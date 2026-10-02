import { NextRequest, NextResponse } from "next/server";
import { toRevisionUploadDto } from "@/lib/documents/dto";
import { authorizeRequest } from "@/lib/auth/membership";
import { publishRevision } from "@/lib/documents/publishRevision";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await context.params;
    const access = await authorizeRequest(request, "upload");
    const form = await request.formData();
    const file = form.get("file");
    const revisionLabel = form.get("revisionLabel");
    if (!(file instanceof File) || typeof revisionLabel !== "string") {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "A PDF and revision label are required." } },
        { status: 400 },
      );
    }
    const revision = await publishRevision(access.organizationId, documentId, {
      revisionLabel,
      originalFilename: file.name,
      mimeType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return NextResponse.json({ revision: toRevisionUploadDto(revision) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
