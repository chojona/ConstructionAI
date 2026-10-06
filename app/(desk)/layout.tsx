import { authorizePage } from "@/lib/auth/pageAccess";

export const dynamic = "force-dynamic";

/** Gate the desk before this segment's loading boundary streams.
 *  unauthorized() and forbidden() inside that boundary run after the
 *  response has started, so the document status would stay 200.
 */
export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  await authorizePage("read");
  return children;
}
