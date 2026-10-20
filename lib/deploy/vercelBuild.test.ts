import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type BuildStep = { command: string; args: string[] };
type BuildPlan = {
  vercelEnv: string | null;
  migrate: boolean;
  seed: false;
  branch: "production-migrate" | "skip-migrate";
  steps: BuildStep[];
};

async function loadPlan() {
  const href = pathToFileURL(path.join(root, "scripts/vercel-build.mjs")).href;
  return (await import(href)) as {
    decideVercelBuild: (env: { VERCEL_ENV?: string }) => BuildPlan;
    vercelBuildLogLines: (plan: BuildPlan) => string[];
  };
}

function runsMigrate(plan: BuildPlan) {
  return plan.steps.some((step) => step.args.includes("migrate") || step.args.includes("deploy"));
}

function runsSeed(plan: BuildPlan) {
  return plan.steps.some((step) => step.command.includes("seed") || step.args.some((arg) => arg.includes("seed")));
}

describe("vercel build decision", () => {
  it("migrates only for VERCEL_ENV=production and never seeds", async () => {
    const { decideVercelBuild, vercelBuildLogLines } = await loadPlan();
    const cases = [
      { VERCEL_ENV: "production", migrate: true, branch: "production-migrate" as const },
      { VERCEL_ENV: "preview", migrate: false, branch: "skip-migrate" as const },
      { VERCEL_ENV: "development", migrate: false, branch: "skip-migrate" as const },
      { VERCEL_ENV: undefined, migrate: false, branch: "skip-migrate" as const },
      { VERCEL_ENV: "", migrate: false, branch: "skip-migrate" as const },
      { VERCEL_ENV: "Production", migrate: false, branch: "skip-migrate" as const },
      { VERCEL_ENV: "prod", migrate: false, branch: "skip-migrate" as const },
    ];

    for (const entry of cases) {
      const env: { VERCEL_ENV?: string } = {};
      if (entry.VERCEL_ENV !== undefined) env.VERCEL_ENV = entry.VERCEL_ENV;
      const plan = decideVercelBuild(env);
      expect(plan.migrate, JSON.stringify(entry)).toBe(entry.migrate);
      expect(plan.seed).toBe(false);
      expect(plan.branch).toBe(entry.branch);
      expect(runsMigrate(plan)).toBe(entry.migrate);
      expect(runsSeed(plan)).toBe(false);
      expect(plan.steps.map((step) => step.command)).toEqual(
        entry.migrate ? ["prisma", "prisma", "next"] : ["prisma", "next"],
      );
      expect(plan.steps[0]).toEqual({ command: "prisma", args: ["generate"] });
      expect(plan.steps.at(-1)).toEqual({ command: "next", args: ["build", "--webpack"] });
      const logs = vercelBuildLogLines(plan).join("\n");
      expect(logs).toContain("seed=false");
      expect(logs).toContain("vercel-build: seed did not run");
      if (entry.migrate) {
        expect(logs).toContain("vercel-build: migrations running because VERCEL_ENV is production");
      } else {
        expect(logs).toContain("vercel-build: migrations did not run");
        expect(logs).not.toContain("migrations running");
      }
    }
  });

  it("keeps the Vercel build command on the script and off the seed", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8")) as {
      buildCommand?: string;
    };
    expect(pkg.scripts["vercel-build"]).toBe("node scripts/vercel-build.mjs");
    expect(pkg.scripts["vercel-build"]).not.toMatch(/seed|migrate/);
    expect(pkg.scripts["db:seed"]).toBe("node --env-file-if-exists=.env --import tsx prisma/seed.ts");
    expect(vercel.buildCommand).toBe("npm run vercel-build");
    const script = readFileSync(path.join(root, "scripts/vercel-build.mjs"), "utf8");
    expect(script).not.toMatch(/db:seed|prisma\/seed/);
  });
});
