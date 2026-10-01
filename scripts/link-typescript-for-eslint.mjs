// TypeScript 7 is the compiler Next.js runs, and it ships no JavaScript API.
// typescript-eslint still imports `typescript`, so point those packages at the TypeScript 6 install.
import { existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const typescript6 = "node_modules/typescript-6";
const packageNames = new Set(["typescript-eslint", "ts-api-utils", "eslint-plugin-import"]);

if (!existsSync(join(typescript6, "lib", "typescript.js"))) {
  throw new Error("typescript-6 is not installed, so ESLint cannot load the TypeScript 6 API.");
}

function findPackages(directory, depth, found) {
  if (depth > 8) {
    return;
  }

  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === ".bin" || entry.name === "typescript" || entry.name === "typescript-6") {
      continue;
    }

    const fullPath = join(directory, entry.name);
    if (packageNames.has(entry.name) && existsSync(join(fullPath, "package.json"))) {
      found.push(fullPath);
    }

    findPackages(fullPath, depth + 1, found);
  }
}

const packages = [];
findPackages("node_modules", 0, packages);

if (packages.length === 0) {
  throw new Error("Could not find typescript-eslint to link against TypeScript 6.");
}

for (const packageDir of packages) {
  const linkPath = join(packageDir, "node_modules", "typescript");
  const desired = relative(dirname(linkPath), typescript6);
  mkdirSync(dirname(linkPath), { recursive: true });

  if (existsSync(linkPath) || lstatSync(linkPath, { throwIfNoEntry: false })?.isSymbolicLink()) {
    if (lstatSync(linkPath).isSymbolicLink() && readlinkSync(linkPath) === desired) {
      continue;
    }
    rmSync(linkPath, { recursive: true, force: true });
  }

  symlinkSync(desired, linkPath);
}
