import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalSignoffText } from "@/components/review/approval-signoff";
import { approvalSignoff, signoffForReviewer } from "./approvalSignoff";
import type { ReviewerDirectoryEntry } from "./roles";

function jane(overrides: Partial<ReviewerDirectoryEntry> = {}): ReviewerDirectoryEntry {
  return {
    userId: "user_jane",
    name: "Jane Doe",
    email: "jane.doe@northstar.example",
    status: "DISABLED",
    ...overrides,
  };
}

describe("approval sign-off", () => {
  it("uses the person name when it is present", () => {
    expect(signoffForReviewer("user_jane", [jane()])).toEqual({ name: "Jane Doe", disabled: true });
    expect(approvalSignoff("user_jane", { knownName: "Jane Doe", knownEmail: "jane.doe@northstar.example" })).toEqual({
      name: "Jane Doe",
      disabled: false,
    });
  });

  it("uses the email when the name is missing", () => {
    expect(signoffForReviewer("user_jane", [jane({ name: null })])).toEqual({
      name: "jane.doe@northstar.example",
      disabled: true,
    });
    expect(signoffForReviewer("user_jane", [jane({ name: "  " })])).toEqual({
      name: "jane.doe@northstar.example",
      disabled: true,
    });
    expect(signoffForReviewer("user_jane", [jane({ name: "Unknown" })])).toEqual({
      name: "jane.doe@northstar.example",
      disabled: true,
    });
  });

  it("uses Recorded reviewer when the name and email are both missing", () => {
    expect(signoffForReviewer("user_jane", [jane({ name: null, email: null })])).toEqual({
      name: "Recorded reviewer",
      disabled: true,
    });
    expect(signoffForReviewer("user_jane", [jane({ name: "Unknown", email: "Unknown" })]).name).toBe("Recorded reviewer");
    expect(signoffForReviewer("user_jane", []).name).toBe("Recorded reviewer");
    expect(signoffForReviewer("c" + "a".repeat(24), []).name).toBe("Recorded reviewer");
    expect(approvalSignoff("Unknown", { disabled: true })).toEqual({ name: "Recorded reviewer", disabled: true });
    expect(approvalSignoff("  ", { knownName: "Unknown", disabled: true }).name).toBe("Recorded reviewer");
  });

  it("keeps a typed reviewer label and marks a disabled reviewer in muted text", () => {
    expect(approvalSignoff("Avery Quinn").name).toBe("Avery Quinn");
    const disabled = signoffForReviewer("user_jane", [jane()]);
    expect(disabled.name).not.toBe("");
    expect(disabled.name).not.toBe("Unknown");
    expect(disabled.name).not.toBe("user_jane");

    const html = renderToStaticMarkup(createElement(ApprovalSignoffText, disabled));
    expect(html).toContain("Jane Doe");
    expect(html).toContain("> (disabled)<");
    expect(html).toContain('class="approval-signoff-disabled"');
    expect(html).not.toMatch(/badge|pill|status-danger|color-danger/i);

    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    const rule = css.match(/\.approval-signoff-disabled \{[^}]+\}/)?.[0] ?? "";
    expect(rule).toContain("var(--color-ink-secondary)");
    expect(rule).not.toMatch(/background|border-radius|badge|pill|--color-danger|--color-warning/);
  });
});
