import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DomainError } from "@/lib/domain/errors";
import { SESSION_COOKIE } from "@/lib/auth/sessionToken";
import {
  LOGIN_EMAIL_FAILURE_LIMIT,
  LOGIN_RATE_LIMIT_MESSAGE,
  MemoryLoginAttemptStore,
  resetLoginAttemptStore,
  setLoginAttemptStore,
} from "@/lib/auth/loginRateLimit";

const { loginWithPassword, acceptInvitation, findAcceptEmail } = vi.hoisted(() => ({
  loginWithPassword: vi.fn(),
  acceptInvitation: vi.fn(),
  findAcceptEmail: vi.fn(),
}));

vi.mock("@/lib/auth/login", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/login")>();
  return { ...actual, loginWithPassword, acceptInvitation, findAcceptEmail };
});

import { POST as acceptPost } from "@/app/api/auth/accept/route";
import { POST as loginPost } from "@/app/api/auth/login/route";

const KNOWN = "pe@northstar.example";
const UNKNOWN = "missing@northstar.example";
const IP = "203.0.113.10";
const WRONG = "wrong-password-1";
const RIGHT = "correct-horse-1";
const TOKEN = "invite-token-value-ok";

const invalidLogin = new DomainError("UNAUTHENTICATED", "Email or password is incorrect.", 401);
const invalidInvite = new DomainError("INVALID_INPUT", "This invitation link is not valid.", 400);

function signedIn(email: string) {
  return {
    userId: "user_1",
    email,
    name: "Pat Lee",
    organizationId: "org_a",
    token: "session-token",
  };
}

function loginRequest(email: string, password: string, ip = IP) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-vercel-forwarded-for": ip },
    body: JSON.stringify({ email, password }),
  });
}

function acceptRequest(ip = IP, body: Record<string, string> = { token: TOKEN, password: RIGHT }) {
  return new NextRequest("http://localhost/api/auth/accept", {
    method: "POST",
    headers: { "content-type": "application/json", "x-vercel-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("auth route lockout", () => {
  let attempts: MemoryLoginAttemptStore;

  beforeEach(() => {
    attempts = new MemoryLoginAttemptStore();
    setLoginAttemptStore(attempts);
    loginWithPassword.mockReset();
    acceptInvitation.mockReset();
    findAcceptEmail.mockReset();
    findAcceptEmail.mockResolvedValue(null);
  });

  afterEach(() => {
    resetLoginAttemptStore();
  });

  async function failLogins(email: string, times: number, ip = IP) {
    loginWithPassword.mockRejectedValue(invalidLogin);
    const statuses: number[] = [];
    for (let i = 0; i < times; i++) {
      const response = await loginPost(loginRequest(email, WRONG, ip));
      statuses.push(response.status);
    }
    return statuses;
  }

  it("fails normally under the limit and locks with one body for known and unknown emails", async () => {
    expect(await failLogins(KNOWN, LOGIN_EMAIL_FAILURE_LIMIT)).toEqual(Array(LOGIN_EMAIL_FAILURE_LIMIT).fill(401));
    expect(await failLogins(UNKNOWN, LOGIN_EMAIL_FAILURE_LIMIT)).toEqual(Array(LOGIN_EMAIL_FAILURE_LIMIT).fill(401));
    const calls = loginWithPassword.mock.calls.length;

    const known = await loginPost(loginRequest(KNOWN, RIGHT));
    const unknown = await loginPost(loginRequest(UNKNOWN, WRONG, "203.0.113.99"));
    expect(known.status).toBe(429);
    expect(unknown.status).toBe(429);
    expect(known.cookies.get(SESSION_COOKIE)).toBeUndefined();
    const knownBody = await known.json();
    const unknownBody = await unknown.json();
    expect(knownBody).toEqual(unknownBody);
    expect(knownBody).toEqual({
      error: { code: "RATE_LIMITED", message: LOGIN_RATE_LIMIT_MESSAGE },
    });
    expect(JSON.stringify(knownBody)).not.toContain("northstar");
    expect(loginWithPassword).toHaveBeenCalledTimes(calls);

    const under = await loginPost(loginRequest("other@northstar.example", WRONG));
    expect(under.status).toBe(401);
    expect(await under.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Email or password is incorrect." },
    });
  });

  it("treats email case as the same counter", async () => {
    expect(await failLogins("PE@northstar.example", LOGIN_EMAIL_FAILURE_LIMIT)).toEqual(
      Array(LOGIN_EMAIL_FAILURE_LIMIT).fill(401),
    );
    const blocked = await loginPost(loginRequest(KNOWN, RIGHT));
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: { code: "RATE_LIMITED", message: LOGIN_RATE_LIMIT_MESSAGE },
    });
  });

  it("clears the email counter after a successful login", async () => {
    expect(await failLogins(KNOWN, LOGIN_EMAIL_FAILURE_LIMIT - 1)).toEqual(
      Array(LOGIN_EMAIL_FAILURE_LIMIT - 1).fill(401),
    );
    loginWithPassword.mockResolvedValue(signedIn(KNOWN));
    const signed = await loginPost(loginRequest(KNOWN, RIGHT));
    expect(signed.status).toBe(200);
    expect(await signed.json()).toEqual({
      user: { id: "user_1", email: KNOWN, name: "Pat Lee", organizationId: "org_a" },
    });
    expect(signed.cookies.get(SESSION_COOKIE)?.value).toBe("session-token");
    expect(attempts.rows).toHaveLength(0);

    expect(await failLogins(KNOWN, LOGIN_EMAIL_FAILURE_LIMIT)).toEqual(Array(LOGIN_EMAIL_FAILURE_LIMIT).fill(401));
    const blocked = await loginPost(loginRequest(KNOWN, RIGHT));
    expect(blocked.status).toBe(429);
  });

  it("locks invite accept on the same email counter and clears it after accept succeeds", async () => {
    findAcceptEmail.mockResolvedValue(KNOWN);
    expect(await failLogins(KNOWN, LOGIN_EMAIL_FAILURE_LIMIT)).toEqual(Array(LOGIN_EMAIL_FAILURE_LIMIT).fill(401));
    const blocked = await acceptPost(acceptRequest());
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({
      error: { code: "RATE_LIMITED", message: LOGIN_RATE_LIMIT_MESSAGE },
    });
    expect(acceptInvitation).not.toHaveBeenCalled();

    attempts.rows = [];
    acceptInvitation.mockRejectedValue(invalidInvite);
    const failed = await acceptPost(acceptRequest());
    expect(failed.status).toBe(400);
    expect(await failed.json()).toEqual({
      error: { code: "INVALID_INPUT", message: "This invitation link is not valid." },
    });
    expect(attempts.rows).toHaveLength(1);

    for (let i = 1; i < LOGIN_EMAIL_FAILURE_LIMIT; i++) {
      const response = await acceptPost(acceptRequest());
      expect(response.status).toBe(400);
    }
    const locked = await acceptPost(acceptRequest());
    expect(locked.status).toBe(429);
    expect(acceptInvitation).toHaveBeenCalledTimes(LOGIN_EMAIL_FAILURE_LIMIT);

    attempts.rows = attempts.rows.slice(0, LOGIN_EMAIL_FAILURE_LIMIT - 1);
    acceptInvitation.mockResolvedValue(signedIn(KNOWN));
    const accepted = await acceptPost(acceptRequest());
    expect(accepted.status).toBe(200);
    expect(attempts.rows).toHaveLength(0);
    expect(await failLogins(KNOWN, 1)).toEqual([401]);
  });

  it("rejects a short password before counting it, and ignores server errors", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const invalid = await loginPost(loginRequest(KNOWN, "short"));
      expect(invalid.status).toBe(400);
      expect(loginWithPassword).not.toHaveBeenCalled();
      expect(attempts.rows).toHaveLength(0);

      const invite = await acceptPost(acceptRequest(IP, { token: "short", password: RIGHT }));
      expect(invite.status).toBe(400);
      expect(findAcceptEmail).not.toHaveBeenCalled();
      expect(acceptInvitation).not.toHaveBeenCalled();

      loginWithPassword.mockRejectedValue(new Error("db down"));
      const crashed = await loginPost(loginRequest(KNOWN, WRONG));
      expect(crashed.status).toBe(500);
      expect(attempts.rows).toHaveLength(0);
    } finally {
      logged.mockRestore();
    }
  });
});
