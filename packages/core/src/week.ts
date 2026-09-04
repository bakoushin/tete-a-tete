/** Epoch math. A channel lives one UTC week (7 days), then nothing exists anywhere. */
export const WEEK_SECONDS = 7 * 24 * 60 * 60;
export const WEEK_MS = WEEK_SECONDS * 1000;

/** Integer week index for a point in time (weeks since the Unix epoch). */
export function weekIndex(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / WEEK_MS);
}

/** Weeks a reader must check: the current one and the previous one (records live 7 days after write). */
export function readWindow(nowMs: number = Date.now()): [current: number, previous: number] {
  const w = weekIndex(nowMs);
  return [w, w - 1];
}

export function weekStartMs(week: number): number {
  return week * WEEK_MS;
}

export function weekEndMs(week: number): number {
  return (week + 1) * WEEK_MS;
}
