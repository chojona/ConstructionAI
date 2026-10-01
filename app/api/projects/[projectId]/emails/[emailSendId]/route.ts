import { NextRequest, NextResponse } from "next/server";
import { readEmailSend, updateEmailDraft } from "@/lib/email/service";
import { errorResponse } from "@/lib/http";
import { requestOrganizationId } from "@/lib/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; emailSendId: string }> },
) {
  try {
    const { projectId, emailSendId } = await context.params;
    const email = await readEmailSend(requestOrganizationId(request), projectId, emailSendId);
    return NextResponse.json({ email });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; emailSendId: string }> },
) {
  try {
    const { projectId, emailSendId } = await context.params;
    const email = await updateEmailDraft(
      requestOrganizationId(request),
      projectId,
      emailSendId,
      await request.json(),
    );
    return NextResponse.json({ email });
  } catch (error) {
    return errorResponse(error);
  }
}
