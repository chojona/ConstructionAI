import { readFileSync } from "node:fs";
import { CONSTRUCTION_FACTS_FIXTURES } from "./fixtures";
import {
  formatEvalReport,
  goldBaselinePredictions,
  precision,
  recall,
  scoreConstructionFactsEval,
} from "./score";

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
  console.error(`Unknown argument: ${arg ?? ""}\nUsage: npm run eval:construction-facts -- [--predictions file.json] [--min-precision 0-1] [--min-recall 0-1]`);
  process.exit(1);
}

const predictions = predictionsPath
  ? readPredictions(predictionsPath)
  : goldBaselinePredictions(CONSTRUCTION_FACTS_FIXTURES);
const report = scoreConstructionFactsEval(CONSTRUCTION_FACTS_FIXTURES, predictions);
console.log(formatEvalReport(report));

const precisionFloor = predictionsPath ? minPrecision : 1;
const recallFloor = predictionsPath ? minRecall : 1;
const precisionMiss = precisionFloor !== undefined && precision(report) < precisionFloor;
const recallMiss = recallFloor !== undefined && recall(report) < recallFloor;
if (precisionMiss || recallMiss) process.exit(1);

function readPredictions(path: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Predictions file must be a JSON object keyed by fixture id.");
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
