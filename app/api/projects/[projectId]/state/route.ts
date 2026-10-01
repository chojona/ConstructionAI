import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { toProjectStateDto } from "@/lib/review/dto";
import { getProjectReview } from "@/lib/review/service";
import { requestOrganizationId } from "@/lib/tenancy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const review = await getProjectReview(requestOrganizationId(request), projectId);
    return NextResponse.json({ state: toProjectStateDto(review.state) });
  } catch (error) {
    return errorResponse(error);
  }
}
