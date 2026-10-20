import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");

/**
 * Fail closed: migrate only when VERCEL_ENV is exactly "production".
 * Preview, development, unset, and any other value skip migrate.
 * Seed is never part of the build.
 */
export function decideVercelBuild(env = process.env) {
  const raw = env.VERCEL_ENV;
  const migrate = raw === "production";
  const steps = [{ command: "prisma", args: ["generate"] }];
  if (migrate) steps.push({ command: "prisma", args: ["migrate", "deploy"] });
  steps.push({ command: "next", args: ["build", "--webpack"] });
  return {
    vercelEnv: typeof raw === "string" ? raw : null,
    migrate,
    seed: false,
    branch: migrate ? "production-migrate" : "skip-migrate",
    steps,
  };
}

export function vercelBuildLogLines(plan) {
  const shown = plan.vercelEnv === null ? "(unset)" : JSON.stringify(plan.vercelEnv);
  const lines = [
    `vercel-build: branch=${plan.branch} VERCEL_ENV=${shown} migrate=${plan.migrate} seed=${plan.seed}`,
  ];
  if (plan.migrate) {
    lines.push("vercel-build: migrations running because VERCEL_ENV is production");
  } else {
    lines.push("vercel-build: migrations did not run");
  }
  lines.push("vercel-build: seed did not run");
  return lines;
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(scriptPath);
  } catch {
    return false;
  }
}

function runStep(step) {
  console.log(`vercel-build: run ${step.command} ${step.args.join(" ")}`);
  const result = spawnSync(path.join(root, "node_modules", ".bin", step.command), step.args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

if (isDirectRun()) {
  const plan = decideVercelBuild(process.env);
  for (const line of vercelBuildLogLines(plan)) console.log(line);
  for (const step of plan.steps) runStep(step);
}
