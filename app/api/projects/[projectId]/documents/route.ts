import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth/membership";
import { createDocument } from "@/lib/documents/service";
import { errorResponse, readJsonBody } from "@/lib/http";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const access = await authorizeRequest(request, "upload");
    const document = await createDocument(
      access.organizationId,
      projectId,
      await readJsonBody(request),
    );
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
