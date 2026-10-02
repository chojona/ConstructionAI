import { NextRequest, NextResponse } from "next/server";
import { constructionRepository } from "@/lib/domain/prismaRepository";
import { errorResponse } from "@/lib/http";
import { previewRevisionPage } from "@/lib/review/pagePreview";
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
    const png = await previewRevisionPage({
      organizationId: requestOrganizationId(request),
      projectId,
      revisionId,
      pageNumber: Number(pageNumber),
      repository: constructionRepository,
      objects: requireObjectStore(),
    });
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
