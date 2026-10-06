const TRUTHY_AUTH_TRUST_HEADER = new Set(["1", "true", "yes"]);

/** `1`, `true`, and `yes`, ignoring case and surrounding whitespace. */
export function authTrustUserHeaderIsTruthy(
  value: string | undefined = process.env.AUTH_TRUST_USER_HEADER,
): boolean {
  return TRUTHY_AUTH_TRUST_HEADER.has(value?.trim().toLowerCase() ?? "");
}

/**
 * Boot guard. Preview and development may still set AUTH_TRUST_USER_HEADER for
 * tests and local scripts. Production must not, because that switch honors a
 * forged x-user-id header.
 */
export function assertAuthTrustUserHeaderForbiddenInProduction(): void {
  if (process.env.VERCEL_ENV === "production" && authTrustUserHeaderIsTruthy()) {
    throw new Error(
      "AUTH_TRUST_USER_HEADER is forbidden in production. Unset it so a forged x-user-id header cannot be trusted.",
    );
  }
}
