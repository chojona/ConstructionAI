import { NextRequest, NextResponse } from "next/server";
import { errorResponse, readJsonBody } from "@/lib/http";
import { toFindingDto, toReviewDecisionDto } from "@/lib/review/dto";
import { authorizeRequest } from "@/lib/auth/membership";
import { getProjectReview, recordReviewDecision } from "@/lib/review/service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const access = await authorizeRequest(request, "read");
    const review = await getProjectReview(access.organizationId, projectId);
    return NextResponse.json({
      decisions: review.decisions.map(toReviewDecisionDto),
      findings: review.findings.map(toFindingDto),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const access = await authorizeRequest(request, "approve");
    const decision = await recordReviewDecision(
      access.organizationId,
      projectId,
      access.named ? access.userId : request.headers.get("x-reviewer-id"),
      await readJsonBody(request),
    );
    return NextResponse.json({ decision: toReviewDecisionDto(decision) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
