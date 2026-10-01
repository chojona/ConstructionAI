import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeavyJobSourceBrowser } from "@/components/heavyjob/source-object-browser";
import { parseProjectView, ProjectNavigation } from "@/components/workspace/project-navigation";
import type { HeavyJobSourceObjectDto } from "./dto";
import { HEAVYJOB_DEMO_PROJECT_ID, HEAVYJOB_FIXTURE_FETCHED_AT, HEAVYJOB_OBJECT_TYPES, heavyJobFixtures } from "./fixtures";

const BANNED_COPY = /\b(dsc|force-account|force account|entitlement|unpaid|candidate|detection|change orders?)\b/i;

function fixtureObjects(): HeavyJobSourceObjectDto[] {
  return heavyJobFixtures.map((fixture, index) => ({
    id: `heavyjob_${index}`,
    projectId: HEAVYJOB_DEMO_PROJECT_ID,
    objectType: fixture.objectType,
    sourceId: fixture.sourceId,
    fetchedAt: fixture.fetchedAt,
    raw: fixture.raw as HeavyJobSourceObjectDto["raw"],
    createdAt: fixture.fetchedAt,
  }));
}

function renderBrowser(objects: readonly HeavyJobSourceObjectDto[]) {
  return renderToStaticMarkup(createElement(HeavyJobSourceBrowser, { objects }));
}

describe("HeavyJob source object browser", () => {
  it("lists fixture rows by object type with sourceId, fetchedAt, and a collapsed raw peek", () => {
    const objects = fixtureObjects();
    const html = renderBrowser(objects);
    const withoutRaw = html.replace(/<pre>[\s\S]*?<\/pre>/g, "");

    expect(html).toContain("Source objects");
    expect(html).toContain("<th scope=\"col\">type</th>");
    expect(html).toContain("<th scope=\"col\">sourceId</th>");
    expect(html).toContain("<th scope=\"col\">fetchedAt</th>");
    expect(html).toContain("<th scope=\"col\">raw</th>");
    let previous = -1;
    for (const objectType of HEAVYJOB_OBJECT_TYPES) {
      const index = html.indexOf(`data-object-type="${objectType}"`);
      expect(index).toBeGreaterThan(previous);
      previous = index;
      expect(html).toContain(`>${objectType}<`);
    }
    for (const object of objects) {
      expect(html).toContain(object.sourceId);
      expect(html).toContain(object.fetchedAt);
    }
    expect(html).toContain(HEAVYJOB_FIXTURE_FETCHED_AT);
    const details = html.match(/<details\b[^>]*>/g) ?? [];
    expect(details).toHaveLength(objects.length);
    expect(details.every((tag) => !/\sopen(?:=|\s|>)/.test(tag))).toBe(true);
    expect(html).toContain(">Expand<");
    expect(html).toContain("&quot;isTm&quot;: true");
    expect(html).toContain("&quot;isRework&quot;: true");
    expect(withoutRaw).not.toMatch(/\bisTm\b|\bisRework\b/);
    expect(html).not.toMatch(BANNED_COPY);
    expect(html).not.toMatch(/<button|<form|<input|<textarea/i);
  });

  it("shows an empty state without inventing rows", () => {
    const html = renderBrowser([]);
    expect(html).toContain("No source objects");
    expect(html).not.toContain("data-object-type");
    expect(html).not.toContain("<details");
    expect(html).not.toMatch(BANNED_COPY);
  });

  it("keeps HeavyJob as a project tab beside Changes and Documents", () => {
    expect(parseProjectView(undefined)).toBe("overview");
    expect(parseProjectView("changes")).toBe("changes");
    expect(parseProjectView("documents")).toBe("documents");
    expect(parseProjectView("heavyjob")).toBe("heavyjob");
    expect(parseProjectView("entitlement")).toBe("overview");

    const html = renderToStaticMarkup(createElement(ProjectNavigation, {
      projectId: HEAVYJOB_DEMO_PROJECT_ID,
      active: "heavyjob",
      openCount: 2,
    }));
    expect(html).toContain("Overview");
    expect(html).toContain("Changes");
    expect(html).toContain("Documents");
    expect(html).toContain("HeavyJob");
    expect(html).toMatch(new RegExp(`href="/projects/${HEAVYJOB_DEMO_PROJECT_ID}\\?view=heavyjob"[^>]*aria-current="page"|aria-current="page"[^>]*href="/projects/${HEAVYJOB_DEMO_PROJECT_ID}\\?view=heavyjob"`));
    expect(html).toContain(`href="/projects/${HEAVYJOB_DEMO_PROJECT_ID}?view=heavyjob"`);
    expect(html).toContain(`href="/projects/${HEAVYJOB_DEMO_PROJECT_ID}?view=changes"`);
    expect(html).toContain(`href="/projects/${HEAVYJOB_DEMO_PROJECT_ID}?view=documents"`);
    expect(html).toContain('aria-current="page"');
    expect(html).not.toMatch(/change order/i);
    expect(html).not.toMatch(BANNED_COPY);
  });
});
