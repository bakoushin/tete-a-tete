import { open, seal } from "./aead";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  fromHex0x,
  utf8ToBytes,
  type Hex,
} from "./bytes";

export interface Message {
  /** Sender's clock, unix ms. */
  t: number;
  m: string;
}

export interface MailboxLog {
  v: 1;
  msgs: Message[];
}

export const emptyLog = (): MailboxLog => ({ v: 1, msgs: [] });

export function encodeLog(log: MailboxLog): Uint8Array {
  return utf8ToBytes(JSON.stringify(log));
}

export function decodeLog(bytes: Uint8Array): MailboxLog {
  const parsed = JSON.parse(bytesToUtf8(bytes)) as unknown;
  if (!parsed || typeof parsed !== "object" || (parsed as MailboxLog).v !== 1 || !Array.isArray((parsed as MailboxLog).msgs)) {
    throw new Error("bad mailbox log");
  }
  return parsed as MailboxLog;
}

/** Encrypt a weekly log into the text-record value stored at `node`. */
export function sealLog(encKey: Uint8Array, log: MailboxLog, node: Hex): string {
  return bytesToBase64(seal(encKey, encodeLog(log), fromHex0x(node)));
}

/** Decrypt a text-record value read from `node`. Throws on wrong key/tamper. */
export function openLog(encKey: Uint8Array, value: string, node: Hex): MailboxLog {
  return decodeLog(open(encKey, base64ToBytes(value), fromHex0x(node)));
}

const RDV_KEY_PREFIX = "x25519:";

/** `rdv-key` text record value for an X25519 public key. */
export function encodeRdvKey(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) throw new Error("x25519 public key must be 32 bytes");
  return RDV_KEY_PREFIX + bytesToBase64(publicKey);
}

/** Parse an `rdv-key` record; null if absent or malformed. */
export function decodeRdvKey(value: string | null | undefined): Uint8Array | null {
  if (!value || !value.startsWith(RDV_KEY_PREFIX)) return null;
  try {
    const pk = base64ToBytes(value.slice(RDV_KEY_PREFIX.length));
    return pk.length === 32 ? pk : null;
  } catch {
    return null;
  }
}
