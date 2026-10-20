export type SeedEnv = {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  ALLOW_PROD_SEED?: string;
};

/**
 * Manual seed must not write a demo org admin into production.
 * `ALLOW_PROD_SEED=1` is the only override.
 */
export function seedRefusalReason(env: SeedEnv = process.env): string | null {
  const vercelProduction = env.VERCEL_ENV === "production";
  const nodeProduction = env.NODE_ENV === "production";
  if (!vercelProduction && !nodeProduction) return null;
  if (env.ALLOW_PROD_SEED === "1") return null;
  const reasons = [
    vercelProduction ? "VERCEL_ENV=production" : null,
    nodeProduction ? "NODE_ENV=production" : null,
  ].filter((reason): reason is string => reason !== null);
  return `Refusing to seed while ${reasons.join(" and ")}. Seed is manual and is not part of the Vercel build. Set ALLOW_PROD_SEED=1 to override.`;
}

export function assertSeedAllowed(env: SeedEnv = process.env): void {
  const reason = seedRefusalReason(env);
  if (reason) throw new Error(reason);
}
