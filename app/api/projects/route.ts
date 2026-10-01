import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { createProject } from "@/lib/projects/service";
import { requestOrganizationId } from "@/lib/tenancy";

export async function POST(request: NextRequest) {
  try {
    const project = await createProject(requestOrganizationId(request), await request.json());
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
