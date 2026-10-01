import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function postgresConnectionConfig(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get("schema") ?? undefined;
  url.searchParams.delete("schema");
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode === "prefer" || sslmode === "require" || sslmode === "verify-ca") {
    url.searchParams.set("sslmode", "verify-full");
  }
  return { connectionString: url.toString(), schema };
}

export function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const { connectionString, schema } = postgresConnectionConfig(databaseUrl);
  const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);
  return new PrismaClient({ adapter });
}

function sharedPrisma() {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = sharedPrisma();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
