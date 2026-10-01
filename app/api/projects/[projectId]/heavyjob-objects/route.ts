import { NextRequest, NextResponse } from "next/server";
import { toHeavyJobSourceObjectDto } from "@/lib/heavyjob/dto";
import { listHeavyJobSourceObjects, parseHeavyJobObjectTypeFilter } from "@/lib/heavyjob/service";
import { errorResponse } from "@/lib/http";
import { requestOrganizationId } from "@/lib/tenancy";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const objectType = parseHeavyJobObjectTypeFilter(request.nextUrl.searchParams.get("objectType"));
    const objects = await listHeavyJobSourceObjects(requestOrganizationId(request), projectId, objectType);
    return NextResponse.json({ objects: objects.map(toHeavyJobSourceObjectDto) });
  } catch (error) {
    return errorResponse(error);
  }
}
