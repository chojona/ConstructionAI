import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { getDocumentProxy, renderPageAsImage } from "unpdf";
import { DomainError } from "@/lib/domain/errors";
import { PAGE_PREVIEW_TEXT_UNAVAILABLE_MESSAGE, PAGE_PREVIEW_UNAVAILABLE_MESSAGE } from "./pagePreviewCopy";

const PAGE_PREVIEW_WIDTH = 640;
const INK_CHANNEL = 250;
/** Enough pixels to prove a short word painted, and low enough that a blank page fails. */
const MAX_REQUIRED_INK_PIXELS = 24;

const require = createRequire(import.meta.url);

/**
 * CON-109 page preview. Standard-14 font files (`standard_fonts/`) come from
 * the installed pdfjs-dist package. Fonts may track pdfjs-dist versions.
 * Rendering is pinned to whatever unpdf 1.8.1 bundles. Do not bump `unpdf`
 * or change the rendering path without re-running page-preview ink tests on
 * Node ≥22.13.
 * Node reads these with fs, so this is a directory path with a trailing
 * slash rather than a file URL. Vercel has no Helvetica or Times.
 */
function standardFontDataUrl() {
  const packageJson = require.resolve("pdfjs-dist/package.json");
  return path.join(path.dirname(packageJson), "standard_fonts") + path.sep;
}

function standardFontDocumentOptions() {
  return {
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    standardFontDataUrl: standardFontDataUrl(),
  };
}

/** Renders one PDF page to a PNG. The image is not stored. */
export async function renderRevisionPageImage(bytes: Buffer, pageNumber: number) {
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const pdf = await getDocumentProxy(copy, standardFontDocumentOptions());
    try {
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
        throw new DomainError("PAGE_PREVIEW_UNAVAILABLE", PAGE_PREVIEW_UNAVAILABLE_MESSAGE, 404);
      }
      const pageText = await textOnPage(pdf, pageNumber);
      const image = await renderPageAsImage(pdf, pageNumber, {
        canvasImport: () => import("@napi-rs/canvas"),
        width: PAGE_PREVIEW_WIDTH,
      });
      return await rejectUnpaintedTextPreview(Buffer.from(image), pageText);
    } finally {
      await pdf.cleanup().catch(() => undefined);
      await pdf.loadingTask?.destroy().catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (isMissingCanvas(error)) throw error;
    throw new DomainError("PAGE_PREVIEW_UNAVAILABLE", PAGE_PREVIEW_UNAVAILABLE_MESSAGE, 404);
  }
}

async function textOnPage(pdf: { getPage(pageNumber: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }> }, pageNumber: number) {
  const content = await (await pdf.getPage(pageNumber)).getTextContent();
  return content.items.map((item) => {
    if (!item || typeof item !== "object" || !("str" in item)) return "";
    return typeof item.str === "string" ? item.str : "";
  }).join("");
}

/** A page with extractable text must not be served as a near-white PNG. */
export async function rejectUnpaintedTextPreview(png: Buffer, pageText: string) {
  const characters = pageText.replace(/\s/g, "").length;
  if (characters === 0) return png;
  const dark = await darkPixelCount(png);
  if (dark < Math.min(characters, MAX_REQUIRED_INK_PIXELS)) {
    throw new DomainError("PAGE_PREVIEW_TEXT_UNAVAILABLE", PAGE_PREVIEW_TEXT_UNAVAILABLE_MESSAGE, 404);
  }
  return png;
}

async function darkPixelCount(png: Buffer) {
  const img = await loadImage(png);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  let dark = 0;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index] ?? 255;
    const green = data[index + 1] ?? 255;
    const blue = data[index + 2] ?? 255;
    if (red < INK_CHANNEL || green < INK_CHANNEL || blue < INK_CHANNEL) dark += 1;
  }
  return dark;
}

function isMissingCanvas(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Cannot find module") || message.includes("canvasImport");
}
