import { NextRequest, NextResponse } from "next/server";
import { attachSession } from "@/lib/auth/httpSession";
import { acceptInvitation } from "@/lib/auth/login";
import { errorResponse, readJsonBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await acceptInvitation(await readJsonBody(request));
    const response = NextResponse.json({
      user: {
        id: session.userId,
        email: session.email,
        name: session.name,
        organizationId: session.organizationId,
      },
    });
    return attachSession(response, session.token);
  } catch (error) {
    return errorResponse(error);
  }
}
