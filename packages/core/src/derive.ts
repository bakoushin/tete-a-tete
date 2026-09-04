import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes, type Hex } from "./bytes";
import { DEFAULT_PARENT, labelToName, nodeOf } from "./ens";

/**
 * A pair has two directions. Direction 0 is written by the name whose namehash sorts lower,
 * direction 1 by the other. Both sides compute the same ordering, so no negotiation is needed.
 */
export type Direction = 0 | 1;

export function pairOrder(a: string, b: string): [string, string] {
  return nodeOf(a) < nodeOf(b) ? [a, b] : [b, a];
}

export function directionOf(from: string, to: string): Direction {
  return pairOrder(from, to)[0] === from ? 0 : 1;
}

export interface WeekKeys {
  week: number;
  dir: Direction;
  /** 32 hex chars. Looks random to everyone without the shared secret. */
  label: string;
  /** `<label>.<parent>` */
  name: string;
  /** namehash(name) — the gateway's storage key. */
  node: Hex;
  /** XChaCha20-Poly1305 key for this direction this week. */
  encKey: Uint8Array;
  /** Ed25519 seed for signing writes to this record. */
  writeSeed: Uint8Array;
}

/**
 * HKDF-SHA256(shared, salt = parent name, info = version/week/direction) → label, encKey, writeSeed.
 * Dropped from memory when the week leaves the read window.
 */
export function deriveWeekKeys(
  shared: Uint8Array,
  week: number,
  dir: Direction,
  parent: string = DEFAULT_PARENT,
): WeekKeys {
  const info = utf8ToBytes(`tete-a-tete/v1/${week}/${dir}`);
  const okm = hkdf(sha256, shared, utf8ToBytes(parent), info, 80);
  const label = bytesToHex(okm.subarray(0, 16));
  const name = labelToName(label, parent);
  return {
    week,
    dir,
    label,
    name,
    node: nodeOf(name),
    encKey: okm.slice(16, 48),
    writeSeed: okm.slice(48, 80),
  };
}
