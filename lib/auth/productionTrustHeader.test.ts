import { afterEach, describe, expect, it, vi } from "vitest";
import { assertAuthTrustUserHeaderForbiddenInProduction } from "./productionTrustHeader";

const FORBIDDEN = /AUTH_TRUST_USER_HEADER is forbidden in production/;

const previousVercel = process.env.VERCEL_ENV;
const previousTrust = process.env.AUTH_TRUST_USER_HEADER;

function assignEnv(name: "VERCEL_ENV" | "AUTH_TRUST_USER_HEADER", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function useEnv(vercelEnv: string | undefined, trustHeader: string | undefined) {
  assignEnv("VERCEL_ENV", vercelEnv);
  assignEnv("AUTH_TRUST_USER_HEADER", trustHeader);
}

afterEach(() => {
  assignEnv("VERCEL_ENV", previousVercel);
  assignEnv("AUTH_TRUST_USER_HEADER", previousTrust);
  vi.resetModules();
});

describe("assertAuthTrustUserHeaderForbiddenInProduction", () => {
  it.each(["1", "true", "TRUE", "yes", "Yes", " YeS "])(
    "throws when VERCEL_ENV is production and AUTH_TRUST_USER_HEADER is %j",
    (trustHeader) => {
      useEnv("production", trustHeader);
      expect(() => assertAuthTrustUserHeaderForbiddenInProduction()).toThrow(FORBIDDEN);
    },
  );

  it.each([
    ["production", undefined],
    ["production", ""],
    ["production", "0"],
    ["production", "false"],
    ["production", "FALSE"],
    ["production", "no"],
    ["preview", "1"],
    ["preview", "true"],
    ["preview", "yes"],
    ["development", "1"],
    [undefined, "1"],
    [undefined, "true"],
    ["Production", "1"],
  ] as const)(
    "does not throw when VERCEL_ENV is %j and AUTH_TRUST_USER_HEADER is %j",
    (vercelEnv, trustHeader) => {
      useEnv(vercelEnv, trustHeader);
      expect(() => assertAuthTrustUserHeaderForbiddenInProduction()).not.toThrow();
    },
  );
});

describe("production boot wiring", () => {
  it("instrumentation register throws in production when the trust header is truthy", async () => {
    useEnv("production", "yes");
    vi.resetModules();
    const { register } = await import("../../instrumentation");
    await expect(register()).rejects.toThrow(FORBIDDEN);
  });

  it("instrumentation register does not throw outside production or when the header is unset", async () => {
    useEnv("preview", "1");
    vi.resetModules();
    const preview = await import("../../instrumentation");
    await expect(preview.register()).resolves.toBeUndefined();

    useEnv("production", undefined);
    vi.resetModules();
    const production = await import("../../instrumentation");
    await expect(production.register()).resolves.toBeUndefined();
  });

  it("auth session module throws on load in production when the trust header is truthy", async () => {
    useEnv("production", "true");
    vi.resetModules();
    await expect(import("./sessionToken")).rejects.toThrow(FORBIDDEN);
  });

  it("auth session module loads when production has no trust header and when the header is only for preview", async () => {
    useEnv("production", undefined);
    vi.resetModules();
    await expect(import("./sessionToken")).resolves.toHaveProperty("trustsUserHeader");

    useEnv("preview", "1");
    vi.resetModules();
    const loaded = await import("./sessionToken");
    expect(loaded.trustsUserHeader()).toBe(true);
  });
});
