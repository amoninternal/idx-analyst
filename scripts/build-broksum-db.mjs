// Builds .data/broksum.duckdb from the broksum-data parquet export.
// The app also runs this automatically on first use; run it by hand after
// refreshing the data folder:  npm run build:db
import { DuckDBInstance } from "@duckdb/node-api";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dataDir = path.resolve(root, process.env.BROKSUM_DIR ?? "../broksum-data");
const outDir = path.join(root, ".data");
const outFile = path.join(outDir, "broksum.duckdb");
const tmpFile = outFile + ".tmp";

const posix = (p) => p.replaceAll("\\", "/");
const sqlStr = (s) => `'${s.replaceAll("'", "''")}'`;

if (!fs.existsSync(path.join(dataDir, "parquet", "broker"))) {
  console.error(`No parquet data found under ${dataDir}. Set BROKSUM_DIR.`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
for (const f of [tmpFile, tmpFile + ".wal"]) fs.rmSync(f, { force: true });

const started = Date.now();
const instance = await DuckDBInstance.create(tmpFile);
const con = await instance.connect();
const p = (rel) => sqlStr(posix(path.join(dataDir, rel)));

await con.run(`
  CREATE TABLE broker AS
  SELECT date, ticker, code, buy_volume, sell_volume, buy_value, sell_value,
         buy_freq, sell_freq, net_value, net_volume
  FROM read_parquet(${p("parquet/broker/*/*.parquet")}, hive_partitioning = true)
  ORDER BY ticker, date, code`);
await con.run(`CREATE TABLE daily AS SELECT * FROM read_parquet(${p("parquet/daily.parquet")}) ORDER BY ticker, date`);
await con.run(`CREATE TABLE baseline AS SELECT * FROM read_parquet(${p("parquet/baseline.parquet")}) ORDER BY ticker, code`);
await con.run(`CREATE TABLE brokers AS SELECT * FROM read_csv(${p("meta/brokers.csv")}, header = true)`);

const splits = JSON.parse(fs.readFileSync(path.join(dataDir, "meta", "corp-actions.json"), "utf8"));
await con.run(`CREATE TABLE splits (ticker VARCHAR, date DATE, ratio DOUBLE)`);
for (const s of splits) {
  // Prefer the clean split ratio ("split 1:5?") over the observed price ratio.
  const m = /split\s+1:(\d+)/.exec(s.guess ?? "");
  const ratio = m ? 1 / Number(m[1]) : s.ratio;
  await con.run(`INSERT INTO splits VALUES ($1, $2::DATE, $3)`, [s.ticker, s.date, ratio]);
}

const reader = await con.runAndReadAll(`
  SELECT (SELECT count(*) FROM broker)::INTEGER AS rows,
         (SELECT count(DISTINCT ticker) FROM broker)::INTEGER AS tickers,
         (SELECT strftime(min(date), '%Y-%m-%d') FROM broker) AS first_date,
         (SELECT strftime(max(date), '%Y-%m-%d') FROM broker) AS last_date`);
const stats = reader.getRowObjectsJson()[0];
await con.run("CHECKPOINT");
con.closeSync();
instance.closeSync();

fs.renameSync(tmpFile, outFile);
console.log(`Built ${posix(path.relative(root, outFile))} in ${((Date.now() - started) / 1000).toFixed(1)}s`, stats);
