import { namehash } from "viem/ens";
import type { Hex } from "./bytes";

/** Parent name whose wildcard resolver serves every pair's secret subname. */
export const DEFAULT_PARENT = "tete-a-tete.eth";

/** Text record key on a user's own name holding their X25519 public key. */
export const RDV_KEY_RECORD = "rdv-key";
/** Text record key on <label>.<parent> holding the encrypted weekly mailbox. */
export const RDV_RECORD = "rdv";

export function nodeOf(name: string): Hex {
  return namehash(name);
}

export function labelToName(label: string, parent: string = DEFAULT_PARENT): string {
  return `${label}.${parent}`;
}

/** DNS wire-format encoding used by ENSIP-10 `resolve(bytes name, bytes data)`. */
export function dnsEncode(name: string): Uint8Array {
  const labels = name.replace(/\.$/, "").split(".").filter(Boolean);
  const enc = new TextEncoder();
  const parts = labels.map((l) => enc.encode(l));
  const out = new Uint8Array(parts.reduce((n, p) => n + 1 + p.length, 0) + 1);
  let i = 0;
  for (const p of parts) {
    if (p.length > 255) throw new Error("label too long");
    out[i++] = p.length;
    out.set(p, i);
    i += p.length;
  }
  out[i] = 0;
  return out;
}

/** Inverse of dnsEncode. */
export function dnsDecode(bytes: Uint8Array): string {
  const labels: string[] = [];
  const dec = new TextDecoder();
  let i = 0;
  while (i < bytes.length) {
    const len = bytes[i++] ?? 0;
    if (len === 0) break;
    labels.push(dec.decode(bytes.subarray(i, i + len)));
    i += len;
  }
  return labels.join(".");
}

export { namehash };
