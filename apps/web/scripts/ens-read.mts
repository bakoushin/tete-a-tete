// Reads a mailbox record through real ENS resolution on Sepolia (Universal Resolver → wildcard → CCIP-Read).
// Usage: pnpm tsx scripts/ens-read.mts <name-or-label> [key]
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

const arg = process.argv[2] ?? "probe";
const key = process.argv[3] ?? "rdv";
const parent = process.env.NEXT_PUBLIC_PARENT_NAME ?? "tete-a-tete.eth";
const name = arg.includes(".") ? arg : `${arg}.${parent}`;
const client = createPublicClient({ chain: sepolia, transport: http(process.env.NEXT_PUBLIC_RPC_URL || undefined) });

console.log("resolver of", name, "→", await client.getEnsResolver({ name }));
const t0 = Date.now();
const v = await client.getEnsText({ name, key, strict: true });
console.log(`text(${key}) =`, v === null ? null : `${v.slice(0, 60)}${v.length > 60 ? "…" : ""} (${v.length} chars)`, `in ${Date.now() - t0} ms`);
