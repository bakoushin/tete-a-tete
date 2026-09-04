import { createPublicClient, http, labelhash, namehash, toHex, type Hex, type WalletClient } from "viem";
import { normalize } from "viem/ens";
import { sepolia } from "viem/chains";
import { RDV_KEY_RECORD, RDV_RECORD, decodeRdvKey, dnsEncode, encodeRdvKey, type WriteRequest } from "@tat/core";
import { RESOLVER_ADDRESS, RPC_URL } from "./config";
import type { StoredRecord } from "@/gateway/store";

export const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL || undefined) });

export const resolverAbi = [
  { type: "function", name: "gatewayUrls", stateMutability: "view", inputs: [], outputs: [{ type: "string[]" }] },
  { type: "function", name: "signers", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
] as const;

export const setTextAbi = [
  {
    type: "function",
    name: "setText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
] as const;

export function normalizeName(name: string): string {
  const n = normalize(name.trim().toLowerCase());
  if (!n.includes(".")) throw new Error("use a full name like pierre.eth");
  return n;
}

/** The peer's published X25519 key, or null if they never enabled private channels. */
export async function readRdvKey(name: string): Promise<Uint8Array | null> {
  const v = await publicClient.getEnsText({ name, key: RDV_KEY_RECORD });
  return decodeRdvKey(v);
}

export async function readEnsAddress(name: string): Promise<Hex | null> {
  return publicClient.getEnsAddress({ name });
}

/**
 * Standard ENS resolution of `<label>.tete-a-tete.eth`: Universal Resolver → wildcard resolver →
 * OffchainLookup → gateway → signature verified in resolveWithProof. Throws if the gateway is down.
 */
export async function readMailbox(name: string): Promise<string | null> {
  const v = await publicClient.getEnsText({ name, key: RDV_RECORD, strict: true });
  return v || null;
}

export interface GatewayInfo {
  template: string;
  origin: string;
  writeUrl: string;
}

export async function getGateway(): Promise<GatewayInfo> {
  if (!RESOLVER_ADDRESS) throw new Error("NEXT_PUBLIC_RESOLVER_ADDRESS not set");
  const urls = await publicClient.readContract({ address: RESOLVER_ADDRESS, abi: resolverAbi, functionName: "gatewayUrls" });
  const template = urls[0];
  if (!template) throw new Error("resolver has no gateway url");
  const origin = new URL(template.replace("{sender}", "s").replace("{data}", "d")).origin;
  return { template, origin, writeUrl: `${origin}/api/write` };
}

export async function postWrite(gw: GatewayInfo, req: WriteRequest): Promise<{ validUntil: number }> {
  const res = await fetch(gw.writeUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
  const body = (await res.json().catch(() => ({}))) as { message?: string; validUntil?: number };
  if (!res.ok) throw new Error(body.message || `write failed (${res.status})`);
  return { validUntil: body.validUntil ?? 0 };
}

export async function fetchGatewayRecord(gw: GatewayInfo, node: Hex): Promise<StoredRecord | null> {
  const res = await fetch(`${gw.origin}/api/record/${node}`);
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  return ((await res.json()) as { record: StoredRecord | null }).record;
}

/** One wallet tx: setText(node, "rdv-key", "x25519:…") on the name's own resolver. */
export async function publishRdvKey(wallet: WalletClient, name: string, publicKey: Uint8Array): Promise<Hex> {
  const resolver = await publicClient.getEnsResolver({ name });
  const [account] = await wallet.getAddresses();
  if (!account) throw new Error("wallet has no account");
  const hash = await wallet.writeContract({
    account,
    chain: sepolia,
    address: resolver,
    abi: setTextAbi,
    functionName: "setText",
    args: [namehash(name), RDV_KEY_RECORD, encodeRdvKey(publicKey)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export const UNIVERSAL_RESOLVER = "0xeeeeeeee14d718c2b47d9923deab1335e144eeee" as const;
export const universalResolverAbi = [
  { type: "function", name: "findOwner", stateMutability: "view", inputs: [{ name: "name", type: "bytes" }], outputs: [{ type: "address" }] },
  { type: "function", name: "findParentRegistry", stateMutability: "view", inputs: [{ name: "name", type: "bytes" }], outputs: [{ type: "address" }] },
  { type: "function", name: "findResolver", stateMutability: "view", inputs: [{ name: "name", type: "bytes" }], outputs: [{ type: "address" }, { type: "bytes32" }, { type: "uint256" }] },
] as const;
export const registryV2Abi = [
  { type: "function", name: "setResolver", stateMutability: "nonpayable", inputs: [{ name: "anyId", type: "uint256" }, { name: "resolver", type: "address" }], outputs: [] },
  { type: "function", name: "getResolver", stateMutability: "view", inputs: [{ name: "label", type: "string" }], outputs: [{ type: "address" }] },
] as const;

/** Who controls a name, per the ENSv2 Universal Resolver (walks the hierarchical registry). */
export async function readNameOwner(name: string): Promise<Hex | null> {
  const owner = await publicClient.readContract({
    address: UNIVERSAL_RESOLVER,
    abi: universalResolverAbi,
    functionName: "findOwner",
    args: [toHex(dnsEncode(name))],
  });
  return owner === "0x0000000000000000000000000000000000000000" ? null : owner;
}

/** Registry that holds `name` (its parent's registry) and the resolver currently found for it. */
export async function readParentRegistryAndResolver(name: string): Promise<{ registry: Hex; resolver: Hex; offset: bigint }> {
  const dns = toHex(dnsEncode(name));
  const [registry, [resolver, , offset]] = await Promise.all([
    publicClient.readContract({ address: UNIVERSAL_RESOLVER, abi: universalResolverAbi, functionName: "findParentRegistry", args: [dns] }),
    publicClient.readContract({ address: UNIVERSAL_RESOLVER, abi: universalResolverAbi, functionName: "findResolver", args: [dns] }),
  ]);
  return { registry, resolver, offset };
}

/** ENSv2: setResolver(labelhash, resolver) on the registry that holds the name. Caller must own it. */
export async function setNameResolver(wallet: WalletClient, name: string, resolver: Hex): Promise<Hex> {
  const { registry } = await readParentRegistryAndResolver(name);
  const label = name.split(".")[0]!;
  const [account] = await wallet.getAddresses();
  if (!account) throw new Error("wallet has no account");
  const hash = await wallet.writeContract({
    account,
    chain: sepolia,
    address: registry,
    abi: registryV2Abi,
    functionName: "setResolver",
    args: [BigInt(labelhash(label)), resolver],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
