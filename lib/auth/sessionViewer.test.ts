import { describe, expect, it, vi } from "vitest";
import { hashToken, SESSION_COOKIE } from "./sessionToken";
import { readSessionViewer, type SessionUserLookup } from "./sessionViewer";

function request(cookie?: string, headers: Record<string, string> = {}) {
  return {
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    cookies: {
      get: (name: string) => (cookie && name === SESSION_COOKIE ? { value: cookie } : undefined),
    },
  };
}

function users(row: { name: string | null; email: string } | null): SessionUserLookup {
  return { findUserIdentity: async () => row };
}

describe("readSessionViewer", () => {
  it("ignores x-user-id when there is no construction_session", async () => {
    const findValidSession = vi.fn(async () => ({ userId: "user_a" }));
    const viewer = await readSessionViewer(
      request(undefined, { "x-user-id": "user_a" }),
      { findValidSession },
      users({ name: "Alex Chen", email: "alex.chen@northstar.example" }),
    );
    expect(viewer).toBeNull();
    expect(findValidSession).not.toHaveBeenCalled();
  });

  it("returns null for a missing or unknown session", async () => {
    const sessions = { findValidSession: async () => null };
    const identity = users({ name: "Alex Chen", email: "alex.chen@northstar.example" });
    await expect(readSessionViewer(request(), sessions, identity)).resolves.toBeNull();
    await expect(readSessionViewer(request("   "), sessions, identity)).resolves.toBeNull();
    await expect(readSessionViewer(request("stale-token"), sessions, identity)).resolves.toBeNull();
  });

  it("uses the member name, then the email", async () => {
    const token = "session-token";
    const sessions = {
      async findValidSession(tokenHash: string) {
        return tokenHash === hashToken(token) ? { userId: "user_a" } : null;
      },
    };
    await expect(readSessionViewer(
      request(token, { "x-user-id": "someone-else" }),
      sessions,
      users({ name: "Alex Chen", email: "alex.chen@northstar.example" }),
    )).resolves.toEqual({ label: "Alex Chen" });
    await expect(readSessionViewer(
      request(token),
      sessions,
      users({ name: "  ", email: "alex.chen@northstar.example" }),
    )).resolves.toEqual({ label: "alex.chen@northstar.example" });
    await expect(readSessionViewer(
      request(token),
      sessions,
      users({ name: null, email: "alex.chen@northstar.example" }),
    )).resolves.toEqual({ label: "alex.chen@northstar.example" });
  });
});
