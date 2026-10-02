import { describe, expect, it } from "vitest";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { PAGE_PREVIEW_UNAVAILABLE_MESSAGE } from "./pagePreviewCopy";
import { renderRevisionPageImage } from "./pagePreviewImage";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("revision page image", () => {
  it("renders the requested page and does not invent a page that is missing", async () => {
    const pdf = buildTextPdf(["Cover", "Catch basin detail"]);
    const png = await renderRevisionPageImage(pdf, 2);
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    await expect(renderRevisionPageImage(pdf, 9)).rejects.toMatchObject({
      code: "PAGE_PREVIEW_UNAVAILABLE",
      message: PAGE_PREVIEW_UNAVAILABLE_MESSAGE,
    });
  });
});
