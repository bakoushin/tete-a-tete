import { describe, expect, it } from "vitest";
import { randomBytes } from "@noble/curves/utils.js";
import { RECORD_SIZE, SEALED_SIZE, open, seal } from "../src/aead";
import { base64ToBytes, utf8ToBytes } from "../src/bytes";
import { decodeRdvKey, emptyLog, encodeRdvKey, openLog, sealLog } from "../src/record";

const key = randomBytes(32);
const node = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;

describe("aead + record", () => {
  it("roundtrips and pads to a fixed size", () => {
    const small = seal(key, utf8ToBytes("hi"), new Uint8Array([1]));
    const big = seal(key, utf8ToBytes("x".repeat(10_000)), new Uint8Array([1]));
    expect(small.length).toBe(SEALED_SIZE);
    expect(big.length).toBe(SEALED_SIZE);
    expect(open(key, small, new Uint8Array([1]))).toEqual(utf8ToBytes("hi"));
  });

  it("rejects oversize, wrong key and wrong AAD", () => {
    expect(() => seal(key, new Uint8Array(RECORD_SIZE), new Uint8Array())).toThrow(/too large/);
    const blob = seal(key, utf8ToBytes("hi"), utf8ToBytes("a"));
    expect(() => open(randomBytes(32), blob, utf8ToBytes("a"))).toThrow();
    expect(() => open(key, blob, utf8ToBytes("b"))).toThrow();
  });

  it("seals a mailbox log bound to its node", () => {
    const log = emptyLog();
    log.msgs.push({ t: 1, m: "bonjour" });
    const value = sealLog(key, log, node);
    expect(base64ToBytes(value).length).toBe(SEALED_SIZE);
    expect(openLog(key, value, node)).toEqual(log);
    const other = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
    expect(() => openLog(key, value, other)).toThrow();
  });

  it("encodes and parses rdv-key records", () => {
    const pk = randomBytes(32);
    const v = encodeRdvKey(pk);
    expect(v.startsWith("x25519:")).toBe(true);
    expect(decodeRdvKey(v)).toEqual(pk);
    expect(decodeRdvKey("")).toBeNull();
    expect(decodeRdvKey("x25519:AAAA")).toBeNull();
    expect(decodeRdvKey("nope")).toBeNull();
  });
});
