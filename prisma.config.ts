import "dotenv/config";
import { defineConfig } from "prisma/config";
import { prismaCliDatasourceUrl } from "./lib/deploy/prismaCliDatasourceUrl";

const datasourceUrl = prismaCliDatasourceUrl(
  {
    DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
    DATABASE_URL: process.env.DATABASE_URL,
  },
  process.argv,
);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: datasourceUrl ? { url: datasourceUrl } : undefined,
});
