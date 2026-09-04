import { describe, expect, it } from "vitest";
import {
  decodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  keccak256,
  recoverAddress,
  toHex,
  type Hex,
} from "viem";
import { randomBytes } from "@noble/curves/utils.js";
import { deriveWeekKeys, dnsEncode, emptyLog, openLog, sealLog, signWrite } from "@tat/core";
import { handleCcip, resolverServiceAbi, textAbi } from "./ccip";
import { makeSigner } from "./signer";
import { MemoryStore } from "./store";
import { handleWrite } from "./write";

const pk = ("0x" + "11".repeat(32)) as Hex;
const signer = makeSigner(pk);
const sender = "0x000000000000000000000000000000000000dEaD" as Hex;
const shared = randomBytes(32);
const keys = deriveWeekKeys(shared, 2957, 0);

function ccipCalldata(name: string, node: Hex, key = "rdv"): Hex {
  const inner = encodeFunctionData({ abi: textAbi, functionName: "text", args: [node, key] });
  return encodeFunctionData({ abi: resolverServiceAbi, functionName: "resolve", args: [toHex(dnsEncode(name)), inner] });
}

async function readText(store: MemoryStore, now: number, name = keys.name, node = keys.node) {
  const request = ccipCalldata(name, node);
  const { data } = await handleCcip(sender, request, store, signer, now);
  const [result, expires, sig] = decodeAbiParameters([{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }], data);
  const hash = keccak256(
    encodePacked(["bytes2", "address", "uint64", "bytes32", "bytes32"], ["0x1900", sender, expires, keccak256(request), keccak256(result)]),
  );
  expect(await recoverAddress({ hash, signature: sig })).toBe(signer.address);
  expect(Number(expires)).toBe(Math.floor(now / 1000) + 60);
  const [value] = decodeAbiParameters([{ type: "string" }], result);
  return value;
}

describe("gateway", () => {
  it("write → signed CCIP read roundtrip", async () => {
    let now = 1_800_000_000_000;
    const store = new MemoryStore(() => now);
    expect(await readText(store, now)).toBe("");

    const log = emptyLog();
    log.msgs.push({ t: now, m: "bonjour" });
    const blob = sealLog(keys.encKey, log, keys.node);
    const res = await handleWrite(signWrite(keys.writeSeed, keys.node, blob, now), store, now);
    expect(res.validUntil).toBe(now + 7 * 86400 * 1000);

    now += 1500; // past the 1s read cache
    const value = await readText(store, now);
    expect(value).toBe(blob);
    expect(openLog(keys.encKey, value, keys.node)).toEqual(log);

    // gone after 7 days
    now += 7 * 86400 * 1000;
    expect(await readText(store, now)).toBe("");
  });

  it("rejects name/node mismatch and non-rdv keys with an empty record", async () => {
    const now = 1_800_000_000_000;
    const store = new MemoryStore(() => now);
    const blob = sealLog(keys.encKey, emptyLog(), keys.node);
    await handleWrite(signWrite(keys.writeSeed, keys.node, blob, now), store, now);
    expect(await readText(store, now + 2000, "other.tete-a-tete.eth", keys.node)).toBe("");
    const { data } = await handleCcip(sender, ccipCalldata(keys.name, keys.node, "avatar"), store, signer, now + 4000);
    const [result] = decodeAbiParameters([{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }], data);
    expect(decodeAbiParameters([{ type: "string" }], result)[0]).toBe("");
  });

  it("enforces writer binding, monotonic ts, skew and size", async () => {
    const now = 1_800_000_000_000;
    const store = new MemoryStore(() => now);
    const blob = sealLog(keys.encKey, emptyLog(), keys.node);
    await handleWrite(signWrite(keys.writeSeed, keys.node, blob, now), store, now);

    await expect(handleWrite(signWrite(keys.writeSeed, keys.node, blob, now), store, now)).rejects.toThrow(/replay/);
    await expect(handleWrite(signWrite(keys.writeSeed, keys.node, blob, now - 1000), store, now)).rejects.toThrow(/replay/);
    await expect(handleWrite(signWrite(keys.writeSeed, keys.node, blob, now + 10 * 60_000), store, now)).rejects.toThrow(/stale/);

    const other = deriveWeekKeys(randomBytes(32), 2957, 0);
    await expect(handleWrite(signWrite(other.writeSeed, keys.node, blob, now + 1), store, now)).rejects.toThrow(/writer mismatch/);

    const tampered = { ...signWrite(keys.writeSeed, keys.node, blob, now + 2), blob: sealLog(keys.encKey, emptyLog(), keys.node) };
    await expect(handleWrite(tampered, store, now)).rejects.toThrow(/bad signature/);

    await expect(handleWrite({ ...signWrite(keys.writeSeed, keys.node, "AAAA", now + 3) }, store, now)).rejects.toThrow(/exactly/);

    await handleWrite(signWrite(keys.writeSeed, keys.node, blob, now + 4), store, now);
  });
});
