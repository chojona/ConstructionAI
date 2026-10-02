import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest, withLedgerActor } from "@/lib/auth/membership";
import { recordEmailSend } from "@/lib/email/service";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const access = await authorizeRequest(request, "draft_email");
    const email = await recordEmailSend(
      access.organizationId,
      projectId,
      withLedgerActor(access, await request.json()),
    );
    return NextResponse.json({ email }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
