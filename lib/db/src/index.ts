import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";
import * as schema from "./schema/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any;
let _pool: pg.Pool | undefined;

if (process.env.DATABASE_URL) {
  // Standard server mode: connect to a real PostgreSQL database.
  // pg and drizzle-orm/node-postgres are loaded lazily here so that the
  // Electron desktop build (which bundles this module) never tries to load
  // them at startup — they can't be easily bundled and are never needed when
  // running with PGlite.
  const { default: pg } = await import("pg");
  const { drizzle: pgDrizzle } = await import("drizzle-orm/node-postgres");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  _pool = pool;
  _db = pgDrizzle(pool, { schema });
} else if (process.env.ELECTRON_DB_PATH) {
  // PGlite: embedded PostgreSQL via WASM — no external database server needed.
  // Used by the Electron desktop app when DATABASE_URL is not available on
  // the end-user's machine. Data persists to the user's app-data directory.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: pgliteDrizzle } = await import("drizzle-orm/pglite");
  const { runPgliteMigrations } = await import("./pglite-migrate.js");

  const client = new PGlite(process.env.ELECTRON_DB_PATH);
  await runPgliteMigrations(client);
  _db = pgliteDrizzle(client, { schema });
} else {
  throw new Error(
    "DATABASE_URL or ELECTRON_DB_PATH must be set. Did you forget to provision a database?",
  );
}

export const db: NodePgDatabase<typeof schema> = _db;
export const pool: pg.Pool | undefined = _pool;
export * from "./schema/index.js";
