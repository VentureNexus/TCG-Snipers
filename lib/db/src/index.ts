import pg from "pg";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema/index.js";

const { Pool } = pg;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any;
let _pool: pg.Pool | undefined;

if (process.env.DATABASE_URL) {
  _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  _db = pgDrizzle(_pool, { schema });
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

export const db: ReturnType<typeof pgDrizzle<typeof schema>> = _db;
export const pool: pg.Pool | undefined = _pool;
export * from "./schema/index.js";
