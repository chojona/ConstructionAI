import { NextRequest, NextResponse } from "next/server";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import { errorResponse } from "@/lib/http";
import { openPagePreview } from "@/lib/review/pagePreview";
import { renderRevisionPageImage } from "@/lib/review/pagePreviewImage";
import { requireObjectStore } from "@/lib/storage/objectStore";
import { requestOrganizationId } from "@/lib/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; revisionId: string; pageNumber: string }> },
) {
  try {
    const { projectId, revisionId, pageNumber } = await context.params;
    const preview = await openPagePreview({
      organizationId: requestOrganizationId(request),
      projectId,
      revisionId,
      pageNumber: Number(pageNumber),
      repository: constructionRepository,
      objects: requireObjectStore(),
      transport: "stream",
    });
    if (preview.kind !== "stream") {
      throw new Error("Page preview stream was not opened.");
    }
    const png = await renderRevisionPageImage(preview.bytes, preview.pageNumber);
    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
