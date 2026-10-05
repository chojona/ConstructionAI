import { NextRequest, NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/httpSession";
import { endSession } from "@/lib/auth/login";
import { SESSION_COOKIE } from "@/lib/auth/sessionToken";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await endSession(request.cookies.get(SESSION_COOKIE)?.value ?? "");
    return clearSession(NextResponse.json({ ok: true }));
  } catch (error) {
    return errorResponse(error);
  }
}
