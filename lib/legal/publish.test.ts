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
import { MAX_PDF_PAGES } from "@/lib/documents/pdfLimits";
import { MAX_UPLOAD_BYTES } from "@/lib/documents/uploadLimit";
import {
  cardAText,
  companyFieldError,
  consentError,
  consentUpdates,
  dotFieldError,
  draftBanner,
  emailFieldError,
  findLegalCopyViolations,
  hostingRequestLogs,
  landingAndDialogText,
  loginRecordFallback,
  pilotFeatureLabel,
  privacyFileDeletion,
  roleFieldError,
  termsFileDeletion,
  waitlistInstruction,
  waitlistPickedPrefix,
  waitlistRequired,
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
import { unpublishedLegalSentences, unpublishedSentencePieces } from "@/lib/legal/unpublishedSentences.fixture";
import { waitlistFieldErrors } from "@/lib/legal/waitlistForm";

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
    const landing = textOf(renderToStaticMarkup(createElement(PilotLanding, { showLegalLinks: true })));
    expect(unpublishedLegalSentences.length).toBeGreaterThan(0);
    for (const sentence of unpublishedLegalSentences) {
      const pieces = unpublishedSentencePieces(sentence);
      expect(pieces.length).toBeGreaterThan(0);
      for (const piece of pieces) {
        expect(html, piece).not.toContain(piece);
        expect(landing, piece).not.toContain(piece);
      }
    }
    expect(html).toContain(loginRecordFallback);
    expect(html).toContain(privacyFileDeletion);
    expect(html).toContain(termsFileDeletion);
    expect(html).toContain(waitlistSignupSource);
    expect(html).toContain("up to five optional questions");
    expect(html).toContain(hostingRequestLogs);
    expect(html).not.toContain("log retention");
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

  it("publishes the shared upload limit sentence", () => {
    const html = textOf(renderToStaticMarkup(createElement(PrivacyNote, { facts: filledLegalFacts })));
    const megabytes = (MAX_UPLOAD_BYTES / 1_000_000).toFixed(1);
    const sentence = `Document uploads: PDF, up to ${megabytes} MB and ${MAX_PDF_PAGES} pages; appendices can also be Bluebeam CSV.`;
    expect(html).toContain(sentence);
    expect(html).not.toContain("If a file is too large to upload");
    expect(readFileSync(path.join(repoRoot, "components/legal/privacy-note.tsx"), "utf8")).not.toContain("extractPdf");
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
    expect(legalFactRejected("effectiveDate", "February 30, 2026")).toBe(true);
    expect(legalFactRejected("effectiveDate", "2026-02-30")).toBe(true);
    expect(legalFactRejected("effectiveDate", "February 29, 2026")).toBe(true);
    expect(legalFactRejected("effectiveDate", "February 29, 2024")).toBe(false);
    expect(legalFactRejected("copyrightYear", "26")).toBe(true);
    const rejected: LegalFacts = { ...filledLegalFacts, contactEmail: "contact@fixture.example" };
    expect(() => assertLegalCopyPublishable(rejected)).toThrow(/contactEmail/);
  });

  it("allows an unset contact email and copyright year", () => {
    const facts = { ...filledLegalFacts, contactEmail: null, copyrightYear: null };
    expect(legalFactRejected("contactEmail", null)).toBe(false);
    expect(legalFactRejected("copyrightYear", null)).toBe(false);
    expect(() => assertLegalCopyPublishable(facts)).not.toThrow();
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

  it("ignores bracketed design tokens in class and style attributes", () => {
  const html = `<button class="h-[var(--size-target-min)] text-[length:var(--font-size-md)]">Sign in</button><span style="outline: var(--size-border-focus) solid var(--color-focus)">ok</span>`;
  expect(findLegalCopyViolations(html)).toEqual([]);
  expect(findLegalCopyViolations(`${html}<p>[legal entity name]</p>`)).toContain("[legal entity name]");
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
      renderToStaticMarkup(createElement(PayEstimateCard)),
      renderToStaticMarkup(createElement(PilotLanding, { showLegalLinks: true })),
    ];
    const privacyHits = findLegalCopyViolations(surfaces[0]);
    const termsHits = findLegalCopyViolations(surfaces[1]);
    expect(privacyHits).toContain("[legal entity name]");
    expect(termsHits.some((hit) => hit.includes("[warranty disclaimer"))).toBe(true);
    expect(privacyHits.length).toBeGreaterThan(1);
    expect(termsHits.length).toBeGreaterThan(1);
    expect(findLegalCopyViolations(textOf(renderLegalSurfaces(emptyLegalFacts))).length).toBeGreaterThan(0);
    for (const html of surfaces.slice(2)) {
      expect(html).not.toContain("Every gap");
      expect(findLegalCopyViolations(html)).toEqual([]);
    }
    expect(textOf(surfaces[5])).toContain(waitlistRequired);
    expect(textOf(surfaces[5])).not.toContain(waitlistInstruction);
    expect(landingAndDialogText()).toContain(waitlistRequired);
    expect(landingAndDialogText()).toContain(waitlistInstruction);
  });

  it("finds no bracket tags on filled privacy, terms, footer, consent, card B, and the landing", () => {
    const surfaces = [
      renderToStaticMarkup(createElement(PrivacyNote, { facts: filledLegalFacts })),
      renderToStaticMarkup(createElement(TermsOfUse, { facts: filledLegalFacts })),
      renderToStaticMarkup(createElement(LegalFooterLinks)),
      renderToStaticMarkup(createElement(SignupConsent)),
      renderToStaticMarkup(createElement(PayEstimateCard)),
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

describe("waitlist field validation", () => {
  const complete = { email: "ada@northline.example", company: "Northline", role: "Estimator", dotWork: "yes", consent: true };

  it("accepts a complete form", () => {
    expect(waitlistFieldErrors(complete)).toEqual({});
  });

  it("asks for a work email when that field is empty", () => {
    expect(waitlistFieldErrors({ ...complete, email: "  " })).toEqual({ email: emailFieldError });
  });

  it("asks for a company when that field is empty", () => {
    expect(waitlistFieldErrors({ ...complete, company: "" })).toEqual({ company: companyFieldError });
  });

  it("asks for a role when that field is empty", () => {
    expect(waitlistFieldErrors({ ...complete, role: "" })).toEqual({ role: roleFieldError });
  });

  it("asks for Yes or No when that choice is empty", () => {
    expect(waitlistFieldErrors({ ...complete, dotWork: "" })).toEqual({ dot: dotFieldError });
  });

  it("keeps the consent error when the box is unchecked", () => {
    expect(waitlistFieldErrors({ ...complete, consent: false })).toEqual({ consent: consentError });
  });

  it("renders every required control and both pilot badges", () => {
    const html = renderToStaticMarkup(createElement(PilotLanding));
    expect(html.match(new RegExp(pilotFeatureLabel, "g"))).toHaveLength(2);
    expect(html).toContain('name="dot-work"');
    expect(html.match(/name="dot-work"/g)).toHaveLength(2);
    expect(html).toContain(emailFieldError);
    expect(html).toContain(companyFieldError);
    expect(html).toContain(roleFieldError);
    expect(html).toContain(dotFieldError);
    expect(html).toContain('data-field="email"');
    expect(html).toContain('data-field="company"');
    expect(html).toContain('data-field="role"');
    expect(html).toContain("required");
    expect(html).toContain(waitlistRequired);
    expect(html).not.toContain(waitlistInstruction);
  });

  it("shows card A on the landing page and in the You picked line", () => {
    const html = renderToStaticMarkup(createElement(PilotLanding));
    expect(cardAText).toBe("One page that shows the current revision of every sheet on the job, with its source, ready to send to the field.");
    expect(html.split(cardAText).length - 1).toBe(2);
    expect(html).toContain(`${waitlistPickedPrefix} ${cardAText}`);
  });

  it("links each inline error to its field", () => {
    const html = renderToStaticMarkup(createElement(PilotLanding));
    const tags = html.match(/<[^>]+>/g) ?? [];
    const tag = (includes: string) => tags.find((item) => item.includes(includes)) ?? "";
    expect(tag('data-field="email"')).toContain('aria-describedby="email"');
    expect(tag('id="email"')).toContain('data-field-error="email"');
    expect(tag('data-field="company"')).toContain('aria-describedby="company"');
    expect(tag('id="company"')).toContain('data-field-error="company"');
    expect(tag('data-field="role"')).toContain('aria-describedby="role"');
    expect(tag('id="role"')).toContain('data-field-error="role"');
    expect(tag("<fieldset")).toContain('aria-describedby="dot"');
    expect(tag('id="dot"')).toContain('data-field-error="dot"');
    expect(tag('data-consent="terms"')).toContain('aria-describedby="consent"');
    expect(tag('id="consent"')).toContain("data-consent-error");
    expect(tag('data-field="email"')).toContain('aria-invalid="false"');
  });

  it("shows the required line while resting and the error summary after a failed submit", () => {
    const resting = renderToStaticMarkup(createElement(PilotLanding));
    expect(resting).toContain(`class="waitlist-required">${waitlistRequired}`);
    expect(resting).not.toContain(waitlistInstruction);
    expect(resting).not.toContain("waitlist-error-summary");
    expect(resting).toContain('id="email"');
    expect(resting.match(/id="email"[^>]*hidden/)?.[0]).toBeTruthy();

    const failed = renderToStaticMarkup(createElement(PilotLanding, {
      initialErrors: {
        email: emailFieldError,
        company: companyFieldError,
        role: roleFieldError,
        dot: dotFieldError,
        consent: consentError,
      },
    }));
    expect(failed).toContain(`role="alert">${waitlistInstruction}`);
    expect(failed).toContain('class="waitlist-error-summary"');
    expect(failed).not.toContain(waitlistRequired);
    expect(failed).not.toContain("All fields are required unless marked (optional).");
    for (const id of ["email", "company", "role", "dot", "consent"]) {
      const error = failed.match(new RegExp(`<p[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
      expect(error).not.toContain("hidden");
      expect(error).toContain('role="alert"');
    }
    expect(failed).toContain(emailFieldError);
    expect(failed).toContain(companyFieldError);
    expect(failed).toContain(roleFieldError);
    expect(failed).toContain(dotFieldError);
    expect(failed).toContain(consentError);
  });
});

describe("filled fixture covers every required fact", () => {
  it("sets each typed fact", () => {
    for (const key of legalFactKeys) {
      expect(filledLegalFacts[key as LegalFactKey]?.trim().length).toBeGreaterThan(0);
    }
  });
});
