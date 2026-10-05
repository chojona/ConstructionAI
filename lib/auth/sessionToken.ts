import { createHash, randomBytes } from "node:crypto";

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

/** Temporary test and local-script switch. Production leaves this unset. */
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
