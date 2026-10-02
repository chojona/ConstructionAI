import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth/membership";
import { errorResponse } from "@/lib/http";
import { toProjectStateDto } from "@/lib/review/dto";
import { getProjectReview } from "@/lib/review/service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const access = await authorizeRequest(request, "read");
    const review = await getProjectReview(access.organizationId, projectId);
    return NextResponse.json({ state: toProjectStateDto(review.state) });
  } catch (error) {
    return errorResponse(error);
  }
}
