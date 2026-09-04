import { decodeFunctionData, encodeAbiParameters, type Hex } from "viem";
import { RDV_RECORD, dnsDecode, fromHex0x, nodeOf } from "@tat/core";
import type { Store, StoredRecord } from "./store";
import type { GatewaySigner } from "./signer";

export const resolverServiceAbi = [
  {
    type: "function",
    name: "resolve",
    stateMutability: "view",
    inputs: [
      { name: "name", type: "bytes" },
      { name: "data", type: "bytes" },
    ],
    outputs: [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
  },
] as const;

export const textAbi = [
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ type: "string" }],
  },
] as const;

/** Signed responses are valid this long. Short, so a gateway can't replay a deleted record for long. */
export const RESPONSE_TTL_SECONDS = BigInt(60);
/** Coalesce bursts of readers of the same node into one store read. */
const CACHE_MS = 1000;
const cache = new Map<string, { at: number; rec: StoredRecord | null }>();

export async function cachedGet(store: Store, node: Hex, now: number): Promise<StoredRecord | null> {
  const hit = cache.get(node);
  if (hit && now - hit.at < CACHE_MS) return hit.rec;
  const rec = await store.get(node);
  cache.set(node, { at: now, rec });
  if (cache.size > 10_000) cache.clear();
  return rec;
}

export function invalidate(node: Hex) {
  cache.delete(node);
}

export class CcipError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * EIP-3668 GET handler. `data` is the calldata of IResolverService.resolve(bytes name, bytes data).
 * Returns the ABI-encoded, signed response body `{ data }`.
 */
export async function handleCcip(
  sender: Hex,
  data: Hex,
  store: Store,
  signer: GatewaySigner,
  nowMs: number = Date.now(),
): Promise<{ data: Hex }> {
  let name: Hex, inner: Hex;
  try {
    const d = decodeFunctionData({ abi: resolverServiceAbi, data });
    [name, inner] = d.args;
  } catch {
    throw new CcipError("bad resolve() calldata");
  }

  let result: Hex = "0x";
  try {
    const t = decodeFunctionData({ abi: textAbi, data: inner });
    const [node, key] = t.args;
    const fullName = dnsDecode(fromHex0x(name));
    if (key === RDV_RECORD && nodeOf(fullName).toLowerCase() === node.toLowerCase()) {
      const rec = await cachedGet(store, node, nowMs);
      const value = rec && rec.validUntil > nowMs ? rec.blob : "";
      result = encodeAbiParameters([{ type: "string" }], [value]);
    } else {
      result = encodeAbiParameters([{ type: "string" }], [""]);
    }
  } catch {
    // Not a text() query (addr, contenthash, …): nothing lives here. Empty result decodes as "no record".
    result = "0x";
  }

  const expires = BigInt(Math.floor(nowMs / 1000)) + RESPONSE_TTL_SECONDS;
  return { data: await signer.signResponse(sender, expires, data, result) };
}
