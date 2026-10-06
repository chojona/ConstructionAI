import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest, withLedgerActor } from "@/lib/auth/membership";
import { readEmailSend, updateEmailDraft } from "@/lib/email/service";
import { errorResponse, readJsonBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; emailSendId: string }> },
) {
  try {
    const { projectId, emailSendId } = await context.params;
    const access = await authorizeRequest(request, "read");
    const email = await readEmailSend(access.organizationId, projectId, emailSendId);
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
    const access = await authorizeRequest(request, "draft_email");
    const email = await updateEmailDraft(
      access.organizationId,
      projectId,
      emailSendId,
      withLedgerActor(access, await readJsonBody(request)),
    );
    return NextResponse.json({ email });
  } catch (error) {
    return errorResponse(error);
  }
}
