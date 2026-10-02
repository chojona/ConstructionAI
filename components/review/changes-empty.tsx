import Link from "next/link";
import { DESK_EMPTY_NO_OPEN_CHANGES } from "@/lib/review/exportPacketView";

export function EmptyChanges({ href }: { href: string }) {
  return (
    <div className="empty-solid">
      <p>{DESK_EMPTY_NO_OPEN_CHANGES}</p>
      <Link className="primary-link" href={href}>Upload first revision</Link>
    </div>
  );
}
