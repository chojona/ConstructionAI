import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegalFooterLinks } from "@/components/legal/legal-chrome";
import { PayEstimateCard } from "@/components/legal/pay-estimate-card";
import { PrivacyNote } from "@/components/legal/privacy-note";
import { SignupConsent } from "@/components/legal/signup-consent";
import { TermsOfUse } from "@/components/legal/terms-of-use";
import {
  doNotPublishLines,
  findLegalCopyViolations,
  loginRecordFallback,
  loginRecordUnpublished,
  prohibitedPhrase,
} from "@/lib/legal/copy";
import {
  emptyLegalFacts,
  filledLegalFactEnv,
  filledLegalFacts,
  legalFactEnvKeys,
  legalFactKeys,
  type LegalFactKey,
} from "@/lib/legal/facts";
import {
  assertLegalCopyPublishable,
  canPublishLegalPages,
  enforceLegalPublishDuringBuild,
  renderLegalSurfaces,
  resetLegalPublishWarningForTests,
} from "@/lib/legal/publish";

const copyPath = path.join(import.meta.dirname, "frontend-copy.md");
const envKeys = ["LEGAL_PAGES_PUBLISHED", "NEXT_PHASE", "NEXT_RUNTIME", ...Object.values(legalFactEnvKeys)];

let saved: Record<string, string | undefined> = {};

function applyEnv(values: Record<string, string | undefined>) {
  for (const key of envKeys) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

beforeEach(() => {
  saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  resetLegalPublishWarningForTests();
});

afterEach(() => {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

describe("legal copy publish guard", () => {
  it("counts 10 DO NOT PUBLISH lines in the vendored copy", () => {
    const lines = doNotPublishLines(readFileSync(copyPath, "utf8"));
    expect(lines).toHaveLength(10);
    for (const line of lines) expect(prohibitedPhrase(line).length).toBeGreaterThan(20);
  });

  it("keeps the login-record bullet and swaps in the fallback sentence", () => {
    const html = renderToStaticMarkup(createElement(PrivacyNote, { facts: filledLegalFacts }));
    expect(html).toContain(loginRecordFallback);
    expect(html).toContain("failed attempts to use an invite link");
    expect(html).not.toContain(loginRecordUnpublished);
    expect(html).not.toContain("up to 30 days");
  });

  it("leaves every other DO NOT PUBLISH sentence out of the rendered surfaces", () => {
    const html = renderLegalSurfaces(filledLegalFacts).replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, "\"");
    const lines = doNotPublishLines(readFileSync(copyPath, "utf8"));
    for (const line of lines) {
      expect(html).not.toContain(prohibitedPhrase(line));
    }
    expect(html).not.toContain("Before you upload");
    expect(html).not.toContain("Continue to upload");
    expect(html).not.toContain("You're getting this because you joined");
  });

  it("passes assertLegalCopyPublishable when every blank is filled", () => {
    expect(() => assertLegalCopyPublishable(filledLegalFacts)).not.toThrow();
  });

  it("throws from assertLegalCopyPublishable when one blank is left", () => {
    const facts = { ...filledLegalFacts, legalEntityName: null };
    expect(() => assertLegalCopyPublishable(facts)).toThrow(/legalEntityName/);
  });

  it("detects unfilled blank markers when the guard is bypassed", () => {
    const html = renderLegalSurfaces(emptyLegalFacts);
    const hits = findLegalCopyViolations(html);
    expect(hits.some((hit) => hit.includes("[legal entity name]"))).toBe(true);
    expect(hits.some((hit) => hit.includes("[PLACEHOLDER") || hit.includes("[legal entity name]"))).toBe(true);
    for (const surface of [
      renderToStaticMarkup(createElement(PrivacyNote, { facts: emptyLegalFacts })),
      renderToStaticMarkup(createElement(TermsOfUse, { facts: emptyLegalFacts })),
      renderToStaticMarkup(createElement(LegalFooterLinks)),
      renderToStaticMarkup(createElement(SignupConsent)),
      renderToStaticMarkup(createElement(PayEstimateCard, { pilot: true })),
    ]) {
      if (surface.includes("[")) expect(findLegalCopyViolations(surface).length).toBeGreaterThan(0);
    }
    expect(findLegalCopyViolations(renderToStaticMarkup(createElement(PrivacyNote, { facts: emptyLegalFacts }))).length).toBeGreaterThan(0);
  });

  it("finds no bracket tags on filled privacy, terms, footer, consent, and card B", () => {
    const surfaces = [
      renderToStaticMarkup(createElement(PrivacyNote, { facts: filledLegalFacts })),
      renderToStaticMarkup(createElement(TermsOfUse, { facts: filledLegalFacts })),
      renderToStaticMarkup(createElement(LegalFooterLinks)),
      renderToStaticMarkup(createElement(SignupConsent)),
      renderToStaticMarkup(createElement(PayEstimateCard, { pilot: true })),
    ];
    for (const html of surfaces) expect(findLegalCopyViolations(html)).toEqual([]);
  });

  it("fails the build hook only when the flag is on during a production build", () => {
    applyEnv({});
    process.env.NEXT_PHASE = "phase-production-build";
    expect(() => enforceLegalPublishDuringBuild()).not.toThrow();
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true" });
    process.env.NEXT_PHASE = "phase-production-build";
    expect(() => enforceLegalPublishDuringBuild()).toThrow(/not publishable/);
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true", ...filledLegalFactEnv() });
    process.env.NEXT_PHASE = "phase-production-build";
    expect(() => enforceLegalPublishDuringBuild()).not.toThrow();
    delete process.env.NEXT_PHASE;
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true" });
    expect(() => enforceLegalPublishDuringBuild()).not.toThrow();
  });

  it("warns once and stays closed when the flag is on and a fact is blank", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true" });
    expect(canPublishLegalPages()).toBe(false);
    expect(canPublishLegalPages()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("legalEntityName");
    expect(String(warn.mock.calls[0]?.[0])).toContain("contactEmail");
  });

  it("does not warn when the flag is off", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    applyEnv({ LEGAL_PAGES_PUBLISHED: "false" });
    expect(canPublishLegalPages()).toBe(false);
    applyEnv({ LEGAL_PAGES_PUBLISHED: "TRUE" });
    expect(canPublishLegalPages()).toBe(false);
    applyEnv({});
    expect(canPublishLegalPages()).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("startup register throws only when the flag is on and a fact is blank", async () => {
    applyEnv({});
    const { register } = await import("@/instrumentation");
    await expect(register()).resolves.toBeUndefined();
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true", ...filledLegalFactEnv() });
    await expect(register()).resolves.toBeUndefined();
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true", ...filledLegalFactEnv(), [legalFactEnvKeys.supportEmail]: "" });
    await expect(register()).rejects.toThrow(/supportEmail/);
  });
});

describe("filled fixture covers every required fact", () => {
  it("sets each typed fact", () => {
    for (const key of legalFactKeys) {
      expect(filledLegalFacts[key as LegalFactKey]?.trim().length).toBeGreaterThan(0);
    }
  });
});
