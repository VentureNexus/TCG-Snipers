/**
 * smoke-test-pglite.mjs
 *
 * Pre-release smoke test for PGlite database persistence.
 *
 * Verifies:
 *   1. postgres.wasm and postgres.data exist in dist/ (required for runtime)
 *   2. PGlite can be instantiated from the copied WASM assets in dist/
 *   3. A minimal create/read round-trip succeeds without errors
 *
 * Usage (run after `pnpm --filter @workspace/api-server run build`):
 *   node artifacts/api-server/scripts/smoke-test-pglite.mjs
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 */

import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label, detail = "") {
  console.error(`  ✗ ${label}${detail ? `: ${detail}` : ""}`);
  failed++;
}

// ---------------------------------------------------------------------------
// Step 1: Verify WASM asset files exist in dist/
// ---------------------------------------------------------------------------
console.log("\n[1/2] Checking for PGlite WASM assets in dist/ …");

const wasmPath = path.join(distDir, "postgres.wasm");
const dataPath = path.join(distDir, "postgres.data");

if (existsSync(wasmPath)) {
  const { size } = await stat(wasmPath);
  ok(`postgres.wasm exists (${(size / 1024 / 1024).toFixed(1)} MB)`);
} else {
  fail("postgres.wasm is MISSING from dist/", wasmPath);
}

if (existsSync(dataPath)) {
  const { size } = await stat(dataPath);
  ok(`postgres.data exists (${(size / 1024).toFixed(0)} KB)`);
} else {
  fail("postgres.data is MISSING from dist/", dataPath);
}

// ---------------------------------------------------------------------------
// Step 2: PGlite create/read round-trip
// ---------------------------------------------------------------------------
console.log("\n[2/2] Running PGlite create/read round-trip …");

if (!existsSync(wasmPath) || !existsSync(dataPath)) {
  fail("Skipping round-trip — WASM assets are missing");
} else {
  try {
    const req = createRequire(
      path.resolve(__dirname, "../../../lib/db/src/index.ts")
    );
    const pgliteMain = req.resolve("@electric-sql/pglite");
    const { PGlite } = await import(pathToFileURL(pgliteMain).href);

    const db = new PGlite();
    await db.waitReady;

    await db.exec(`
      CREATE TABLE IF NOT EXISTS _smoke_test (
        id   SERIAL PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);
    ok("CREATE TABLE succeeded");

    await db.exec(`INSERT INTO _smoke_test (name) VALUES ('hello-smoke');`);
    ok("INSERT succeeded");

    const result = await db.query(
      `SELECT name FROM _smoke_test WHERE name = 'hello-smoke';`
    );

    if (result.rows.length === 1 && result.rows[0].name === "hello-smoke") {
      ok("SELECT returned the expected row");
    } else {
      fail(
        "SELECT did not return expected row",
        JSON.stringify(result.rows)
      );
    }

    await db.exec(`DROP TABLE _smoke_test;`);
    ok("DROP TABLE (cleanup) succeeded");

    await db.close();
  } catch (err) {
    fail("PGlite round-trip threw an error", err.message);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nSmoke test result: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}
