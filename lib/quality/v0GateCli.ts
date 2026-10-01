import { formatV0QualitySnapshot, qualityTargetsMet, readV0QualitySnapshot } from "./v0Gate";

const snapshot = await readV0QualitySnapshot();
console.log(formatV0QualitySnapshot(snapshot));
if (!qualityTargetsMet(snapshot)) process.exit(1);
