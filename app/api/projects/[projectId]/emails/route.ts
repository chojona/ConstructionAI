import { NextRequest, NextResponse } from "next/server";
import { recordEmailSend } from "@/lib/email/service";
import { errorResponse } from "@/lib/http";
import { requestOrganizationId } from "@/lib/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const email = await recordEmailSend(requestOrganizationId(request), projectId, await request.json());
    return NextResponse.json({ email }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
