import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    usePathname: () => "/projects",
    useRouter: () => ({ push() {}, refresh() {} }),
  };
});

import { SidebarFooter } from "@/components/workspace/app-shell";
import { cardBCaption, cardBText, consentError, consentUpdates, draftBanner, findLegalCopyViolations, hostingRequestLogs, pilotFeatureLabel, waitlistInstruction, waitlistSignupSource } from "@/lib/legal/copy";
import { unpublishedLegalSentences, unpublishedSentencePieces } from "@/lib/legal/unpublishedSentences.fixture";
import { legalFactEnvKeys } from "@/lib/legal/facts";
import { filledLegalFactEnv } from "@/lib/legal/filledLegalFacts.fixture";
import { legalLinksEnabled, resetLegalPublishWarningForTests } from "@/lib/legal/publish";

const envKeys = ["LEGAL_PAGES_PUBLISHED", "LEGAL_ATTORNEY_REVIEWED", "PILOT_LANDING_PUBLISHED", ...Object.values(legalFactEnvKeys)];
let saved: Record<string, string | undefined> = {};

function applyEnv(values: Record<string, string | undefined>) {
  for (const key of envKeys) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value) process.env[key] = value;
  }
}

function textOf(html: string): string {
  return html.replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, "\"");
}

function digestOf(error: unknown): string {
  if (typeof error === "object" && error && "digest" in error) return String((error as { digest?: unknown }).digest ?? "");
  return "";
}

beforeEach(() => {
  saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  resetLegalPublishWarningForTests();
  vi.resetModules();
});

afterEach(() => {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

async function privacy() {
  const { default: Page } = await import("@/app/privacy/page");
  return Page();
}

async function terms() {
  const { default: Page } = await import("@/app/terms/page");
  return Page();
}

async function home() {
  const { default: Page } = await import("@/app/page");
  return Page();
}

async function login() {
  const { default: Page } = await import("@/app/login/page");
  return Page();
}

async function accept() {
  const { default: Page } = await import("@/app/accept/page");
  return Page({ searchParams: Promise.resolve({ token: "invite-token" }) });
}

describe("legal routes", () => {
  it("returns 404 and hides links when the flag is off", async () => {
    applyEnv({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const privacyMeta = await import("@/app/privacy/page");
    const termsMeta = await import("@/app/terms/page");
    expect(await privacyMeta.generateMetadata()).toEqual({});
    expect(await termsMeta.generateMetadata()).toEqual({});
    await expect(privacy()).rejects.toSatisfy((error: unknown) => digestOf(error).includes("404"));
    await expect(terms()).rejects.toSatisfy((error: unknown) => digestOf(error).includes("404"));
    await expect(home()).rejects.toSatisfy((error: unknown) => digestOf(error).startsWith("NEXT_REDIRECT") && digestOf(error).includes("/projects"));
    const { legalLinksEnabled: linksEnabled } = await import("@/lib/legal/publish");
    expect(linksEnabled()).toBe(false);
    const loginHtml = renderToStaticMarkup(await login());
    const acceptHtml = renderToStaticMarkup(await accept());
    const sidebarHtml = renderToStaticMarkup(createElement(SidebarFooter, { viewer: null, showLegalLinks: linksEnabled() }));
    for (const html of [loginHtml, acceptHtml, sidebarHtml]) {
      expect(html).not.toContain('href="/privacy"');
      expect(html).not.toContain('href="/terms"');
      expect(html).not.toContain("Privacy and data deletion");
      expect(html).not.toContain(consentError);
      expect(html).not.toContain("Pilot feature");
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns 404 without page titles and warns when the flag is on but a fact is blank", async () => {
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const privacyMeta = await import("@/app/privacy/page");
    const termsMeta = await import("@/app/terms/page");
    expect(await privacyMeta.generateMetadata()).toEqual({});
    expect(await termsMeta.generateMetadata()).toEqual({});
    await expect(privacy()).rejects.toSatisfy((error: unknown) => digestOf(error).includes("404"));
    await expect(terms()).rejects.toSatisfy((error: unknown) => digestOf(error).includes("404"));
    const loginHtml = renderToStaticMarkup(await login());
    expect(loginHtml).not.toContain('href="/privacy"');
    expect(loginHtml).not.toContain("I agree to the");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("LEGAL_PAGES_PUBLISHED is on but legal facts are missing");
    expect(String(warn.mock.calls[0]?.[0])).toContain("privacyContactEmail");
    expect(String(warn.mock.calls[0]?.[0])).toContain("bluebeamCsvColumns");
  });

  it("keeps the home redirect when only the legal flag is on", async () => {
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true", ...filledLegalFactEnv() });
    await expect(home()).rejects.toSatisfy((error: unknown) => digestOf(error).startsWith("NEXT_REDIRECT") && digestOf(error).includes("/projects"));
    expect(legalLinksEnabled()).toBe(true);
  });

  it("keeps the home redirect when the landing flag is on without the legal flag", async () => {
    applyEnv({ PILOT_LANDING_PUBLISHED: "true" });
    await expect(home()).rejects.toSatisfy((error: unknown) => digestOf(error).startsWith("NEXT_REDIRECT") && digestOf(error).includes("/projects"));
    await expect(privacy()).rejects.toSatisfy((error: unknown) => digestOf(error).includes("404"));
  });

  it("renders the landing from its own flag and the legal pages from theirs", async () => {
    applyEnv({ LEGAL_PAGES_PUBLISHED: "true", PILOT_LANDING_PUBLISHED: "true", ...filledLegalFactEnv() });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const privacyMeta = await import("@/app/privacy/page");
    const termsMeta = await import("@/app/terms/page");
    expect(await privacyMeta.generateMetadata()).toEqual({ title: "Privacy and data deletion" });
    expect(await termsMeta.generateMetadata()).toEqual({ title: "Pilot terms of use" });
    expect(legalLinksEnabled()).toBe(true);
    const privacyHtml = renderToStaticMarkup(await privacy());
    const termsHtml = renderToStaticMarkup(await terms());
    const homeHtml = renderToStaticMarkup(await home());
    const loginHtml = renderToStaticMarkup(await login());
    const acceptHtml = renderToStaticMarkup(await accept());
    const sidebarHtml = renderToStaticMarkup(createElement(SidebarFooter, { viewer: { label: "Alex Chen" }, showLegalLinks: legalLinksEnabled() }));
    const pages = [privacyHtml, termsHtml, homeHtml, loginHtml, acceptHtml, sidebarHtml];
    for (const html of pages) {
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('href="/terms"');
      expect(findLegalCopyViolations(html)).toEqual([]);
      expect(html).not.toContain("Every gap");
    }
    const privacyText = textOf(privacyHtml);
    const termsText = textOf(termsHtml);
    const homeText = textOf(homeHtml);
    expect(privacyText).toContain(draftBanner);
    expect(privacyText).toContain("Privacy and data deletion note");
    expect(privacyText).toContain(waitlistSignupSource);
    expect(privacyText).toContain("up to five optional questions");
    expect(privacyText).toContain("hash of your invite link, which expires after 14 days");
    expect(privacyText).toContain(hostingRequestLogs);
    expect(privacyText).not.toContain("log retention");
    expect(privacyText).toContain("The app keeps project records, including uploaded files, as a fixed history");
    for (const sentence of unpublishedLegalSentences) {
      for (const piece of unpublishedSentencePieces(sentence)) {
        expect(privacyText, piece).not.toContain(piece);
        expect(termsText, piece).not.toContain(piece);
        expect(homeText, piece).not.toContain(piece);
      }
    }
    expect(privacyText).toContain("Northline Contracting LLC");
    expect(privacyText).not.toContain("up to 30 days");
    expect(privacyText).not.toContain("Contact");
    expect(privacyText).not.toContain("©");
    expect(termsText).toContain("Pilot terms of use");
    expect(termsText).toContain("ConstructionAI keeps a fixed history of uploads and decisions");
    expect(termsText).toContain("Texas law governs.");
    expect(termsText).not.toContain("We won't sell Your Content");
    expect(homeHtml.match(new RegExp(pilotFeatureLabel, "g"))).toHaveLength(2);
    expect(homeText).toContain(cardBText);
    expect(homeText).toContain(cardBCaption);
    expect(homeText).toContain(waitlistInstruction);
    expect(homeText).not.toContain("All fields are required unless marked (optional).");
    expect(homeText).toContain(consentError);
    expect(homeHtml).toContain(consentUpdates);
    expect(homeHtml).not.toContain("(optional)");
    expect(homeHtml).toContain('data-consent="terms"');
    expect(homeHtml).not.toContain('data-consent="terms" checked');
    expect(homeHtml).not.toContain('action="/api/');
    expect(loginHtml).toContain("Privacy and data deletion");
    expect(acceptHtml).toContain("Privacy and data deletion");
    expect(sidebarHtml).toContain("Privacy and data deletion");
    expect(warn).not.toHaveBeenCalled();

    applyEnv({ LEGAL_PAGES_PUBLISHED: "true", LEGAL_ATTORNEY_REVIEWED: "true", PILOT_LANDING_PUBLISHED: "true", ...filledLegalFactEnv() });
    const reviewed = textOf(renderToStaticMarkup(await privacy()));
    expect(reviewed).not.toContain(draftBanner);
    expect(reviewed).toContain("Privacy and data deletion note");
  });
});
