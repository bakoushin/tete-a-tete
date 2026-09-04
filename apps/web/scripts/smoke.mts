// Smoke test for the gateway HTTP routes: signed write, CCIP-Read GET, record endpoint. Usage: pnpm smoke [baseUrl]
import { encodeFunctionData, decodeAbiParameters, keccak256, encodePacked, recoverAddress, toHex } from "viem";
import { deriveWeekKeys, dnsEncode, emptyLog, sealLog, signWrite, openLog } from "@tat/core";
import { resolverServiceAbi, textAbi } from "../src/gateway/ccip";
const base = process.argv[2] ?? "http://localhost:3000";
const shared = new Uint8Array(32).fill(7);
const k = deriveWeekKeys(shared, 2957, 0);
const sender = "0x000000000000000000000000000000000000dEaD";
const gw = await (await fetch(`${base}/api/gateway`)).json();
console.log("gateway:", gw);
const inner = encodeFunctionData({ abi: textAbi, functionName: "text", args: [k.node, "rdv"] });
const data = encodeFunctionData({ abi: resolverServiceAbi, functionName: "resolve", args: [toHex(dnsEncode(k.name)), inner] });
async function read(suffix = "") {
  const r = await fetch(`${base}/api/ccip/${sender}/${data}${suffix}`);
  const j = await r.json();
  const [result, expires, sig] = decodeAbiParameters([{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }], j.data);
  const hash = keccak256(encodePacked(["bytes2","address","uint64","bytes32","bytes32"], ["0x1900", sender, expires, keccak256(data), keccak256(result)]));
  const signer = await recoverAddress({ hash, signature: sig });
  return { status: r.status, cors: r.headers.get("access-control-allow-origin"), signer, value: decodeAbiParameters([{ type: "string" }], result)[0] };
}
console.log("read empty:", await read());
const log = emptyLog(); log.msgs.push({ t: Date.now(), m: "salut" });
const blob = sealLog(k.encKey, log, k.node);
const w = await fetch(`${base}/api/write`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signWrite(k.writeSeed, k.node, blob)) });
console.log("write:", w.status, await w.json());
await new Promise((r) => setTimeout(r, 1100));
const r2 = await read(".json");
console.log("read after write (.json suffix):", { ...r2, value: r2.value.slice(0, 24) + "…", decrypts: JSON.stringify(openLog(k.encKey, r2.value, k.node)) });
const rec = await (await fetch(`${base}/api/record/${k.node}`)).json();
console.log("record endpoint writer:", rec.record?.writer, "blob chars:", rec.record?.blob.length);
const bad = await fetch(`${base}/api/write`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...signWrite(k.writeSeed, k.node, blob), blob: blob.slice(0, -4) + "AAAA" }) });
console.log("tampered write:", bad.status, await bad.json());
