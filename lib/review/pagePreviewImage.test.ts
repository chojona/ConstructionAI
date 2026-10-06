import { readFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { buildTextPdf } from "@/lib/documents/minimalPdf";
import { PAGE_PREVIEW_TEXT_UNAVAILABLE_MESSAGE, PAGE_PREVIEW_UNAVAILABLE_MESSAGE } from "./pagePreviewCopy";
import { rejectUnpaintedTextPreview, renderRevisionPageImage } from "./pagePreviewImage";
import { buildUnembeddedStandardFontPdf } from "./unembeddedStandardFontPdf";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FIXTURE = readFileSync(new URL("./fixtures/unembedded-standard-fonts.pdf", import.meta.url));

describe("revision page image", () => {
  it("renders the requested page and does not invent a page that is missing", async () => {
    const pdf = buildTextPdf(["Cover", "Catch basin detail"]);
    const png = await renderRevisionPageImage(pdf, 2);
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(await previewInk(png)).toBeGreaterThan(24);
    await expect(renderRevisionPageImage(pdf, 9)).rejects.toMatchObject({
      code: "PAGE_PREVIEW_UNAVAILABLE",
      message: PAGE_PREVIEW_UNAVAILABLE_MESSAGE,
    });
  });

  it("returns a white page when the page has no extractable text", async () => {
    const png = await renderRevisionPageImage(buildTextPdf(["   "]), 1);
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(await previewInk(png)).toBe(0);
  });
});

describe("unembedded standard fonts", () => {
  it("renders Helvetica and Times ink from a PDF with no FontFile", async () => {
    expect(FIXTURE.equals(buildUnembeddedStandardFontPdf())).toBe(true);
    const source = FIXTURE.toString("latin1");
    expect(source).toContain("/BaseFont /Helvetica");
    expect(source).toContain("/BaseFont /Times-Roman");
    expect(source).toContain("Tj");
    expect(source).not.toContain("/FontFile");

    const png = await renderRevisionPageImage(FIXTURE, 1);
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(await previewInk(png)).toBeGreaterThan(200);
  });

  it("returns the explicit text failure instead of a white PNG", async () => {
    const white = whitePng();
    await expect(rejectUnpaintedTextPreview(white, "Catch basin 16 EA")).rejects.toMatchObject({
      code: "PAGE_PREVIEW_TEXT_UNAVAILABLE",
      message: PAGE_PREVIEW_TEXT_UNAVAILABLE_MESSAGE,
    });
    await expect(rejectUnpaintedTextPreview(white, "Catch basin 16 EA")).rejects.not.toBe(white);
  });
});

function whitePng() {
  const canvas = createCanvas(640, 828);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 640, 828);
  return canvas.toBuffer("image/png");
}

async function previewInk(png: Buffer) {
  const { loadImage, createCanvas: makeCanvas } = await import("@napi-rs/canvas");
  const img = await loadImage(png);
  const canvas = makeCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  let dark = 0;
  for (let index = 0; index < data.length; index += 4) {
    if ((data[index] ?? 255) < 250 || (data[index + 1] ?? 255) < 250 || (data[index + 2] ?? 255) < 250) dark += 1;
  }
  return dark;
}
