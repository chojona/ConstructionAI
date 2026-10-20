import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertSeedAllowed, seedRefusalReason } from "./seedGuard";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("seed production guard", () => {
  it("refuses when VERCEL_ENV or NODE_ENV is production unless ALLOW_PROD_SEED=1", () => {
    expect(seedRefusalReason({ VERCEL_ENV: "production" })).toMatch(/Refusing to seed while VERCEL_ENV=production/);
    expect(seedRefusalReason({ NODE_ENV: "production" })).toMatch(/Refusing to seed while NODE_ENV=production/);
    expect(seedRefusalReason({ VERCEL_ENV: "production", NODE_ENV: "production" })).toMatch(
      /VERCEL_ENV=production and NODE_ENV=production/,
    );
    expect(seedRefusalReason({ VERCEL_ENV: "production", ALLOW_PROD_SEED: "1" })).toBeNull();
    expect(seedRefusalReason({ NODE_ENV: "production", ALLOW_PROD_SEED: "1" })).toBeNull();
    expect(seedRefusalReason({ VERCEL_ENV: "production", ALLOW_PROD_SEED: "true" })).toMatch(/Refusing to seed/);
    expect(seedRefusalReason({ VERCEL_ENV: "preview", NODE_ENV: "development" })).toBeNull();
    expect(seedRefusalReason({ VERCEL_ENV: "development" })).toBeNull();
    expect(seedRefusalReason({})).toBeNull();
    expect(() => assertSeedAllowed({ VERCEL_ENV: "production" })).toThrow(/Refusing to seed/);
    expect(() => assertSeedAllowed({ VERCEL_ENV: "preview" })).not.toThrow();
  });

  it("refuses to run prisma/seed.ts when VERCEL_ENV=production", () => {
    const result = spawnSync(
      process.execPath,
      ["--env-file-if-exists=.env", "--import", "tsx", "prisma/seed.ts"],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 20_000,
        env: {
          ...process.env,
          VERCEL_ENV: "production",
          ALLOW_PROD_SEED: "",
          DATABASE_URL: "postgresql://refused:refused@127.0.0.1:1/refused",
          DIRECT_DATABASE_URL: "postgresql://refused:refused@127.0.0.1:1/refused",
        },
      },
    );
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    expect(result.status).toBe(1);
    expect(output).toMatch(/Refusing to seed while VERCEL_ENV=production/);
    expect(output).not.toMatch(/P1001|Can't reach database|Northstar Construction/);
  });
});
