// End-to-end: seal a weekly log, POST it to the gateway, then read it back through *real* ENS resolution
// (Universal Resolver → wildcard RendezvousResolver → CCIP-Read → signature check) and decrypt.
// Usage: NEXT_PUBLIC_RPC_URL=... pnpm tsx scripts/e2e-ens.mts [gatewayWriteUrl]
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { randomBytes } from "@noble/curves/utils.js";
import { deriveWeekKeys, emptyLog, openLog, sealLog, signWrite, weekIndex } from "@tat/core";

const writeUrl = process.argv[2] ?? "http://localhost:3000/api/write";
const parent = process.env.NEXT_PUBLIC_PARENT_NAME ?? "tete-a-tete.eth";
const client = createPublicClient({ chain: sepolia, transport: http(process.env.NEXT_PUBLIC_RPC_URL || undefined) });

const shared = randomBytes(32);
const k = deriveWeekKeys(shared, weekIndex(), 0, parent);
console.log("label", k.name);

const before = await client.getEnsText({ name: k.name, key: "rdv", strict: true });
console.log("before write:", before);

const log = emptyLog();
log.msgs.push({ t: Date.now(), m: "bonjour pierre — via ENS" });
const blob = sealLog(k.encKey, log, k.node);
const res = await fetch(writeUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signWrite(k.writeSeed, k.node, blob)) });
console.log("write:", res.status, await res.text());
await new Promise((r) => setTimeout(r, 1100));

const t0 = Date.now();
const after = await client.getEnsText({ name: k.name, key: "rdv", strict: true });
console.log(`after write: ${after?.length} chars in ${Date.now() - t0} ms, matches blob: ${after === blob}`);
console.log("decrypted:", JSON.stringify(openLog(k.encKey, after!, k.node)));
