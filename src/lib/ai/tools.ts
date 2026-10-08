import "server-only";
import type { FunctionDeclaration } from "@google/genai";
import { runWithSignal } from "../abort";
import { flowLeaders, getBrokerSummary } from "../brokers";
import { config } from "../config";
import { hasSectorsKey } from "../keys";
import { addDays } from "../dates";
import { technicalSnapshot } from "../indicators";
import { valuePortfolio } from "../portfolio";
import { getCandles, getQuote } from "../prices";
import {
  getCompanyReport,
  getForeignFlowLeaders,
  getIndexSeries,
  getMostTraded,
  getNews,
  getTopMovers,
  screenCompanies,
} from "../sectors/api";
import { describeError, isValidSymbol, normalizeSymbol } from "../sectors/client";
import type { ReportSection } from "../sectors/types";
import { BROKER_PERIODS, type BrokerCategory, type BrokerPeriod } from "../types";

// Tools the analyst model can call. Results are compact JSON: numbers rounded,
// empty fields dropped, long lists trimmed, so a full stock review stays small.

const FUNDAMENTAL_SECTIONS = ["financials", "dividend", "future", "peers", "management", "ownership"] as const;

const symbolParam = { type: "string", description: "Four-letter IDX ticker, e.g. BBCA." } as const;

/** A Gemini function declaration. Every parameter is required unless listed in `optional`. */
function tool(name: string, description: string, properties: Record<string, unknown>, optional: string[] = []): FunctionDeclaration {
  if (Object.keys(properties).length === 0) return { name, description };
  return {
    name,
    description,
    parametersJsonSchema: {
      type: "object",
      properties,
      required: Object.keys(properties).filter((k) => !optional.includes(k)),
      additionalProperties: false,
    },
  };
}

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  tool(
    "get_stock_overview",
    "Company profile, sector, market cap, index membership, 52-week and all-time price range, and valuation (P/E, P/B, P/S by year with peer averages, forward P/E, intrinsic value), plus the latest close. Start here for any single-stock question. Costs 2 credits.",
    { symbol: symbolParam },
  ),
  tool(
    "get_fundamentals",
    "Deeper fundamentals for one stock. Request only the sections you need: financials (annual revenue, earnings, balance sheet, ratios), dividend (history, yield, payout), future (analyst forecasts and ratings), peers (subsector comparison), management, ownership (major shareholders, insider and institutional flows). Costs 1 credit per section.",
    {
      symbol: symbolParam,
      sections: { type: "array", items: { type: "string", enum: [...FUNDAMENTAL_SECTIONS] } },
    },
  ),
  tool(
    "get_technical_analysis",
    "Daily price history and indicators for one stock: trend call with reasons, moving averages (20/50/200), RSI 14, MACD, Bollinger bands, stochastic, ATR, volume against its average, 52-week range, returns, pivot levels, swing support and resistance, notable signals, and the last 15 daily candles.",
    { symbol: symbolParam, days: { type: "integer", description: "Calendar days of history, 120 to 730. Use 400 for a full view." } },
  ),
  tool(
    "get_broker_flow",
    "Broker summary (bandarmology) for one stock over a period: top net buying and selling brokers with average prices, net flow by broker category (Foreign, Institution, Retail), an accumulation/distribution read, brokers trading far above their usual size on the last day, and recent daily flows.",
    { symbol: symbolParam, period: { type: "string", enum: [...BROKER_PERIODS] } },
  ),
  tool(
    "get_news",
    "Recent news articles with Sectors' sentiment tags (Bullish/Bearish) and summaries. Filter by stock, by keyword in the headline, or neither for market-wide news. Costs 1 credit.",
    {
      symbol: { type: "string", description: "Ticker to filter by. Omit for any stock." },
      keyword: { type: "string", description: "Word to match in headlines. Omit for any headline." },
      limit: { type: "integer", description: "1 to 20." },
    },
    ["symbol", "keyword", "limit"],
  ),
  tool(
    "screen_stocks",
    "Screen all IDX companies with a plain-language query, e.g. 'banks with ROE above 15% and P/E below 10' or 'top 10 coal miners by dividend yield'. Also finds a ticker from a company name. Returns matching symbols with the values used. Costs 3 credits.",
    { query: { type: "string" } },
  ),
  tool(
    "get_market_overview",
    "Market snapshot: IHSG composite index recent closes, top gainers and losers of the day among large caps, the largest net foreign buys and sells, and the most traded stocks. Costs about 8 credits.",
    {},
  ),
  tool(
    "find_flow_leaders",
    "Scan the whole market in the local broker data for stocks where one broker category (foreign, institution or retail) was the largest net buyer or seller over the last N trading days. Uses only the local dataset, which ends on its last complete date. Free.",
    {
      category: { type: "string", enum: ["foreign", "institution", "retail"] },
      side: { type: "string", enum: ["buy", "sell"] },
      days: { type: "integer", description: "Calendar days back from the last local date, 1 to 365." },
      limit: { type: "integer", description: "1 to 20." },
    },
  ),
  tool("get_portfolio", "The user's saved portfolio: positions with lots, average price, latest price, market value, P&L and weight, plus totals.", {}),
];

// --- Result shaping ------------------------------------------------------------

function round(n: number): number {
  const abs = Math.abs(n);
  if (abs >= 1000) return Math.round(n);
  if (abs >= 1) return Math.round(n * 100) / 100;
  return Math.round(n * 10000) / 10000;
}

/** Rounds numbers and drops null, undefined, empty strings and empty arrays/objects. */
function compact(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? round(value) : undefined;
  if (Array.isArray(value)) {
    const items = value.map(compact).filter((v) => v !== undefined);
    return items.length ? items : undefined;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const c = compact(v);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (value === null || value === "") return undefined;
  return value;
}

const lastN = <T>(rows: T[] | undefined, n: number) => (rows ?? []).slice(-n);

function requireSymbol(raw: unknown): string {
  if (typeof raw !== "string" || !isValidSymbol(raw)) throw new Error(`"${String(raw)}" is not a four-letter IDX ticker.`);
  return normalizeSymbol(raw);
}

async function requireSectors() {
  if (!(await hasSectorsKey())) throw new Error("No Sectors API key is connected, so this data is unavailable.");
}

// --- Implementations -------------------------------------------------------------

async function stockOverview(args: { symbol: string }) {
  await requireSectors();
  const symbol = requireSymbol(args.symbol);
  const [report, quote] = await Promise.all([getCompanyReport(symbol, ["overview", "valuation"]), getQuote(symbol)]);
  const o = report.overview ?? {};
  return {
    symbol,
    name: report.company_name,
    quote,
    overview: {
      sector: o.sector,
      sub_sector: o.sub_sector,
      industry: o.industry,
      listing_board: o.listing_board,
      listing_date: o.listing_date,
      market_cap: o.market_cap,
      market_cap_rank: o.market_cap_rank,
      employees: o.employee_num,
      indices: o.indices,
      tags: o.tags,
      affiliates: o.affiliates,
      esg_score: o.esg_score,
      price_extremes: o.all_time_price,
    },
    valuation: {
      forward_pe: report.valuation?.forward_pe,
      intrinsic_value: report.valuation?.intrinsic_value,
      by_year: lastN(
        [...(report.valuation?.historical_valuation ?? [])].sort((a, b) => a.year - b.year),
        4,
      ),
    },
  };
}

const KEY_FINANCIALS = [
  "revenue",
  "gross_profit",
  "operating_pnl",
  "earnings",
  "ebitda",
  "total_assets",
  "total_liabilities",
  "total_equity",
  "total_debt",
  "net_debt",
  "operating_cash_flow",
  "free_cash_flow",
  "net_interest_income",
  "gross_loan",
  "total_deposit",
  "premium_income",
];

async function fundamentals(args: { symbol: string; sections: string[] }) {
  await requireSectors();
  const symbol = requireSymbol(args.symbol);
  const sections = (Array.isArray(args.sections) ? args.sections : []).filter((s): s is (typeof FUNDAMENTAL_SECTIONS)[number] =>
    (FUNDAMENTAL_SECTIONS as readonly string[]).includes(s),
  );
  if (!sections.length) throw new Error("Ask for at least one section.");
  const r = await getCompanyReport(symbol, sections as ReportSection[]);
  const out: Record<string, unknown> = { symbol, name: r.company_name };
  if (r.financials) {
    const fin = r.financials;
    out.financials = {
      eps: fin.eps,
      yoy_quarter_revenue_growth: fin.yoy_quarter_revenue_growth,
      yoy_quarter_earnings_growth: fin.yoy_quarter_earnings_growth,
      annual: lastN(
        [...(fin.historical_financials ?? [])].sort((a, b) => a.year - b.year).map((row) =>
          Object.fromEntries([["year", row.year], ...KEY_FINANCIALS.map((k) => [k, row[k]])]),
        ),
        5,
      ),
      ratios: lastN(
        [...(fin.historical_financial_ratio ?? [])]
          .sort((a, b) => Number(a.year) - Number(b.year))
          .map((row) => ({ year: row.year, ...row.profitability, ...row.leverage, ...row.liquidity, ...row.efficiency, ...row.capital })),
        5,
      ),
    };
  }
  if (r.dividend) {
    const d = r.dividend;
    out.dividend = {
      yield_ttm: d.yield_ttm,
      dividend_ttm: d.dividend_ttm,
      payout_ratio: d.payout_ratio,
      avg_yield: d.dividend_yield_avg,
      last_ex_date: d.last_ex_dividend_date,
      upcoming: d.upcoming_dividends,
      by_year: lastN(
        Object.entries(d.historical_dividends ?? {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([year, v]) => ({ year, total_dividend: v.total_dividend, total_yield: v.total_yield })),
        6,
      ),
    };
  }
  if (r.future) out.future = r.future;
  if (r.peers) {
    out.peers = (r.peers[0]?.peers_data?.companies ?? []).slice(0, 10).map((p) => ({
      symbol: normalizeSymbol(p.symbol),
      name: p.company_name,
      market_cap: p.market_cap,
      pe_ttm: p.pe_ttm,
      pb_mrq: p.pb_mrq,
      revenue: p.total_revenue,
      net_income: p.net_income,
      yearly_mcap_change: p.yearly_mcap_chg,
    }));
  }
  if (r.management) {
    out.management = {
      key_executives: r.management.key_executives?.slice(0, 8),
      executive_holdings: r.management.executives_shareholdings?.slice(0, 8),
    };
  }
  if (r.ownership) {
    out.ownership = {
      major_shareholders: r.ownership.major_shareholders?.slice(0, 10),
      top_transactions: r.ownership.top_transactions,
      institutional_flow: lastN(r.ownership.institutional_transaction_flow, 6),
      whale_investors: r.ownership.whale_investors,
      conglomerate_groups: r.ownership.conglomerates_group,
    };
  }
  return out;
}

async function technicals(args: { symbol: string; days: number }) {
  const symbol = requireSymbol(args.symbol);
  const days = Math.max(60, Math.min(730, Math.round(args.days) || 400));
  const series = await getCandles(symbol, days);
  const snapshot = technicalSnapshot(series.candles);
  if (!snapshot) throw new Error(`No price history for ${symbol}.`);
  if (series.source === "sectors") {
    return { symbol, source: "Sectors daily OHLCV", snapshot, recent_candles: lastN(series.candles, 15) };
  }
  // Daily averages have no real high or low, so range-based readings would be noise.
  const rangeBased = new Set(["stochastic", "atr14", "pivots"]);
  const rest = Object.fromEntries(Object.entries(snapshot).filter(([key]) => !rangeBased.has(key)));
  return {
    symbol,
    source: "Daily VWAP from local broker data (no open/high/low; stochastic, ATR and pivots omitted)",
    note: series.note,
    snapshot: rest,
    recent_days: lastN(series.candles, 15).map((c) => ({ date: c.time, vwap: c.close, volume: c.volume })),
  };
}

async function brokerFlow(args: { symbol: string; period: string }) {
  const symbol = requireSymbol(args.symbol);
  const period = (BROKER_PERIODS as string[]).includes(args.period) ? (args.period as BrokerPeriod) : "1M";
  const s = await getBrokerSummary(symbol, period);
  const pick = (rows: typeof s.rows) =>
    rows.map((r) => ({
      code: r.code,
      name: r.name,
      category: r.category,
      net_value: r.netValue,
      net_lots: r.netVolume / 100,
      avg_buy: r.buyAvg,
      avg_sell: r.sellAvg,
      share_of_value: s.totals.value > 0 ? (r.buyValue + r.sellValue) / (2 * s.totals.value) : null,
    }));
  return {
    symbol,
    period,
    range: { start: s.start, end: s.end, trading_days: s.dates.length },
    sources: s.sources,
    total_value_traded: s.totals.value,
    net_by_category: Object.fromEntries(Object.entries(s.categories).map(([k, v]) => [k, v.net])),
    signal: s.signal,
    top_buyers: pick(s.rows.filter((r) => r.netValue > 0).slice(0, 8)),
    top_sellers: pick(s.rows.filter((r) => r.netValue < 0).reverse().slice(0, 8)),
    unusual_last_day: s.unusual,
    recent_days: lastN(s.daily, 10).map((d) => ({ date: d.date, vwap: d.vwap, value: d.value, ...d.net })),
    notes: s.notes,
  };
}

async function news(args: { symbol: string | null; keyword: string | null; limit: number }) {
  await requireSectors();
  const symbol = args.symbol ? requireSymbol(args.symbol) : null;
  const page = await getNews({
    symbols: symbol ? [symbol] : undefined,
    keyword: args.keyword ?? undefined,
    limit: Math.max(1, Math.min(20, args.limit || 10)),
  });
  return {
    total_matching: page.total,
    articles: page.articles.map((a) => ({
      date: a.publishedAt,
      title: a.title,
      sentiment: a.sentiment,
      tags: a.tags.slice(0, 5),
      symbols: a.symbols.slice(0, 6),
      source: a.source,
      summary: a.summary.length > 360 ? `${a.summary.slice(0, 357)}...` : a.summary,
      url: a.url,
    })),
  };
}

async function screen(args: { query: string }) {
  await requireSectors();
  const result = await screenCompanies(args.query);
  return { ...result, rows: result.rows.slice(0, 25) };
}

async function marketOverview() {
  await requireSectors();
  const settle = async <T>(p: Promise<T>) => {
    try {
      return await p;
    } catch (err) {
      return { error: describeError(err) };
    }
  };
  const [ihsg, movers, buys, sells, traded] = await Promise.all([
    settle(getIndexSeries("ihsg", 14)),
    settle(getTopMovers("1d", 6)),
    settle(getForeignFlowLeaders("buy", 8)),
    settle(getForeignFlowLeaders("sell", 8)),
    settle(getMostTraded(8)),
  ]);
  return { ihsg_recent: Array.isArray(ihsg) ? lastN(ihsg, 6) : ihsg, movers_1d: movers, foreign_net_buys: buys, foreign_net_sells: sells, most_traded: traded };
}

async function leaders(args: { category: string; side: string; days: number; limit: number }) {
  const category = (["foreign", "institution", "retail"].includes(args.category) ? args.category : "foreign") as BrokerCategory;
  const side = args.side === "sell" ? "sell" : "buy";
  const end = config.broksumLastComplete;
  const start = addDays(end, -Math.max(0, Math.min(365, Math.round(args.days) || 7) - 1));
  const rows = await flowLeaders(category, start, end, side, Math.max(1, Math.min(20, args.limit || 10)));
  return {
    category,
    side,
    range: { start, end },
    note: `Local broker data only, which ends on ${end}.`,
    stocks: rows.map((r) => ({
      symbol: r.ticker,
      net_value: r.net,
      value_traded: r.value,
      net_share_of_value: r.value > 0 ? r.net / r.value : null,
      trading_days: r.days,
    })),
  };
}

async function portfolio() {
  const p = await valuePortfolio();
  return {
    as_of: p.asOf,
    totals: p.totals,
    fee_settings_pct: p.settings,
    positions: p.positions.map((v) => ({
      symbol: v.symbol,
      name: v.name,
      sector: v.sector,
      lots: v.lots,
      avg_price: v.avgPrice,
      last_price: v.lastPrice,
      market_value: v.marketValue,
      pnl: v.pnl,
      pnl_pct: v.pnlPct,
      day_change_pct: v.dayChangePct,
      weight: v.weight,
      opened_at: v.openedAt,
      notes: v.notes,
    })),
    warnings: p.warnings,
  };
}

// --- Dispatch --------------------------------------------------------------------

type Handler = (args: never) => Promise<unknown>;

const HANDLERS: Record<string, Handler> = {
  get_stock_overview: stockOverview,
  get_fundamentals: fundamentals,
  get_technical_analysis: technicals,
  get_broker_flow: brokerFlow,
  get_news: news,
  screen_stocks: screen,
  get_market_overview: marketOverview,
  find_flow_leaders: leaders,
  get_portfolio: portfolio,
};

export type ToolResult = { ok: boolean; output: string; summary: string };

export async function runTool(name: string, rawArgs: string, signal?: AbortSignal): Promise<ToolResult> {
  const handler = HANDLERS[name];
  if (!handler) return { ok: false, output: JSON.stringify({ error: `Unknown tool ${name}.` }), summary: "Unknown tool" };
  if (signal?.aborted) return { ok: false, output: JSON.stringify({ error: "Stopped by the user." }), summary: "Stopped" };
  try {
    const args = rawArgs ? JSON.parse(rawArgs) : {};
    const result = compact(await runWithSignal(signal, () => handler(args as never))) ?? {};
    return { ok: true, output: JSON.stringify(result), summary: "Done" };
  } catch (err) {
    const message = describeError(err);
    return { ok: false, output: JSON.stringify({ error: message }), summary: message };
  }
}

/** A short label for the tool-call chip in the chat. */
export function toolLabel(name: string, rawArgs: string): string {
  let a: Record<string, unknown> = {};
  try {
    a = JSON.parse(rawArgs || "{}");
  } catch {
    // Keep the generic label.
  }
  const sym = typeof a.symbol === "string" ? a.symbol.toUpperCase() : "";
  switch (name) {
    case "get_stock_overview":
      return `${sym} overview and valuation`;
    case "get_fundamentals":
      return `${sym} ${Array.isArray(a.sections) ? a.sections.join(", ") : "fundamentals"}`;
    case "get_technical_analysis":
      return `${sym} chart and indicators`;
    case "get_broker_flow":
      return `${sym} broker flow, ${String(a.period ?? "")}`;
    case "get_news":
      return sym ? `News for ${sym}` : a.keyword ? `News about "${String(a.keyword)}"` : "Market news";
    case "screen_stocks":
      return `Screen: ${String(a.query ?? "")}`;
    case "get_market_overview":
      return "Market overview";
    case "find_flow_leaders":
      return `${String(a.category ?? "")} ${a.side === "sell" ? "selling" : "buying"} leaders, ${String(a.days ?? "")} days`;
    case "get_portfolio":
      return "Your portfolio";
    default:
      return name;
  }
}
