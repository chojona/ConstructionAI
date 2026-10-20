import { createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { DraftBanner, LegalFooterLinks, LegalLogo } from "@/components/legal/legal-chrome";
import { PayEstimateCard } from "@/components/legal/pay-estimate-card";
import { PrivacyNote } from "@/components/legal/privacy-note";
import { SignupConsent } from "@/components/legal/signup-consent";
import { TermsOfUse } from "@/components/legal/terms-of-use";
import { findLegalCopyViolations, landingAndDialogText } from "@/lib/legal/copy";
import { missingLegalFactKeys, readLegalFacts, type LegalFacts } from "@/lib/legal/facts";
import { legalDraftBanner, legalFlagOn } from "@/lib/legal/publish";

function isPlainFunction(type: unknown): type is (props: unknown) => ReactNode {
  if (typeof type !== "function") return false;
  const prototype = (type as { prototype?: { isReactComponent?: boolean } }).prototype;
  return !prototype?.isReactComponent;
}

function isThenable(value: unknown): boolean {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

function componentLabel(type: unknown): string {
  if (typeof type === "function" && type.name) return type.name;
  return "non-function";
}

/**
 * Text, string attributes, and dangerouslySetInnerHTML.
 * Child text is joined with "" so a placeholder split across elements is still one marker.
 * Anything other than a host tag, a Fragment, or a plain function component fails the scan.
 */
export function scanLegalTree(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => scanLegalTree(child)).join("");
  if (!isValidElement(node)) {
    throw new Error("Legal copy scan skipped unrenderable component: non-element");
  }
  const props = node.props as {
    children?: ReactNode;
    dangerouslySetInnerHTML?: { __html?: string };
  } & Record<string, unknown>;
  const rawHtml = typeof props.dangerouslySetInnerHTML?.__html === "string" ? props.dangerouslySetInnerHTML.__html : "";
  const attributes = Object.entries(props)
    .filter(([key, value]) => key !== "children" && key !== "dangerouslySetInnerHTML" && typeof value === "string")
    .map(([, value]) => value as string)
    .join("");
  const type = node.type;
  if (typeof type === "string" || type === Fragment) {
    return attributes + rawHtml + scanLegalTree(props.children);
  }
  if (!isPlainFunction(type)) {
    throw new Error(`Legal copy scan skipped unrenderable component: ${componentLabel(type)}`);
  }
  let rendered: ReactNode;
  try {
    rendered = type(props);
  } catch (error) {
    throw new Error(`Legal copy scan skipped unrenderable component: ${componentLabel(type)}`, { cause: error });
  }
  if (isThenable(rendered)) {
    throw new Error(`Legal copy scan skipped unrenderable component: ${componentLabel(type)}`);
  }
  return attributes + rawHtml + scanLegalTree(rendered);
}

function pageFrame(note: ReactElement) {
  return createElement(
    "div",
    { className: "legal-page" },
    createElement(DraftBanner, { text: legalDraftBanner() }),
    createElement("header", { className: "legal-top" }, createElement(LegalLogo)),
    note,
    createElement(LegalFooterLinks),
  );
}

/**
 * Renders privacy, terms, the footer, the consent block, card B, and the landing/dialog strings.
 * Does not apply the publish guard. Unfilled facts stay in the markup as bracketed blanks.
 * Contact and the copyright year are optional while the footer shows only the two document links.
 */
export function renderLegalSurfaces(facts: LegalFacts): string {
  return scanLegalTree(
    createElement(
      "div",
      null,
      pageFrame(createElement(PrivacyNote, { facts })),
      pageFrame(createElement(TermsOfUse, { facts })),
      createElement(LegalFooterLinks),
      createElement(SignupConsent),
      createElement(PayEstimateCard),
      landingAndDialogText(),
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

/** Full markup scan during `next build`. Imported by the legal routes, not by the root layout. */
export function enforceLegalCopyDuringBuild(): void {
  if (process.env.NEXT_PHASE !== "phase-production-build") return;
  if (!legalFlagOn()) return;
  assertLegalCopyPublishable(readLegalFacts());
}
