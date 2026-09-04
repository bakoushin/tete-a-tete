import { WriteError, handleWrite } from "@/gateway/write";
import { json, preflight } from "@/gateway/http";
import { getStore } from "@/gateway/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Write a sealed weekly record. Body: { node, blob, writer, ts, sig } */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ message: "invalid json" }, 400);
  }
  try {
    return json(await handleWrite(body, getStore()));
  } catch (e) {
    if (e instanceof WriteError) return json({ message: e.message }, e.status);
    console.error("[write]", e);
    return json({ message: "gateway error" }, 500);
  }
}

export function OPTIONS() {
  return preflight();
}
