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

describe("sidebar footer", () => {
  it("shows only Sign in when there is no session", () => {
    const html = renderToStaticMarkup(createElement(SidebarFooter, { viewer: null }));
    expect(hrefs(html)).toEqual(["/login"]);
    expect(html).toContain(">Sign in<");
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("/api/auth/logout");
  });

  it("shows the member name and Sign out when a session is present", () => {
    const html = renderToStaticMarkup(createElement(SidebarFooter, { viewer: { label: "Alex Chen" } }));
    expect(html).toContain("Alex Chen");
    expect(html).toContain(">Sign out<");
    expect(html).toContain('action="/api/auth/logout"');
    expect(html).toContain('method="post"');
    expect(html).not.toContain("Sign in");
    expect(hrefs(html)).toEqual([]);
  });

  it("shows the email when that is the member label", () => {
    const html = renderToStaticMarkup(createElement(SidebarFooter, { viewer: { label: "alex.chen@northstar.example" } }));
    expect(html).toContain("alex.chen@northstar.example");
    expect(html).toContain(">Sign out<");
    expect(html).not.toContain(">Sign in<");
  });
});
