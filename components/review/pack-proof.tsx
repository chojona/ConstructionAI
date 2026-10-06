import {
  CONTENT_SHA256_LABEL,
  PACK_PROOF_FETCHED_LABEL,
  PACK_PROOF_SOURCE_LABEL,
  appendixCiteVisible,
  isUnpinnedAppendixCite,
  packProofChrome,
  visiblePackProof,
  type DeskPackFile,
} from "@/lib/review/exportPacketView";

export function LegacyPageCiteNotice({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="empty" role="status">{message}</p>;
}

export function PackProofList({ files }: { files: readonly DeskPackFile[] }) {
  const proved = visiblePackProof(files);
  if (proved.length === 0) return null;
  return (
    <ul className="packet-proof">
      {proved.map((file) => {
        const chrome = packProofChrome(file);
        return (
          <li key={`${chrome.sourceId}:${file.contentHash}`}>
            <span className="packet-proof-title">{chrome.title}</span>
            <dl className="packet-proof-fields">
              <div>
                <dt>{PACK_PROOF_SOURCE_LABEL}</dt>
                <dd>{chrome.sourceId}</dd>
              </div>
              <div>
                <dt>{PACK_PROOF_FETCHED_LABEL}</dt>
                <dd><time dateTime={chrome.fetchedAt}>{chrome.fetchedAt}</time></dd>
              </div>
              <div>
                <dt>{CONTENT_SHA256_LABEL}</dt>
                <dd>{chrome.sha256}</dd>
              </div>
            </dl>
            {chrome.pageCites.length > 0 && (
              <span className="packet-chips">
                {chrome.pageCites.map((cite) => {
                  const visible = appendixCiteVisible(cite);
                  const key = isUnpinnedAppendixCite(cite)
                    ? `${file.contentHash}:unpinned:${cite.label}:${cite.reason}`
                    : `${file.contentHash}:${cite.revisionId}:${cite.page}`;
                  return (
                    <span className="page-chip" data-pin-status={visible.status} key={key}>
                      {visible.status === "Unpinned" ? `Unpinned · ${visible.text} · ${visible.reason}` : visible.text}
                    </span>
                  );
                })}
              </span>
            )}
            <LegacyPageCiteNotice message={file.citeNotice} />
          </li>
        );
      })}
    </ul>
  );
}
