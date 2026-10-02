import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth/membership";
import { getEmailDraftSource } from "@/lib/email/service";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const access = await authorizeRequest(request, "draft_email");
    const source = await getEmailDraftSource(access.organizationId, projectId);
    return NextResponse.json(source);
  } catch (error) {
    return errorResponse(error);
  }
}
