import { json, preflight } from "@/gateway/http";
import { getSigner } from "@/gateway/signer";
import { getStore, UpstashStore } from "@/gateway/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Operator info: which address must be enabled on the resolver via setSigners(). */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return json({
    signer: getSigner().address,
    urlTemplate: `${origin}/api/ccip/{sender}/{data}`,
    writeUrl: `${origin}/api/write`,
    store: getStore() instanceof UpstashStore ? "upstash" : "memory",
  });
}

export function OPTIONS() {
  return preflight();
}
