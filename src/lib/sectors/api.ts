import "server-only";
import { cached, DAY, HOUR, MINUTE } from "../cache";
import { addDays, apiToday, daysBetween, minDate, todayJakarta } from "../dates";
import type { Candle, NewsArticle, NewsPage, UniverseEntry } from "../types";
import { normalizeSymbol, SectorsError, sectorsGet } from "./client";
import type {
  CompanyReport,
  ForeignFlowDay,
  ForeignFlowLeader,
  IndexPoint,
  MostTraded,
  Mover,
  QuarterlyFinancials,
  ReportSection,
  ScreenerResult,
  Subsector,
} from "./types";

// ---------------------------------------------------------------------------
// Date-range endpoints are capped at 90 days per call. Ranges are split into
// fixed 90-day blocks anchored to one epoch, so a block that has closed is
// fetched once and reused by every chart range that touches it. Only the block
// containing today is refreshed.

const BLOCK_EPOCH = "2019-01-07";
const BLOCK_DAYS = 90;

function blocksFor(start: string, end: string): { from: string; to: string; current: boolean }[] {
  const first = Math.floor(daysBetween(BLOCK_EPOCH, start) / BLOCK_DAYS);
  const last = Math.floor(daysBetween(BLOCK_EPOCH, end) / BLOCK_DAYS);
  const blocks = [];
  for (let i = first; i <= last; i++) {
    const from = addDays(BLOCK_EPOCH, i * BLOCK_DAYS);
    const blockEnd = addDays(from, BLOCK_DAYS - 1);
    blocks.push({ from, to: minDate(blockEnd, end), current: blockEnd >= end });
  }
  return blocks;
}

const blockTtl = (current: boolean) => (current ? 10 * MINUTE : 7 * DAY);

// --- Prices ---------------------------------------------------------------

type RawDaily = {
  symbol: string;
  date: string;
  close: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number;
  market_cap: number | null;
};

/** Daily OHLCV for the last `days` calendar days, oldest first. Costs 1 credit per uncached 90-day block. */
export async function getDailyCandles(symbol: string, days: number): Promise<Candle[]> {
  const sym = normalizeSymbol(symbol);
  const end = apiToday();
  const start = addDays(end, -days);
  const fetchBlock = (b: { from: string; to: string; current: boolean }) =>
    sectorsGet<RawDaily[]>({
      path: `/v2/daily/${sym}/`,
      params: { start: b.from, end: b.to },
      ttlMs: blockTtl(b.current),
      cost: 1,
    });
  // Newest block first: an unknown symbol 404s once (1 credit) instead of once per block.
  const [latest, ...older] = blocksFor(start, end).reverse();
  const newest = await fetchBlock(latest);
  const blocks = [newest, ...(await Promise.all(older.map(fetchBlock)))];
  const byDate = new Map<string, Candle>();
  for (const row of blocks.flat()) {
    if (!row || typeof row.close !== "number" || row.date < start) continue;
    byDate.set(row.date, {
      time: row.date,
      open: row.open ?? row.close,
      high: row.high ?? Math.max(row.open ?? row.close, row.close),
      low: row.low ?? Math.min(row.open ?? row.close, row.close),
      close: row.close,
      volume: row.volume ?? 0,
    });
  }
  return [...byDate.values()].sort((a, b) => a.time.localeCompare(b.time));
}

type RawIndexDaily = { index_code: string; date: string; price: number };

export const INDEX_CODES = ["ihsg", "lq45", "idx30", "kompas100", "idxhidiv20", "jii70"] as const;

/** Daily index closes (e.g. `ihsg`, `lq45`) for the last `days` calendar days. */
export async function getIndexSeries(code: string, days: number): Promise<IndexPoint[]> {
  const end = apiToday();
  const start = addDays(end, -days);
  const blocks = await Promise.all(
    blocksFor(start, end).map((b) =>
      sectorsGet<RawIndexDaily[]>({
        path: `/v2/index-daily/${code.toLowerCase()}/`,
        params: { start: b.from, end: b.to },
        ttlMs: blockTtl(b.current),
        cost: 1,
      }),
    ),
  );
  const byDate = new Map<string, IndexPoint>();
  for (const row of blocks.flat()) {
    if (row && typeof row.price === "number" && row.date >= start) byDate.set(row.date, { time: row.date, value: row.price });
  }
  return [...byDate.values()].sort((a, b) => a.time.localeCompare(b.time));
}

// --- Company report ---------------------------------------------------------

type RawReport = { symbol?: string; company_name?: string } & Record<string, unknown>;

/**
 * Company report sections, each cached separately for 12 hours. Sectors charges
 * one credit per section either way, so fetching them one by one costs the
 * same and lets the header, the fundamentals tab and the analyst share them.
 */
export async function getCompanyReport(symbol: string, sections: ReportSection[]): Promise<CompanyReport> {
  const sym = normalizeSymbol(symbol);
  const parts = await Promise.all(
    sections.map(async (section) => {
      const raw = await sectorsGet<RawReport>({
        path: `/v2/company/report/${sym}/`,
        params: { sections: section },
        ttlMs: 12 * HOUR,
        cost: 1,
      });
      return { section, raw };
    }),
  );
  const report: CompanyReport = { symbol: sym, company_name: null };
  for (const { section, raw } of parts) {
    report.company_name ??= raw.company_name ?? null;
    if (raw[section] !== undefined) (report as Record<string, unknown>)[section] = raw[section];
  }
  return report;
}

export async function getQuarterlyFinancials(symbol: string, quarters: number): Promise<QuarterlyFinancials[]> {
  const n = Math.max(1, Math.min(8, Math.round(quarters)));
  const rows = await sectorsGet<QuarterlyFinancials[]>({
    path: `/v2/financials/quarterly/${normalizeSymbol(symbol)}/`,
    params: { n_quarters: n },
    ttlMs: DAY,
    cost: n,
  });
  return [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// --- News -------------------------------------------------------------------

type RawArticle = {
  title: string;
  body?: string;
  source: string;
  timestamp: string;
  thumbnail?: string | null;
  sector?: string | null;
  sub_sector?: string[];
  tags?: string[];
  symbols?: string[];
};

type Pagination = { total_count: number; has_next: boolean; next_offset: number | null };

export type NewsQuery = {
  symbols?: string[];
  subSector?: string;
  tags?: string[];
  keyword?: string;
  limit?: number;
  offset?: number;
};

function sentimentOf(tags: string[]): NewsArticle["sentiment"] {
  const lower = tags.map((t) => t.toLowerCase());
  const bull = lower.includes("bullish");
  const bear = lower.includes("bearish");
  if (bull === bear) return null;
  return bull ? "bullish" : "bearish";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function getNews(query: NewsQuery = {}): Promise<NewsPage> {
  const limit = Math.max(1, Math.min(30, query.limit ?? 20));
  const raw = await sectorsGet<{ results: RawArticle[]; pagination: Pagination }>({
    path: "/v2/news/",
    params: {
      symbols: query.symbols?.map(normalizeSymbol).join(","),
      sub_sector: query.subSector,
      tags: query.tags?.join(","),
      keyword: query.keyword,
      limit,
      offset: query.offset ?? 0,
    },
    ttlMs: 10 * MINUTE,
    cost: 1,
  });
  const articles: NewsArticle[] = (raw.results ?? []).map((a) => {
    const tags = a.tags ?? [];
    return {
      title: a.title,
      summary: a.body ?? "",
      url: a.source,
      source: hostOf(a.source),
      publishedAt: a.timestamp,
      thumbnail: a.thumbnail ?? null,
      symbols: (a.symbols ?? []).map(normalizeSymbol),
      tags,
      sector: a.sector ?? null,
      sentiment: sentimentOf(tags),
    };
  });
  return {
    articles,
    total: raw.pagination?.total_count ?? articles.length,
    nextOffset: raw.pagination?.has_next ? raw.pagination.next_offset : null,
  };
}

// --- Brokers ----------------------------------------------------------------

export type RawBrokerRow = {
  broker_code: string;
  bfreq: number;
  blot: number;
  bval: number;
  bavg_per_share: number;
  sfreq: number;
  slot: number;
  sval: number;
  savg_per_share: number;
  nlot: number;
  nval: number;
};

export type RawBrokerDay = { date: string; summary: RawBrokerRow[] };

/** Per-broker daily rows for one stock. Split into the endpoint's 14-day windows; 1 credit each. */
export async function getBrokerDays(symbol: string, start: string, end: string): Promise<RawBrokerDay[]> {
  const sym = normalizeSymbol(symbol);
  const today = todayJakarta();
  const windows: { from: string; to: string }[] = [];
  for (let from = start; from <= end; from = addDays(from, 14)) {
    windows.push({ from, to: minDate(addDays(from, 13), end) });
  }
  const results = await Promise.all(
    windows.map((w) =>
      sectorsGet<{ data: RawBrokerDay[] }>({
        path: `/v2/broker-summary/${sym}/`,
        params: { start: w.from, end: w.to },
        ttlMs: w.to < today ? 7 * DAY : 10 * MINUTE,
        cost: 1,
      }).then((r) => r.data ?? []),
    ),
  );
  return results.flat().sort((a, b) => a.date.localeCompare(b.date));
}

export type RegistryBroker = { code: string; name: string; isForeign: boolean; cohort: string };

export async function getBrokerRegistry(): Promise<RegistryBroker[]> {
  const rows = await sectorsGet<{ code: string; name: string; is_foreign: boolean; cohort: string }[]>({
    path: "/v2/brokers/",
    ttlMs: 7 * DAY,
    cost: 1,
  });
  return rows.map((r) => ({ code: r.code, name: r.name, isForeign: r.is_foreign, cohort: r.cohort }));
}

/** Official net foreign flow for one stock (or `IHSG` for the whole market), up to 90 days. */
export async function getForeignFlow(symbol: string, days: number): Promise<ForeignFlowDay[]> {
  const end = apiToday();
  // Inclusive range: `days` calendar days ending today, capped at the endpoint's 90.
  const start = addDays(end, -(Math.min(90, days) - 1));
  const raw = await sectorsGet<{
    data: { date: string; net_foreign_inflow: number; foreign_buy_idr: number; foreign_sell_idr: number; foreign_share?: number | null }[];
  }>({
    path: `/v2/foreign-flow/${normalizeSymbol(symbol)}/`,
    params: { start, end },
    ttlMs: 30 * MINUTE,
    cost: 1,
  });
  return (raw.data ?? []).map((d) => ({
    date: d.date,
    netForeign: d.net_foreign_inflow,
    foreignBuy: d.foreign_buy_idr,
    foreignSell: d.foreign_sell_idr,
    foreignShare: d.foreign_share ?? null,
  }));
}

/** The day's largest net foreign buys (`buy`) or sells (`sell`) across the market. */
export async function getForeignFlowLeaders(side: "buy" | "sell", limit = 10): Promise<ForeignFlowLeader[]> {
  const raw = await sectorsGet<{
    results: { symbol: string; date: string; net_foreign_inflow: number; foreign_buy_idr: number; foreign_sell_idr: number }[];
  }>({
    path: "/v2/foreign-flow/",
    params: { order_by: side === "buy" ? "-net_foreign_inflow" : "net_foreign_inflow", limit: Math.min(30, limit) },
    ttlMs: 15 * MINUTE,
    cost: 1,
  });
  return (raw.results ?? []).map((r) => ({
    symbol: normalizeSymbol(r.symbol),
    date: r.date,
    netForeign: r.net_foreign_inflow,
    foreignBuy: r.foreign_buy_idr,
    foreignSell: r.foreign_sell_idr,
  }));
}

// --- Rankings ---------------------------------------------------------------

type RawMover = { name: string; symbol: string; price_change: number; last_close_price: number; latest_close_date: string };

export type MoverPeriod = "1d" | "7d" | "14d" | "30d" | "365d";

/** Top gainers and losers for one period (2 credits), large caps by default. */
export async function getTopMovers(period: MoverPeriod = "1d", n = 8, minMcapBillion = 5000) {
  const raw = await sectorsGet<{ top_gainers?: Record<string, RawMover[]>; top_losers?: Record<string, RawMover[]> }>({
    path: "/v2/companies/top-changes/",
    params: {
      classifications: "top_gainers,top_losers",
      periods: period,
      n_stock: Math.min(10, n),
      min_mcap_billion: minMcapBillion,
    },
    ttlMs: 15 * MINUTE,
    cost: 2,
  });
  const map = (rows: RawMover[] | undefined): Mover[] =>
    (rows ?? []).map((r) => ({
      symbol: normalizeSymbol(r.symbol),
      name: r.name,
      change: r.price_change,
      lastPrice: r.last_close_price,
      date: r.latest_close_date,
    }));
  return { gainers: map(raw.top_gainers?.[period]), losers: map(raw.top_losers?.[period]) };
}

/** Most traded stocks by volume on the latest trading day (2 credits). */
export async function getMostTraded(n = 10): Promise<{ date: string | null; rows: MostTraded[] }> {
  const end = apiToday();
  const raw = await sectorsGet<Record<string, { symbol: string; company_name: string; volume: number; price: number }[]>>({
    path: "/v2/most-traded/",
    params: { start: addDays(end, -7), end, n_stock: Math.min(10, n) },
    ttlMs: 15 * MINUTE,
    cost: 2,
  });
  const latest = Object.keys(raw).sort().at(-1) ?? null;
  const rows = latest
    ? raw[latest].map((r) => ({ symbol: normalizeSymbol(r.symbol), name: r.company_name, volume: r.volume, price: r.price }))
    : [];
  return { date: latest, rows };
}

// --- Screener & universe ----------------------------------------------------

type RawScreener = {
  results: { symbol: string; company_name: string; query_values?: Record<string, unknown> | null }[];
  pagination: Pagination;
  llm_translation?: { translated_params?: { where?: string; order_by?: string }; message?: string | null } | null;
};

/** Natural-language screen, e.g. "banks with ROE above 15% and P/E under 10". 3 credits. */
export async function screenCompanies(question: string): Promise<ScreenerResult> {
  const raw = await sectorsGet<RawScreener>({
    path: "/v2/companies/",
    params: { q: question.trim().slice(0, 400), include_query_values: true },
    ttlMs: HOUR,
    cost: 3,
  });
  return {
    rows: (raw.results ?? []).map((r) => ({
      symbol: normalizeSymbol(r.symbol),
      name: r.company_name,
      values: r.query_values ?? {},
    })),
    total: raw.pagination?.total_count ?? raw.results?.length ?? 0,
    translated: raw.llm_translation?.translated_params ?? null,
    message: raw.llm_translation?.message ?? null,
  };
}

// Referencing a field in `where` makes the screener return it in `query_values`.
// The first form asks for the columns the stock list shows; the second is the
// minimal fallback if the parser rejects the first (a 400 costs no credits).
const UNIVERSE_QUERIES = [
  "market_cap > 0 and (sector != '' or sub_sector != '' or last_close_price > 0 or daily_close_change > -1 or pe_ttm > -100000 or pb_mrq > -100000 or roe_ttm > -100000 or yield_ttm >= 0)",
  "market_cap > 0",
];

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

async function fetchUniverse(where: string): Promise<UniverseEntry[]> {
  const entries: UniverseEntry[] = [];
  for (let offset = 0, page = 0; page < 10; page++) {
    const raw = await sectorsGet<RawScreener>({
      path: "/v2/companies/",
      params: { where, order_by: "-market_cap", limit: 200, offset, include_query_values: true },
      ttlMs: DAY,
      cost: 1,
    });
    for (const r of raw.results ?? []) {
      const v = r.query_values ?? {};
      entries.push({
        symbol: normalizeSymbol(r.symbol),
        name: r.company_name ?? null,
        sector: str(v.sector),
        subSector: str(v.sub_sector),
        marketCap: num(v.market_cap),
        lastPrice: num(v.last_close_price),
        change1d: num(v.daily_close_change),
        peTtm: num(v.pe_ttm),
        pbMrq: num(v.pb_mrq),
        roeTtm: num(v.roe_ttm),
        yieldTtm: num(v.yield_ttm),
      });
    }
    if (!raw.pagination?.has_next || raw.pagination.next_offset == null) break;
    offset = raw.pagination.next_offset;
  }
  return entries;
}

/** Every IDX-listed company, largest first. About 5 credits, refreshed daily. */
export async function getSectorsUniverse(): Promise<UniverseEntry[]> {
  return cached("universe:sectors:v2", DAY, async () => {
    let lastError: unknown;
    for (const where of UNIVERSE_QUERIES) {
      try {
        return await fetchUniverse(where);
      } catch (err) {
        lastError = err;
        if (!(err instanceof SectorsError && err.code === "BAD_REQUEST")) throw err;
      }
    }
    throw lastError;
  });
}

// --- Sector taxonomy ----------------------------------------------------------

export async function getSubsectors(): Promise<Subsector[]> {
  const rows = await sectorsGet<{ sector: string; subsector: string }[]>({ path: "/v2/subsectors/", ttlMs: 7 * DAY, cost: 1 });
  return rows.map((r) => ({ sector: r.sector, subSector: r.subsector }));
}
