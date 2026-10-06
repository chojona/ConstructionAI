import type { ApprovalSignoff } from "@/lib/auth/approvalSignoff";

/** Plain audit text. The disabled mark is muted secondary type, not a badge. */
export function ApprovalSignoffText({ name, disabled }: ApprovalSignoff) {
  return (
    <span className="approval-signoff">
      {name}
      {disabled ? <span className="approval-signoff-disabled"> (disabled)</span> : null}
    </span>
  );
}
