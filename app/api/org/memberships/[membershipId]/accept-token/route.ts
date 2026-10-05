import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth/membership";
import { refreshAcceptToken } from "@/lib/auth/people";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ membershipId: string }> },
) {
  try {
    const access = await authorizeRequest(request, "manage_people");
    const { membershipId } = await context.params;
    const issued = await refreshAcceptToken(access, membershipId);
    return NextResponse.json(issued);
  } catch (error) {
    return errorResponse(error);
  }
}
