import type { NextRequest } from "next/server";

const DEVELOPMENT_ORGANIZATION_ID = "org_demo";

export function currentOrganizationId(): string {
  return process.env.APP_ORGANIZATION_ID?.trim() || DEVELOPMENT_ORGANIZATION_ID;
}

export function requestOrganizationId(request: NextRequest): string {
  return request.headers.get("x-organization-id")?.trim() || currentOrganizationId();
}
