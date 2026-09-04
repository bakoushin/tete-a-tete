import type { Hex } from "viem";
import { CcipError, handleCcip } from "@/gateway/ccip";
import { json, preflight } from "@/gateway/http";
import { getSigner } from "@/gateway/signer";
import { getStore } from "@/gateway/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** EIP-3668 GET: /api/ccip/{sender}/{data} */
export async function GET(_req: Request, ctx: { params: Promise<{ sender: string; data: string }> }) {
  const { sender, data } = await ctx.params;
  try {
    const body = await handleCcip(sender as Hex, data.replace(/\.json$/, "") as Hex, getStore(), getSigner());
    return json(body);
  } catch (e) {
    if (e instanceof CcipError) return json({ message: e.message }, e.status);
    console.error("[ccip]", e);
    return json({ message: "gateway error" }, 500);
  }
}

export function OPTIONS() {
  return preflight();
}
