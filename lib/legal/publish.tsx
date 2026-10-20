import { draftBanner } from "@/lib/legal/copy";
import { missingLegalFactKeys, readLegalFacts } from "@/lib/legal/facts";

export function legalFlagOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LEGAL_PAGES_PUBLISHED === "true";
}

export function pilotLandingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PILOT_LANDING_PUBLISHED === "true";
}

/** Banner stays up until an attorney review is recorded. The wording lives in the copy module. */
export function legalDraftBanner(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.LEGAL_ATTORNEY_REVIEWED === "true") return null;
  return draftBanner;
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

/** Runtime backstop. Flag off is a quiet no. Flag on with any blank or rejected fact warns once and stays closed. */
export function canPublishLegalPages(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!legalFlagOn(env)) return false;
  const missing = missingLegalFactKeys(readLegalFacts(env));
  if (missing.length > 0) {
    warnMissingLegalFacts(missing);
    return false;
  }
  return true;
}

/**
 * Fact check during `next build`, safe for the root layout to import.
 * The markup scan lives in `scan.tsx` so this file does not pull the PDF parser
 * into every route. No-op unless the flag is exactly "true" during the production build.
 */
export function enforceLegalPublishDuringBuild(): void {
  if (process.env.NEXT_PHASE !== "phase-production-build") return;
  if (!legalFlagOn()) return;
  const missing = missingLegalFactKeys();
  if (missing.length === 0) return;
  throw new Error(`Legal copy is not publishable. Missing facts: ${missing.join(", ")}.`);
}
