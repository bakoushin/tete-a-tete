/**
 * Demo clock. `?now=2026-09-12T10:00:00Z` shifts "now" by a fixed offset so weekly rollover can be
 * shown live. Offset lives only in this tab's memory.
 */
let offsetMs = 0;
let initialized = false;

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const raw = new URLSearchParams(window.location.search).get("now");
  if (!raw) return;
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) offsetMs = t - Date.now();
}

export function now(): number {
  init();
  return Date.now() + offsetMs;
}

export function clockOffsetMs(): number {
  init();
  return offsetMs;
}
