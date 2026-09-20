import "server-only";
import { cached, HOUR } from "../cache";
import type { BrokerCategory } from "../types";
import { query } from "./db";

// Split-adjusted view of one stock's rows. `f` is the product of the split
// ratios after each row's date: dividing volume by it restates old share counts
// in today's shares, and averages computed as value ÷ volume follow suit.
const ADJUSTED = `
  adj AS (
    SELECT b.*,
      coalesce((SELECT exp(sum(ln(s.ratio))) FROM splits s WHERE s.ticker = b.ticker AND s.date > b.date), 1.0) AS f
    FROM broker b
    WHERE b.ticker = $1 AND b.date BETWEEN $2::DATE AND $3::DATE
  )`;

const LOCAL_CATEGORY: Record<string, BrokerCategory> = {
  asing: "foreign",
  institusi: "institution",
  ritel: "retail",
};

export type LocalBroker = { code: string; name: string; category: BrokerCategory };

export async function localBrokers(): Promise<Map<string, LocalBroker>> {
  const rows = await cached("broksum:brokers", HOUR, () =>
    query<{ code: string; name: string; category: string }>(`SELECT code, name, category FROM brokers`),
  );
  return new Map(rows.map((r) => [r.code, { code: r.code, name: r.name, category: LOCAL_CATEGORY[r.category] ?? "other" }]));
}

export type Coverage = { firstDate: string | null; lastDate: string | null; tickers: number };

export async function coverage(): Promise<Coverage> {
  const [row] = await query<{ first_date: string | null; last_date: string | null; tickers: number }>(`
    SELECT strftime(min(date), '%Y-%m-%d') AS first_date,
           strftime(max(date), '%Y-%m-%d') AS last_date,
           count(DISTINCT ticker)::INTEGER AS tickers
    FROM daily`);
  return { firstDate: row?.first_date ?? null, lastDate: row?.last_date ?? null, tickers: row?.tickers ?? 0 };
}

export type LocalBrokerTotals = {
  code: string;
  buy_value: number;
  buy_volume: number;
  buy_freq: number;
  sell_value: number;
  sell_volume: number;
  sell_freq: number;
};

/** Per-broker totals for one stock over [start, end]. */
export function brokerTotals(ticker: string, start: string, end: string) {
  return query<LocalBrokerTotals>(
    `WITH ${ADJUSTED}
     SELECT code,
       sum(buy_value)::DOUBLE AS buy_value, sum(buy_volume / f)::DOUBLE AS buy_volume, sum(buy_freq)::DOUBLE AS buy_freq,
       sum(sell_value)::DOUBLE AS sell_value, sum(sell_volume / f)::DOUBLE AS sell_volume, sum(sell_freq)::DOUBLE AS sell_freq
     FROM adj GROUP BY code`,
    [ticker, start, end],
  );
}

export type LocalDay = {
  date: string;
  value: number;
  volume: number;
  net_foreign: number;
  net_institution: number;
  net_retail: number;
  net_other: number;
};

/** One row per trading day: traded value and volume, and net value by broker category. */
export function dailyFlows(ticker: string, start: string, end: string) {
  return query<LocalDay>(
    `WITH ${ADJUSTED}
     SELECT strftime(a.date, '%Y-%m-%d') AS date,
       sum(a.buy_value)::DOUBLE AS value,
       sum(a.buy_volume / a.f)::DOUBLE AS volume,
       sum(CASE WHEN c.category = 'asing' THEN a.net_value ELSE 0 END)::DOUBLE AS net_foreign,
       sum(CASE WHEN c.category = 'institusi' THEN a.net_value ELSE 0 END)::DOUBLE AS net_institution,
       sum(CASE WHEN c.category = 'ritel' THEN a.net_value ELSE 0 END)::DOUBLE AS net_retail,
       sum(CASE WHEN c.category IS NULL THEN a.net_value ELSE 0 END)::DOUBLE AS net_other
     FROM adj a LEFT JOIN brokers c USING (code)
     GROUP BY a.date ORDER BY a.date`,
    [ticker, start, end],
  );
}

export type LocalBrokerDay = {
  date: string;
  buy_value: number;
  buy_volume: number;
  sell_value: number;
  sell_volume: number;
};

/** One broker's daily activity in one stock. */
export function brokerDays(ticker: string, code: string, start: string, end: string) {
  return query<LocalBrokerDay>(
    `WITH ${ADJUSTED}
     SELECT strftime(date, '%Y-%m-%d') AS date,
       buy_value::DOUBLE AS buy_value, (buy_volume / f)::DOUBLE AS buy_volume,
       sell_value::DOUBLE AS sell_value, (sell_volume / f)::DOUBLE AS sell_volume
     FROM adj WHERE code = $4 ORDER BY date`,
    [ticker, start, end, code],
  );
}

export type Baseline = { code: string; active_days: number; mean_abs_net: number; sd_abs_net: number };

/** Each broker's typical daily |net value| in this stock over the whole export. */
export function baselines(ticker: string) {
  return query<Baseline>(
    `SELECT code, active_days::INTEGER AS active_days, mean_abs_net::DOUBLE AS mean_abs_net, sd_abs_net::DOUBLE AS sd_abs_net
     FROM baseline WHERE ticker = $1`,
    [ticker],
  );
}

export type FlowLeader = { ticker: string; net: number; value: number; days: number };

/** Stocks with the largest net buying (or selling) by one broker category, market-wide. */
export function categoryLeaders(category: BrokerCategory, start: string, end: string, side: "buy" | "sell", limit: number) {
  const local = Object.entries(LOCAL_CATEGORY).find(([, v]) => v === category)?.[0] ?? "asing";
  return query<FlowLeader>(
    `WITH cat AS (
       SELECT b.ticker, sum(b.net_value) AS net, count(DISTINCT b.date) AS days
       FROM broker b JOIN brokers c USING (code)
       WHERE c.category = $1 AND b.date BETWEEN $2::DATE AND $3::DATE
       GROUP BY b.ticker
     ), tot AS (
       SELECT ticker, sum(total_buy) AS value FROM daily WHERE date BETWEEN $2::DATE AND $3::DATE GROUP BY ticker
     )
     SELECT cat.ticker, cat.net::DOUBLE AS net, tot.value::DOUBLE AS value, cat.days::INTEGER AS days
     FROM cat JOIN tot USING (ticker)
     ORDER BY cat.net ${side === "buy" ? "DESC" : "ASC"}
     LIMIT $4`,
    [local, start, end, Math.max(1, Math.min(50, limit))],
  );
}

export type LocalTicker = { ticker: string; vwap: number | null; value30: number };

/** Every stock in the export with its last complete-day VWAP and 30-day traded value. */
export function localTickers(lastComplete: string) {
  return query<LocalTicker>(
    `WITH last AS (
       SELECT ticker, (sum(buy_value) / nullif(sum(buy_volume), 0))::DOUBLE AS vwap
       FROM broker WHERE date = $1::DATE GROUP BY ticker
     ), recent AS (
       SELECT ticker, sum(total_buy)::DOUBLE AS value30
       FROM daily WHERE date > $1::DATE - INTERVAL 30 DAY AND date <= $1::DATE GROUP BY ticker
     )
     SELECT recent.ticker, last.vwap, recent.value30
     FROM recent LEFT JOIN last USING (ticker)
     ORDER BY recent.value30 DESC`,
    [lastComplete],
  );
}
