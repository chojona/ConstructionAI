export interface ReviewSummaryCounts {
  needsReview: number;
  acceptedToday: number;
  rejectedToday: number;
}

/**
 * Needs review is the open queue. Accepted and rejected today count append-only
 * ledger rows on the UTC calendar day of `now`. A later decision does not erase
 * an earlier row from the same day. Dismissals are the rejected count.
 */
export function reviewSummaryCounts(
  input: {
    needsReview: number;
    decisions: readonly { decision: string; createdAt: Date | string }[];
  },
  now: Date = new Date(),
): ReviewSummaryCounts {
  const today = utcDay(now);
  let acceptedToday = 0;
  let rejectedToday = 0;
  for (const decision of input.decisions) {
    const created = decision.createdAt instanceof Date ? decision.createdAt : new Date(decision.createdAt);
    if (Number.isNaN(created.getTime()) || utcDay(created) !== today) continue;
    if (decision.decision === "ACCEPTED") acceptedToday += 1;
    else if (decision.decision === "DISMISSED") rejectedToday += 1;
  }
  return { needsReview: input.needsReview, acceptedToday, rejectedToday };
}

function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}
