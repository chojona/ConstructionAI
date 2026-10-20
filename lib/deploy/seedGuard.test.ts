import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { assertSeedAllowed, seedRefusalReason } from "./seedGuard";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const prodUrl = "postgresql://refused:super-secret@ep-prod.neon.tech:5432/neondb?sslmode=require";
const devUrl = "postgresql://refused:super-secret@127.0.0.1:5432/construction";

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

  it("refuses a production database host unless ALLOW_PROD_SEED=1", () => {
    const refused = seedRefusalReason({
      VERCEL_ENV: "preview",
      NODE_ENV: "development",
      DATABASE_URL: prodUrl,
      PROD_DB_HOST: "EP-PROD.NEON.TECH:5432",
    });
    expect(refused).toMatch(/DATABASE_URL host matches PROD_DB_HOST \(ep-prod\.neon\.tech\)/);
    expect(refused).not.toMatch(/super-secret/);
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL: prodUrl,
        PROD_DB_HOST: "ep-prod.neon.tech",
      }),
    ).toThrow(/Refusing to seed/);

    expect(
      seedRefusalReason({
        DATABASE_URL: prodUrl,
        DIRECT_DATABASE_URL: prodUrl,
        PROD_DB_HOST: "ep-prod.neon.tech",
        ALLOW_PROD_SEED: "1",
      }),
    ).toBeNull();
    expect(
      seedRefusalReason({
        DATABASE_URL: prodUrl,
        PROD_DB_HOST: "ep-prod.neon.tech",
        ALLOW_PROD_SEED: "true",
      }),
    ).toMatch(/Refusing to seed/);
  });

  it("allows a non-production host and ignores an unset PROD_DB_HOST", () => {
    expect(
      seedRefusalReason({
        DATABASE_URL: devUrl,
        DIRECT_DATABASE_URL: "postgresql://refused:secret@db.internal:5432/app",
        PROD_DB_HOST: "ep-prod.neon.tech",
      }),
    ).toBeNull();
    expect(seedRefusalReason({ DATABASE_URL: prodUrl })).toBeNull();
    expect(seedRefusalReason({ DATABASE_URL: prodUrl, PROD_DB_HOST: "   " })).toBeNull();
    expect(
      seedRefusalReason({
        DATABASE_URL: devUrl,
        PROD_DB_HOST: "postgresql://other:secret@ep-prod.neon.tech:5432/neondb",
      }),
    ).toBeNull();
  });

  it("refuses when DIRECT_DATABASE_URL matches the production host", () => {
    const refused = seedRefusalReason({
      DATABASE_URL: devUrl,
      DIRECT_DATABASE_URL: "postgres://refused:direct-secret@Ep-Prod.Neon.Tech/neondb",
      PROD_DB_HOST: "ep-prod.neon.tech.",
    });
    expect(refused).toMatch(/DIRECT_DATABASE_URL host matches PROD_DB_HOST \(ep-prod\.neon\.tech\)/);
    expect(refused).not.toMatch(/because DATABASE_URL host matches/);
    expect(refused).not.toMatch(/direct-secret/);
  });

  it("refuses a Neon pooler URL when PROD_DB_HOST is the direct host", () => {
    const direct = "ep-foo-123.us-east-2.aws.neon.tech";
    const pooler = "ep-foo-123-pooler.us-east-2.aws.neon.tech";
    const refused = seedRefusalReason({
      DATABASE_URL: `postgresql://refused:super-secret@${pooler}:5432/neondb`,
      PROD_DB_HOST: direct,
    });
    expect(refused).toMatch(
      /DATABASE_URL host matches PROD_DB_HOST \(ep-foo-123\.us-east-2\.aws\.neon\.tech\)/,
    );
    expect(refused).not.toMatch(/super-secret/);
    expect(
      seedRefusalReason({
        DATABASE_URL: `postgresql://refused:secret@${pooler}/neondb`,
        PROD_DB_HOST: "ep-other.us-east-2.aws.neon.tech",
      }),
    ).toBeNull();
    expect(
      seedRefusalReason({
        DATABASE_URL: "postgresql://refused:secret@cache-pooler.internal/db",
        PROD_DB_HOST: "cache.internal",
      }),
    ).toBeNull();
  });

  it("refuses a Neon direct URL when PROD_DB_HOST is the pooler host", () => {
    const refused = seedRefusalReason({
      DIRECT_DATABASE_URL: "postgresql://refused:direct-secret@ep-foo-123.us-east-2.aws.neon.tech/neondb",
      DATABASE_URL: devUrl,
      PROD_DB_HOST: "EP-FOO-123-POOLER.us-east-2.aws.neon.tech:5432",
    });
    expect(refused).toMatch(
      /DIRECT_DATABASE_URL host matches PROD_DB_HOST \(ep-foo-123-pooler\.us-east-2\.aws\.neon\.tech\)/,
    );
    expect(refused).not.toMatch(/because DATABASE_URL host matches/);
    expect(refused).not.toMatch(/direct-secret/);
  });

  it("refuses when a comma-separated PROD_DB_HOST list names the host", () => {
    const refused = seedRefusalReason({
      DATABASE_URL: devUrl,
      DIRECT_DATABASE_URL: prodUrl,
      PROD_DB_HOST: " , db.internal ,  ep-prod.neon.tech ",
    });
    expect(refused).toMatch(/DIRECT_DATABASE_URL host matches PROD_DB_HOST \(ep-prod\.neon\.tech\)/);
    expect(refused).not.toMatch(/because DATABASE_URL host matches/);
    expect(
      seedRefusalReason({
        DATABASE_URL: prodUrl,
        PROD_DB_HOST: " db.internal, localhost ",
      }),
    ).toBeNull();
    expect(seedRefusalReason({ DATABASE_URL: prodUrl, PROD_DB_HOST: " , , " })).toBeNull();
    expect(
      seedRefusalReason({
        DATABASE_URL: devUrl,
        PROD_DB_HOST: "ep-prod.neon.tech, not a host",
      }),
    ).toMatch(/PROD_DB_HOST is set but is not a usable hostname/);
  });

  it("fails closed when PROD_DB_HOST is set and a URL cannot be checked", () => {
    expect(
      seedRefusalReason({
        PROD_DB_HOST: "ep-prod.neon.tech",
        DATABASE_URL: "not a url",
        DIRECT_DATABASE_URL: devUrl,
      }),
    ).toMatch(/DATABASE_URL could not be parsed/);
    expect(seedRefusalReason({ PROD_DB_HOST: "ep-prod.neon.tech" })).toMatch(
      /neither DATABASE_URL nor DIRECT_DATABASE_URL is set/,
    );
    expect(
      seedRefusalReason({
        PROD_DB_HOST: "ep-prod.neon.tech",
        DATABASE_URL: "postgresql:///construction?host=/var/run/postgresql",
      }),
    ).toMatch(/DATABASE_URL could not be parsed/);
    expect(
      seedRefusalReason({
        PROD_DB_HOST: "not a host",
        DATABASE_URL: devUrl,
      }),
    ).toMatch(/PROD_DB_HOST is set but is not a usable hostname/);
    expect(
      seedRefusalReason({
        PROD_DB_HOST: "ep-prod.neon.tech",
        DATABASE_URL: "not a url",
        ALLOW_PROD_SEED: "1",
      }),
    ).toBeNull();
  });

  it("prints the bypassed refusal on stderr without a connection string", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((message?: unknown) => {
      lines.push(String(message));
    });
    try {
      assertSeedAllowed({
        VERCEL_ENV: "preview",
        NODE_ENV: "development",
        ALLOW_PROD_SEED: "1",
        PROD_DB_HOST: "ep-prod.neon.tech",
        DATABASE_URL: "postgresql://seed-user:super-secret@ep-prod.neon.tech:5432/neondb?sslmode=require",
      });
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/ALLOW_PROD_SEED=1 overriding seed refusal: Refusing to seed because DATABASE_URL host matches PROD_DB_HOST \(ep-prod\.neon\.tech\)/);
      expect(lines[0]).not.toMatch(/super-secret|seed-user|postgresql:\/\/|sslmode/);
      expect(lines[0]).not.toContain("\n");
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps the seed guard ahead of the database client import", () => {
    const source = readFileSync(path.join(root, "prisma/seed.ts"), "utf8");
    const guardAt = source.indexOf("assertSeedAllowed()");
    const clientImportAt = source.indexOf('import("../lib/db")');
    const constructAt = source.indexOf("createPrismaClient(");
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(clientImportAt).toBeGreaterThan(guardAt);
    expect(constructAt).toBeGreaterThan(clientImportAt);
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

  it("refuses a production host before a database client is created", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "seed-guard-"));
    const marker = path.join(dir, "db-imported");
    const registerPath = path.join(dir, "register.mjs");
    writeFileSync(
      registerPath,
      `import { register } from "node:module";\nregister("./hooks.mjs", import.meta.url);\n`,
    );
    writeFileSync(
      path.join(dir, "hooks.mjs"),
      [
        'import { appendFileSync } from "node:fs";',
        "const marker = process.env.SEED_GUARD_IMPORT_MARKER;",
        "function watched(specifier) {",
        '  const spec = String(specifier).replaceAll("\\\\", "/");',
        '  return spec === "../lib/db" || spec.endsWith("/lib/db") || spec.endsWith("/lib/db.ts") || spec.endsWith("/lib/db.js");',
        "}",
        "export async function resolve(specifier, context, nextResolve) {",
        "  if (marker && watched(specifier)) {",
        "    appendFileSync(marker, String(specifier) + \"\\n\");",
        '    return { shortCircuit: true, url: "data:text/javascript,throw%20new%20Error(%22DB_CLIENT_CREATED%22)%3B" };',
        "  }",
        "  return nextResolve(specifier, context);",
        "}",
        "",
      ].join("\n"),
    );

    try {
      const result = spawnSync(
        process.execPath,
        ["--env-file-if-exists=.env", "--import", registerPath, "--import", "tsx", "prisma/seed.ts"],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 20_000,
          env: {
            ...process.env,
            VERCEL_ENV: "preview",
            NODE_ENV: "development",
            ALLOW_PROD_SEED: "",
            PROD_DB_HOST: "ep-prod.neon.tech",
            DATABASE_URL: prodUrl,
            DIRECT_DATABASE_URL: devUrl,
            SEED_GUARD_IMPORT_MARKER: marker,
          },
        },
      );
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      expect(result.status).toBe(1);
      expect(output).toMatch(/DATABASE_URL host matches PROD_DB_HOST \(ep-prod\.neon\.tech\)/);
      expect(output).not.toMatch(/super-secret|P1001|Can't reach database|Northstar Construction|DB_CLIENT_CREATED/);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
