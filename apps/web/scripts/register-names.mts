// Registers ENS names on Sepolia from the deployer key and points the parent name at RendezvousResolver.
// Uses the live ETHRegistrarController (the one the ENS app uses; wraps names via NameWrapper).
// Usage: pnpm tsx scripts/register-names.mts
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, namehash, parseAbi, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { randomBytes } from "@noble/curves/utils.js";

const env = Object.fromEntries(
  readFileSync(new URL("../../../packages/contracts/.env", import.meta.url), "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY as Hex);
const pub = createPublicClient({ chain: sepolia, transport: http(env.SEPOLIA_RPC_URL) });
const wallet = createWalletClient({ chain: sepolia, transport: http(env.SEPOLIA_RPC_URL), account });

const CONTROLLER = "0x4477cAc137F3353Ca35060E01E5aEb777a1Ca01B";
const PUBLIC_RESOLVER = "0x8948458626811dd0c23EB25Cc74291247077cC51";
const REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const NAME_WRAPPER = "0x0635513f179D50A207757E05759CbD106d7dFcE8";
const RDV_RESOLVER = "0x56E996B6f96B79eF02Ac16afB92660293B52460A";

const controllerAbi = parseAbi([
  "function available(string name) view returns (bool)",
  "function rentPrice(string name, uint256 duration) view returns ((uint256 base, uint256 premium))",
  "function makeCommitment(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) pure returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register(string name, address owner, uint256 duration, bytes32 secret, address resolver, bytes[] data, bool reverseRecord, uint16 ownerControlledFuses) payable",
  "function minCommitmentAge() view returns (uint256)",
]);
const registryAbi = parseAbi([
  "function owner(bytes32 node) view returns (address)",
  "function resolver(bytes32 node) view returns (address)",
  "function setResolver(bytes32 node, address resolver)",
]);
const wrapperAbi = parseAbi(["function ownerOf(uint256 id) view returns (address)", "function setResolver(bytes32 node, address resolver)"]);

const wanted: { label: string; owner: Hex }[] = [
  { label: "tete-a-tete", owner: account.address },
  { label: "marie", owner: "0x2472A9AFd2861ac3AC9f2ede36669697D47807b5" },
  { label: "pierre", owner: "0x38AF94183dED8A2cB5544D7bAD60E514d5AcD079" },
];
const duration = 365n * 86400n;

console.log("deployer", account.address, "balance", Number(await pub.getBalance({ address: account.address })) / 1e18, "ETH");

type Reg = { label: string; owner: Hex; secret: Hex };
const regs: Reg[] = [];
for (const w of wanted) {
  const available = await pub.readContract({ address: CONTROLLER, abi: controllerAbi, functionName: "available", args: [w.label] });
  if (!available) { console.log(w.label, "not available — skipping"); continue; }
  const secret = toHex(randomBytes(32));
  const commitment = await pub.readContract({ address: CONTROLLER, abi: controllerAbi, functionName: "makeCommitment", args: [w.label, w.owner, duration, secret, PUBLIC_RESOLVER, [], false, 0] });
  const hash = await wallet.writeContract({ address: CONTROLLER, abi: controllerAbi, functionName: "commit", args: [commitment] });
  console.log("commit", w.label, hash);
  await pub.waitForTransactionReceipt({ hash });
  regs.push({ label: w.label, owner: w.owner, secret });
}
if (regs.length) {
  const age = await pub.readContract({ address: CONTROLLER, abi: controllerAbi, functionName: "minCommitmentAge" });
  console.log(`waiting ${age + 15n}s for commitments to mature…`);
  await new Promise((r) => setTimeout(r, Number(age + 15n) * 1000));
  for (const reg of regs) {
    const price = await pub.readContract({ address: CONTROLLER, abi: controllerAbi, functionName: "rentPrice", args: [reg.label, duration] });
    const value = ((price.base + price.premium) * 105n) / 100n;
    const args = [reg.label, reg.owner, duration, reg.secret, PUBLIC_RESOLVER as Hex, [] as Hex[], false, 0] as const;
    await pub.simulateContract({ address: CONTROLLER, abi: controllerAbi, functionName: "register", args, value, account });
    const hash = await wallet.writeContract({ address: CONTROLLER, abi: controllerAbi, functionName: "register", args, value });
    console.log("register", reg.label, hash, "value", Number(value) / 1e18);
    const rcpt = await pub.waitForTransactionReceipt({ hash });
    console.log("  status", rcpt.status);
  }
}

// Point the parent at the wildcard resolver.
const node = namehash("tete-a-tete.eth");
const owner = await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "owner", args: [node] });
const current = await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "resolver", args: [node] });
console.log("tete-a-tete.eth registry owner", owner, "resolver", current);
if (owner !== "0x0000000000000000000000000000000000000000" && current.toLowerCase() !== RDV_RESOLVER.toLowerCase()) {
  const wrapped = owner.toLowerCase() === NAME_WRAPPER.toLowerCase();
  const hash = wrapped
    ? await wallet.writeContract({ address: NAME_WRAPPER, abi: wrapperAbi, functionName: "setResolver", args: [node, RDV_RESOLVER] })
    : await wallet.writeContract({ address: REGISTRY, abi: registryAbi, functionName: "setResolver", args: [node, RDV_RESOLVER] });
  console.log("setResolver", wrapped ? "(via NameWrapper)" : "(via registry)", hash);
  await pub.waitForTransactionReceipt({ hash });
}
console.log("final resolver", await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "resolver", args: [node] }));
for (const n of ["marie.eth", "pierre.eth"]) {
  const o = await pub.readContract({ address: REGISTRY, abi: registryAbi, functionName: "owner", args: [namehash(n)] });
  const wo = o.toLowerCase() === NAME_WRAPPER.toLowerCase() ? await pub.readContract({ address: NAME_WRAPPER, abi: wrapperAbi, functionName: "ownerOf", args: [BigInt(namehash(n))] }) : o;
  console.log(n, "owner", wo);
}
