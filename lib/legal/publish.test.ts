import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement, forwardRef, memo, useState, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegalFooterLinks } from "@/components/legal/legal-chrome";
import { PayEstimateCard } from "@/components/legal/pay-estimate-card";
import { PilotLanding } from "@/components/legal/pilot-landing";
import { PrivacyNote } from "@/components/legal/privacy-note";
import { SignupConsent } from "@/components/legal/signup-consent";
import { TermsOfUse } from "@/components/legal/terms-of-use";
import { MAX_PDF_PAGES } from "@/lib/documents/extractPdf";
import { MAX_UPLOAD_BYTES } from "@/lib/documents/uploadLimit";
import {
  consentUpdates,
  draftBanner,
  findLegalCopyViolations,
  loginRecordFallback,
  privacyFileDeletion,
  termsFileDeletion,
  waitlistInstruction,
  waitlistSignupSource,
} from "@/lib/legal/copy";
import { filledLegalFactEnv, filledLegalFacts } from "@/lib/legal/filledLegalFacts.fixture";
import {
  emptyLegalFacts,
  legalFactEnvKeys,
  legalFactKeys,
  legalFactRejected,
  type LegalFactKey,
  type LegalFacts,
} from "@/lib/legal/facts";
import {
  canPublishLegalPages,
  enforceLegalPublishDuringBuild,
  resetLegalPublishWarningForTests,
} from "@/lib/legal/publish";
import {
  assertLegalCopyPublishable,
  enforceLegalCopyDuringBuild,
  renderLegalSurfaces,
  scanLegalTree,
} from "@/lib/legal/scan";
import { unpublishedLegalSentences } from "@/lib/legal/unpublishedSentences.fixture";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const envKeys = [
  "LEGAL_PAGES_PUBLISHED",
  "LEGAL_ATTORNEY_REVIEWED",
  "PILOT_LANDING_PUBLISHED",
  "NEXT_PHASE",
  "NEXT_RUNTIME",
  ...Object.values(legalFactEnvKeys),
];

let saved: Record<string, string | undefined> = {};

function applyEnv(values: Record<string, string | undefined>) {
  for (const key of envKeys) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

function textOf(html: string): string {
  return html.replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
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
  it("keeps every DO NOT PUBLISH sentence out of the rendered surfaces", () => {
    const html = textOf(renderLegalSurfaces(filledLegalFacts));
    expect(unpublishedLegalSentences.length).toBeGreaterThan(0);
    for (const sentence of unpublishedLegalSentences) {
      expect(html, sentence).not.toContain(sentence);
    }
    expect(html).toContain(loginRecordFallback);
    expect(html).toContain(privacyFileDeletion);
    expect(html).toContain(termsFileDeletion);
    expect(html).toContain(waitlistSignupSource);
    expect(html).toContain("up to five optional questions");
    expect(html).not.toContain("Before you upload");
    expect(html).not.toContain("Continue to upload");
    expect(html).not.toContain("You're getting this because you joined");
    const footer = scanLegalTree(createElement(LegalFooterLinks));
    expect(footer).toContain("Privacy and data deletion");
    expect(footer).toContain("Terms");
    expect(footer).not.toContain("Contact");
    expect(footer).not.toContain("mailto:");
    expect(footer).not.toContain("©");
  });

  it("states the shared upload limits and leaves the unpublished limit sentence out", () => {
    const html = textOf(renderToStaticMarkup(createElement(PrivacyNote, { facts: filledLegalFacts })));
    expect(html).toContain(`${MAX_UPLOAD_BYTES.toLocaleString("en-US")} bytes`);
    expect(html).toContain(`${(MAX_UPLOAD_BYTES / 1_000_000).toFixed(1)} MB`);
    expect(html).toContain(`${MAX_PDF_PAGES} pages`);
    expect(html).not.toContain(unpublishedLegalSentences[1]);
    expect(html).not.toContain(unpublishedLegalSentences[2]);
  });

  it("passes assertLegalCopyPublishable when every blank is filled with accepted values", () => {
    for (const key of legalFactKeys) {
      expect(legalFactRejected(key, filledLegalFacts[key])).toBe(false);
    }
    expect(() => assertLegalCopyPublishable(filledLegalFacts)).not.toThrow();
  });

  it("rejects TBD, Fixture, fixture.example, and bad email, date, and year values", () => {
    expect(legalFactRejected("legalEntityName", "TBD")).toBe(true);
    expect(legalFactRejected("postalAddress", "Northline TBD office")).toBe(true);
    expect(legalFactRejected("legalEntityName", "Fixture Construction LLC")).toBe(true);
    expect(legalFactRejected("privacyContactEmail", "privacy@fixture.example")).toBe(true);
    expect(legalFactRejected("supportEmail", "not-an-email")).toBe(true);
    expect(legalFactRejected("effectiveDate", "soon")).toBe(true);
    expect(legalFactRejected("effectiveDate", "2026-13-40")).toBe(true);
    expect(legalFactRejected("copyrightYear", "26")).toBe(true);
    const rejected: LegalFacts = { ...filledLegalFacts, contactEmail: "contact@fixture.example" };
    expect(() => assertLegalCopyPublishable(rejected)).toThrow(/contactEmail/);
  });

  it("throws from assertLegalCopyPublishable when one blank is left", () => {
    const facts = { ...filledLegalFacts, legalEntityName: null };
    expect(() => assertLegalCopyPublishable(facts)).toThrow(/legalEntityName/);
  });

  it("stays closed while the Bluebeam CSV columns are still unconfirmed", () => {
    const facts = { ...filledLegalFacts, bluebeamCsvColumns: null };
    expect(() => assertLegalCopyPublishable(facts)).toThrow(/bluebeamCsvColumns/);
    const html = textOf(renderToStaticMarkup(createElement(PrivacyNote, { facts })));
    expect(html).toContain("[bluebeam csv columns]");
    expect(findLegalCopyViolations(html).some((hit) => hit.includes("[bluebeam csv columns]"))).toBe(true);
  });

  it("joins text with an empty string so a placeholder split across elements is caught", () => {
    function Split() {
      return createElement("span", null, "[legal ", createElement("strong", null, "entity"), " name]");
    }
    const text = scanLegalTree(createElement(Split));
    expect(text).toContain("[legal entity name]");
    expect(findLegalCopyViolations(text).some((hit) => hit.includes("[legal entity name]"))).toBe(true);
  });

  it("reads dangerouslySetInnerHTML as text", () => {
    function Raw() {
      return createElement("div", { dangerouslySetInnerHTML: { __html: "Write [support email] here" } });
    }
    const hits = findLegalCopyViolations(scanLegalTree(createElement(Raw)));
    expect(hits.some((hit) => hit.includes("[support email]"))).toBe(true);
  });

  it("throws when a component cannot be scanned", () => {
    function Hooked() {
      useState(0);
      return "skipped [postal address]";
    }
    const Memoed = memo(function Memoed() {
      return "skipped [year]";
    });
    const Forwarded = forwardRef<HTMLSpanElement>(function Forwarded() {
      return createElement("span", null, "skipped [contact email]");
    });
    class ClassNote {
      static displayName = "ClassNote";
      props: unknown;
      constructor(props: unknown) {
        this.props = props;
      }
      render() {
        return "skipped [effective date]";
      }
    }
    (ClassNote.prototype as { isReactComponent?: boolean }).isReactComponent = true;
    async function AsyncNote() {
      return "skipped [storage provider]";
    }
    for (const type of [Hooked, Memoed, Forwarded, ClassNote as unknown as ComponentType, AsyncNote]) {
      expect(() => scanLegalTree(createElement(type))).toThrow(/Legal copy scan skipped unrenderable component/);
    }
  });

  it("scans static markup of every surface with blank facts", () => {
    const surfaces = [
      renderToStaticMarkup(createElement(PrivacyNote, { facts: emptyLegalFacts })),
      renderToStaticMarkup(createElement(TermsOfUse, { facts: emptyLegalFacts })),
      renderToStaticMarkup(createElement(LegalFooterLinks)),
      renderToStaticMarkup(createElement(SignupConsent)),
      renderToStaticMarkup(createElement(PayEstimateCard, { pilot: true })),
      renderToStaticMarkup(createElement(PayEstimateCard, { pilot: false })),
      renderToStaticMarkup(createElement(PilotLanding, { showLegalLinks: true })),
    ];
    for (const html of surfaces) {
      findLegalCopyViolations(html);
    }
    expect(findLegalCopyViolations(surfaces[0]).some((hit) => hit.includes("[legal entity name]"))).toBe(true);
    expect(findLegalCopyViolations(surfaces[1]).some((hit) => hit.includes("[warranty disclaimer"))).toBe(true);
    expect(findLegalCopyViolations(textOf(renderLegalSurfaces(emptyLegalFacts))).length).toBeGreaterThan(0);
    for (const html of surfaces.slice(2)) {
      expect(html).not.toContain("Every gap");
    }
    expect(textOf(surfaces[6])).toContain(waitlistInstruction);
    expect(findLegalCopyViolations(surfaces[6])).toEqual([]);
  });

  it("finds no bracket tags on filled privacy, terms, footer, consent, card B, and the landing", () => {
    const surfaces = [
      renderToStaticMarkup(createElement(PrivacyNote, { facts: filledLegalFacts })),
      renderToStaticMarkup(createElement(TermsOfUse, { facts: filledLegalFacts })),
      renderToStaticMarkup(createElement(LegalFooterLinks)),
      renderToStaticMarkup(createElement(SignupConsent)),
      renderToStaticMarkup(createElement(PayEstimateCard, { pilot: true })),
      renderToStaticMarkup(createElement(PilotLanding)),
    ];
    for (const html of surfaces) expect(findLegalCopyViolations(html)).toEqual([]);
    expect(textOf(surfaces[3])).toContain(consentUpdates);
    expect(textOf(surfaces[3])).not.toContain("(optional)");
    expect(textOf(surfaces[4])).toContain("Gaps are flagged with their source page.");
    expect(surfaces[4]).not.toContain("Every gap");
  });

  it("does not import react-dom/server from app code", () => {
    const files = [
      "lib/legal/publish.tsx",
      "lib/legal/scan.tsx",
      "lib/legal/copy.ts",
      "app/page.tsx",
      "app/privacy/page.tsx",
      "app/terms/page.tsx",
      "app/layout.tsx",
      "instrumentation.ts",
      "components/legal/privacy-note.tsx",
      "components/legal/terms-of-use.tsx",
      "components/legal/pay-estimate-card.tsx",
      "components/legal/pilot-landing.tsx",
    ];
    for (const file of files) {
      expect(readFileSync(path.join(repoRoot, file), "utf8")).not.toContain("react-dom/server");
    }
    expect(readFileSync(path.join(repoRoot, "components/legal/pay-estimate-card.tsx"), "utf8")).not.toContain("Every gap");
  });

  it("fails the build hook only when the flag is on during a production build", () => {
    applyEnv({});
    process.env.NEXT_PHASE = "phase-production-build";
    expect(() => enforceLegalPublishDuringBuild()).not.toThrow();
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true" });
    process.env.NEXT_PHASE = "phase-production-build";
    expect(() => enforceLegalPublishDuringBuild()).toThrow(/not publishable/);
    expect(() => enforceLegalCopyDuringBuild()).toThrow(/not publishable/);
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true", ...filledLegalFactEnv() });
    process.env.NEXT_PHASE = "phase-production-build";
    expect(() => enforceLegalPublishDuringBuild()).not.toThrow();
    expect(() => enforceLegalCopyDuringBuild()).not.toThrow();
    delete process.env.NEXT_PHASE;
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true" });
    expect(() => enforceLegalPublishDuringBuild()).not.toThrow();
    expect(() => enforceLegalCopyDuringBuild()).not.toThrow();
  });

  it("warns once and stays closed when the flag is on and a fact is blank", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true" });
    expect(canPublishLegalPages()).toBe(false);
    expect(canPublishLegalPages()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("legalEntityName");
    expect(String(warn.mock.calls[0]?.[0])).toContain("bluebeamCsvColumns");
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
    applyEnv({ NEXT_RUNTIME: "edge", LEGAL_PAGES_PUBLISHED: "true" });
    const { register } = await import("@/instrumentation");
    await expect(register()).resolves.toBeUndefined();
    applyEnv({ NEXT_RUNTIME: "nodejs" });
    await expect(register()).resolves.toBeUndefined();
    applyEnv({ NEXT_RUNTIME: "nodejs", LEGAL_PAGES_PUBLISHED: "true", ...filledLegalFactEnv() });
    await expect(register()).resolves.toBeUndefined();
    applyEnv({ NEXT_RUNTIME: "nodejs", LEGAL_PAGES_PUBLISHED: "true", ...filledLegalFactEnv(), [legalFactEnvKeys.supportEmail]: "" });
    await expect(register()).rejects.toThrow(/supportEmail/);
  });

  it("uses the draft banner wording until attorney review is recorded", () => {
    expect(draftBanner).toBe("DRAFT — pending attorney review");
    const shown = textOf(renderLegalSurfaces(filledLegalFacts));
    expect(shown).toContain(draftBanner);
    applyEnv({ LEGAL_ATTORNEY_REVIEWED: "true" });
    expect(textOf(renderLegalSurfaces(filledLegalFacts))).not.toContain(draftBanner);
  });
});

describe("filled fixture covers every required fact", () => {
  it("sets each typed fact", () => {
    for (const key of legalFactKeys) {
      expect(filledLegalFacts[key as LegalFactKey]?.trim().length).toBeGreaterThan(0);
    }
  });
});
