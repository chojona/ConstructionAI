import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { authorizeRequest } from "@/lib/auth/membership";
import { createProject } from "@/lib/projects/service";

export async function POST(request: NextRequest) {
  try {
    const access = await authorizeRequest(request, "upload");
    const project = await createProject(access.organizationId, await request.json());
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
