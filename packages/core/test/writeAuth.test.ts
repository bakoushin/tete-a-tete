import { describe, expect, it } from "vitest";
import { randomBytes } from "@noble/curves/utils.js";
import { signWrite, verifyWrite, writerPublicKey } from "../src/writeAuth";

const node = "0x3333333333333333333333333333333333333333333333333333333333333333" as const;

describe("writeAuth", () => {
  it("signs and verifies", () => {
    const seed = randomBytes(32);
    const req = signWrite(seed, node, "AAAA", 1700000000000);
    expect(req.writer).toBe(writerPublicKey(seed));
    expect(verifyWrite(req)).toBe(true);
  });
  it("rejects tampering", () => {
    const seed = randomBytes(32);
    const req = signWrite(seed, node, "AAAA", 1700000000000);
    expect(verifyWrite({ ...req, blob: "BBBB" })).toBe(false);
    expect(verifyWrite({ ...req, ts: req.ts + 1 })).toBe(false);
    expect(verifyWrite({ ...req, writer: writerPublicKey(randomBytes(32)) })).toBe(false);
    expect(verifyWrite({ ...req, sig: "0x00" })).toBe(false);
  });
});
