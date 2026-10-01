import { Button } from "@/components/ui/button";
import { exportPacketAction, subjectExportVisible, visiblePacketChanges, type ApprovedChangePreview } from "@/lib/review/exportPacketView";

export function ExportPacketControl({
  projectId,
  changes,
}: {
  projectId: string;
  changes: readonly ApprovedChangePreview[];
}) {
  const approved = visiblePacketChanges(changes).filter((change) => subjectExportVisible(change.decision));
  const action = exportPacketAction(approved.length, projectId);
  if (!action.enabled || !action.href) {
    return <p className="packet-blocked">{action.message}</p>;
  }
  return (
    <div className="packet-export">
      <div>
        <p className="packet-kicker">Approved pack</p>
        <ul className="packet-preview" aria-label="Approved changes in this packet">
          {approved.map((change) => (
            <li key={change.subjectKey}>
              <span className="packet-summary">{change.summary}</span>
              <span className="packet-chips">
                {change.evidence.map((item) => (
                  <span className="page-chip" key={`${change.subjectKey}:${item.revisionId}:${item.pageNumber}:${item.excerpt}`} title={item.excerpt}>p. {item.pageNumber}</span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Button asChild>
        <a href={action.href} download="approved-pack.json">Export approved pack</a>
      </Button>
    </div>
  );
}
