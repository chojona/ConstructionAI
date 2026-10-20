import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const trackedPrefixes = ["--color-", "--font-", "--radius-", "--shadow-", "--space-"];

function tokenNames(markdown: string) {
  const names = new Set<string>();
  for (const match of markdown.matchAll(/`((?:color|space|radius|font|size)\/[^`]+)`/g)) {
    names.add(`--${match[1]!.replaceAll("/", "-")}`);
  }
  return names;
}

function definedCustomProperties(css: string) {
  const names = new Set<string>();
  for (const match of css.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)) names.add(match[1]!);
  return names;
}

describe("ConstructionAI tokens", () => {
  const markdown = readFileSync(new URL("../../docs/design/tokens.md", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../app/styles/tokens.css", import.meta.url), "utf8");
  const expected = tokenNames(markdown);
  const defined = definedCustomProperties(css);

  it("defines every name from docs/design/tokens.md", () => {
    const missing = [...expected].filter((name) => !defined.has(name)).sort();
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("adds no unlisted color, font, radius, shadow, or space tokens", () => {
    const extra = [...defined].filter((name) => (
      trackedPrefixes.some((prefix) => name.startsWith(prefix)) && !expected.has(name)
    )).sort();
    expect(extra, extra.join("\n")).toEqual([]);
  });
});
