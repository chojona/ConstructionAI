import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { toFindingDto, toReviewDecisionDto } from "@/lib/review/dto";
import { getProjectReview, recordReviewDecision } from "@/lib/review/service";
import { requestOrganizationId } from "@/lib/tenancy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const review = await getProjectReview(requestOrganizationId(request), projectId);
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
    const decision = await recordReviewDecision(
      requestOrganizationId(request),
      projectId,
      request.headers.get("x-reviewer-id"),
      await request.json(),
    );
    return NextResponse.json({ decision: toReviewDecisionDto(decision) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
