import { readFileSync } from "node:fs";
import { CONSTRUCTION_DOCUMENT_BENCHMARK } from "./dataset";
import { evaluateConstructionDocumentBenchmark, formatBenchmarkReport } from "./evaluate";
import { formatEvalReport, precision, recall } from "@/lib/extractions/eval/score";

const args = process.argv.slice(2);
let predictionsPath: string | undefined;
let minPrecision: number | undefined;
let minRecall: number | undefined;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--predictions") {
    predictionsPath = args[index + 1];
    index += 1;
    continue;
  }
  if (arg === "--min-precision") {
    minPrecision = numberArg(args[index + 1], "--min-precision");
    index += 1;
    continue;
  }
  if (arg === "--min-recall") {
    minRecall = numberArg(args[index + 1], "--min-recall");
    index += 1;
    continue;
  }
  console.error(`Unknown argument: ${arg ?? ""}\nUsage: npm run eval:construction-documents -- [--predictions file.json] [--min-precision 0-1] [--min-recall 0-1]`);
  process.exit(1);
}

const predictions = predictionsPath ? readPredictions(predictionsPath) : undefined;
const report = evaluateConstructionDocumentBenchmark(CONSTRUCTION_DOCUMENT_BENCHMARK, predictions);
console.log(formatBenchmarkReport(report));
console.log(formatEvalReport(report.extraction));

const precisionFloor = predictions ? minPrecision : 1;
const recallFloor = predictions ? minRecall : 1;
const precisionMiss = precisionFloor !== undefined && precision(report.extraction) < precisionFloor;
const recallMiss = recallFloor !== undefined && recall(report.extraction) < recallFloor;
if (precisionMiss || recallMiss || report.changeMismatches.length > 0) process.exit(1);

function readPredictions(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Predictions file must be a JSON object keyed by pairId:base or pairId:revised.");
  }
  return parsed as Record<string, unknown>;
}

function numberArg(value: string | undefined, flag: string) {
  const parsed = Number(value);
  if (!value || Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${flag} expects a number from 0 to 1.`);
  }
  return parsed;
}
