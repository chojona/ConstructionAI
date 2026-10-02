import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { authorizeRequest } from "@/lib/auth/membership";
import { exportApprovedChangePacket } from "@/lib/review/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const access = await authorizeRequest(request, "export");
    const packet = await exportApprovedChangePacket(
      access.organizationId,
      projectId,
      { subjectKey: request.nextUrl.searchParams.get("subjectKey") },
    );
    return new NextResponse(`${JSON.stringify(packet, null, 2)}\n`, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": "attachment; filename=\"approved-pack.json\"",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
