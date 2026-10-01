import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { exportApprovedChangePacket } from "@/lib/review/service";
import { requestOrganizationId } from "@/lib/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const packet = await exportApprovedChangePacket(
      requestOrganizationId(request),
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
