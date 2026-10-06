import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError, isDomainError } from "@/lib/domain/errors";

/** Failed attempts remembered for one email address. */
export const LOGIN_EMAIL_FAILURE_LIMIT = 10;

/** Failed attempts remembered for one client address, across emails. */
export const LOGIN_IP_FAILURE_LIMIT = 30;

export const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export const LOGIN_RATE_LIMIT_MESSAGE = "Too many attempts. Try again later.";

const UNKNOWN_IP = "unknown";
const IP_HEADERS = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"] as const;

export interface LoginAttemptRow {
  email: string;
  ip: string;
  createdAt: Date;
}

export interface LoginAttemptStore {
  countEmail(email: string, since: Date): Promise<number>;
  countIp(ip: string, since: Date): Promise<number>;
  record(row: LoginAttemptRow): Promise<void>;
  clearEmail(email: string): Promise<void>;
  prune(before: Date): Promise<void>;
}

export class MemoryLoginAttemptStore implements LoginAttemptStore {
  rows: LoginAttemptRow[] = [];

  async countEmail(email: string, since: Date) {
    return this.rows.filter((row) => row.email === email && row.createdAt.getTime() > since.getTime()).length;
  }

  async countIp(ip: string, since: Date) {
    return this.rows.filter((row) => row.ip === ip && row.createdAt.getTime() > since.getTime()).length;
  }

  async record(row: LoginAttemptRow) {
    this.rows.push(row);
  }

  async clearEmail(email: string) {
    if (!email) return;
    this.rows = this.rows.filter((row) => row.email !== email);
  }

  async prune(before: Date) {
    const cutoff = before.getTime();
    this.rows = this.rows.filter((row) => row.createdAt.getTime() >= cutoff);
  }
}

export class PrismaLoginAttemptStore implements LoginAttemptStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  countEmail(email: string, since: Date) {
    return this.db.loginAttempt.count({ where: { email, createdAt: { gt: since } } });
  }

  countIp(ip: string, since: Date) {
    return this.db.loginAttempt.count({ where: { ip, createdAt: { gt: since } } });
  }

  async record(row: LoginAttemptRow) {
    await this.db.loginAttempt.create({ data: row });
  }

  async clearEmail(email: string) {
    if (!email) return;
    await this.db.loginAttempt.deleteMany({ where: { email } });
  }

  async prune(before: Date) {
    await this.db.loginAttempt.deleteMany({ where: { createdAt: { lt: before } } });
  }
}

let attemptStore: LoginAttemptStore = new PrismaLoginAttemptStore();

export function setLoginAttemptStore(store: LoginAttemptStore) {
  attemptStore = store;
}

export function resetLoginAttemptStore() {
  attemptStore = new PrismaLoginAttemptStore();
}

export function normalizeAttemptEmail(email: string): string {
  return email.trim().toLowerCase();
}

function firstAddress(header: string | null): string | null {
  if (!header) return null;
  const hop = header.split(",")[0]?.trim() ?? "";
  if (!hop || hop.length > 64 || !/^[0-9a-f:.]+$/i.test(hop)) return null;
  return hop.toLowerCase();
}

/**
 * Client address for the IP cap.
 * Prefer the platform header. A missing or malformed address shares one bucket
 * so omitting the header cannot mint a fresh limit.
 */
export function clientIp(request: { headers: { get(name: string): string | null } }): string {
  for (const name of IP_HEADERS) {
    const hop = firstAddress(request.headers.get(name));
    if (hop) return hop;
  }
  return UNKNOWN_IP;
}

export function loginRateLimitError(): DomainError {
  return new DomainError("RATE_LIMITED", LOGIN_RATE_LIMIT_MESSAGE, 429);
}

/** Wrong email or password. Membership refusals after a correct password do not count. */
export function isLoginCredentialFailure(error: unknown): boolean {
  return isDomainError(error) && error.httpStatus === 401;
}

/** Invalid, expired, spent, or disabled invitations. Validation errors are not DomainErrors. */
export function isAcceptAttemptFailure(error: unknown): boolean {
  return isDomainError(error) && (error.httpStatus === 400 || error.httpStatus === 403);
}

function windowStart(now: Date): Date {
  return new Date(now.getTime() - LOGIN_ATTEMPT_WINDOW_MS);
}

async function assertIpAllowed(ip: string, since: Date) {
  const ipCount = await attemptStore.countIp(ip, since);
  if (ipCount >= LOGIN_IP_FAILURE_LIMIT) throw loginRateLimitError();
}

async function assertEmailAllowed(email: string, since: Date) {
  if (!email) return;
  const emailCount = await attemptStore.countEmail(email, since);
  if (emailCount >= LOGIN_EMAIL_FAILURE_LIMIT) throw loginRateLimitError();
}

async function clearAttemptEmail(email: string) {
  const normalized = normalizeAttemptEmail(email);
  if (!normalized) return;
  await attemptStore.clearEmail(normalized);
}

export async function runLimitedAuthAttempt<T>(input: {
  ip: string;
  email?: string;
  resolveEmail?: () => Promise<string | null>;
  countsFailure: (error: unknown) => boolean;
  run: () => Promise<T>;
  emailToClear?: (result: T) => string | null;
  now?: Date;
}): Promise<T> {
  const now = input.now ?? new Date();
  const since = windowStart(now);
  const ip = firstAddress(input.ip) ?? UNKNOWN_IP;
  await attemptStore.prune(since);
  await assertIpAllowed(ip, since);

  const resolved = input.email ?? (await input.resolveEmail?.()) ?? "";
  const email = normalizeAttemptEmail(resolved);
  await assertEmailAllowed(email, since);

  try {
    const result = await input.run();
    await clearAttemptEmail(email);
    if (input.emailToClear) await clearAttemptEmail(input.emailToClear(result) ?? "");
    return result;
  } catch (error) {
    if (input.countsFailure(error)) {
      await attemptStore.record({ email, ip, createdAt: now });
    }
    throw error;
  }
}
