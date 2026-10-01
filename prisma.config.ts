import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrateUrl = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: migrateUrl ? { url: migrateUrl } : undefined,
});
