import { NextRequest, NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth/membership";
import { inviteMember, listPeople } from "@/lib/auth/people";
import { errorResponse, readJsonBody } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const access = await authorizeRequest(request, "manage_people");
    const people = await listPeople(access);
    return NextResponse.json({ people });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await authorizeRequest(request, "manage_people");
    const membership = await inviteMember(access, await readJsonBody(request));
    return NextResponse.json({ membership }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
