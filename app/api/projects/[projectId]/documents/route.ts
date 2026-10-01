import { NextRequest, NextResponse } from "next/server";
import { createDocument } from "@/lib/documents/service";
import { errorResponse } from "@/lib/http";
import { requestOrganizationId } from "@/lib/tenancy";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const document = await createDocument(
      requestOrganizationId(request),
      projectId,
      await request.json(),
    );
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
