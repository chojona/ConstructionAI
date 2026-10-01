"use client";

import { DraftEmailButton } from "@/components/review/draft-email";
import { Button } from "@/components/ui/button";
import { draftEmailVisible } from "@/lib/email/emailSendView";
import { exportPacketAction, subjectExportVisible, visiblePacketChanges, type ApprovedChangePreview } from "@/lib/review/exportPacketView";

export function ExportPacketControl({
  projectId,
  changes,
  actorId = "",
}: {
  projectId: string;
  changes: readonly ApprovedChangePreview[];
  actorId?: string;
}) {
  const approved = visiblePacketChanges(changes).filter((change) => subjectExportVisible(change.decision));
  const action = exportPacketAction(approved.length, projectId);
  if (!action.enabled || !action.href) {
    return <p className="packet-blocked">{action.message}</p>;
  }
  return (
    <div className="packet-actions">
      <Button asChild>
        <a href={action.href} download="approved-pack.json">Export approved pack</a>
      </Button>
      {draftEmailVisible(approved.length) && <DraftEmailButton projectId={projectId} actorId={actorId} />}
    </div>
  );
}
