import type { Hex } from "viem";

export const PARENT_NAME = process.env.NEXT_PUBLIC_PARENT_NAME || "tete-a-tete.eth";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";
export const RESOLVER_ADDRESS = (process.env.NEXT_PUBLIC_RESOLVER_ADDRESS || "") as Hex;
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/** Poll cadence is fixed (not activity-driven) so traffic shape says nothing about the conversation. */
export const POLL_VISIBLE_MS = 1000;
export const POLL_HIDDEN_MS = 10_000;
/** How often to re-check the peer's rdv-key for rotation. */
export const KEY_CHECK_MS = 30_000;
