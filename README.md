# IDX Analyst

A research desk for stocks on the Indonesia Stock Exchange: price charts with indicators, broker summaries
(bandarmology), fundamentals, news, a portfolio tracker, and an AI analyst that reads all of it before answering.

Next.js 16 · React 19 · Tailwind v4 · DuckDB · lightweight-charts · Sectors Financial API v2 · Gemini API

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

**Every visitor brings their own API keys.** By default the app asks each visitor for their own Sectors and
Gemini keys on a Connect page and never uses keys from the server's environment, so a public deployment
can't spend its operator's credits. To run it for yourself with your own keys, set `KEY_MODE=server`. See
[Using a public copy](#using-a-public-copy) if you were sent a link, [Hosting a public copy](#hosting-a-public-copy)
to put one online, and [API keys](#api-keys) for how the keys are protected.

**Nothing here is investment advice.** The flow read, trend call and valuation read are rules of thumb,
and the interface says so where they appear. The signals in this app are weak by design and by measurement;
see [Honest limitations](#honest-limitations).

---

## What it does

| Page | What it does | Data |
|---|---|---|
| **Markets** | IHSG on the same chart as the stock page (ranges, 1D/1W/1M, line, area or baseline, indicators, grid, log or percent scale, drawn lines, PNG, full screen), market-wide foreign flow, top movers, most traded, a week of foreign broker buying and selling, latest news | Sectors, local broker data |
| **Stocks** | Every listed stock, sortable and filterable, plus a plain-language screener ("banks with ROE above 15%") | Sectors screener |
| **Stock page** | Four one-line reads (trend, broker flow, valuation, news), then four tabs: | |
| &nbsp;&nbsp;Chart | TradingView-style chart: candles, hollow candles, OHLC bars, Heikin-Ashi, line, area or baseline; daily, weekly or monthly bars; ranges from 1M to 3Y; linear, log or percent scale; grid, crosshair, volume and price-line settings; horizontal lines you draw; save as PNG; full screen. MA 20/50/200, EMA 20, Bollinger, support/resistance; RSI, MACD, stochastic panes; technical summary. Settings are remembered per browser. | Sectors daily OHLCV |
| &nbsp;&nbsp;Broker summary | Net flow by broker category, accumulation/distribution read, top buyers and sellers with average prices, day-by-day category flow, unusual activity, per-broker position and average cost | Local export + Sectors live |
| &nbsp;&nbsp;Fundamentals | Valuation against peers, annual financials and ratios, dividends, analyst ratings and forecasts, peers, ownership, management, quarterly results | Sectors company report |
| &nbsp;&nbsp;News | Articles tagged with the stock, with bullish/bearish tags | Sectors news |
| **Portfolio** | Positions in lots with average price; value, P&L before and after fees, day change, allocation by stock and sector | Your entries + prices |
| **Analyst** | Chat with a Gemini model that calls nine tools (overview, fundamentals, technicals, broker flow, news, screener, market overview, market-wide flow scan, portfolio). Opens beside any page. | Everything above |
| **☰ menu** | Every page, the analyst chat, light/dark/device appearance, and the API keys: what is connected, and (on a public copy) connect, replace or disconnect your own keys | |

### Why broker flow

On the IDX, every trade is reported with the broker code on each side. Aggregated per day, that tells you
*who* was buying — foreign-client brokers, domestic institutions, or retail platforms — not just that the
price moved. This app treats that as its primary signal and everything else as context.

Broker categories are data-driven rather than ownership-based: each broker's foreign-client share is
estimated from IDX's official foreign buy/sell figures, and brokers at or above 50% are classed **Foreign**
(8 of them). **Retail** is the domestic retail platforms (15). The rest are local **Institution**. Net flow
for the Foreign category built this way correlates 0.81 with IDX's official foreign net.

---

## Using a public copy

If someone sent you a link to IDX Analyst, you bring your own API keys. Nobody else's keys are ever used for you,
and yours are never used for anyone else.

1. **Get a Sectors key** (required). Sign up at [sectors.app](https://sectors.app/pricing); the market data
   endpoints need the Insider plan. Create the key at [sectors.app/api](https://sectors.app/api).
2. **Get a Gemini key** (optional, only for the AI analyst). Create one for free in
   [Google AI Studio](https://aistudio.google.com/apikey). For safety, restrict it to the Gemini API there.
3. **Open the link.** It shows *Connect your API keys*. Paste the keys and press **Connect**. The server checks
   them once (1 Sectors credit, and a free lookup at Google) and you're in.
4. **Use the ☰ menu** (top left) to move between Markets, Stocks, News and Portfolio, to chat with the analyst,
   and, under **API keys**, to replace your keys or **Disconnect and forget my keys**.

What happens to your keys: they are encrypted into a cookie that only that server can read and that page scripts
can't touch. It expires after 7 days, or when you disconnect. They are never written to the server's disk, a
database or a log, and never sent to the AI model. Every Sectors credit and Gemini request is billed to your
own account, and the page footer shows an estimate of today's Sectors credits.

What costs credits: on a public copy everything comes live from your Sectors key, including news and broker
summaries. Broker summaries are the expensive part, about 26 credits for a year of one stock (1 credit per
14 days). Answers are cached, so opening the same stock again doesn't charge again.

What you still have to trust: the person running that copy. Their server uses your keys to make requests for
you, so someone who changed the code could misuse them. Only connect keys to a copy you trust, or
[run it yourself](#running-it-yourself). If you think a key leaked, rotate it at Sectors or Google: the old one
stops working at once.

Your portfolio on a public copy belongs to your keys: connect the same Sectors key again and it is still there
(unless the operator changes `SESSION_SECRET`, which starts everyone fresh).
On hosts without a writable disk (Vercel, for example) adding positions is not available.

---

## Hosting a public copy

To put a copy online for other people to use with their own keys:

1. **Don't set `KEY_MODE`.** Visitor keys are the default. Never set `KEY_MODE=server` on a public copy: that
   would let every visitor spend your keys.
2. **Set `SESSION_SECRET`** to a new random value (don't reuse the one from your own machine):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
3. **Don't set `SECTORS_API_KEY` or `GEMINI_API_KEY`.** They are ignored in this mode anyway, so leave them out.
4. **Set `BROKSUM_LAST_COMPLETE` to a past date** such as `2020-01-01` and don't set `BROKSUM_DIR`, so every day
   of broker data comes from each visitor's own Sectors key. If you have a broker-summary export of your own,
   don't serve it from a public copy, even if it is on the same server: an export licensed for personal use
   isn't yours to hand to visitors.
5. **Serve it over HTTPS.** The key cookie is `Secure` in production and browsers won't send it over plain
   HTTP (localhost is the only exception).
6. **Behind your own reverse proxy** (nginx, Caddy), set `TRUST_PROXY_HEADERS=1` so the connect page can tell
   visitors apart for its attempt limit. Vercel needs nothing.

On **Vercel**: import the GitHub repository, add `SESSION_SECRET` and `BROKSUM_LAST_COMPLETE` under
*Settings → Environment Variables*, and deploy. Every push to `main` redeploys. Everything works there except
the portfolio, which needs a writable disk; a small VPS or any host with persistent storage runs all of it with
`npm run build` and `npm start`.

To check visitor mode on your own machine first, comment out `KEY_MODE=server` in `.env.local`, restart, and
open `http://localhost:3000`: you get the Connect page. A private browser window acts as a second visitor.

Before hosting it for others, read [License](#license): the market data has its own terms.

---

## Running it yourself

Requires **Node.js 20.9 or later**.

```bash
git clone https://github.com/amoninternal/idx-analyst.git
cd idx-analyst
npm install
cp .env.example .env.local   # then edit it, see API keys below
npm run dev                  # http://localhost:3000
```

For your own machine the simplest setup is `KEY_MODE=server` with your keys in `.env.local`. Leave
`KEY_MODE` unset to try the visitor flow instead: set `SESSION_SECRET`, open the app, and it sends you to
`/connect`.

What you get depends on what you have. Three honest scenarios:

### 1. No keys, no data — the app runs, most of it is empty

Pages load, navigation works, and you can read the code. Charts, fundamentals, news, the screener and the
analyst all need a key. Broker pages need either a key or a local export. Useful for reading the codebase,
not for analysis.

### 2. A Sectors key, no local export — **this is the normal path**

Connect a Sectors key (or set `SECTORS_API_KEY` with `KEY_MODE=server`), then set `BROKSUM_LAST_COMPLETE` to a date *before* the period you care about — for
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
| `KEY_MODE` | Unset (default): visitors connect their own keys. `server`: use the two keys below. Anything else counts as unset. |
| `SESSION_SECRET` | Required unless `KEY_MODE=server`. 32+ random characters that encrypt visitors' key sessions. Changing it signs everyone out. |
| `TRUST_PROXY_HEADERS` | Optional. `1` when the app runs behind a reverse proxy that sets `X-Real-IP` / `X-Forwarded-For`, so the `/connect` limiter can tell visitors apart. Automatic on Vercel. |
| `SECTORS_API_KEY` | `KEY_MODE=server` only. Prices, fundamentals, news, screener, index data, and broker data after `BROKSUM_LAST_COMPLETE`. Requires the Sectors Insider plan. |
| `GEMINI_API_KEY` | `KEY_MODE=server` only. The analyst chat; nothing else uses it. From [Google AI Studio](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL` | Default `gemini-3.8-flash`. `gemini-3.5-flash-lite` is cheaper, `gemini-3.1-pro-preview` the most capable. |
| `GEMINI_THINKING_LEVEL` | `minimal` \| `low` \| `medium` \| `high`. Default `low`; lower is faster and cheaper. |
| `BROKSUM_DIR` | Folder holding the broker summary export (`parquet/`, `meta/`). Default `../broksum-data`. Harmless if it does not exist. |
| `BROKSUM_LAST_COMPLETE` | Last date the export is complete for every stock. Days after it come from Sectors. Set it to a past date if you have no export. |

Restart the dev server after changing `.env.local`. `.env.local` is gitignored and must stay that way —
it holds live billable keys.

---

## API keys

### Visitor keys (the default)

With `KEY_MODE` unset, every page and API route needs a key session. A visitor without one is sent to
`/connect`, enters a Sectors key (required) and a Gemini key (optional, for the analyst), and the server:

1. checks the format, then checks both keys with the providers: one small Sectors request (1 credit) and a
   free model lookup at Google;
2. encrypts them with AES-256-GCM, using a key derived (HKDF) from `SESSION_SECRET`, into a cookie that is
   `HttpOnly` (page scripts can't read it), `SameSite=Lax`, and in production `Secure` with the `__Host-`
   prefix (HTTPS only, this host only). It expires after 7 days; the expiry is inside the encrypted payload;
3. on every later request, decrypts the cookie and uses those keys for that request only.

The keys are never written to disk, a database or a log, and never sent to the AI model. What each visitor
does is kept apart by an id derived from their key with an HMAC: their own cache entries, their own credit
counter, and their own portfolio file (`.data/portfolios/<id>.json`).

Why there is no way around it: the only code that can hand out a key is `getKeys()` in `src/lib/keys.ts`.
With visitor keys it reads nothing but the requesting visitor's own cookie, and never the environment. The
redirect in `src/proxy.ts` is a convenience on top of that, not the boundary: a request that slipped past it
would still carry no keys, and every paid call would fail before it was sent.

Also in place:

- a per-request nonce Content Security Policy: only this app's scripts run, the page talks only to its own
  server (`connect-src 'self'`), and it can't be framed;
- every API call that changes something (connect, disconnect, chat, portfolio) must come from a page on
  this site, in both key modes, and cross-site requests to the API are refused with visitor keys;
- `/connect` accepts 8 attempts per client per 10 minutes, at most 4 key checks run at once, and once 120
  checks have failed in 10 minutes, clients that failed recently are held back (others still get through),
  so it can't be used to test stolen keys in bulk;
- the redirect after connecting only goes to paths on this site;
- the analyst's answers never load images, so text planted in a news article can't make the model leak
  data through an image URL;
- request bodies have size limits, API responses are `private, no-store`, and the usual hardening headers.

What it can't do, stated plainly:

- **Visitors have to trust whoever runs the server.** The server holds the plaintext keys while it makes
  requests for them; an operator who changes the code could log them. That is true of every app that calls
  an API for you. The Connect page says so, and the safest option is always to run it yourself.
- **A visitor's own device is outside its reach.** Malware or a malicious browser extension on the visitor's
  machine can do anything the visitor can. A cookie copied off a device keeps working until it expires
  (7 days); rotating the keys at Sectors and Google cuts it off at once.
- **The attempt limiter is in memory**, per server instance. Behind several instances, each counts on its
  own. It tells clients apart by `X-Real-IP` / `X-Forwarded-For` only on Vercel or when you set
  `TRUST_PROXY_HEADERS=1` (do that only behind a proxy that overwrites those headers). Otherwise all
  visitors share one per-client budget, which is safe but stricter.
- **The portfolio needs a writable disk.** On serverless hosts such as Vercel the file system is read-only,
  so adding a position reports that it can't be saved. Everything else works there. Portfolio files stay in
  `.data/portfolios/` until you delete them.

### Server keys (`KEY_MODE=server`)

Keys come from `SECTORS_API_KEY` and `GEMINI_API_KEY`, there is no Connect page, and anyone who can reach the
app uses your keys. Use it on your own machine, or behind something that already restricts who can open it.

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
- **Analyst** (`src/lib/ai/`). Gemini API through `@google/genai`, with function declarations for the nine
  tools, streamed to the browser as NDJSON. The API keeps no conversation state, so each tool round resends
  the history, with the model's own turns returned unchanged (thinking models attach thought signatures to
  their function calls). Tool results are compacted before they reach the model.
- **Keys** (`src/lib/keys.ts`, `src/lib/session.ts`, `src/proxy.ts`). See [API keys](#api-keys).
- **Portfolio** is stored in `.data/portfolio.json` with server keys, or one file per visitor with visitor
  keys (`.data/portfolios/`, kept until the operator deletes it). One position per stock; adding a stock you
  already hold merges at the combined average price.

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
src/proxy.ts        security headers (CSP nonce) and the visitor-key gate
src/app/            pages and API routes (api/chat streams the analyst, api/session connects keys)
src/components/     board (header and ☰ menu), stock tabs, charts (one chart workspace for stocks and IHSG),
                    portfolio, analyst chat
src/lib/sectors/    Sectors v2 client, endpoints, credit counter
src/lib/broksum/    DuckDB over the local export
src/lib/ai/         analyst tools and tool-calling loop
src/lib/keys.ts     the only place API keys are read; session.ts encrypts them
src/lib/            indicators, candle resampling, broker merge, prices, portfolio, cache, formatting
scripts/            build-broksum-db.mjs
```

Colours are tokens in `src/app/globals.css`, one set for the light theme (a calm research desk: navy ink
on cool paper) and one for the dark theme (a focused terminal: deep navy, never pure black). Visitors pick
Light, Dark or Device under ☰ → Appearance; the choice is a cookie, so the server renders the right theme
on the first paint. Up and down are a calm green and a brick red rather than neon, so a falling price reads
as information, not an alarm, and they always pair colour with a sign or an arrow. Foreign is blue,
Institution violet, Retail orange, validated for colour-blind separation. Turmeric marks focus and the
analyst, never prices. Canvas charts read the same tokens through `src/lib/palette.ts` and redraw when the
theme changes. Every text colour meets WCAG AA contrast in both themes.

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
data the app consumes. IDX broker summaries, Sectors Financial API responses and Gemini output are each
governed by their own providers' terms — read them before redistributing data or hosting this app for
other people. Hosting it publicly, in particular, is a different licensing question from running it
yourself, and the answer is not in this file.
