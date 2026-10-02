import { readFileSync } from "node:fs";
import path from "node:path";

/** WEAK wedge guardrail (CON-74): no entitlement / DSC / FA / CO-candidate schema or API fields. */
export type WeakWedgeBannedLabel =
  | "entitlement"
  | "dsc"
  | "force-account"
  | "change-order"
  | "pco"
  | "candidate"
  | "detection-signal";

export interface SchemaWallHit {
  file: string;
  line: number;
  kind: string;
  identifier: string;
  label: WeakWedgeBannedLabel;
}

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

export const SCHEMA_WALL_PATHS = {
  prismaSchema: "prisma/schema.prisma",
  domainTypes: "lib/domain/types.ts",
  domainRepository: "lib/domain/repository.ts",
  apiDtos: [
    "lib/documents/dto.ts",
    "lib/email/dto.ts",
    "lib/extractions/dto.ts",
    "lib/heavyjob/dto.ts",
    "lib/review/dto.ts",
  ],
  apiZodSchemas: [
    "lib/review/service.ts",
    "lib/heavyjob/service.ts",
    "lib/extractions/constructionFacts.ts",
    "lib/email/service.ts",
    "lib/documents/service.ts",
    "lib/projects/service.ts",
    "lib/extractions/service.ts",
  ],
} as const;

export function normalizeIdentifier(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

export function bannedLabelForIdentifier(identifier: string): WeakWedgeBannedLabel | null {
  const n = normalizeIdentifier(identifier);
  const segments = n.split("_").filter(Boolean);

  if (n.includes("entitlement")) return "entitlement";
  if (segments.includes("dsc")) return "dsc";
  if (n.includes("force_account") || n.includes("forceaccount")) return "force-account";
  if (segments.includes("pco")) return "pco";
  if (segments.includes("change") && segments.includes("order")) return "change-order";
  if (n.includes("co_candidate") || n.includes("change_order_candidate")) return "candidate";
  if (segments.includes("candidate")) return "candidate";
  if (n.includes("detection_signal") || (segments.includes("detection") && segments.includes("signal"))) {
    return "detection-signal";
  }

  if (segments.length === 1 && segments[0] === "fa") return "force-account";
  if (segments.includes("fa") && (segments.includes("force") || segments.includes("account"))) {
    return "force-account";
  }

  return null;
}

function rel(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function pushHit(
  hits: SchemaWallHit[],
  filePath: string,
  line: number,
  kind: string,
  identifier: string,
) {
  const label = bannedLabelForIdentifier(identifier);
  if (!label) return;
  hits.push({ file: rel(filePath), line, kind, identifier, label });
}

export function collectPrismaIdentifiers(schema: string, filePath: string): SchemaWallHit[] {
  const hits: SchemaWallHit[] = [];
  const lines = schema.split("\n");
  let inEnum = false;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();
    if (!line || line.startsWith("//")) continue;

    const enumDecl = line.match(/^enum\s+(\w+)/);
    if (enumDecl) {
      inEnum = true;
      pushHit(hits, filePath, index + 1, "enum", enumDecl[1]);
      continue;
    }

    const modelDecl = line.match(/^model\s+(\w+)/);
    if (modelDecl) {
      inEnum = false;
      pushHit(hits, filePath, index + 1, "model", modelDecl[1]);
      continue;
    }

    if (line === "}") {
      inEnum = false;
      continue;
    }

    if (inEnum) {
      const value = line.replace(/,$/, "");
      if (/^[A-Z][A-Z0-9_]*$/.test(value)) {
        pushHit(hits, filePath, index + 1, "enumValue", value);
      }
      continue;
    }

    if (/^  \w+/.test(raw)) {
      const field = raw.trim().match(/^(\w+)\s+/);
      if (field && !field[1].startsWith("@@")) {
        pushHit(hits, filePath, index + 1, "field", field[1]);
      }
    }
  }

  return hits;
}

export function collectTypeScriptIdentifiers(source: string, filePath: string): SchemaWallHit[] {
  const hits: SchemaWallHit[] = [];
  const lines = source.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    const typeAlias = trimmed.match(/^export type (\w+)\s*=/);
    if (typeAlias) pushHit(hits, filePath, index + 1, "type", typeAlias[1]);

    const iface = trimmed.match(/^(?:export )?interface (\w+)/);
    if (iface) pushHit(hits, filePath, index + 1, "interface", iface[1]);

    const prop = trimmed.match(/^(\w+)(\?)?:\s/);
    if (prop) pushHit(hits, filePath, index + 1, "property", prop[1]);

    const stringUnion = trimmed.match(/^\|?\s*"([^"]+)"/);
    if (stringUnion) pushHit(hits, filePath, index + 1, "stringLiteral", stringUnion[1]);

    for (const match of trimmed.matchAll(/z\.enum\(\[([^\]]+)\]/g)) {
      for (const literal of match[1].match(/"([^"]+)"/g) ?? []) {
        pushHit(hits, filePath, index + 1, "zodEnum", literal.slice(1, -1));
      }
    }

    const objectKey = trimmed.match(/^(\w+):\s*z\./);
    if (objectKey) pushHit(hits, filePath, index + 1, "zodKey", objectKey[1]);
  }

  return hits;
}

export function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

export function auditWeakWedgeSchemaWall(): SchemaWallHit[] {
  const hits: SchemaWallHit[] = [];

  hits.push(
    ...collectPrismaIdentifiers(
      readRepoFile(SCHEMA_WALL_PATHS.prismaSchema),
      path.join(REPO_ROOT, SCHEMA_WALL_PATHS.prismaSchema),
    ),
  );

  for (const relativePath of [
    SCHEMA_WALL_PATHS.domainTypes,
    SCHEMA_WALL_PATHS.domainRepository,
    ...SCHEMA_WALL_PATHS.apiDtos,
    ...SCHEMA_WALL_PATHS.apiZodSchemas,
  ]) {
    const absolute = path.join(REPO_ROOT, relativePath);
    hits.push(...collectTypeScriptIdentifiers(readRepoFile(relativePath), absolute));
  }

  return hits;
}

export function formatSchemaWallFailures(hits: SchemaWallHit[]): string {
  return hits
    .map((hit) => `${hit.file}:${hit.line} ${hit.kind} \`${hit.identifier}\` (${hit.label})`)
    .join("\n");
}
