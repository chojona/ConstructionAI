import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { measureConstructionDocumentAccuracy } from "./accuracy";
import { formatQualityReport } from "@/lib/extractions/eval/quality";

const reportPath = path.join(process.cwd(), "benchmarks", "construction-documents", "reports", "extraction-accuracy.json");
const report = measureConstructionDocumentAccuracy();
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(formatQualityReport(report));
console.log(`\nstored ${reportPath}`);
