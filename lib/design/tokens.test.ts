import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const trackedPrefixes = ["--color-", "--font-", "--radius-", "--shadow-", "--space-", "--size-"];

function tokenNames(markdown: string) {
  const names = new Set<string>();
  for (const match of markdown.matchAll(/`((?:color|space|radius|font|size)\/[^`]+)`/g)) {
    names.add(`--${match[1]!.replaceAll("/", "-")}`);
  }
  return names;
}

function documentedValues(markdown: string) {
  const values = new Map<string, string>();
  for (const line of markdown.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    const name = cells[0]?.replaceAll("`", "");
    const value = cells[1]?.replaceAll("`", "");
    if (!name || !value || !/^(?:color|space|radius|font|size)\//.test(name)) continue;
    values.set(`--${name.replaceAll("/", "-")}`, value);
  }
  return values;
}

function definedCustomProperties(css: string) {
  const names = new Set<string>();
  for (const match of css.matchAll(/(--[A-Za-z0-9-]+)\s*:/g)) names.add(match[1]!);
  return names;
}

function declaredValues(css: string) {
  const values = new Map<string, string>();
  for (const match of css.matchAll(/(--[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) {
    if (!values.has(match[1]!)) values.set(match[1]!, match[2]!.trim());
  }
  return values;
}

function resolveValue(name: string, values: Map<string, string>, seen = new Set<string>()): string | undefined {
  const raw = values.get(name);
  if (!raw) return undefined;
  const alias = /^var\((--[A-Za-z0-9-]+)\)$/.exec(raw);
  if (!alias) return raw;
  if (seen.has(name)) return raw;
  seen.add(name);
  return resolveValue(alias[1]!, values, seen);
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

  it("adds no unlisted color, font, radius, shadow, space, or size tokens", () => {
    const extra = [...defined].filter((name) => (
      trackedPrefixes.some((prefix) => name.startsWith(prefix)) && !expected.has(name)
    )).sort();
    expect(extra, extra.join("\n")).toEqual([]);
  });

  it("matches the documented value of every token, including size", () => {
    const declared = declaredValues(css);
    const mismatches = [...documentedValues(markdown)].flatMap(([name, value]) => {
      const resolved = resolveValue(name, declared);
      if (resolved?.toLowerCase() === value.toLowerCase()) return [];
      return [`${name}: ${resolved ?? "missing"} ≠ ${value}`];
    });
    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });
});
