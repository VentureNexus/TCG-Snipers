#!/usr/bin/env node
/**
 * Detects stale dist output.
 *
 * Algorithm:
 *   1. Hash every file currently in dist/ (empty map when dist doesn't exist)
 *   2. Run `tsc --build --force` to produce a fresh dist
 *   3. Hash every file in dist/ again
 *   4. Fail if the two hash maps differ — the pre-existing dist was stale
 *
 * Run directly:   node check-dist.mjs
 * Via pnpm:       pnpm run check-dist
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function hashDir(dir) {
  const result = {};
  if (!existsSync(dir)) return result;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        const content = readFileSync(full);
        result[full.slice(dir.length + 1)] = createHash("sha256")
          .update(content)
          .digest("hex");
      }
    }
  };
  walk(dir);
  return result;
}

const distDir = new URL("dist", import.meta.url).pathname;

const before = hashDir(distDir);

try {
  execSync("tsc --build --force", { stdio: "inherit" });
} catch {
  process.exit(1);
}

const after = hashDir(distDir);

const beforeKeys = Object.keys(before).sort();
const afterKeys = Object.keys(after).sort();

const added = afterKeys.filter((k) => !(k in before));
const removed = beforeKeys.filter((k) => !(k in after));
const changed = afterKeys.filter((k) => k in before && before[k] !== after[k]);

if (added.length || removed.length || changed.length) {
  console.error(
    "\ndist/ was stale. Run `pnpm --filter @workspace/api-client-react run build` and commit the updated dist.\n"
  );
  if (added.length) console.error("  Added:  ", added.join(", "));
  if (removed.length) console.error("  Removed:", removed.join(", "));
  if (changed.length) console.error("  Changed:", changed.join(", "));
  console.error();
  process.exit(1);
}

console.log("dist/ is up to date.");
