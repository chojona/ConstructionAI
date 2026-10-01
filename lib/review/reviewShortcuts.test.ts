import { describe, expect, it } from "vitest";
import { nextQueueIndex, reviewShortcut } from "./reviewShortcuts";

const idle = { typing: false, armed: null, reasonReady: false } as const;

describe("reviewShortcut", () => {
  it("accepts, arms dismiss and flag, and moves without a modifier", () => {
    expect(reviewShortcut("a", idle)).toEqual({ type: "accept" });
    expect(reviewShortcut("D", idle)).toEqual({ type: "arm", decision: "DISMISSED" });
    expect(reviewShortcut("f", idle)).toEqual({ type: "arm", decision: "FLAGGED" });
    expect(reviewShortcut("ArrowDown", idle)).toEqual({ type: "move", direction: 1 });
    expect(reviewShortcut("ArrowUp", idle)).toEqual({ type: "move", direction: -1 });
  });

  it("ignores decision keys while typing and confirms a ready reason with Enter", () => {
    const typing = { typing: true, armed: "DISMISSED" as const, reasonReady: true };
    expect(reviewShortcut("a", typing)).toBeNull();
    expect(reviewShortcut("Enter", typing)).toEqual({ type: "confirm" });
    expect(reviewShortcut("Enter", { ...typing, reasonReady: false })).toBeNull();
  });

  it("confirms a repeated dismiss or flag only after a reason is present", () => {
    expect(reviewShortcut("d", { typing: false, armed: "DISMISSED", reasonReady: false })).toEqual({
      type: "arm",
      decision: "DISMISSED",
    });
    expect(reviewShortcut("d", { typing: false, armed: "DISMISSED", reasonReady: true })).toEqual({ type: "confirm" });
    expect(reviewShortcut("f", { typing: false, armed: "DISMISSED", reasonReady: true })).toEqual({
      type: "arm",
      decision: "FLAGGED",
    });
  });

  it("cancels an armed decision with Escape", () => {
    expect(reviewShortcut("Escape", { typing: true, armed: "FLAGGED", reasonReady: false })).toEqual({ type: "cancel" });
    expect(reviewShortcut("Escape", idle)).toBeNull();
  });
});

describe("nextQueueIndex", () => {
  it("wraps movement inside the open queue", () => {
    expect(nextQueueIndex(0, 3, -1)).toBe(2);
    expect(nextQueueIndex(2, 3, 1)).toBe(0);
    expect(nextQueueIndex(0, 0, 1)).toBe(0);
  });
});
