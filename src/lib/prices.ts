import "server-only";
import { dailyFlows } from "./broksum/queries";
import { config, hasSectorsKey } from "./config";
import { addDays } from "./dates";
import { getDailyCandles } from "./sectors/api";
import { describeError, normalizeSymbol, SectorsError } from "./sectors/client";
import type { Candle, CandleSeries } from "./types";

const VWAP_NOTE = "Showing daily average prices (VWAP) from the local broker data. Open, high and low need the Sectors API.";

/** Daily VWAP candles from the local broker export; open, high and low equal the VWAP. */
async function localCandles(symbol: string, days: number): Promise<Candle[]> {
  const end = config.broksumLastComplete;
  const rows = await dailyFlows(symbol, addDays(end, -days), end);
  return rows
    .filter((r) => r.volume > 0)
    .map((r) => {
      const vwap = r.value / r.volume;
      return { time: r.date, open: vwap, high: vwap, low: vwap, close: vwap, volume: r.volume };
    });
}

/**
 * Daily candles for a stock. Uses Sectors OHLCV when a key is set; otherwise, or
 * if Sectors fails, falls back to VWAPs from the local broker data.
 */
export async function getCandles(symbol: string, days: number): Promise<CandleSeries> {
  const sym = normalizeSymbol(symbol);
  let problem: string | null = null;
  if (hasSectorsKey()) {
    try {
      const candles = await getDailyCandles(sym, days);
      if (candles.length) return { symbol: sym, source: "sectors", candles };
      problem = `Sectors returned no prices for ${sym} in this range.`;
    } catch (err) {
      if (err instanceof SectorsError && err.code === "NOT_FOUND") {
        return { symbol: sym, source: "sectors", candles: [], note: `${sym} is not a listed IDX symbol.` };
      }
      problem = describeError(err);
    }
  }
  const candles = await localCandles(sym, days).catch(() => []);
  const note = problem ? `${problem} ${VWAP_NOTE}` : VWAP_NOTE;
  return { symbol: sym, source: "local-vwap", candles, note: candles.length ? note : problem ?? `No price data for ${sym}.` };
}

export type Quote = {
  symbol: string;
  price: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  date: string;
  source: CandleSeries["source"];
};

export async function getQuote(symbol: string): Promise<Quote | null> {
  const series = await getCandles(symbol, 14);
  const last = series.candles.at(-1);
  if (!last) return null;
  const prev = series.candles.at(-2) ?? null;
  return {
    symbol: series.symbol,
    price: last.close,
    prevClose: prev?.close ?? null,
    change: prev ? last.close - prev.close : null,
    changePct: prev && prev.close > 0 ? last.close / prev.close - 1 : null,
    date: last.time,
    source: series.source,
  };
}
