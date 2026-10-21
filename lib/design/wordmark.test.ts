import { readFileSync } from "node:fs";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects",
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));

import { AppShell } from "@/components/workspace/app-shell";

const uiSources = [
  "components/workspace/app-shell.tsx",
  "app/layout.tsx",
] as const;

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("ConstructionAI wordmark", () => {
  it("renders ConstructionAI in the app shell brand", () => {
    // React 19 types require `children` on this component's props, while
    // `react/no-children-prop` requires the createElement children argument.
    const Shell = AppShell as (props: {
      projects: [];
      viewer: { label: string } | null;
      canManagePeople: boolean;
      children?: ReactNode;
    }) => ReactElement;
    const html = renderToStaticMarkup(createElement(
      Shell,
      { projects: [], viewer: { label: "Alex Chen" }, canManagePeople: false },
      createElement("main", null, "Workspace"),
    ));
    expect(html).toContain('aria-label="ConstructionAI"');
    expect(html).toContain("ConstructionAI<small>Project intelligence</small>");
    expect(html).not.toContain("Construction AI");
  });

  it("keeps Construction AI out of the UI sources that render the brand", () => {
    for (const path of uiSources) {
      expect(source(path), path).not.toContain("Construction AI");
      expect(source(path), path).toContain("ConstructionAI");
    }
    const layout = source("app/layout.tsx");
    expect(layout).toContain('default: "ConstructionAI"');
    expect(layout).toContain('template: "%s · ConstructionAI"');
  });
});
