import { describe, expect, it } from "vitest";
import { PRISMA_GENERATE_PLACEHOLDER_URL, prismaCliDatasourceUrl } from "./prismaCliDatasourceUrl";

describe("prisma CLI datasource URL", () => {
  it("uses the direct URL for migrate when DIRECT_DATABASE_URL is set", () => {
    expect(
      prismaCliDatasourceUrl(
        {
          DIRECT_DATABASE_URL: "postgresql://direct.example/prod",
          DATABASE_URL: "postgresql://pooled.example/prod",
        },
        ["node", "prisma", "migrate", "deploy"],
      ),
    ).toBe("postgresql://direct.example/prod");
  });

  it("falls back to DATABASE_URL when the direct URL is unset", () => {
    expect(
      prismaCliDatasourceUrl(
        { DATABASE_URL: "postgresql://pooled.example/prod" },
        ["node", "prisma", "migrate", "deploy"],
      ),
    ).toBe("postgresql://pooled.example/prod");
  });

  it("uses a placeholder only for generate when no URL is configured", () => {
    expect(prismaCliDatasourceUrl({}, ["node", "/path/prisma", "generate"])).toBe(
      PRISMA_GENERATE_PLACEHOLDER_URL,
    );
    expect(prismaCliDatasourceUrl({ DATABASE_URL: "  ", DIRECT_DATABASE_URL: "" }, ["generate"])).toBe(
      PRISMA_GENERATE_PLACEHOLDER_URL,
    );
    expect(prismaCliDatasourceUrl({}, ["node", "prisma", "migrate", "deploy"])).toBeUndefined();
    expect(
      prismaCliDatasourceUrl({ DATABASE_URL: "postgresql://pooled.example/prod" }, ["generate"]),
    ).toBe("postgresql://pooled.example/prod");
  });
});