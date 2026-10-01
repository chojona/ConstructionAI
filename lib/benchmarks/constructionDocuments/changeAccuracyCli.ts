import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatChangeAccuracyReport, measureRevisionChangeAccuracy } from "./changeAccuracy";

const reportPath = path.join(process.cwd(), "benchmarks", "construction-documents", "reports", "change-accuracy.json");
const report = measureRevisionChangeAccuracy();
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(formatChangeAccuracyReport(report));
console.log(`\nstored ${reportPath}`);
if (!report.targets.allMeasuredTargetsMet) process.exit(1);
