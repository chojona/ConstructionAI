const DEVELOPMENT_ORGANIZATION_ID = "org_demo";

/** Process organization for the unnamed demo desk.
 *  API routes and server pages resolve the caller through authorizeRequest.
 */
export function currentOrganizationId(): string {
  return process.env.APP_ORGANIZATION_ID?.trim() || DEVELOPMENT_ORGANIZATION_ID;
}
