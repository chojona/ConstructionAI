import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/domain/errors";
import {
  LOGIN_EMAIL_FAILURE_LIMIT,
  LOGIN_RATE_LIMIT_MESSAGE,
  PrismaLoginAttemptStore,
  isLoginCredentialFailure,
  resetLoginAttemptStore,
  runLimitedAuthAttempt,
  setLoginAttemptStore,
} from "@/lib/auth/loginRateLimit";
import { hasIntegrationDatabase, integrationDb } from "@/tests/support/integrationDb";

describe.skipIf(!hasIntegrationDatabase)("login attempt rows", () => {
  const db = integrationDb();
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const email = `rate-${suffix}@northstar.example`;
  const unknown = `missing-${suffix}@northstar.example`;
  const ip = "203.0.113.50";
  const now = new Date();
  const invalidLogin = new DomainError("UNAUTHENTICATED", "Email or password is incorrect.", 401);

  beforeAll(() => {
    setLoginAttemptStore(new PrismaLoginAttemptStore(db));
  });

  afterAll(async () => {
    await db.loginAttempt.deleteMany({ where: { OR: [{ email }, { email: unknown }, { ip }] } });
    resetLoginAttemptStore();
    await db.$disconnect();
  });

  async function fail(target: string) {
    await expect(runLimitedAuthAttempt({
      email: target,
      ip,
      now,
      countsFailure: isLoginCredentialFailure,
      run: async () => {
        throw invalidLogin;
      },
    })).rejects.toMatchObject({ httpStatus: 401, message: "Email or password is incorrect." });
  }

  it("locks known and unknown emails with the same error and clears a successful login", async () => {
    for (let i = 0; i < LOGIN_EMAIL_FAILURE_LIMIT; i++) await fail(unknown);
    await expect(runLimitedAuthAttempt({
      email: unknown,
      ip,
      now,
      countsFailure: isLoginCredentialFailure,
      run: async () => "ok",
    })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: LOGIN_RATE_LIMIT_MESSAGE,
      httpStatus: 429,
    });

    for (let i = 0; i < LOGIN_EMAIL_FAILURE_LIMIT - 1; i++) await fail(email);
    expect(await db.loginAttempt.count({ where: { email } })).toBe(LOGIN_EMAIL_FAILURE_LIMIT - 1);
    await runLimitedAuthAttempt({
      email,
      ip,
      now,
      countsFailure: isLoginCredentialFailure,
      run: async () => ({ email }),
      emailToClear: (result) => result.email,
    });
    expect(await db.loginAttempt.count({ where: { email } })).toBe(0);

    for (let i = 0; i < LOGIN_EMAIL_FAILURE_LIMIT; i++) await fail(email);
    await expect(runLimitedAuthAttempt({
      email,
      ip,
      now,
      countsFailure: isLoginCredentialFailure,
      run: async () => "ok",
    })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: LOGIN_RATE_LIMIT_MESSAGE,
      httpStatus: 429,
    });
    expect(await db.loginAttempt.count({ where: { email } })).toBe(LOGIN_EMAIL_FAILURE_LIMIT);
  });
});