import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { readStoredExportPacket } from "@/lib/review/service";
import { requestOrganizationId } from "@/lib/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; exportPacketId: string }> },
) {
  try {
    const { projectId, exportPacketId } = await context.params;
    const stored = await readStoredExportPacket(requestOrganizationId(request), projectId, exportPacketId);
    return new NextResponse(new Uint8Array(stored.payload), {
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
