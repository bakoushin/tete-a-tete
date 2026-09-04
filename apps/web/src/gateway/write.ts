import { SEALED_SIZE, WEEK_SECONDS, base64ToBytes, verifyWrite, type Hex, type WriteRequest } from "@tat/core";
import { invalidate } from "./ccip";
import type { Store, StoredRecord } from "./store";

export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const RETENTION_SECONDS = WEEK_SECONDS;

export class WriteError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const isHex = (s: unknown, bytes?: number): s is Hex =>
  typeof s === "string" && /^0x[0-9a-fA-F]*$/.test(s) && (bytes === undefined || s.length === 2 + bytes * 2);

export function parseWriteRequest(body: unknown): WriteRequest {
  const b = body as Partial<WriteRequest> | null;
  if (!b || typeof b !== "object") throw new WriteError("bad body");
  if (!isHex(b.node, 32)) throw new WriteError("bad node");
  if (!isHex(b.writer, 32)) throw new WriteError("bad writer");
  if (!isHex(b.sig, 64)) throw new WriteError("bad sig");
  if (typeof b.ts !== "number" || !Number.isFinite(b.ts)) throw new WriteError("bad ts");
  if (typeof b.blob !== "string") throw new WriteError("bad blob");
  let len: number;
  try {
    len = base64ToBytes(b.blob).length;
  } catch {
    throw new WriteError("blob is not base64");
  }
  if (len !== SEALED_SIZE) throw new WriteError(`blob must be exactly ${SEALED_SIZE} bytes`);
  return { node: b.node, writer: b.writer, sig: b.sig, ts: b.ts, blob: b.blob };
}

/**
 * Accepts a record if the signature is valid, the timestamp is fresh and monotonic, and the
 * writer key matches the one bound on the node's first write.
 */
export async function handleWrite(
  body: unknown,
  store: Store,
  nowMs: number = Date.now(),
): Promise<{ ok: true; node: Hex; validUntil: number }> {
  const req = parseWriteRequest(body);
  if (Math.abs(req.ts - nowMs) > MAX_CLOCK_SKEW_MS) throw new WriteError("stale timestamp");
  if (!verifyWrite(req)) throw new WriteError("bad signature", 401);

  const existing = await store.get(req.node);
  if (existing && existing.validUntil > nowMs) {
    if (existing.writer.toLowerCase() !== req.writer.toLowerCase()) throw new WriteError("writer mismatch", 403);
    if (req.ts <= existing.ts) throw new WriteError("replay", 409);
  }

  const rec: StoredRecord = {
    blob: req.blob,
    writer: req.writer,
    ts: req.ts,
    validUntil: req.ts + RETENTION_SECONDS * 1000,
  };
  await store.put(req.node, rec, RETENTION_SECONDS);
  invalidate(req.node);
  return { ok: true, node: req.node, validUntil: rec.validUntil };
}
