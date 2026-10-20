export type SeedEnv = {
  VERCEL_ENV?: string;
  NODE_ENV?: string;
  ALLOW_PROD_SEED?: string;
  DATABASE_URL?: string;
  DIRECT_DATABASE_URL?: string;
  PROD_DB_HOST?: string;
};

const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

/**
 * Manual seed must not write a demo org admin into production.
 * `ALLOW_PROD_SEED=1` is the only override. Any other value, including
 * "true", still refuses. Same rule as the guard from #99.
 *
 * Two production signals are checked, in order, and both run before a
 * database client is created:
 *
 * 1. Environment. `VERCEL_ENV` or `NODE_ENV` is exactly `production`.
 *    An unset or other value does not trip this check.
 *
 * 2. Host. The hostname of `DATABASE_URL` or `DIRECT_DATABASE_URL` matches
 *    `PROD_DB_HOST`. Comparison is case-insensitive, ignores the port and a
 *    trailing dot, and treats a unicode hostname and its punycode form as
 *    the same host. `PROD_DB_HOST` may be a bare hostname, `host:port`, a
 *    postgres URL, or a comma-separated list of those. Blank entries are
 *    dropped. Only the hostname of each entry is used. A list that still
 *    contains an unusable entry fails closed.
 *
 *    On a `*.neon.tech` host, the endpoint label (the first label) ending
 *    in `-pooler` matches the same endpoint without that suffix, in either
 *    direction. `ep-foo-123-pooler.us-east-2.aws.neon.tech` and
 *    `ep-foo-123.us-east-2.aws.neon.tech` are one host. A `-pooler` label
 *    on any other hostname stays part of that name.
 *
 * When `PROD_DB_HOST` is unset or blank, the host check does not refuse.
 * That matches #99: a missing production signal is not treated as
 * production, so local and preview seeds keep working without the variable.
 * The environment check still applies.
 *
 * When `PROD_DB_HOST` is set, the host check fails closed. A set URL that
 * is not a parsable postgres URL, or that has no hostname, refuses. If
 * neither URL is set, the seed also refuses, because the target host cannot
 * be shown to be non-production. A URL that is itself unset is skipped so
 * the other URL can still be checked. Refusal text includes hostnames only,
 * never a connection string.
 */
export function seedRefusalReason(env: SeedEnv = process.env): string | null {
  if (env.ALLOW_PROD_SEED === "1") return null;

  const environmentReason = productionEnvironmentRefusal(env);
  if (environmentReason) return environmentReason;

  return productionHostRefusal(env);
}

export function assertSeedAllowed(env: SeedEnv = process.env): void {
  const reason = seedRefusalReason(env);
  if (reason) throw new Error(reason);
}

function productionEnvironmentRefusal(env: SeedEnv): string | null {
  const vercelProduction = env.VERCEL_ENV === "production";
  const nodeProduction = env.NODE_ENV === "production";
  if (!vercelProduction && !nodeProduction) return null;
  const reasons = [
    vercelProduction ? "VERCEL_ENV=production" : null,
    nodeProduction ? "NODE_ENV=production" : null,
  ].filter((reason): reason is string => reason !== null);
  return `Refusing to seed while ${reasons.join(" and ")}. Seed is manual and is not part of the Vercel build. Set ALLOW_PROD_SEED=1 to override.`;
}

const NEON_POOLER_SUFFIX = "-pooler";

function productionHostRefusal(env: SeedEnv): string | null {
  const configured = blankToUndefined(env.PROD_DB_HOST);
  if (!configured) return null;

  const prodHosts = parseProdDbHosts(configured);
  if (prodHosts.kind === "blank") return null;
  if (prodHosts.kind === "unusable") {
    return "Refusing to seed because PROD_DB_HOST is set but is not a usable hostname, so the database host cannot be checked. Seed is manual and is not part of the Vercel build. Set ALLOW_PROD_SEED=1 to override.";
  }

  const database = inspectPostgresUrl(env.DATABASE_URL);
  const direct = inspectPostgresUrl(env.DIRECT_DATABASE_URL);
  const unparsable = [
    database.kind === "unparsable" ? "DATABASE_URL" : null,
    direct.kind === "unparsable" ? "DIRECT_DATABASE_URL" : null,
  ].filter((name): name is string => name !== null);

  if (unparsable.length > 0) {
    return `Refusing to seed because PROD_DB_HOST is set and ${unparsable.join(" and ")} could not be parsed as a postgres URL, so the host cannot be checked. Seed is manual and is not part of the Vercel build. Set ALLOW_PROD_SEED=1 to override.`;
  }

  if (database.kind === "absent" && direct.kind === "absent") {
    return "Refusing to seed because PROD_DB_HOST is set and neither DATABASE_URL nor DIRECT_DATABASE_URL is set, so the host cannot be checked. Seed is manual and is not part of the Vercel build. Set ALLOW_PROD_SEED=1 to override.";
  }

  const matches = [
    database.kind === "host" ? matchedProdHost("DATABASE_URL", database.host, prodHosts.hosts) : null,
    direct.kind === "host" ? matchedProdHost("DIRECT_DATABASE_URL", direct.host, prodHosts.hosts) : null,
  ].filter((match): match is ProdHostMatch => match !== null);

  if (matches.length === 0) return null;
  const names = matches.map((match) => match.name).join(" and ");
  const hosts = [...new Set(matches.map((match) => match.host))].join(", ");
  return `Refusing to seed because ${names} host matches PROD_DB_HOST (${hosts}). Seed is manual and is not part of the Vercel build. Set ALLOW_PROD_SEED=1 to override.`;
}

type ProdHostMatch = { name: string; host: string };

function matchedProdHost(name: string, urlHost: string, prodHosts: string[]): ProdHostMatch | null {
  const host = prodHosts.find((prodHost) => hostsMatch(urlHost, prodHost));
  return host ? { name, host } : null;
}

function hostsMatch(urlHost: string, prodHost: string): boolean {
  return comparisonKey(urlHost) === comparisonKey(prodHost);
}

/** Neon pooler and direct endpoints share one key. Every other host is itself. */
function comparisonKey(host: string): string {
  const labels = host.split(".");
  if (labels.length < 3 || labels[labels.length - 2] !== "neon" || labels[labels.length - 1] !== "tech") return host;
  const endpoint = labels[0];
  if (endpoint.endsWith(NEON_POOLER_SUFFIX) && endpoint.length > NEON_POOLER_SUFFIX.length) {
    labels[0] = endpoint.slice(0, -NEON_POOLER_SUFFIX.length);
  }
  return labels.join(".");
}

type ProdHostList = { kind: "blank" } | { kind: "unusable" } | { kind: "hosts"; hosts: string[] };

function parseProdDbHosts(raw: string): ProdHostList {
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return { kind: "blank" };

  const hosts: string[] = [];
  for (const part of parts) {
    const extracted = part.includes("://") ? hostnameFromPostgresUrl(part) : part;
    const host = canonicalHost(extracted ?? "");
    if (!host) return { kind: "unusable" };
    hosts.push(host);
  }
  return { kind: "hosts", hosts };
}

type UrlInspection = { kind: "absent" } | { kind: "unparsable" } | { kind: "host"; host: string };

function inspectPostgresUrl(value: string | undefined): UrlInspection {
  const present = blankToUndefined(value);
  if (!present) return { kind: "absent" };
  const host = hostnameFromPostgresUrl(present);
  if (!host) return { kind: "unparsable" };
  const canonical = canonicalHost(host);
  if (!canonical) return { kind: "unparsable" };
  return { kind: "host", host: canonical };
}

function hostnameFromPostgresUrl(connectionString: string): string | null {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return null;
  }
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) return null;

  if (url.hostname) return url.hostname;

  const queryHost = url.searchParams.get("host");
  if (!queryHost || queryHost.startsWith("/")) return null;
  return queryHost;
}

function canonicalHost(raw: string): string | null {
  let value = stripPortAndBrackets(raw);
  if (!value) return null;
  if (value.includes("%")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
    value = stripPortAndBrackets(value);
    if (!value) return null;
  }
  try {
    const wrapped = value.includes(":") ? `[${value}]` : value;
    return stripPortAndBrackets(new URL(`http://${wrapped}`).hostname);
  } catch {
    return null;
  }
}

function stripPortAndBrackets(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end <= 1) return null;
    const rest = value.slice(end + 1);
    if (rest.length > 0 && !/^:\d+$/.test(rest)) return null;
    value = value.slice(1, end);
  } else {
    const portMatch = /^(.*):(\d+)$/.exec(value);
    if (portMatch && !portMatch[1].includes(":")) value = portMatch[1];
  }
  if (value.endsWith(".")) value = value.slice(0, -1);
  if (!value || value.includes("/") || /\s/.test(value)) return null;
  return value;
}

function blankToUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}
