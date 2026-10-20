/**
 * Non-connecting URL used only so `prisma generate` can load `prisma.config.ts`
 * when neither database URL is configured. Migrate never receives this value.
 */
export const PRISMA_GENERATE_PLACEHOLDER_URL =
  "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public";

/**
 * URL Prisma CLI should use.
 * The schema has no `directUrl`. When `DIRECT_DATABASE_URL` is set, migrate and
 * the rest of the CLI use that direct (non-pooled) URL. Otherwise they use
 * `DATABASE_URL`. A placeholder is substituted only for `prisma generate`.
 */
export type PrismaCliEnv = {
  DIRECT_DATABASE_URL?: string;
  DATABASE_URL?: string;
};

export function prismaCliDatasourceUrl(env: PrismaCliEnv, argv: readonly string[]): string | undefined {
  const direct = env.DIRECT_DATABASE_URL?.trim();
  if (direct) return direct;
  const pooled = env.DATABASE_URL?.trim();
  if (pooled) return pooled;
  const generating = argv.includes("generate") && !argv.includes("migrate");
  if (generating) return PRISMA_GENERATE_PLACEHOLDER_URL;
  return undefined;
}
