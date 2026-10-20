import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shellCss = readFileSync(new URL("../../app/styles/shell.css", import.meta.url), "utf8");
const changesCss = readFileSync(new URL("../../app/styles/changes.css", import.meta.url), "utf8");
const legalCss = readFileSync(new URL("../../app/styles/legal.css", import.meta.url), "utf8");

function rule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{[^}]+\\}`))?.[0] ?? "";
}

describe("shell nav item states", () => {
  it("gives hover, current, and focus-visible their token treatments at 44px", () => {
    const row = rule(shellCss, ".nav-row");
    const hover = rule(shellCss, ".nav-row:hover");
    const active = rule(shellCss, ".nav-row.is-active");
    const current = rule(shellCss, ".nav-row[aria-current=\"page\"]");
    const focus = rule(shellCss, ".nav-row:focus-visible");
    expect(row).toContain("min-height: var(--size-target-min)");
    expect(row).toContain("min-width: var(--size-target-min)");
    expect(hover).toContain("background: var(--color-bg-hover)");
    expect(hover).toContain("color: var(--color-text-primary)");
    expect(hover).not.toContain("#1a232a");
    expect(active).toContain("background: var(--color-bg-selected)");
    expect(active).toContain("color: var(--color-text-primary)");
    expect(current).toContain("background: var(--color-bg-selected)");
    expect(current).toContain("color: var(--color-text-primary)");
    expect(focus).toContain("outline: var(--size-border-focus) solid var(--color-focus)");
    expect(focus).toContain("outline-offset: var(--size-border-focus)");
    expect(rule(shellCss, ".nav-row.is-active > svg")).toContain("color: var(--color-focus)");
    expect(rule(shellCss, ".nav-row:hover .nav-copy small")).toContain("color: var(--color-text-secondary)");
    expect(rule(changesCss, ".app-shell.is-collapsed .nav-row")).toContain("width: var(--size-target-min)");
  });
});

describe("project switcher", () => {
  it("matches the 44px field select: border, radius, focus, and chevron", () => {
    const select = rule(shellCss, ".project-switcher select");
    const hover = rule(shellCss, ".project-switcher select:hover:not(:focus-visible)");
    const focus = rule(shellCss, ".project-switcher select:focus-visible");
    const chevron = rule(shellCss, ".project-switcher::after");
    expect(select).toContain("height: var(--size-target-min)");
    expect(select).toContain("min-height: var(--size-target-min)");
    expect(select).toContain("border: 1px solid var(--color-border-input)");
    expect(select).toContain("border-radius: var(--radius-md)");
    expect(select).toContain("appearance: none");
    expect(hover).toContain("border-color: var(--color-border-input-hover)");
    expect(focus).toContain("outline: none");
    expect(focus).toContain("border-width: var(--size-border-focus)");
    expect(focus).toContain("border-color: var(--color-focus)");
    expect(chevron).toContain("border-right: 1.5px solid var(--color-text-tertiary)");
    expect(chevron).toContain("border-bottom: 1.5px solid var(--color-text-tertiary)");
    expect(rule(shellCss, ".project-switcher")).toContain("font-size: var(--font-size-xs)");
  });
});

describe("landing and legal styles", () => {
  it("uses tokens only and keeps the pilot badge ahead of the option kicker", () => {
    const hex = legalCss.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
    expect(hex, hex.join("\n")).toEqual([]);
    expect(legalCss).not.toContain("#667085");
    expect(legalCss).not.toContain("#F2F4F7");
    const feature = rule(legalCss, ".pilot-feature");
    expect(feature).toContain("order: -1");
    expect(feature).toContain("background: var(--color-bg-warning)");
    expect(feature).toContain("color: var(--color-text-accent)");
    expect(rule(legalCss, ".pilot-kicker")).toContain("text-transform: uppercase");
    expect(rule(legalCss, ".pilot-join:hover, .waitlist-submit:hover")).toContain("background: var(--color-bg-brand-hover)");
    expect(rule(legalCss, ".pilot-join:focus-visible, .waitlist-submit:focus-visible")).toContain("outline: var(--size-border-focus) solid var(--color-focus)");
    expect(rule(legalCss, ".pilot-join:focus-visible, .waitlist-submit:focus-visible")).toContain("outline-offset: var(--size-border-focus)");
    expect(rule(legalCss, ".pilot-join, .waitlist-submit")).toContain("min-height: var(--size-target-min)");
    const undersized = [...legalCss.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((match) => match[0]);
    expect(undersized).toEqual([]);
  });
});
