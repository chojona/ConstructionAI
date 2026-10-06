import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentSessionViewer } = vi.hoisted(() => ({
  currentSessionViewer: vi.fn(),
}));

vi.mock("@/lib/auth/sessionViewer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/sessionViewer")>();
  return { ...actual, currentSessionViewer };
});

import NotFound from "@/app/not-found";

function hrefs(html: string) {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

describe("not found page", () => {
  beforeEach(() => {
    currentSessionViewer.mockReset();
  });

  it("sends a signed-out visitor to sign-in", async () => {
    currentSessionViewer.mockResolvedValue(null);
    const html = renderToStaticMarkup(await NotFound());
    expect(hrefs(html)).toEqual(["/login"]);
    expect(html).toContain(">Sign in<");
    expect(html).not.toContain("/projects");
  });

  it("returns a signed-in member to projects", async () => {
    currentSessionViewer.mockResolvedValue({ label: "Alex Chen" });
    const html = renderToStaticMarkup(await NotFound());
    expect(hrefs(html)).toEqual(["/projects"]);
    expect(html).toContain(">Return to projects<");
    expect(html).not.toContain(">Sign in<");
  });
});
