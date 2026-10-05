import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 10;

const KEY_LEN = 32;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, SCRYPT, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

let dummyHash: Promise<string> | null = null;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** Compare a password with a stored scrypt hash. A malformed hash never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltText, hashText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !hashText || stored.split("$").length !== 3) return false;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(hashText, "base64url");
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = await scrypt(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** Spend the same scrypt work when the email is unknown. */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("not-a-user-password");
  return dummyHash;
}
