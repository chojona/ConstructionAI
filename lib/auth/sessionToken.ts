import { createHash, randomBytes } from "node:crypto";
import { assertAuthTrustUserHeaderForbiddenInProduction } from "./productionTrustHeader";

assertAuthTrustUserHeaderForbiddenInProduction();

export const SESSION_COOKIE = "construction_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function acceptPath(token: string): string {
  return `/accept?token=${encodeURIComponent(token)}`;
}

/**
 * Temporary test and local-script switch. Only the exact value "1" trusts
 * x-user-id. Production refuses to start if the variable is 1, true, or yes.
 */
export function trustsUserHeader(): boolean {
  return process.env.AUTH_TRUST_USER_HEADER === "1";
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
