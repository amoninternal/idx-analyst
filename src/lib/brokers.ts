import "server-only";
import * as local from "./broksum/queries";
import { config, hasSectorsKey } from "./config";
import { addDays, apiToday, daysBetween, maxDate, minDate } from "./dates";
import { getBrokerDays, getBrokerRegistry, type RawBrokerDay } from "./sectors/api";
import { describeError, normalizeSymbol } from "./sectors/client";
import {
  BROKER_CATEGORIES,
  type BrokerCategory,
  type BrokerDrilldown,
  type BrokerPeriod,
  type BrokerRow,
  type BrokerSummary,
  type DailyFlow,
  type FlowSignal,
  type SourceSpan,
  type UnusualActivity,
} from "./types";

// Broker summary for one stock, merged from two sources:
//   local   the broksum export (full year, free), through BROKSUM_LAST_COMPLETE
//   sectors /v2/broker-summary for the days after that (1 credit per 14 days)

const PERIOD_DAYS: Record<Exclude<BrokerPeriod, "1D">, number> = { "1W": 7, "1M": 30, "3M": 91, "6M": 182, "1Y": 365 };
// Sectors serves 14 days per call; cap live-only history at 7 calls.
const MAX_LIVE_DAYS = 98;

type Totals = {
  buyValue: number;
  buyVolume: number;
  buyFreq: number;
  sellValue: number;
  sellVolume: number;
  sellFreq: number;
};

const emptyTotals = (): Totals => ({ buyValue: 0, buyVolume: 0, buyFreq: 0, sellValue: 0, sellVolume: 0, sellFreq: 0 });
const emptyNet = (): Record<BrokerCategory, number> => ({ foreign: 0, institution: 0, retail: 0, other: 0 });

type BrokerInfo = { name: string; category: BrokerCategory };

async function brokerDirectory(): Promise<(code: string) => BrokerInfo> {
  const known = await local.localBrokers().catch(() => new Map<string, local.LocalBroker>());
  let registry = new Map<string, BrokerInfo>();
  if (hasSectorsKey()) {
    try {
      registry = new Map(
        (await getBrokerRegistry()).map((b) => [
          b.code,
          {
            name: b.name,
            category: b.isForeign ? "foreign" : b.cohort === "retail" ? "retail" : b.cohort === "unknown" ? "other" : "institution",
          },
        ]),
      );
    } catch {
      // Names fall back to the code; categories to "other".
    }
  }
  return (code) => known.get(code) ?? registry.get(code) ?? { name: code, category: "other" };
}

function liveRowTotals(row: RawBrokerDay["summary"][number]): Totals {
  return {
    buyValue: row.bval ?? 0,
    buyVolume: (row.blot ?? 0) * 100,
    buyFreq: row.bfreq ?? 0,
    sellValue: row.sval ?? 0,
    sellVolume: (row.slot ?? 0) * 100,
    sellFreq: row.sfreq ?? 0,
  };
}

function addInto(target: Totals, t: Totals) {
  target.buyValue += t.buyValue;
  target.buyVolume += t.buyVolume;
  target.buyFreq += t.buyFreq;
  target.sellValue += t.sellValue;
  target.sellVolume += t.sellVolume;
  target.sellFreq += t.sellFreq;
}

export function computeSignal(rows: BrokerRow[], totalValue: number): FlowSignal | null {
  if (totalValue <= 0 || rows.length < 4) return null;
  const buyers = rows.filter((r) => r.netValue > 0).sort((a, b) => b.netValue - a.netValue);
  const sellers = rows.filter((r) => r.netValue < 0).sort((a, b) => a.netValue - b.netValue);
  const top3Buy = buyers.slice(0, 3).reduce((s, r) => s + r.netValue, 0);
  const top3Sell = -sellers.slice(0, 3).reduce((s, r) => s + r.netValue, 0);
  const score = (top3Buy - top3Sell) / totalValue;
  const label =
    score >= 0.1
      ? "Big accumulation"
      : score >= 0.03
        ? "Accumulation"
        : score <= -0.1
          ? "Big distribution"
          : score <= -0.03
            ? "Distribution"
            : "Neutral";
  return { label, score, top3Buy, top3Sell, buyers: buyers.length, sellers: sellers.length };
}

/** The date range a period covers, ending at the latest day any source can serve. */
function periodRange(period: BrokerPeriod): { start: string; end: string } {
  const end = hasSectorsKey() ? apiToday() : config.broksumLastComplete;
  const days = period === "1D" ? 7 : PERIOD_DAYS[period];
  return { start: addDays(end, -(days - 1)), end };
}

type Collected = {
  sym: string;
  start: string;
  end: string;
  info: (code: string) => BrokerInfo;
  perBroker: Map<string, Totals>;
  lastDayNet: Map<string, number>;
  lastDay: string | null;
  daily: DailyFlow[];
  sources: SourceSpan[];
  notes: string[];
  liveDays: RawBrokerDay[];
};

async function collect(symbol: string, period: BrokerPeriod): Promise<Collected> {
  const sym = normalizeSymbol(symbol);
  const { start: rangeStart, end } = periodRange(period);
  const lastComplete = config.broksumLastComplete;
  const info = await brokerDirectory();
  const notes: string[] = [];
  const sources: SourceSpan[] = [];

  // Live part: days after the local export.
  let liveDays: RawBrokerDay[] = [];
  if (end > lastComplete) {
    if (hasSectorsKey()) {
      let liveStart = maxDate(rangeStart, addDays(lastComplete, 1));
      if (daysBetween(liveStart, end) + 1 > MAX_LIVE_DAYS) {
        liveStart = addDays(end, -(MAX_LIVE_DAYS - 1));
        notes.push(`Live broker data is limited to the last ${MAX_LIVE_DAYS} days for this range.`);
      }
      try {
        liveDays = (await getBrokerDays(sym, liveStart, end)).filter((d) => d.summary?.length);
      } catch (err) {
        notes.push(`Live broker data unavailable: ${describeError(err)}`);
      }
    } else {
      notes.push(`Local data ends ${lastComplete}. Add a Sectors API key to include later days.`);
    }
  }

  // For 1D, keep only the most recent trading day across both sources.
  let start = rangeStart;
  if (period === "1D") {
    const lastLive = liveDays.at(-1)?.date;
    if (lastLive) {
      start = lastLive;
      liveDays = liveDays.filter((d) => d.date === lastLive);
    } else {
      const localDays = await local.dailyFlows(sym, rangeStart, minDate(end, lastComplete)).catch(() => []);
      start = localDays.at(-1)?.date ?? end;
    }
  }

  const perBroker = new Map<string, Totals>();
  const daily: DailyFlow[] = [];
  let lastDay: string | null = null;
  const lastDayNet = new Map<string, number>();

  // Local part.
  if (start <= lastComplete) {
    const localEnd = minDate(end, lastComplete);
    try {
      const [totals, days] = await Promise.all([local.brokerTotals(sym, start, localEnd), local.dailyFlows(sym, start, localEnd)]);
      for (const t of totals) {
        const acc = perBroker.get(t.code) ?? emptyTotals();
        addInto(acc, {
          buyValue: t.buy_value,
          buyVolume: t.buy_volume,
          buyFreq: t.buy_freq,
          sellValue: t.sell_value,
          sellVolume: t.sell_volume,
          sellFreq: t.sell_freq,
        });
        perBroker.set(t.code, acc);
      }
      for (const d of days) {
        daily.push({
          date: d.date,
          value: d.value,
          volume: d.volume,
          vwap: d.volume > 0 ? d.value / d.volume : null,
          net: { foreign: d.net_foreign, institution: d.net_institution, retail: d.net_retail, other: d.net_other },
        });
      }
      if (days.length) {
        sources.push({ kind: "local", from: days[0].date, to: days.at(-1)!.date, days: days.length });
        lastDay = days.at(-1)!.date;
      } else if (totals.length === 0) {
        notes.push(`${sym} has no trades in the local data for this range.`);
      }
    } catch (err) {
      notes.push(`Local broker data unavailable: ${describeError(err)}`);
    }
  }

  // Merge the live part.
  for (const day of liveDays) {
    const net = emptyNet();
    let value = 0;
    let volume = 0;
    for (const row of day.summary) {
      const t = liveRowTotals(row);
      const acc = perBroker.get(row.broker_code) ?? emptyTotals();
      addInto(acc, t);
      perBroker.set(row.broker_code, acc);
      net[info(row.broker_code).category] += t.buyValue - t.sellValue;
      value += t.buyValue;
      volume += t.buyVolume;
    }
    daily.push({ date: day.date, value, volume, vwap: volume > 0 ? value / volume : null, net });
    lastDay = day.date;
  }
  if (liveDays.length) {
    sources.push({ kind: "sectors", from: liveDays[0].date, to: liveDays.at(-1)!.date, days: liveDays.length });
  }

  // Net per broker on the last day, for unusual-activity flags.
  if (lastDay) {
    const liveLast = liveDays.find((d) => d.date === lastDay);
    if (liveLast) {
      for (const row of liveLast.summary) lastDayNet.set(row.broker_code, (row.bval ?? 0) - (row.sval ?? 0));
    } else {
      const rows = await local.brokerTotals(sym, lastDay, lastDay).catch(() => []);
      for (const r of rows) lastDayNet.set(r.code, r.buy_value - r.sell_value);
    }
  }

  return { sym, start, end, info, perBroker, lastDayNet, lastDay, daily, sources, notes, liveDays };
}

async function unusualActivity(sym: string, c: Collected): Promise<UnusualActivity[]> {
  if (!c.lastDay || c.lastDayNet.size === 0) return [];
  const stats = await local.baselines(sym).catch(() => []);
  const byCode = new Map(stats.map((s) => [s.code, s]));
  const flagged: UnusualActivity[] = [];
  for (const [code, net] of c.lastDayNet) {
    const s = byCode.get(code);
    if (!s || s.active_days < 20 || !(s.sd_abs_net > 0)) continue;
    const z = (Math.abs(net) - s.mean_abs_net) / s.sd_abs_net;
    if (z >= 3 && Math.abs(net) >= 1e8) {
      const { name, category } = c.info(code);
      flagged.push({ code, name, category, date: c.lastDay, netValue: net, zScore: z, usualAbsNet: s.mean_abs_net });
    }
  }
  return flagged.sort((a, b) => b.zScore - a.zScore).slice(0, 6);
}

export async function getBrokerSummary(symbol: string, period: BrokerPeriod): Promise<BrokerSummary> {
  const c = await collect(symbol, period);
  const rows: BrokerRow[] = [...c.perBroker.entries()].map(([code, t]) => {
    const { name, category } = c.info(code);
    return {
      code,
      name,
      category,
      ...t,
      netValue: t.buyValue - t.sellValue,
      netVolume: t.buyVolume - t.sellVolume,
      buyAvg: t.buyVolume > 0 ? t.buyValue / t.buyVolume : null,
      sellAvg: t.sellVolume > 0 ? t.sellValue / t.sellVolume : null,
    };
  });
  rows.sort((a, b) => b.netValue - a.netValue);

  const totals = rows.reduce(
    (acc, r) => ({ value: acc.value + r.buyValue, volume: acc.volume + r.buyVolume, freq: acc.freq + r.buyFreq }),
    { value: 0, volume: 0, freq: 0 },
  );
  const categories = Object.fromEntries(BROKER_CATEGORIES.map((k) => [k, { buy: 0, sell: 0, net: 0 }])) as BrokerSummary["categories"];
  for (const r of rows) {
    const cat = categories[r.category];
    cat.buy += r.buyValue;
    cat.sell += r.sellValue;
    cat.net += r.netValue;
  }

  c.daily.sort((a, b) => a.date.localeCompare(b.date));
  return {
    symbol: c.sym,
    start: c.daily[0]?.date ?? c.start,
    end: c.daily.at(-1)?.date ?? c.end,
    dates: c.daily.map((d) => d.date),
    sources: c.sources,
    rows,
    totals,
    categories,
    daily: c.daily,
    signal: computeSignal(rows, totals.value),
    unusual: await unusualActivity(c.sym, c),
    notes: c.notes,
  };
}

/** One broker's daily flow in one stock, with its running net position. */
export async function getBrokerDrilldown(symbol: string, code: string, period: BrokerPeriod): Promise<BrokerDrilldown> {
  const c = await collect(symbol, period);
  const brokerCode = code.toUpperCase();
  const { name, category } = c.info(brokerCode);
  const vwapByDate = new Map(c.daily.map((d) => [d.date, d.vwap]));
  c.daily.sort((a, b) => a.date.localeCompare(b.date));

  const rows: { date: string; buyValue: number; buyVolume: number; sellValue: number; sellVolume: number }[] = [];
  const localEnd = minDate(c.end, config.broksumLastComplete);
  if (c.start <= localEnd) {
    const days = await local.brokerDays(c.sym, brokerCode, c.start, localEnd).catch(() => []);
    for (const d of days) {
      rows.push({ date: d.date, buyValue: d.buy_value, buyVolume: d.buy_volume, sellValue: d.sell_value, sellVolume: d.sell_volume });
    }
  }
  for (const day of c.liveDays) {
    const row = day.summary.find((r) => r.broker_code === brokerCode);
    if (!row) continue;
    const t = liveRowTotals(row);
    rows.push({ date: day.date, buyValue: t.buyValue, buyVolume: t.buyVolume, sellValue: t.sellValue, sellVolume: t.sellVolume });
  }
  // One entry per trading day in the range, including days this broker sat out.
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const timeline = c.daily.map(
    (d) => byDate.get(d.date) ?? { date: d.date, buyValue: 0, buyVolume: 0, sellValue: 0, sellVolume: 0 },
  );

  // Average cost of the running net position, applying each day's net flow:
  // net buying adds at that day's buy average; net selling releases shares at
  // the running average cost.
  let position = 0;
  let cost = 0;
  const days = timeline.map((r) => {
    const netVolume = r.buyVolume - r.sellVolume;
    const buyAvg = r.buyVolume > 0 ? r.buyValue / r.buyVolume : null;
    if (netVolume > 0) {
      cost += netVolume * (buyAvg ?? 0);
      position += netVolume;
    } else if (netVolume < 0) {
      if (position > 0) cost -= (cost / position) * Math.min(-netVolume, position);
      position += netVolume;
      if (position <= 0) cost = 0;
    }
    return {
      date: r.date,
      netVolume,
      netValue: r.buyValue - r.sellValue,
      buyAvg,
      sellAvg: r.sellVolume > 0 ? r.sellValue / r.sellVolume : null,
      cumVolume: 0,
      avgCost: position > 0 ? cost / position : null,
      vwap: vwapByDate.get(r.date) ?? null,
    };
  });
  let running = 0;
  for (const d of days) {
    running += d.netVolume;
    d.cumVolume = running;
  }

  return { symbol: c.sym, code: brokerCode, name, category, days };
}

export const flowLeaders = local.categoryLeaders;
