import { describe, expect, it } from "vitest";
import { WEEK_MS, readWindow, weekEndMs, weekIndex, weekStartMs } from "../src/week";

describe("week", () => {
  it("indexes UTC weeks", () => {
    expect(weekIndex(0)).toBe(0);
    expect(weekIndex(WEEK_MS - 1)).toBe(0);
    expect(weekIndex(WEEK_MS)).toBe(1);
  });
  it("read window is current + previous", () => {
    const now = Date.UTC(2026, 8, 5);
    const [cur, prev] = readWindow(now);
    expect(cur - prev).toBe(1);
    expect(weekStartMs(cur) <= now && now < weekEndMs(cur)).toBe(true);
  });
});
