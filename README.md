# IDX Analyst

A research desk for stocks on the Indonesia Stock Exchange: price charts with indicators, broker summaries
(bandarmology), fundamentals, news, a portfolio tracker, and an AI analyst that reads all of it before answering.

Next.js 16 · React 19 · Tailwind v4 · DuckDB · Sectors Financial API v2 · OpenAI Responses API

<!-- Add a screenshot or two here — it is the first thing visitors look at.
     Suggested: the stock page with the broker-summary tab open, and the analyst chat.
     ![Stock page](docs/screenshot-stock.png) -->

---

## Before you start

**The market data is not in this repository.** The app was built against a private export of IDX broker
summaries (5.5 million rows, 1.1 GB) that comes from a paid IndexAlpha subscription licensed for personal
use. That export is not redistributable, so it is not here and will not be. See
[Running it yourself](#running-it-yourself) for what you can do instead — with a Sectors API key the app
fetches broker data live and works without any local export.

**Nothing here is investment advice.** The flow read, trend call and valuation read are rules of thumb,
and the interface says so where they appear. The signals in this app are weak by design and by measurement;
see [Honest limitations](#honest-limitations).

---

## What it does

| Page | What it does | Data |
|---|---|---|
| **Markets** | IHSG, market-wide foreign flow, top movers, most traded, a week of foreign broker buying and selling, latest news | Sectors, local broker data |
| **Stocks** | Every listed stock, sortable and filterable, plus a plain-language screener ("banks with ROE above 15%") | Sectors screener |
| **Stock page** | Four one-line reads (trend, broker flow, valuation, news), then four tabs: | |
| &nbsp;&nbsp;Chart | Candles and volume; MA 20/50/200, EMA 20, Bollinger, support/resistance; RSI, MACD, stochastic panes; technical summary | Sectors daily OHLCV |
| &nbsp;&nbsp;Broker summary | Net flow by broker category, accumulation/distribution read, top buyers and sellers with average prices, day-by-day category flow, unusual activity, per-broker position and average cost | Local export + Sectors live |
| &nbsp;&nbsp;Fundamentals | Valuation against peers, annual financials and ratios, dividends, analyst ratings and forecasts, peers, ownership, management, quarterly results | Sectors company report |
| &nbsp;&nbsp;News | Articles tagged with the stock, with bullish/bearish tags | Sectors news |
| **Portfolio** | Positions in lots with average price; value, P&L before and after fees, day change, allocation by stock and sector | Your entries + prices |
| **Analyst** | Chat with an OpenAI model that calls nine tools (overview, fundamentals, technicals, broker flow, news, screener, market overview, market-wide flow scan, portfolio) | Everything above |

### Why broker flow

On the IDX, every trade is reported with the broker code on each side. Aggregated per day, that tells you
*who* was buying — foreign-client brokers, domestic institutions, or retail platforms — not just that the
price moved. This app treats that as its primary signal and everything else as context.

Broker categories are data-driven rather than ownership-based: each broker's foreign-client share is
estimated from IDX's official foreign buy/sell figures, and brokers at or above 50% are classed **Foreign**
(8 of them). **Retail** is the domestic retail platforms (15). The rest are local **Institution**. Net flow
for the Foreign category built this way correlates 0.81 with IDX's official foreign net.

---

## Running it yourself

Requires **Node.js 20.9 or later**.

```bash
git clone https://github.com/<you>/idx-analyst.git
cd idx-analyst
npm install
cp .env.example .env.local   # then fill in the keys, see below
npm run dev                  # http://localhost:3000
```

What you get depends on what you have. Three honest scenarios:

### 1. No keys, no data — the app runs, most of it is empty

Pages load, navigation works, and you can read the code. Charts, fundamentals, news, the screener and the
analyst all need a key. Broker pages need either a key or a local export. Useful for reading the codebase,
not for analysis.

### 2. A Sectors key, no local export — **this is the normal path**

Set `SECTORS_API_KEY`, then set `BROKSUM_LAST_COMPLETE` to a date *before* the period you care about — for
example `2020-01-01`. That variable marks the last day served from the local export; everything after it is
fetched live from Sectors `/v2/broker-summary`. Push it into the past and every day comes from the API.

Charts, fundamentals, news, the screener and the analyst all work. Broker summaries work too, at the cost
of credits: the client fetches in 14-day windows at 1 credit each, so a year of one stock is roughly 26
credits. Watch the counter in the page footer or at `/api/status`.

Sectors requires the [Insider plan](https://sectors.app/pricing) for these endpoints; create a key at
[sectors.app/api](https://sectors.app/api).

### 3. A Sectors key and your own export — full speed

If you have your own IDX broker-summary history, lay it out as the app expects and point `BROKSUM_DIR` at it:

```
<BROKSUM_DIR>/
  parquet/
    broker/month=YYYY-MM/data_0.parquet   date, ticker, code, buy_volume, sell_volume,
                                           buy_value, sell_value, buy_freq, sell_freq,
                                           net_value, net_volume  (+ month partition column)
    daily.parquet                          per stock per day: totals, net, active brokers,
                                           largest net buyer and seller
    baseline.parquet                       per broker per stock: active days, mean and sd of
                                           daily |net|, totals, first and last active day
  meta/
    brokers.csv                            code, name, category (Foreign/Institution/Retail)
    corp-actions.json                      splits, used to adjust volumes and average prices
```

Then `npm run build:db` compiles it into `.data/broksum.duckdb` (a couple of seconds) and queries run in
milliseconds, free. Set `BROKSUM_LAST_COMPLETE` to the last date your export is complete for every stock;
later days fall back to Sectors.

Volumes are in shares (1 lot = 100 shares). Every trade has both a buyer and a seller, so per stock per day
total buy equals total sell across all brokers — a useful integrity check, and the reason "net across all
brokers" is always zero. Net per broker or per category is what carries meaning.

### Environment variables

| Variable | Needed for |
|---|---|
| `SECTORS_API_KEY` | Prices, fundamentals, news, screener, index data, and broker data after `BROKSUM_LAST_COMPLETE`. Requires the Sectors Insider plan. |
| `OPENAI_API_KEY` | The analyst chat. Nothing else uses it. |
| `OPENAI_MODEL` | Default `gpt-5.6-terra`. `gpt-6-astra` is the most capable, `gpt-5.6-luna` the cheapest. |
| `OPENAI_REASONING_EFFORT` | `none` \| `minimal` \| `low` \| `medium` \| `high`. Default `low`; lower is faster and cheaper. |
| `BROKSUM_DIR` | Folder holding the broker summary export (`parquet/`, `meta/`). Default `../broksum-data`. Harmless if it does not exist. |
| `BROKSUM_LAST_COMPLETE` | Last date the export is complete for every stock. Days after it come from Sectors. Set it to a past date if you have no export. |

Restart the dev server after changing `.env.local`. `.env.local` is gitignored and must stay that way —
it holds live billable keys.

---

## How the data fits together

- **Sectors Financial API v2** (`src/lib/sectors/`). v1 was shut down on 2026-05-11; everything here uses
  `/v2`. Every call costs credits, so responses are cached in memory and on disk under `.data/cache/`:
  closed 90-day price blocks for 7 days, the current block for 10 minutes, company report sections for
  12 hours, news for 10 minutes. The footer of every page shows an estimate of today's credit use (also at
  `/api/status`).
- **Local broker summaries** (`src/lib/broksum/`). On first use the app builds `.data/broksum.duckdb` from
  the parquet export, sorted by ticker, with volumes and average prices adjusted for the splits in
  `meta/corp-actions.json`. After refreshing the export, stop the server and run `npm run build:db`.
- **Hybrid broker summary** (`src/lib/brokers.ts`). Days up to `BROKSUM_LAST_COMPLETE` come from DuckDB for
  free; later days come from Sectors in 14-day windows.
- **Analyst** (`src/lib/ai/`). OpenAI Responses API with strict function tools, streamed to the browser as
  NDJSON. Tool rounds chain with `previous_response_id`; tool results are compacted before they reach the
  model.
- **Portfolio** is stored in `.data/portfolio.json`, on your machine only. One position per stock; adding a
  stock you already hold merges at the combined average price.

---

## Scripts

| Command | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run build:db` | Rebuild `.data/broksum.duckdb` from `BROKSUM_DIR` |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |

## Layout

```
src/app/            pages and API routes (api/chat streams the analyst)
src/components/     board (header), stock tabs, charts, portfolio, analyst chat
src/lib/sectors/    Sectors v2 client, endpoints, credit counter
src/lib/broksum/    DuckDB over the local export
src/lib/ai/         analyst tools and tool-calling loop
src/lib/            indicators, broker merge, prices, portfolio, cache, formatting
scripts/            build-broksum-db.mjs
```

Chart colours live in `src/lib/palette.ts`, validated for colour-blind separation and mirrored by the
`@theme` tokens in `src/app/globals.css`. Foreign is blue, Institution violet, Retail orange. Up and down
always pair colour with a sign or an arrow, never colour alone.

---

## Honest limitations

Worth reading before you trust any number on screen.

- **Broker-flow signals are thin.** Cross-sectional flow factors of this kind measure an information
  coefficient in the region of 0.05–0.10. That is a real but small tilt across many names over time, not a
  reason to buy any single stock. Anyone reading a high score as a prediction is misreading it.
- **The flow, trend and valuation reads are heuristics**, not fitted models. They are transparent on
  purpose: each one states the rule that produced it.
- **The local export has known gaps.** 2026-09-11 covers 696 of ~832 stocks; 2025-11-26 is missing 84
  (POLY to SMAR); 2025-12-19 and 2026-02-24 have stocks where total buy ≠ total sell; 2026-03-27 and
  2026-03-30 have zeroed frequency columns.
- **The analyst is a language model.** It reads the tool output above and can still be wrong about it. It
  is a faster way to read the data, not an oracle.
- **There are no automated tests yet.** `npm run typecheck`, `npm run lint` and `npm run build` are the
  current checks.

---

## License

Code is released under the [MIT License](LICENSE).

That covers the code in this repository and nothing else. It does **not** grant any right to the market
data the app consumes. IDX broker summaries, Sectors Financial API responses and OpenAI output are each
governed by their own providers' terms — read them before redistributing data or hosting this app for
other people. Hosting it publicly, in particular, is a different licensing question from running it
yourself, and the answer is not in this file.
