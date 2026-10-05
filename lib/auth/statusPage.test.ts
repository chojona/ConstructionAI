import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Forbidden from "@/app/forbidden";
import Unauthorized from "@/app/unauthorized";

function hrefs(html: string) {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

describe("access status pages", () => {
  it("sends unsigned and denied callers to sign-in", () => {
    for (const page of [Unauthorized, Forbidden]) {
      const html = renderToStaticMarkup(createElement(page));
      expect(hrefs(html)).toEqual(["/login"]);
      expect(html).toContain(">Sign in<");
    }
  });
});
