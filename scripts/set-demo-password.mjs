import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

const password = process.env.DEMO_USER_PASSWORD?.trim() ?? "";
if (!password) {
  console.log("demo-password: skipped");
  process.exit(0);
}
if (password.length < 10) {
  console.error("demo-password: DEMO_USER_PASSWORD must be at least 10 characters");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("demo-password: DATABASE_URL missing");
  process.exit(1);
}

const salt = randomBytes(16);
const derived = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const passwordHash = `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
const orgId = process.env.APP_ORGANIZATION_ID?.trim() || "org_demo";
const email = "alex.chen@northstar.example";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO "Organization" (id, name, "createdAt", "updatedAt")
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [orgId, orgId === "org_demo" ? "Northstar Construction" : "Organization"],
  );
  const updated = await client.query(
    `UPDATE "User" SET "passwordHash" = $1, "updatedAt" = NOW() WHERE email = $2 RETURNING id`,
    [passwordHash, email],
  );
  const userId = updated.rows[0]?.id ?? (await client.query(
    `INSERT INTO "User" (id, email, name, "passwordHash", "createdAt", "updatedAt")
     VALUES ('user_demo', $1, 'Alex Chen', $2, NOW(), NOW())
     RETURNING id`,
    [email, passwordHash],
  )).rows[0].id;
  await client.query(
    `INSERT INTO "OrgMembership" (id, "organizationId", "userId", role, status, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'ORG_ADMIN', 'ACTIVE', NOW(), NOW())
     ON CONFLICT ("organizationId", "userId") DO NOTHING`,
    [`membership_${userId}`, orgId, userId],
  );
  await client.query("COMMIT");
  console.log("demo-password: updated");
} catch (error) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The connection may already be closed.
  }
  console.error("demo-password: failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end();
}
