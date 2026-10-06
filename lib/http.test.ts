import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { errorResponse, readJsonBody } from "./http";

describe("errorResponse", () => {
  it("maps a request-body JSON failure to 400 and leaves other SyntaxErrors as 500", async () => {
    const request = new NextRequest("http://localhost/api/org/memberships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    await expect(readJsonBody(request)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "The request body is not valid JSON.",
      httpStatus: 400,
    });

    const bodyError = await readJsonBody(new NextRequest("http://localhost/api/org/memberships", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    })).catch((error: unknown) => error);
    const client = errorResponse(bodyError);
    expect(client.status).toBe(400);
    await expect(client.json()).resolves.toMatchObject({
      error: { code: "INVALID_INPUT", message: "The request body is not valid JSON." },
    });

    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let serverBug: unknown;
      try {
        JSON.parse("{");
      } catch (error) {
        serverBug = error;
      }
      expect(serverBug).toBeInstanceOf(SyntaxError);
      const server = errorResponse(serverBug);
      expect(server.status).toBe(500);
      await expect(server.json()).resolves.toMatchObject({ error: { code: "INTERNAL_ERROR" } });
    } finally {
      logged.mockRestore();
    }
  });
});
