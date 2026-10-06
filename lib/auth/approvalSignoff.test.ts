import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalSignoffText } from "@/components/review/approval-signoff";
import { approvalSignoff, signoffForReviewer } from "./approvalSignoff";

describe("approval sign-off", () => {
  it("keeps the recorded name and marks a disabled reviewer in muted text", () => {
    const active = approvalSignoff("user_jane", { knownName: "Jane Doe", disabled: false });
    const disabled = signoffForReviewer("user_jane", [
      { userId: "user_jane", name: "Jane Doe", status: "DISABLED" },
    ]);
    expect(active).toEqual({ name: "Jane Doe", disabled: false });
    expect(disabled).toEqual({ name: "Jane Doe", disabled: true });
    expect(disabled.name).not.toBe("");
    expect(disabled.name).not.toBe("Unknown");

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

  it("does not replace a missing name with Unknown", () => {
    expect(approvalSignoff("Unknown", { disabled: true })).toEqual({ name: "Recorded reviewer", disabled: true });
    expect(approvalSignoff("  ", { knownName: "Unknown", disabled: true }).name).toBe("Recorded reviewer");
    expect(approvalSignoff("Avery Quinn").name).toBe("Avery Quinn");
  });
});
