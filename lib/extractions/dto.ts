import type { ProposedFactRecord } from "@/lib/domain/types";

/** API representation cites page identity and excerpt anchors, never storage paths. */
export function toProposedFactDto(fact: ProposedFactRecord) {
  return {
    id: fact.id,
    extractionRunId: fact.extractionRunId,
    ordinal: fact.ordinal,
    type: fact.factType,
    ...fact.payload,
    evidence: fact.evidence.map((item) => ({
      documentPageId: item.documentPageId,
      pageNumber: item.pageNumber,
      excerpt: item.excerpt,
      startOffset: item.startOffset,
      endOffset: item.endOffset,
    })),
    createdAt: fact.createdAt,
  };
}
