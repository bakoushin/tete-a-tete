import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { concatBytes, fromHex0x, toHex0x, u64be, utf8ToBytes, type Hex } from "./bytes";

/**
 * Write authorization for the gateway. The signing key is derived from the pair's shared
 * secret (per direction, per week), so the gateway sees a random Ed25519 key — never a wallet.
 */
export interface WriteRequest {
  node: Hex;
  /** base64 sealed record */
  blob: string;
  /** Ed25519 public key, 0x-hex */
  writer: Hex;
  /** unix ms */
  ts: number;
  /** Ed25519 signature over writeDigest(), 0x-hex */
  sig: Hex;
}

export function writeDigest(node: Hex, ts: number, blob: string): Uint8Array {
  return keccak_256(concatBytes(fromHex0x(node), u64be(ts), sha256(utf8ToBytes(blob))));
}

export function writerPublicKey(writeSeed: Uint8Array): Hex {
  return toHex0x(ed25519.getPublicKey(writeSeed));
}

export function signWrite(writeSeed: Uint8Array, node: Hex, blob: string, ts: number = Date.now()): WriteRequest {
  const sig = ed25519.sign(writeDigest(node, ts, blob), writeSeed);
  return { node, blob, writer: writerPublicKey(writeSeed), ts, sig: toHex0x(sig) };
}

export function verifyWrite(req: WriteRequest): boolean {
  try {
    return ed25519.verify(fromHex0x(req.sig), writeDigest(req.node, req.ts, req.blob), fromHex0x(req.writer));
  } catch {
    return false;
  }
}
