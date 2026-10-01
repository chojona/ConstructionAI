import type { ReactNode } from "react";
import Link from "next/link";

export function EmptySolidCard({
  message,
  action,
  children,
}: {
  message: string;
  action?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className="empty-solid">
      <p>{message}</p>
      {action ? <Link className="primary-link" href={action.href}>{action.label}</Link> : children}
    </div>
  );
}
