import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth/membership";
import { errorResponse } from "@/lib/http";
import { readStoredExportPacket } from "@/lib/review/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; exportPacketId: string }> },
) {
  try {
    const { projectId, exportPacketId } = await context.params;
    const access = await authorizeRequest(request, "export");
    const stored = await readStoredExportPacket(access.organizationId, projectId, exportPacketId);
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
