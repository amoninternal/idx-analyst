import type { Candle } from "./types";

// Pure candle transforms for the chart. No server code, safe in the browser.

export type Interval = "D" | "W" | "M";

/** Monday of the ISO week containing a YYYY-MM-DD date, as YYYY-MM-DD. */
function weekStart(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  const dow = new Date(t).getUTCDay(); // 0 = Sunday
  const back = (dow + 6) % 7;
  return new Date(t - back * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Daily candles into weekly or monthly ones. Each bar is stamped with its first trading
 * day, so times stay real dates and strictly increasing.
 */
export function resample(candles: Candle[], interval: Interval): Candle[] {
  if (interval === "D") return candles;
  const bucketOf = interval === "W" ? weekStart : (d: string) => d.slice(0, 7);
  const out: Candle[] = [];
  let bucket = "";
  for (const c of candles) {
    const b = bucketOf(c.time);
    const last = out.at(-1);
    if (b !== bucket || !last) {
      bucket = b;
      out.push({ ...c });
    } else {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    }
  }
  return out;
}

/** Heikin-Ashi candles: smoothed bars that make trends easier to read. */
export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const prev = out.at(-1);
    const open = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    out.push({ time: c.time, open, high: Math.max(c.high, open, close), low: Math.min(c.low, open, close), close, volume: c.volume });
  }
  return out;
}
