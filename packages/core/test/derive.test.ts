import { describe, expect, it } from "vitest";
import { deriveWeekKeys, directionOf, pairOrder } from "../src/derive";
import { deriveSharedSecret, generateIdentity } from "../src/keys";
import { nodeOf } from "../src/ens";

describe("derive", () => {
  it("both sides agree on ordering and direction", () => {
    const [lo, hi] = pairOrder("marie.eth", "pierre.eth");
    expect(pairOrder("pierre.eth", "marie.eth")).toEqual([lo, hi]);
    expect(directionOf(lo, hi)).toBe(0);
    expect(directionOf(hi, lo)).toBe(1);
  });

  it("A and B derive identical weekly keys from ECDH (webcrypto and noble agree)", async () => {
    const a = await generateIdentity(true);
    const b = await generateIdentity(false);
    const sAB = await deriveSharedSecret(a, b.publicKey);
    const sBA = await deriveSharedSecret(b, a.publicKey);
    expect(sAB).toEqual(sBA);

    const kA = deriveWeekKeys(sAB, 2957, 0);
    const kB = deriveWeekKeys(sBA, 2957, 0);
    expect(kA.label).toBe(kB.label);
    expect(kA.label).toMatch(/^[0-9a-f]{32}$/);
    expect(kA.name).toBe(`${kA.label}.tete-a-tete.eth`);
    expect(kA.node).toBe(nodeOf(kA.name));
    expect(kA.encKey).toEqual(kB.encKey);
    expect(kA.writeSeed).toEqual(kB.writeSeed);
  });

  it("labels differ across weeks and directions", async () => {
    const a = await generateIdentity(false);
    const b = await generateIdentity(false);
    const s = await deriveSharedSecret(a, b.publicKey);
    const w0 = deriveWeekKeys(s, 100, 0);
    expect(deriveWeekKeys(s, 101, 0).label).not.toBe(w0.label);
    expect(deriveWeekKeys(s, 100, 1).label).not.toBe(w0.label);
    expect(deriveWeekKeys(s, 100, 1).encKey).not.toEqual(w0.encKey);
  });
});
