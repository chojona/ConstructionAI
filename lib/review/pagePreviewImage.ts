import { renderPageAsImage } from "unpdf";
import { DomainError } from "@/lib/domain/errors";
import { PAGE_PREVIEW_UNAVAILABLE_MESSAGE } from "./pagePreviewCopy";

const PAGE_PREVIEW_WIDTH = 640;

/** Renders one PDF page to a PNG. The image is not stored. */
export async function renderRevisionPageImage(bytes: Buffer, pageNumber: number) {
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const image = await renderPageAsImage(copy, pageNumber, {
      canvasImport: () => import("@napi-rs/canvas"),
      width: PAGE_PREVIEW_WIDTH,
    });
    return Buffer.from(image);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (isMissingCanvas(error)) throw error;
    throw new DomainError("PAGE_PREVIEW_UNAVAILABLE", PAGE_PREVIEW_UNAVAILABLE_MESSAGE, 404);
  }
}

function isMissingCanvas(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Cannot find module") || message.includes("canvasImport");
}
