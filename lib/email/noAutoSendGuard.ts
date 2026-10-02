import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { EMAIL_SURFACE_COPY, emailCopyIsAllowed } from "./emailSendView";

/** Mail SDKs and transport helpers — must never appear in app source. */
export const MAIL_DELIVERY_IMPORT =
  /\b(nodemailer|@sendgrid\/mail|postmark|resend|@aws-sdk\/client-ses|mailgun-js|smtp-connection|createTransport)\b/;

export const MAIL_DELIVERY_CALL = /\b(sendMail|sendEmail|sendRawEmail|deliverEmail)\s*\(/;

/** UI must not claim the app delivered mail to recipients. */
export const IMPLIED_DELIVERY_COPY =
  /\b(mailed the|mailed your|we sent|we've sent|has been emailed|delivered (the )?(email|message)|reached their inbox|message was sent to)\b/i;

const EMAIL_RECORD_SEND_FILES = new Set([
  "lib/email/service.ts",
  "app/api/projects/[projectId]/emails/route.ts",
]);

const EMAIL_REPOSITORY_IMPL = new Set([
  "lib/domain/prismaRepository.ts",
  "lib/domain/repository.ts",
  "tests/support/memoryRepository.ts",
]);

const EMAIL_UPDATE_DRAFT_FILES = new Set([
  "lib/email/service.ts",
  "app/api/projects/[projectId]/emails/[emailSendId]/route.ts",
  ...EMAIL_REPOSITORY_IMPL,
]);

export const EMAIL_UI_SURFACES = [
  "components/review/draft-email.tsx",
  "components/review/export-packet.tsx",
  "app/projects/[projectId]/emails/[emailSendId]/page.tsx",
];

const SCAN_ROOTS = ["app", "components", "lib"];
const SCAN_SKIP = new Set(["node_modules", ".next", "dist"]);

export function listProjectSourceFiles(repoRoot = process.cwd()): string[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    walk(join(repoRoot, root), repoRoot, files);
  }
  return files.sort();
}

function walk(dir: string, repoRoot: string, files: string[]) {
  for (const name of readdirSync(dir)) {
    if (SCAN_SKIP.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path, repoRoot, files);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    files.push(relative(repoRoot, path));
  }
}

const GUARD_EXEMPT = new Set(["lib/email/noAutoSendGuard.ts"]);

export function assertNoMailDeliveryInSource(source: string, file: string) {
  if (GUARD_EXEMPT.has(file) || file.endsWith(".test.ts") || file.endsWith(".spec.ts")) return;
  if (MAIL_DELIVERY_IMPORT.test(source)) {
    throw new Error(`${file} imports a mail delivery package`);
  }
  if (MAIL_DELIVERY_CALL.test(source)) {
    throw new Error(`${file} calls a mail delivery API`);
  }
}

export function assertEmailLedgerOnlyAtEntrypoints(repoRoot: string, files = listProjectSourceFiles(repoRoot)) {
  const offenders: string[] = [];
  for (const file of files) {
    if (GUARD_EXEMPT.has(file) || file.endsWith(".test.ts") || file.endsWith(".spec.ts")) continue;
    const source = readFileSync(join(repoRoot, file), "utf8");
    if (/\brecordEmailSend\s*\(/.test(source) && !EMAIL_RECORD_SEND_FILES.has(file)) offenders.push(`${file} (recordEmailSend)`);
    if (/export async function updateEmailDraft/.test(source) && file !== "lib/email/service.ts") {
      offenders.push(`${file} (updateEmailDraft export)`);
    }
    if (/\bupdateEmailDraft\s*\(/.test(source) && !EMAIL_UPDATE_DRAFT_FILES.has(file)) {
      offenders.push(`${file} (updateEmailDraft)`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(`Email ledger writes only allowed in service/API routes: ${offenders.join(", ")}`);
  }
}

export function assertEmailSurfaceCopyAllowed() {
  const blocked = EMAIL_SURFACE_COPY.filter((line) => !emailCopyIsAllowed(line));
  if (blocked.length > 0) {
    throw new Error(`Banned email surface copy: ${blocked.join(" | ")}`);
  }
}

export function assertEmailUiDoesNotImplyDelivery(repoRoot: string) {
  const blocked: string[] = [];
  for (const file of EMAIL_UI_SURFACES) {
    const source = readFileSync(join(repoRoot, file), "utf8");
    if (IMPLIED_DELIVERY_COPY.test(source)) blocked.push(file);
  }
  if (blocked.length > 0) {
    throw new Error(`UI implies outbound mail delivery: ${blocked.join(", ")}`);
  }
}
