import { Redis } from "@upstash/redis";
import type { Hex } from "@tat/core";

export interface StoredRecord {
  /** base64 sealed record, always the same size */
  blob: string;
  /** Ed25519 key bound to this node on first write */
  writer: Hex;
  /** unix ms of the last accepted write */
  ts: number;
  /** unix ms after which the record no longer exists */
  validUntil: number;
}

export interface Store {
  get(node: Hex): Promise<StoredRecord | null>;
  put(node: Hex, rec: StoredRecord, ttlSeconds: number): Promise<void>;
}

const key = (node: Hex) => `rdv:${node.toLowerCase()}`;

export class MemoryStore implements Store {
  private m = new Map<string, { rec: StoredRecord; exp: number }>();
  constructor(private now: () => number = Date.now) {}
  async get(node: Hex) {
    const e = this.m.get(key(node));
    if (!e) return null;
    if (e.exp <= this.now()) {
      this.m.delete(key(node));
      return null;
    }
    return e.rec;
  }
  async put(node: Hex, rec: StoredRecord, ttlSeconds: number) {
    this.m.set(key(node), { rec, exp: this.now() + ttlSeconds * 1000 });
  }
}

/** Stateless backend: Redis expiry implements the 7-day purge. */
export class UpstashStore implements Store {
  constructor(private redis: Redis) {}
  async get(node: Hex) {
    return (await this.redis.get<StoredRecord>(key(node))) ?? null;
  }
  async put(node: Hex, rec: StoredRecord, ttlSeconds: number) {
    await this.redis.set(key(node), rec, { ex: ttlSeconds });
  }
}

declare global {
  var __tatStore: Store | undefined;
}

export function storeKind(): "upstash" | "memory" {
  return process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? "upstash" : "memory";
}

/** Upstash when configured. The in-memory fallback is never cached past an env change (dev reloads .env). */
export function getStore(): Store {
  const kind = storeKind();
  const cached = globalThis.__tatStore;
  if (cached && (kind === "upstash") === cached instanceof UpstashStore) return cached;
  if (kind === "upstash") {
    globalThis.__tatStore = new UpstashStore(Redis.fromEnv());
  } else {
    console.warn("[gateway] UPSTASH_REDIS_REST_URL not set — using in-memory store (dev only)");
    globalThis.__tatStore = new MemoryStore();
  }
  return globalThis.__tatStore;
}
