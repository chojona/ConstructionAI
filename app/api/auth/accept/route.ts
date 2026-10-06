import { NextRequest, NextResponse } from "next/server";
import { attachSession } from "@/lib/auth/httpSession";
import { acceptInvitation, findAcceptEmail, parseAcceptRequest } from "@/lib/auth/login";
import { clientIp, isAcceptAttemptFailure, runLimitedAuthAttempt } from "@/lib/auth/loginRateLimit";
import { errorResponse, readJsonBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody(request);
    parseAcceptRequest(body);
    const session = await runLimitedAuthAttempt({
      ip: clientIp(request),
      resolveEmail: () => findAcceptEmail(body),
      countsFailure: isAcceptAttemptFailure,
      run: () => acceptInvitation(body),
      emailToClear: (signedIn) => signedIn.email,
    });
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
