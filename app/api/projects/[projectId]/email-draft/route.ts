import { NextRequest, NextResponse } from "next/server";
import { getEmailDraftSource } from "@/lib/email/service";
import { errorResponse } from "@/lib/http";
import { requestOrganizationId } from "@/lib/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const source = await getEmailDraftSource(requestOrganizationId(request), projectId);
    return NextResponse.json(source);
  } catch (error) {
    return errorResponse(error);
  }
}
