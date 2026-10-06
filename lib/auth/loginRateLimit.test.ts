import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "@/lib/domain/errors";
import { errorResponse } from "@/lib/http";
import { findAcceptEmail } from "@/lib/auth/login";
import { hashToken } from "@/lib/auth/sessionToken";
import type { CredentialStore } from "@/lib/auth/credentials";
import {
  LOGIN_ATTEMPT_WINDOW_MS,
  LOGIN_EMAIL_FAILURE_LIMIT,
  LOGIN_IP_FAILURE_LIMIT,
  LOGIN_RATE_LIMIT_MESSAGE,
  MemoryLoginAttemptStore,
  clientIp,
  isLoginCredentialFailure,
  resetLoginAttemptStore,
  runLimitedAuthAttempt,
  setLoginAttemptStore,
} from "./loginRateLimit";

const IP = "203.0.113.10";
const EMAIL = "pe@northstar.example";
const START = new Date("2026-10-06T16:00:00.000Z");

const invalidLogin = new DomainError("UNAUTHENTICATED", "Email or password is incorrect.", 401);

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

async function failLogin(email: string, now: Date, ip = IP) {
  await expect(runLimitedAuthAttempt({
    email,
    ip,
    now,
    countsFailure: isLoginCredentialFailure,
    run: async () => {
      throw invalidLogin;
    },
  })).rejects.toMatchObject({ httpStatus: 401 });
}

describe("login attempt lockout", () => {
  const store = new MemoryLoginAttemptStore();

  beforeEach(() => {
    store.rows = [];
    setLoginAttemptStore(store);
  });

  afterEach(() => {
    resetLoginAttemptStore();
  });

  it("uses a 15 minute window, 10 failures per email, and an IP cap", () => {
    expect(LOGIN_ATTEMPT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(LOGIN_EMAIL_FAILURE_LIMIT).toBe(10);
    expect(LOGIN_IP_FAILURE_LIMIT).toBe(30);
  });

  it("allows failures inside the window and locks on the next attempt", async () => {
    for (let i = 0; i < LOGIN_EMAIL_FAILURE_LIMIT; i++) await failLogin(EMAIL, START);
    let ran = false;
    await expect(runLimitedAuthAttempt({
      email: EMAIL,
      ip: IP,
      now: new Date(START.getTime() + LOGIN_ATTEMPT_WINDOW_MS - 1),
      countsFailure: isLoginCredentialFailure,
      run: async () => {
        ran = true;
        return EMAIL;
      },
    })).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: LOGIN_RATE_LIMIT_MESSAGE,
      httpStatus: 429,
    });
    expect(ran).toBe(false);
    expect(store.rows).toHaveLength(LOGIN_EMAIL_FAILURE_LIMIT);
  });

  it("forgets failures once the window has passed", async () => {
    for (let i = 0; i < LOGIN_EMAIL_FAILURE_LIMIT; i++) await failLogin(EMAIL, START);
    await expect(runLimitedAuthAttempt({
      email: EMAIL,
      ip: IP,
      now: new Date(START.getTime() + LOGIN_ATTEMPT_WINDOW_MS),
      countsFailure: isLoginCredentialFailure,
      run: async () => "ok",
    })).resolves.toBe("ok");
  });

  it("returns the same error for a known email and an unknown email", async () => {
    const unknown = "missing@northstar.example";
    for (const email of [EMAIL, unknown]) {
      for (let i = 0; i < LOGIN_EMAIL_FAILURE_LIMIT; i++) await failLogin(email, START);
    }
    const blocked = await Promise.all([EMAIL, unknown].map(async (email) => {
      try {
        await runLimitedAuthAttempt({
          email,
          ip: IP,
          now: START,
          countsFailure: isLoginCredentialFailure,
          run: async () => "ok",
        });
      } catch (error) {
        const response = errorResponse(error);
        return { status: response.status, body: await response.json() };
      }
      throw new Error("expected lockout");
    }));
    expect(blocked[0]).toEqual(blocked[1]);
    expect(blocked[0]).toEqual({
      status: 429,
      body: { error: { code: "RATE_LIMITED", message: LOGIN_RATE_LIMIT_MESSAGE } },
    });
  });

  it("clears that email after success and leaves other emails in place", async () => {
    const other = "other@northstar.example";
    for (let i = 0; i < LOGIN_EMAIL_FAILURE_LIMIT - 1; i++) {
      await failLogin(EMAIL, START);
      await failLogin(other, START, "203.0.113.11");
    }
    await expect(runLimitedAuthAttempt({
      email: EMAIL,
      ip: IP,
      now: START,
      countsFailure: isLoginCredentialFailure,
      run: async () => ({ email: EMAIL }),
      emailToClear: (result) => result.email,
    })).resolves.toEqual({ email: EMAIL });
    expect(store.rows.every((row) => row.email === other)).toBe(true);
    expect(store.rows).toHaveLength(LOGIN_EMAIL_FAILURE_LIMIT - 1);

    for (let i = 0; i < LOGIN_EMAIL_FAILURE_LIMIT; i++) await failLogin(EMAIL, START);
    await expect(runLimitedAuthAttempt({
      email: EMAIL,
      ip: IP,
      now: START,
      countsFailure: isLoginCredentialFailure,
      run: async () => "ok",
    })).rejects.toMatchObject({ httpStatus: 429 });
  });

  it("locks an address spraying many emails without locking a different address", async () => {
    for (let i = 0; i < LOGIN_IP_FAILURE_LIMIT; i++) {
      store.rows.push({
        email: `spray${i}@northstar.example`,
        ip: IP,
        createdAt: START,
      });
    }
    await expect(runLimitedAuthAttempt({
      email: "fresh@northstar.example",
      ip: IP,
      now: START,
      countsFailure: isLoginCredentialFailure,
      run: async () => "ok",
    })).rejects.toMatchObject({ code: "RATE_LIMITED", httpStatus: 429 });
    await expect(runLimitedAuthAttempt({
      email: "fresh@northstar.example",
      ip: "203.0.113.20",
      now: START,
      countsFailure: isLoginCredentialFailure,
      run: async () => {
        throw invalidLogin;
      },
    })).rejects.toMatchObject({ httpStatus: 401 });
  });

  it("does not count a refusal that happens after the password matched", async () => {
    await expect(runLimitedAuthAttempt({
      email: EMAIL,
      ip: IP,
      now: START,
      countsFailure: isLoginCredentialFailure,
      run: async () => {
        throw new DomainError("FORBIDDEN", "This account is disabled for the organization.", 403);
      },
    })).rejects.toMatchObject({ httpStatus: 403 });
    expect(store.rows).toHaveLength(0);
  });

  it("does not apply the email cap to attempts with no email", async () => {
    for (let i = 0; i < LOGIN_EMAIL_FAILURE_LIMIT; i++) {
      await expect(runLimitedAuthAttempt({
        ip: IP,
        now: START,
        resolveEmail: async () => null,
        countsFailure: () => true,
        run: async () => {
          throw new DomainError("INVALID_INPUT", "This invitation link is not valid.", 400);
        },
      })).rejects.toMatchObject({ httpStatus: 400 });
    }
    await expect(runLimitedAuthAttempt({
      email: EMAIL,
      ip: "203.0.113.21",
      now: START,
      countsFailure: isLoginCredentialFailure,
      run: async () => "ok",
    })).resolves.toBe("ok");
  });

  it("reads the platform client address and shares a bucket when it is missing", () => {
    expect(clientIp({
      headers: headers({
        "x-vercel-forwarded-for": "2001:DB8::1, 10.0.0.1",
        "x-real-ip": "198.51.100.2",
        "x-forwarded-for": "198.51.100.3",
      }),
    })).toBe("2001:db8::1");
    expect(clientIp({
      headers: headers({ "x-forwarded-for": "198.51.100.3, 10.0.0.1" }),
    })).toBe("198.51.100.3");
    expect(clientIp({
      headers: headers({ "x-forwarded-for": "not-an-ip" }),
    })).toBe("unknown");
    expect(clientIp({ headers: headers({}) })).toBe("unknown");
  });
});

describe("accept email lookup", () => {
  const token = "invite-token-value-ok";

  function store(email: string | null): Pick<CredentialStore, "findInvite"> {
    return {
      async findInvite(tokenHash: string) {
        if (email === null || tokenHash !== hashToken(token)) return null;
        return {
          membership: {
            id: "membership_1",
            organizationId: "org_a",
            userId: "user_1",
            role: "REVIEWER",
            status: "INVITED",
          },
          email,
          name: null,
          organizationName: "Northstar",
          expiresAt: new Date(START.getTime() + 60_000),
        };
      },
    };
  }

  it("normalizes the invited email and returns null when the token identifies nobody", async () => {
    expect(await findAcceptEmail({ token }, store("PE@northstar.example"))).toBe(EMAIL);
    expect(await findAcceptEmail({ token }, store(null))).toBeNull();
    let lookups = 0;
    expect(await findAcceptEmail({ token: "short" }, {
      async findInvite() {
        lookups += 1;
        return null;
      },
    })).toBeNull();
    expect(lookups).toBe(0);
  });
});
