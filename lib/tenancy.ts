const DEVELOPMENT_ORGANIZATION_ID = "org_demo";

/** Process default organization id for seed and local scripts.
 *  Signed-in API routes and server pages resolve the caller from the session.
 */
export function currentOrganizationId(): string {
  return process.env.APP_ORGANIZATION_ID?.trim() || DEVELOPMENT_ORGANIZATION_ID;
}
