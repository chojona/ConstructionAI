import {
  formatWritebackViolations,
  scanV0ProductPathsForUpstreamWriteback,
} from "./v0NoUpstreamWriteback";

const violations = scanV0ProductPathsForUpstreamWriteback();
console.log(formatWritebackViolations(violations));
if (violations.length > 0) {
  process.exitCode = 1;
}
