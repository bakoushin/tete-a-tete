"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect, useEnsName, useSwitchChain, useWalletClient } from "wagmi";
import { sepolia } from "wagmi/chains";
import { ROTATE_AFTER_DAYS, type Identity } from "@tat/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clockOffsetMs } from "@/lib/clock";
import { createIdentity, loadContacts, loadIdentity, loadOwnName, saveOwnName, setActiveWallet } from "@/lib/identity";
import { ChannelSession } from "@/lib/channel";
import { readRdvKey } from "@/lib/ens";
import { EnableCard } from "./enable";
import { HomeCard } from "./home";
import { ChannelView } from "./channel-view";

export function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: wallet } = useWalletClient();
  const { data: primaryName } = useEnsName({ address, chainId: sepolia.id, query: { enabled: !!address } });

  const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
  const [myName, setMyName] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Map<string, ChannelSession>>(new Map());
  const [active, setActive] = useState<string | null>(null);
  const [contacts, setContacts] = useState<string[]>([]);
  const [keyAgeDays, setKeyAgeDays] = useState(0);

  // Re-scope everything on this device to the connected wallet; close open channels on switch.
  useEffect(() => {
    setActiveWallet(address);
    let alive = true;
    void (async () => {
      const id = address ? await loadIdentity() : null;
      if (!alive) return;
      setSessions((prev) => {
        prev.forEach((s) => s.stop());
        return new Map();
      });
      setActive(null);
      setIdentity(id);
      setMyName(address ? loadOwnName() : null);
      setContacts(address ? loadContacts() : []);
      setKeyAgeDays(id ? Math.floor((Date.now() - id.createdAt) / 86_400_000) : 0);
    })();
    return () => {
      alive = false;
    };
  }, [address]);

  // Enabled for the connected wallet: key on device + a name that matches the wallet's primary name.
  const enabled = !!identity && !!myName && (primaryName === undefined || primaryName === myName);
  const wrongChain = isConnected && chainId !== sepolia.id;
  const offset = clockOffsetMs();

  const openChannel = useCallback(
    async (peer: string, activate = true) => {
      if (!identity || !myName) return;
      if (!sessions.has(peer) && !(await readRdvKey(peer))) {
        throw new Error(`${peer} hasn't enabled Tête-à-tête yet.`);
      }
      setSessions((prev) => {
        if (prev.has(peer)) return prev;
        const s = new ChannelSession(identity, myName, peer);
        void s.open();
        const next = new Map(prev);
        next.set(peer, s);
        return next;
      });
      if (activate) setActive(peer);
    },
    [identity, myName, sessions],
  );

  // Remembered contacts are the only counterparties we can scan for: a pair's label needs both keys,
  // so nobody (not even this client) can enumerate unknown senders. Open them on connect.
  const scanned = useRef<string>("");
  useEffect(() => {
    if (!enabled || !address) return;
    const key = `${address}:${contacts.join(",")}`;
    if (scanned.current === key) return;
    scanned.current = key;
    queueMicrotask(() => {
      for (const c of contacts) void openChannel(c, false).catch(() => {});
    });
  }, [enabled, address, contacts, openChannel]);

  const closeChannel = useCallback((peer: string) => {
    setSessions((prev) => {
      prev.get(peer)?.stop();
      const next = new Map(prev);
      next.delete(peer);
      return next;
    });
    setActive((a) => (a === peer ? null : a));
  }, []);

  const onEnabled = (id: Identity, name: string) => {
    setIdentity(id);
    setMyName(name);
    saveOwnName(name);
  };

  const rotate = async () => {
    const id = await createIdentity();
    sessions.forEach((s) => s.stop());
    setSessions(new Map());
    setActive(null);
    setIdentity(id);
    return id;
  };

  const activeSession = active ? sessions.get(active) : undefined;
  const openPeers = useMemo(() => [...sessions.keys()], [sessions]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-start gap-x-2 font-[family-name:var(--font-display)] text-4xl font-bold leading-none tracking-tight">
            <span className="inline-block rounded-lg bg-foreground px-3 py-1.5 pb-2 text-background">Tête-à-tête</span>
            <span className="pt-1 font-sans text-xs font-semibold leading-none tracking-normal text-muted-foreground/60">Sepolia</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">Private untraceable conversations</p>
        </div>
        <div className="flex items-center gap-2">
          {offset !== 0 && (
            <Badge variant="destructive" title="Demo clock offset via ?now=">
              clock {offset > 0 ? "+" : ""}
              {Math.round(offset / 86_400_000)}d
            </Badge>
          )}
          {isConnected ? (
            <>
              <span className="text-sm font-medium">{primaryName ?? myName ?? `${address?.slice(0, 6)}…${address?.slice(-4)}`}</span>
              <Button variant="outline" size="sm" onClick={() => disconnect()}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={connecting || !connectors[0]} onClick={() => connectors[0] && connect({ connector: connectors[0] })}>
              Connect wallet
            </Button>
          )}
        </div>
      </header>

      {wrongChain && (
        <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <span>Wrong network. This demo lives on Sepolia.</span>
          <Button size="sm" variant="outline" onClick={() => switchChain({ chainId: sepolia.id })}>
            Switch
          </Button>
        </div>
      )}

      {identity === undefined ? null : !isConnected ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Connect your wallet to start a private chat</p>
      ) : !enabled ? (
        <EnableCard identity={identity} wallet={wallet ?? null} address={address} onEnabled={onEnabled} />
      ) : (
        <>
          {keyAgeDays >= ROTATE_AFTER_DAYS && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              Your key is {keyAgeDays} days old. Rotate it (one transaction) to bound what a leak could expose.
            </div>
          )}
          <HomeCard
            myName={myName!}
            identity={identity!}
            wallet={wallet ?? null}
            openPeers={openPeers}
            contacts={contacts}
            active={active}
            onOpen={openChannel}
            onSelect={setActive}
            onRotate={rotate}
            onNameChange={(n) => {
              setMyName(n);
              saveOwnName(n);
            }}
          />
          {activeSession && (
            <ChannelView
              key={active!}
              session={activeSession}
              myName={myName!}
              remembered={contacts.includes(active!)}
              onRemember={(v) => setContacts(loadContacts().filter((c) => c !== active!).concat(v ? [active!] : []))}
              onClose={() => closeChannel(active!)}
            />
          )}
        </>
      )}

      <footer className="mt-auto pt-6 text-center text-xs text-muted-foreground">
        Sepolia · End-to-end encrypted · Messages destructed after 7 days
      </footer>
    </div>
  );
}
