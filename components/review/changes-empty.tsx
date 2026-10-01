import Link from "next/link";

export function EmptyChanges({ href }: { href: string }) {
  return (
    <div className="empty-solid">
      <p>No open changes</p>
      <Link className="primary-link" href={href}>Upload first revision</Link>
    </div>
  );
}
