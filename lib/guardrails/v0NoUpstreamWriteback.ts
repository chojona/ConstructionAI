import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** CON-79: V0 desk ingests into ConstructionAI only — no upstream writeback. */
export const V0_NO_UPSTREAM_WRITEBACK_RULE = "CON-79";

/** Product code that ships on the V0 desk (not benchmarks, eval harnesses, or this guard). */
export const V0_PRODUCT_ROOTS = ["app", "components", "lib"] as const;

export const V0_PRODUCT_EXCLUDED_PREFIXES = [
  "lib/benchmarks/",
  "lib/extractions/eval/",
  "lib/guardrails/",
  "lib/observability/",
  "lib/quality/",
] as const;

/** Integration roots that must not appear as outbound write clients on V0. */
export const FORBIDDEN_INTEGRATION_DIR_NAMES = ["bluebeam", "procore"] as const;

export type WritebackViolation = {
  rule: typeof V0_NO_UPSTREAM_WRITEBACK_RULE;
  kind: "forbidden_directory" | "forbidden_filename" | "forbidden_pattern";
  path: string;
  detail: string;
};

const PRODUCT_FILE_EXTENSIONS = new Set([".ts", ".tsx"]);

const PRODUCT_TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;

const FORBIDDEN_FILENAME = /(?:writeback|upstream[-_]?write|(?:bluebeam|procore|heavyjob|acc)[-_]?write[-_]?client)/i;

/**
 * Line-level signatures for outbound Bluebeam / ACC / HeavyJob PCO-create / Procore writes.
 * Patterns are intentionally narrow to avoid flagging ingest-only ACC chapters or HeavyJob read fixtures.
 */
export const FORBIDDEN_LINE_PATTERNS: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "bluebeam-outbound-post", pattern: /\bpost(?:To)?Bluebeam\b/i },
  { id: "bluebeam-api-host-write", pattern: /bluebeam\.com.*method:\s*["'](?:POST|PUT|PATCH|DELETE)/i },
  { id: "acc-mutation-client", pattern: /\b(?:mutateAcc|accMutat(?:e|ion)|AccWriteClient|postToAutodesk)\b/ },
  {
    id: "autodesk-api-write",
    pattern: /developer\.api\.autodesk\.com[\s\S]{0,120}method:\s*["'](?:POST|PUT|PATCH|DELETE)/i,
  },
  { id: "heavyjob-pco-create", pattern: /\bcreateHeavyJobPco\b/i },
  { id: "heavyjob-pco-api-post", pattern: /heavyjob[\w./-]*\/api\/[\w./-]*pco[\w./-]*.*method:\s*["']POST/i },
  { id: "procore-write-client", pattern: /\b(?:procoreWrite|ProcoreWriteClient|postToProcore)\b/ },
  { id: "procore-api-host-write", pattern: /api\.procore\.com.*method:\s*["'](?:POST|PUT|PATCH|DELETE)/i },
  { id: "generic-writeback-export", pattern: /\bexport\s+(?:async\s+)?function\s+\w*writeback\w*/i },
];

function isExcluded(relativePath: string) {
  const normalized = relativePath.replaceAll("\\", "/");
  return V0_PRODUCT_EXCLUDED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function listProductSourceFiles(rootDir: string): string[] {
  const files: string[] = [];
  for (const root of V0_PRODUCT_ROOTS) {
    const absoluteRoot = path.join(rootDir, root);
    if (!existsSync(absoluteRoot)) continue;
    walk(absoluteRoot, (file) => files.push(file));
  }
  return files.sort();
}

function walk(dir: string, onFile: (absolutePath: string) => void) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, onFile);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name);
    if (!PRODUCT_FILE_EXTENSIONS.has(ext)) continue;
    onFile(absolute);
  }
}

function relativeFromRoot(rootDir: string, absolutePath: string) {
  return path.relative(rootDir, absolutePath).replaceAll("\\", "/");
}

export function scanV0ProductPathsForUpstreamWriteback(rootDir = process.cwd()): WritebackViolation[] {
  const violations: WritebackViolation[] = [];

  for (const integration of FORBIDDEN_INTEGRATION_DIR_NAMES) {
    for (const root of V0_PRODUCT_ROOTS) {
      const dir = path.join(rootDir, root, integration);
      if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
      violations.push({
        rule: V0_NO_UPSTREAM_WRITEBACK_RULE,
        kind: "forbidden_directory",
        path: relativeFromRoot(rootDir, dir),
        detail: `Outbound ${integration} integration directory is not allowed on the V0 desk.`,
      });
    }
  }

  for (const absolutePath of listProductSourceFiles(rootDir)) {
    const relativePath = relativeFromRoot(rootDir, absolutePath);
    if (isExcluded(relativePath)) continue;
    if (PRODUCT_TEST_FILE.test(relativePath)) continue;

    const baseName = path.basename(relativePath);
    if (FORBIDDEN_FILENAME.test(baseName)) {
      violations.push({
        rule: V0_NO_UPSTREAM_WRITEBACK_RULE,
        kind: "forbidden_filename",
        path: relativePath,
        detail: `Filename suggests an upstream write client (${baseName}).`,
      });
    }

    const content = readFileSync(absolutePath, "utf8");
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!;
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      for (const { id, pattern } of FORBIDDEN_LINE_PATTERNS) {
        if (!pattern.test(line)) continue;
        violations.push({
          rule: V0_NO_UPSTREAM_WRITEBACK_RULE,
          kind: "forbidden_pattern",
          path: relativePath,
          detail: `${id} at line ${index + 1}: ${trimmed}`,
        });
      }
    }
  }

  return violations;
}

export function formatWritebackViolations(violations: readonly WritebackViolation[]) {
  if (violations.length === 0) {
    return "CON-79: no Bluebeam / ACC / HeavyJob PCO-create / Procore writeback in V0 product paths.";
  }
  return violations
    .map((item) => `${item.path}: [${item.kind}] ${item.detail}`)
    .join("\n");
}
