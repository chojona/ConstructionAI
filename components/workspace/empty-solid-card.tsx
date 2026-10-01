import Link from "next/link";

export function EmptySolidCard({
  message,
  action,
}: {
  message: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="empty-solid">
      <p>{message}</p>
      {action ? <Link className="primary-link" href={action.href}>{action.label}</Link> : null}
    </div>
  );
}
