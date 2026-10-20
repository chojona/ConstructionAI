import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

const changesCss = readFileSync(new URL("../../app/styles/changes.css", import.meta.url), "utf8");
const tokensCss = readFileSync(new URL("../../app/styles/tokens.css", import.meta.url), "utf8");
const componentsCss = readFileSync(new URL("../../app/styles/components.css", import.meta.url), "utf8");

function rule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{[^}]+\\}`))?.[0] ?? "";
}

describe("command search focus", () => {
  it("draws the focus ring on the wrapper and leaves the input unbordered", () => {
    const wrapper = rule(changesCss, ".command-search");
    const input = rule(changesCss, ".command-search input");
    const focused = rule(tokensCss, ".command-search:focus-within");
    const inputFocus = rule(tokensCss, ".command-search input:focus-visible");
    expect(wrapper).toContain("min-height: var(--size-target-min)");
    expect(wrapper).toContain("border: var(--size-border-focus) solid transparent");
    expect(wrapper).toContain("border-radius: var(--radius-sm)");
    expect(input).toContain("border: 0");
    expect(input).toContain("outline: none");
    expect(input).not.toContain("min-height");
    expect(focused).toContain("border-color: var(--color-focus)");
    expect(focused).not.toContain("--color-border-default");
    expect(inputFocus).toContain("outline: none");
  });
});

describe("disabled outline button", () => {
  it("uses #98A2B3 for disabled and aria-disabled outline text on the white surface", () => {
    const text = rule(componentsCss, ".button-outline:disabled,\n.button-outline[aria-disabled=\"true\"]");
    expect(text).toContain("color: #98A2B3");
    expect(tokensCss).toContain("--color-text-disabled: var(--color-gray-600)");
    for (const props of [{ disabled: true }, { "aria-disabled": true }] as const) {
      const html = renderToStaticMarkup(createElement(Button, { variant: "outline", ...props }, "Disable"));
      expect(html).toContain("button-outline");
      expect(html).toContain("disabled:bg-[var(--color-bg-surface)]");
      expect(html).toContain("disabled:border-[var(--color-border-default)]");
      expect(html).toContain("disabled:shadow-[0_1px_2px_0_rgba(16,24,40,0.05)]");
      expect(html).toContain("aria-disabled:bg-[var(--color-bg-surface)]");
      expect(html).toContain("aria-disabled:shadow-[0_1px_2px_0_rgba(16,24,40,0.05)]");
    }
    const filled = renderToStaticMarkup(createElement(Button, { disabled: true }, "Save"));
    expect(filled).not.toContain("button-outline");
    expect(filled).toContain("disabled:text-[var(--color-text-disabled)]");
    expect(filled).toContain("disabled:bg-[var(--color-bg-disabled)]");
  });
});
