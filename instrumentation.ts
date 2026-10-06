/**
 * Runs once when a Next.js server instance starts, before it accepts requests.
 * A truthy AUTH_TRUST_USER_HEADER in production refuses boot.
 */
export async function register(): Promise<void> {
  const { assertAuthTrustUserHeaderForbiddenInProduction } = await import(
    "./lib/auth/productionTrustHeader"
  );
  assertAuthTrustUserHeaderForbiddenInProduction();
}
