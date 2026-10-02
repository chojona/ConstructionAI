import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { authorizeRequest } from "@/lib/auth/membership";
import { attachAccPdfChapter } from "@/lib/review/accChapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const access = await authorizeRequest(request, "upload");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "A PDF is required." } },
        { status: 400 },
      );
    }
    const sourceId = form.get("sourceId");
    const role = form.get("role");
    const subjectKey = form.get("subjectKey");
    const packet = await attachAccPdfChapter(access.organizationId, projectId, {
      bytes: Buffer.from(await file.arrayBuffer()),
      filename: file.name,
      mimeType: file.type.trim() || "application/pdf",
      sourceId: typeof sourceId === "string" ? sourceId : undefined,
      role: typeof role === "string" ? role : undefined,
      subjectKey: typeof subjectKey === "string" ? subjectKey : undefined,
    });
    return NextResponse.json({ packet }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
