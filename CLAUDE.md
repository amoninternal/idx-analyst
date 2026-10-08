@AGENTS.md

# IDX Analyst

Next.js 16 (App Router, Turbopack) + React 19.2 + Tailwind v4. See README.md for features and setup.

- Sectors Financial API: **v2 only** (`/v1` returns 410 since 2026-05-11). Auth is the raw key in `Authorization`.
  Every call costs credits: go through `sectorsGet` in `src/lib/sectors/client.ts` (cache + retry + concurrency gate)
  and pass the endpoint's documented `cost`. Endpoint specs: https://docs.sectors.app/llms.txt and `/schema.json`.
- API keys: only `getKeys()` / `hasSectorsKey()` / `hasGeminiKey()` in `src/lib/keys.ts` may read them. With the
  default `KEY_MODE` (visitor keys) they come solely from the visitor's encrypted session cookie (`src/lib/session.ts`);
  never read `SECTORS_API_KEY` / `GEMINI_API_KEY` anywhere else, never log a key, never pass one to the model. Per-visitor
  data (cache keys, credits, portfolio) is scoped by `dataScope()`. `src/proxy.ts` is only an optimistic gate plus the
  CSP nonce; enforcement is in `getKeys()`.
- Analyst: Gemini via `@google/genai` (`src/lib/ai/agent.ts`). Resend the model's own parts unchanged each tool round
  (thought signatures). Tool schemas are `parametersJsonSchema` in `src/lib/ai/tools.ts`.
- Local broker data lives outside the app (`BROKSUM_DIR`, default `../broksum-data`) and is queried through DuckDB
  (`src/lib/broksum/`). Cast BIGINT aggregates to DOUBLE and format dates with strftime in SQL.
- Pages that fetch data call `await connection()` so nothing runs at build time. `params` are Promises.
- Chart colors live in `src/lib/palette.ts` (validated for color-blind separation) and mirror the `@theme` tokens in
  `src/app/globals.css`. Broker categories: Foreign blue, Institution violet, Retail orange. Up/down always pairs color
  with a sign or arrow.
- Checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Colors and themes

- Use the color tokens (`bg-sheet`, `text-ink-3`, `text-up`, `bg-down-wash`, ...). Never hardcode hex or rgba in components: it breaks the dark theme.
- On `bg-ink` use `text-sheet` (not `text-white`), and `hover:bg-ink-hover`.
- Markup and SVG take colors from `P` in `src/lib/palette.ts` (CSS variables). Canvas charts call `chartColors()` when they build and list `useResolvedTheme()` in the build effect's dependencies, so they redraw on a theme change.
