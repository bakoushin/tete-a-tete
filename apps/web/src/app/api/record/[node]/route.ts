import type { Hex } from "viem";
import { json, preflight } from "@/gateway/http";
import { getStore } from "@/gateway/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the gateway actually holds for a node — used by the "What's public?" panel. */
export async function GET(_req: Request, ctx: { params: Promise<{ node: string }> }) {
  const { node } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(node)) return json({ message: "bad node" }, 400);
  const rec = await getStore().get(node as Hex);
  if (!rec || rec.validUntil <= Date.now()) return json({ node, record: null });
  return json({ node, record: rec });
}

export function OPTIONS() {
  return preflight();
}
