import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { randomBytes } from "@noble/curves/utils.js";
import { concatBytes } from "./bytes";

/** Every record is padded to this many plaintext bytes, so ciphertext length reveals nothing. */
export const RECORD_SIZE = 16 * 1024;
export const NONCE_SIZE = 24;
const LEN_PREFIX = 4;

export function pad(data: Uint8Array): Uint8Array {
  if (data.length + LEN_PREFIX > RECORD_SIZE) {
    throw new Error(`record too large: ${data.length} > ${RECORD_SIZE - LEN_PREFIX}`);
  }
  const out = new Uint8Array(RECORD_SIZE);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(data, LEN_PREFIX);
  return out;
}

export function unpad(buf: Uint8Array): Uint8Array {
  if (buf.length !== RECORD_SIZE) throw new Error("bad padded length");
  const len = new DataView(buf.buffer, buf.byteOffset).getUint32(0);
  if (len + LEN_PREFIX > RECORD_SIZE) throw new Error("bad length prefix");
  return buf.slice(LEN_PREFIX, LEN_PREFIX + len);
}

/** nonce ‖ XChaCha20-Poly1305(pad(plaintext)) with AAD binding the record to its ENS node. */
export function seal(key: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array {
  const nonce = randomBytes(NONCE_SIZE);
  const ct = xchacha20poly1305(key, nonce, aad).encrypt(pad(plaintext));
  return concatBytes(nonce, ct);
}

export function open(key: Uint8Array, blob: Uint8Array, aad: Uint8Array): Uint8Array {
  if (blob.length < NONCE_SIZE + 16) throw new Error("blob too short");
  const nonce = blob.subarray(0, NONCE_SIZE);
  const ct = blob.subarray(NONCE_SIZE);
  return unpad(xchacha20poly1305(key, nonce, aad).decrypt(ct));
}

/** Byte length of every sealed record. */
export const SEALED_SIZE = NONCE_SIZE + RECORD_SIZE + 16;
