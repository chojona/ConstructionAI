export type ArmedDecision = "DISMISSED" | "FLAGGED";

export type ShortcutAction =
  | { type: "accept" }
  | { type: "arm"; decision: ArmedDecision }
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "move"; direction: -1 | 1 };

export function reviewShortcut(
  key: string,
  context: { typing: boolean; armed: ArmedDecision | null; reasonReady: boolean },
): ShortcutAction | null {
  if (key === "Escape") return context.armed ? { type: "cancel" } : null;
  if (context.typing) {
    if (key === "Enter" && context.armed && context.reasonReady) return { type: "confirm" };
    return null;
  }

  const normalized = key.toLowerCase();
  if (normalized === "a") return { type: "accept" };
  if (normalized === "d") {
    if (context.armed === "DISMISSED" && context.reasonReady) return { type: "confirm" };
    return { type: "arm", decision: "DISMISSED" };
  }
  if (normalized === "f") {
    if (context.armed === "FLAGGED" && context.reasonReady) return { type: "confirm" };
    return { type: "arm", decision: "FLAGGED" };
  }
  if (normalized === "arrowdown" || normalized === "arrowright") return { type: "move", direction: 1 };
  if (normalized === "arrowup" || normalized === "arrowleft") return { type: "move", direction: -1 };
  if (key === "Enter" && context.armed && context.reasonReady) return { type: "confirm" };
  return null;
}

export function nextQueueIndex(index: number, length: number, direction: -1 | 1) {
  if (length <= 0) return 0;
  return (index + direction + length) % length;
}
