@AGENTS.md

# IDX Analyst

Next.js 16 (App Router, Turbopack) + React 19.2 + Tailwind v4. See README.md for features and setup.

- Sectors Financial API: **v2 only** (`/v1` returns 410 since 2026-05-11). Auth is the raw key in `Authorization`.
  Every call costs credits: go through `sectorsGet` in `src/lib/sectors/client.ts` (cache + retry + concurrency gate)
  and pass the endpoint's documented `cost`. Endpoint specs: https://docs.sectors.app/llms.txt and `/schema.json`.
- Local broker data lives outside the app (`BROKSUM_DIR`, default `../broksum-data`) and is queried through DuckDB
  (`src/lib/broksum/`). Cast BIGINT aggregates to DOUBLE and format dates with strftime in SQL.
- Pages that fetch data call `await connection()` so nothing runs at build time. `params` are Promises.
- Chart colors live in `src/lib/palette.ts` (validated for color-blind separation) and mirror the `@theme` tokens in
  `src/app/globals.css`. Broker categories: Foreign blue, Institution violet, Retail orange. Up/down always pairs color
  with a sign or arrow.
- Checks: `npm run typecheck`, `npm run lint`, `npm run build`.
