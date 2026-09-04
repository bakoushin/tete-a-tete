import {
  deriveSharedSecret,
  deriveWeekKeys,
  directionOf,
  emptyLog,
  openLog,
  readWindow,
  sealLog,
  signWrite,
  weekIndex,
  bytesEqual,
  type Identity,
  type MailboxLog,
  type WeekKeys,
} from "@tat/core";
import { KEY_CHECK_MS, PARENT_NAME, POLL_HIDDEN_MS, POLL_VISIBLE_MS } from "./config";
import { now } from "./clock";
import { getGateway, postWrite, readMailbox, readRdvKey, type GatewayInfo } from "./ens";

export type ChannelStatus = "resolving" | "no-key" | "open" | "error";

export interface ChatMessage {
  t: number;
  m: string;
  mine: boolean;
  week: number;
}

export interface Banner {
  id: number;
  kind: "info" | "warn";
  text: string;
}

export interface ChannelSnapshot {
  peer: string;
  status: ChannelStatus;
  error?: string;
  peerPub?: Uint8Array;
  week: number;
  /** Keys for this week: what I write to, what I read from. */
  mine?: WeekKeys;
  theirs?: WeekKeys;
  messages: ChatMessage[];
  banners: Banner[];
  sending: boolean;
  syncError?: string;
  lastSync?: number;
  gateway?: GatewayInfo;
}

type Listener = () => void;

/**
 * One open channel. Everything here lives in memory only: the shared secret, the weekly keys and
 * the decrypted logs vanish when the tab closes.
 */
export class ChannelSession {
  private snap: ChannelSnapshot;
  private listeners = new Set<Listener>();
  private shared?: Uint8Array;
  private myDir: 0 | 1;
  private logs = new Map<string, MailboxLog>();
  private lastBlob = new Map<string, string | null>();
  private timer?: ReturnType<typeof setTimeout>;
  private keyTimer?: ReturnType<typeof setInterval>;
  private bannerSeq = 0;
  private stopped = false;
  private ticking = false;

  constructor(
    private identity: Identity,
    private myName: string,
    peer: string,
  ) {
    this.myDir = directionOf(myName, peer);
    this.snap = { peer, status: "resolving", week: weekIndex(now()), messages: [], banners: [], sending: false };
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.snap;

  private set(patch: Partial<ChannelSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  private banner(kind: Banner["kind"], text: string) {
    const b = { id: ++this.bannerSeq, kind, text };
    this.set({ banners: [...this.snap.banners, b] });
  }

  dismissBanner(id: number) {
    this.set({ banners: this.snap.banners.filter((b) => b.id !== id) });
  }

  private keysFor(week: number, dir: 0 | 1) {
    return deriveWeekKeys(this.shared!, week, dir, PARENT_NAME);
  }

  private setWeek(week: number) {
    this.set({ week, mine: this.keysFor(week, this.myDir), theirs: this.keysFor(week, (1 - this.myDir) as 0 | 1) });
  }

  async open() {
    try {
      const peerPub = await readRdvKey(this.snap.peer);
      if (!peerPub) {
        this.set({ status: "no-key" });
        return;
      }
      this.shared = await deriveSharedSecret(this.identity, peerPub);
      this.set({ peerPub });
      this.setWeek(weekIndex(now()));
      const gateway = await getGateway().catch(() => undefined);
      this.set({ status: "open", gateway });
      await this.syncAll();
      this.schedule(0);
      this.keyTimer = setInterval(() => void this.checkPeerKey(), KEY_CHECK_MS);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility);
    } catch (e) {
      this.set({ status: "error", error: (e as Error).message });
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.keyTimer) clearInterval(this.keyTimer);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
    this.shared = undefined;
    this.logs.clear();
  }

  private onVisibility = () => this.schedule(0);

  private schedule(delay?: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    const d = delay ?? (typeof document !== "undefined" && document.visibilityState === "hidden" ? POLL_HIDDEN_MS : POLL_VISIBLE_MS);
    this.timer = setTimeout(() => void this.tick(), d);
  }

  private async tick() {
    if (this.stopped || this.ticking) return;
    this.ticking = true;
    try {
      const w = weekIndex(now());
      if (w !== this.snap.week) {
        this.setWeek(w);
        this.banner("info", `New weekly channel — the label rotated. Last week's messages disappear in 7 days from their write.`);
        await this.syncAll();
      } else {
        await this.read(this.snap.theirs!);
      }
    } finally {
      this.ticking = false;
      this.schedule();
    }
  }

  /** Read both directions for the current and previous week (4 lookups). */
  async syncAll() {
    const [cur, prev] = readWindow(now());
    const jobs: WeekKeys[] = [];
    for (const w of [cur, prev]) {
      jobs.push(this.keysFor(w, this.myDir), this.keysFor(w, (1 - this.myDir) as 0 | 1));
    }
    await Promise.all(jobs.map((k) => this.read(k)));
  }

  private async read(k: WeekKeys) {
    const id = `${k.week}:${k.dir}`;
    try {
      const blob = await readMailbox(k.name);
      if (this.lastBlob.get(id) === blob && this.lastBlob.has(id)) {
        this.set({ syncError: undefined, lastSync: now() });
        return;
      }
      this.lastBlob.set(id, blob);
      if (blob) {
        try {
          this.logs.set(id, openLog(k.encKey, blob, k.node));
        } catch {
          this.banner("warn", `Record for week ${k.week} could not be decrypted — wrong key or tampered.`);
        }
      } else {
        this.logs.delete(id);
      }
      this.rebuild();
      this.set({ syncError: undefined, lastSync: now() });
    } catch (e) {
      this.set({ syncError: (e as Error).message });
    }
  }

  private rebuild() {
    const msgs: ChatMessage[] = [];
    for (const [id, log] of this.logs) {
      const [w, d] = id.split(":");
      const mine = Number(d) === this.myDir;
      for (const m of log.msgs) msgs.push({ ...m, mine, week: Number(w) });
    }
    msgs.sort((a, b) => a.t - b.t);
    this.set({ messages: msgs });
  }

  async send(text: string) {
    if (!this.shared || this.snap.status !== "open") throw new Error("channel not open");
    const gateway = this.snap.gateway ?? (await getGateway());
    const w = weekIndex(now());
    if (w !== this.snap.week) this.setWeek(w);
    const k = this.snap.mine!;
    const id = `${k.week}:${k.dir}`;
    const log = this.logs.get(id) ?? emptyLog();
    const next: MailboxLog = { v: 1, msgs: [...log.msgs, { t: now(), m: text }] };
    this.set({ sending: true, gateway });
    try {
      const blob = sealLog(k.encKey, next, k.node);
      await postWrite(gateway, signWrite(k.writeSeed, k.node, blob, now()));
      this.logs.set(id, next);
      this.lastBlob.set(id, blob);
      this.rebuild();
    } finally {
      this.set({ sending: false });
    }
  }

  private async checkPeerKey() {
    if (this.stopped || !this.snap.peerPub) return;
    try {
      const pk = await readRdvKey(this.snap.peer);
      if (!pk) {
        this.banner("warn", `${this.snap.peer} removed their key. Channel ended.`);
        return;
      }
      if (!bytesEqual(pk, this.snap.peerPub)) {
        this.banner("warn", `${this.snap.peer} rotated their key. Re-deriving this week's channel — verify out of band if unexpected.`);
        this.shared = await deriveSharedSecret(this.identity, pk);
        this.logs.clear();
        this.lastBlob.clear();
        this.set({ peerPub: pk });
        this.setWeek(weekIndex(now()));
        await this.syncAll();
      }
    } catch {}
  }
}
