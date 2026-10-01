import { describe, expect, it } from "vitest";
import { postgresConnectionConfig } from "./db";

describe("postgres connection config", () => {
  it("keeps certificate verification without the sslmode alias warning", () => {
    const config = postgresConnectionConfig("postgresql://construction:construction@localhost:5432/construction_ai?sslmode=require&schema=public");
    const url = new URL(config.connectionString);
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(url.searchParams.get("schema")).toBeNull();
    expect(config.schema).toBe("public");
  });
});