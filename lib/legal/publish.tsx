import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { DraftBanner, LegalFooterLinks, LegalLogo } from "@/components/legal/legal-chrome";
import { PayEstimateCard } from "@/components/legal/pay-estimate-card";
import { PrivacyNote } from "@/components/legal/privacy-note";
import { SignupConsent } from "@/components/legal/signup-consent";
import { TermsOfUse } from "@/components/legal/terms-of-use";
import { findLegalCopyViolations } from "@/lib/legal/copy";
import { missingLegalFactKeys, readLegalFacts, type LegalFacts } from "@/lib/legal/facts";

export function legalFlagOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LEGAL_PAGES_PUBLISHED === "true";
}

let warned = false;

export function resetLegalPublishWarningForTests(): void {
  warned = false;
}

export function warnMissingLegalFacts(keys: readonly string[] = missingLegalFactKeys()): void {
  if (warned || keys.length === 0) return;
  warned = true;
  console.warn(`LEGAL_PAGES_PUBLISHED is on but legal facts are missing: ${keys.join(", ")}`);
}

/** Same gate as the routes. Links stay out of the server HTML unless this is true. */
export function legalLinksEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return canPublishLegalPages(env);
}

/** Runtime backstop. Flag off is a quiet no. Flag on with any blank warns once and stays closed. */
export function canPublishLegalPages(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!legalFlagOn(env)) return false;
  const missing = missingLegalFactKeys(readLegalFacts(env));
  if (missing.length > 0) {
    warnMissingLegalFacts(missing);
    return false;
  }
  return true;
}

function isClientRenderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("hooks") || error.message.includes("it's on the client");
}

/** Text and string attributes. Avoids `react-dom/server`, which Server Components cannot import. */
function renderLegalNode(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderLegalNode).join("");
  if (!isValidElement(node)) return "";
  const props = node.props as { children?: ReactNode } & Record<string, unknown>;
  const attributes = Object.entries(props)
    .filter(([key, value]) => key !== "children" && typeof value === "string")
    .map(([, value]) => value)
    .join("\n");
  const type = node.type as unknown;
  if (typeof type === "function") {
    try {
      const rendered = (type as (nextProps: unknown) => ReactNode)(props);
      return `${attributes}\n${renderLegalNode(rendered)}`;
    } catch (error) {
      if (!isClientRenderError(error)) throw error;
    }
  }
  return `${attributes}\n${renderLegalNode(props.children)}`;
}

function pageFrame(note: ReactElement) {
  return createElement(
    "div",
    { className: "legal-page" },
    createElement(DraftBanner),
    createElement("header", { className: "legal-top" }, createElement(LegalLogo)),
    note,
    createElement(LegalFooterLinks),
  );
}

/**
 * Renders privacy, terms, the footer, the consent block, and card B.
 * Does not apply the publish guard. Unfilled facts stay in the markup as bracketed blanks.
 * Contact and the copyright year are required facts, but Design's footer shows only the
 * two document links, so those two values are not drawn.
 */
export function renderLegalSurfaces(facts: LegalFacts): string {
  return renderLegalNode(
    createElement(
      "div",
      null,
      pageFrame(createElement(PrivacyNote, { facts })),
      pageFrame(createElement(TermsOfUse, { facts })),
      createElement(LegalFooterLinks),
      createElement(SignupConsent),
      createElement(PayEstimateCard, { pilot: true }),
    ),
  );
}

export function assertLegalCopyPublishable(facts: LegalFacts = readLegalFacts()): void {
  const missing = missingLegalFactKeys(facts);
  const violations = findLegalCopyViolations(renderLegalSurfaces(facts));
  if (missing.length === 0 && violations.length === 0) return;
  throw new Error(
    `Legal copy is not publishable. Missing facts: ${missing.join(", ") || "none"}. Markup: ${violations.join(", ") || "none"}.`,
  );
}

/** `next build` prerender. No-op unless the flag is exactly "true" during the production build. */
export function enforceLegalPublishDuringBuild(): void {
  if (process.env.NEXT_PHASE !== "phase-production-build") return;
  if (!legalFlagOn()) return;
  assertLegalCopyPublishable();
}
