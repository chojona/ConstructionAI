import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth/membership";
import { enableMember } from "@/lib/auth/people";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ membershipId: string }> },
) {
  try {
    const { membershipId } = await context.params;
    const access = await authorizeRequest(request, "manage_people");
    const membership = await enableMember(access, membershipId);
    return NextResponse.json({ membership });
  } catch (error) {
    return errorResponse(error);
  }
}
