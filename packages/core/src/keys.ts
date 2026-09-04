import { x25519 } from "@noble/curves/ed25519.js";
import { randomBytes } from "@noble/curves/utils.js";

/**
 * R — the user's dedicated X25519 identity key. Preferred form is a non-extractable WebCrypto
 * key (persisted as a CryptoKey in IndexedDB). Fallback is a raw noble key for runtimes without
 * WebCrypto X25519. Only the public half ever leaves the device (as the `rdv-key` record).
 */
export type Identity =
  | { kind: "webcrypto"; publicKey: Uint8Array; privateKey: CryptoKey; createdAt: number }
  | { kind: "noble"; publicKey: Uint8Array; privateKey: Uint8Array; createdAt: number };

const subtle = () => globalThis.crypto?.subtle;

export async function supportsWebCryptoX25519(): Promise<boolean> {
  try {
    const s = subtle();
    if (!s) return false;
    const kp = (await s.generateKey({ name: "X25519" }, false, ["deriveBits"])) as CryptoKeyPair;
    return !!kp.privateKey;
  } catch {
    return false;
  }
}

export async function generateIdentity(preferWebCrypto = true): Promise<Identity> {
  const createdAt = Date.now();
  if (preferWebCrypto && (await supportsWebCryptoX25519())) {
    const s = subtle()!;
    const kp = (await s.generateKey({ name: "X25519" }, false, ["deriveBits"])) as CryptoKeyPair;
    const raw = new Uint8Array(await s.exportKey("raw", kp.publicKey));
    return { kind: "webcrypto", publicKey: raw, privateKey: kp.privateKey, createdAt };
  }
  const priv = randomBytes(32);
  return { kind: "noble", publicKey: x25519.getPublicKey(priv), privateKey: priv, createdAt };
}

/** s = ECDH(R_mine, R_peer). Derived on demand, never stored. */
export async function deriveSharedSecret(id: Identity, peerPublicKey: Uint8Array): Promise<Uint8Array> {
  if (peerPublicKey.length !== 32) throw new Error("peer key must be 32 bytes");
  if (id.kind === "noble") return x25519.getSharedSecret(id.privateKey, peerPublicKey);
  const s = subtle()!;
  const peer = await s.importKey("raw", peerPublicKey as BufferSource, { name: "X25519" }, false, []);
  const bits = await s.deriveBits({ name: "X25519", public: peer }, id.privateKey, 256);
  return new Uint8Array(bits);
}

/** Days after which the UI nags to rotate R. */
export const ROTATE_AFTER_DAYS = 30;
