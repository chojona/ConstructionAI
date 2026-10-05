import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hash", () => {
  it("verifies the password that was hashed and rejects a different one", async () => {
    const stored = await hashPassword("northstar-bridge-1");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("northstar-bridge-1", stored)).toBe(true);
    expect(await verifyPassword("northstar-bridge-2", stored)).toBe(false);
    expect(await verifyPassword("northstar-bridge-1", "not-a-hash")).toBe(false);
  });
});
