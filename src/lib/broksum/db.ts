import "server-only";
import { DuckDBInstance } from "@duckdb/node-api";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config";

// Read-only DuckDB over the local broker-summary export. The database file is
// built from the parquet folder on first use (about two seconds), sorted by
// ticker so single-stock queries touch only a few row groups.

const dbFile = path.join(config.dataDir, "broksum.duckdb");

const state = ((globalThis as { __idxDuck?: { instance: Promise<DuckDBInstance> | null } }).__idxDuck ??= {
  instance: null,
});

async function buildDatabase() {
  const script = path.join(process.cwd(), "scripts", "build-broksum-db.mjs");
  console.log(`[broksum] building ${dbFile} from ${config.broksumDir}`);
  await promisify(execFile)(process.execPath, [script], {
    cwd: process.cwd(),
    env: { ...process.env, BROKSUM_DIR: config.broksumDir },
  });
}

function instance(): Promise<DuckDBInstance> {
  state.instance ??= (async () => {
    if (!fs.existsSync(dbFile)) await buildDatabase();
    return DuckDBInstance.fromCache(dbFile, { access_mode: "READ_ONLY" });
  })().catch((err) => {
    state.instance = null;
    throw err;
  });
  return state.instance;
}

type Param = string | number | boolean | null;

/**
 * Runs a query and returns JSON-safe rows. Cast BIGINT aggregates to DOUBLE and
 * dates with strftime in SQL; otherwise they come back as strings.
 */
export async function query<T>(sql: string, params: Param[] = []): Promise<T[]> {
  const db = await instance();
  const con = await db.connect();
  try {
    const reader = await con.runAndReadAll(sql, params);
    return reader.getRowObjectsJson() as unknown as T[];
  } finally {
    con.closeSync();
  }
}

export function databaseFile() {
  return dbFile;
}
