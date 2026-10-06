import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));

import { SidebarFooter } from "@/components/workspace/app-shell";

function hrefs(html: string) {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

function accountRows(html: string) {
  const list = html.match(/<ul class="sidebar-account">([\s\S]*?)<\/ul>/);
  if (!list) throw new Error("missing account list");
  return [...list[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]);
}

describe("sidebar footer", () => {
  it("shows only Sign in when there is no session", () => {
    const html = renderToStaticMarkup(createElement(SidebarFooter, { viewer: null }));
    const rows = accountRows(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain(">Sign in<");
    expect(hrefs(html)).toEqual(["/login"]);
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("/api/auth/logout");
    expect(html).not.toContain("People");
  });

  it("shows the member name and Sign out when a session is present", () => {
    const html = renderToStaticMarkup(createElement(SidebarFooter, { viewer: { label: "Alex Chen" } }));
    const rows = accountRows(html);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Alex Chen");
    expect(rows.at(-1)).toContain(">Sign out<");
    expect(rows.at(-1)).toContain('action="/api/auth/logout"');
    expect(rows.at(-1)).toContain('method="post"');
    expect(html).not.toContain("Sign in");
    expect(html).not.toContain("People");
    expect(hrefs(html)).toEqual([]);
  });

  it("shows the email when that is the member label", () => {
    const html = renderToStaticMarkup(createElement(SidebarFooter, { viewer: { label: "alex.chen@northstar.example" } }));
    expect(html).toContain("alex.chen@northstar.example");
    expect(html).toContain(">Sign out<");
    expect(html).not.toContain(">Sign in<");
  });
});
