import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runLatencyBenchmark, withBenchmarkStorage } from "./latencyBenchmark";

const args = process.argv.slice(2);
let iterations = 11;
let pages = 8;
let out = path.join(process.cwd(), "benchmarks", "latency", "baseline.md");

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--iterations") {
    iterations = integerArg(args[index + 1], "--iterations");
    index += 1;
    continue;
  }
  if (arg === "--pages") {
    pages = integerArg(args[index + 1], "--pages");
    index += 1;
    continue;
  }
  if (arg === "--out") {
    const value = args[index + 1];
    if (!value) throw new Error("--out expects a file path.");
    out = path.resolve(value);
    index += 1;
    continue;
  }
  console.error(`Unknown argument: ${arg ?? ""}\nUsage: npm run bench:latency -- [--iterations N] [--pages N] [--out file.md]`);
  process.exit(1);
}

const result = await withBenchmarkStorage((storage) => runLatencyBenchmark({ iterations, pages, storage }));
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, result.report);
console.log(result.report);

function integerArg(value: string | undefined, flag: string) {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} expects a positive integer.`);
  return parsed;
}
