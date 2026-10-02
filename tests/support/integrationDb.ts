import type { PrismaClient } from "@prisma/client";
import { createPrismaClient } from "@/lib/db";

export const hasIntegrationDatabase = Boolean(process.env.DATABASE_URL);

/** Use with describe.skipIf(!hasIntegrationDatabase); describe bodies still run during collection. */
export function integrationDb(): PrismaClient {
  return process.env.DATABASE_URL ? createPrismaClient() : (undefined as unknown as PrismaClient);
}
