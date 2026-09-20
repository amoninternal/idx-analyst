// Technical indicators on daily candles. Pure functions, used by the chart in
// the browser and by the analyst on the server. Every output series is aligned
// with its input; positions without enough history are null.

import type { Candle } from "./types";

export type Series = (number | null)[];

const blank = (n: number): Series => new Array(n).fill(null);

export function sma(values: number[], period: number): Series {
  const out = blank(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out = blank(values.length);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** EMA of a series that starts with nulls (e.g. the MACD line). */
function emaFromFirstValue(values: Series, period: number): Series {
  const out = blank(values.length);
  const first = values.findIndex((v) => v !== null);
  if (first < 0) return out;
  const tail = ema(values.slice(first).map((v) => v ?? 0), period);
  tail.forEach((v, i) => (out[first + i] = v));
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): Series {
  const out = blank(closes.length);
  if (closes.length <= period) return out;
  const value = (gain: number, loss: number) => (gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = value(gain, loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value(gain, loss);
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line: Series = closes.map((_, i) => (f[i] !== null && s[i] !== null ? f[i]! - s[i]! : null));
  const signal = emaFromFirstValue(line, signalPeriod);
  const hist: Series = line.map((v, i) => (v !== null && signal[i] !== null ? v - signal[i]! : null));
  return { line, signal, hist };
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper = blank(closes.length);
  const lower = blank(closes.length);
  for (let i = period - 1; i < closes.length; i++) {
    const m = mid[i]!;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - m) ** 2;
    const sd = Math.sqrt(v / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function stochastic(candles: Candle[], period = 14, smooth = 3) {
  const k = blank(candles.length);
  for (let i = period - 1; i < candles.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hi = Math.max(hi, candles[j].high);
      lo = Math.min(lo, candles[j].low);
    }
    k[i] = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
  }
  const first = k.findIndex((v) => v !== null);
  const d = blank(candles.length);
  if (first >= 0) sma(k.slice(first) as number[], smooth).forEach((v, i) => (d[first + i] = v));
  return { k, d };
}

/** Wilder's average true range. */
export function atr(candles: Candle[], period = 14): Series {
  const out = blank(candles.length);
  if (candles.length <= period) return out;
  const tr = candles.map((c, i) =>
    i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)),
  );
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** On-balance volume. */
export function obv(candles: Candle[]): number[] {
  let total = 0;
  return candles.map((c, i) => {
    if (i > 0) total += c.close > candles[i - 1].close ? c.volume : c.close < candles[i - 1].close ? -c.volume : 0;
    return total;
  });
}

/** IDX price fractions (tick sizes) by price band. */
export function tickSize(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

export function roundToTick(price: number): number {
  const tick = tickSize(price);
  return Math.round(price / tick) * tick;
}

// --- Snapshot ----------------------------------------------------------------

export type Trend = "Uptrend" | "Downtrend" | "Sideways";

export type TechnicalSnapshot = {
  date: string;
  close: number;
  change: number | null;
  changePct: number | null;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  rsi14: number | null;
  macd: { line: number; signal: number; hist: number } | null;
  bollinger: { upper: number; mid: number; lower: number; percentB: number } | null;
  stochastic: { k: number; d: number | null } | null;
  atr14: number | null;
  volume: number;
  volumeAvg20: number | null;
  volumeRatio: number | null;
  high52w: number | null;
  low52w: number | null;
  returns: { d5: number | null; d20: number | null; d60: number | null; d250: number | null };
  trend: Trend;
  trendReasons: string[];
  pivots: { p: number; r1: number; r2: number; s1: number; s2: number };
  supports: number[];
  resistances: number[];
  observations: string[];
  bars: number;
};

const at = (s: Series, i: number) => (i >= 0 && i < s.length ? s[i] : null);

function pctChange(closes: number[], back: number): number | null {
  const i = closes.length - 1;
  if (i - back < 0) return null;
  const base = closes[i - back];
  return base > 0 ? closes[i] / base - 1 : null;
}

/** Recent swing highs and lows, merged when within 1.5% of each other. */
function swingLevels(candles: Candle[], lookback = 120, wing = 3) {
  const recent = candles.slice(-lookback);
  const highs: number[] = [];
  const lows: number[] = [];
  for (let i = wing; i < recent.length - wing; i++) {
    const window = recent.slice(i - wing, i + wing + 1);
    if (recent[i].high === Math.max(...window.map((c) => c.high))) highs.push(recent[i].high);
    if (recent[i].low === Math.min(...window.map((c) => c.low))) lows.push(recent[i].low);
  }
  const merge = (levels: number[]) =>
    [...levels]
      .sort((a, b) => a - b)
      .reduce<number[]>((acc, lvl) => {
        const last = acc.at(-1);
        if (last !== undefined && Math.abs(lvl - last) / last < 0.015) acc[acc.length - 1] = (last + lvl) / 2;
        else acc.push(lvl);
        return acc;
      }, []);
  return { highs: merge(highs), lows: merge(lows) };
}

export function technicalSnapshot(candles: Candle[]): TechnicalSnapshot | null {
  const n = candles.length;
  if (n < 2) return null;
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const last = candles[n - 1];
  const prev = candles[n - 2];
  const i = n - 1;

  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const e20 = ema(closes, 20);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const bb = bollinger(closes);
  const st = stochastic(candles);
  const a = atr(candles);
  const vAvg = sma(volumes, 20);
  const year = candles.slice(-250);

  const sma20 = at(s20, i);
  const sma50 = at(s50, i);
  const sma200 = at(s200, i);
  const sma50Before = at(s50, i - 10);

  // Trend: price against its 50-day average, the 50 against the 200, and the 50-day slope.
  const reasons: string[] = [];
  let score = 0;
  if (sma50 !== null) {
    const above = last.close > sma50;
    score += above ? 1 : -1;
    reasons.push(`Close ${above ? "above" : "below"} the 50-day average`);
  }
  if (sma50 !== null && sma200 !== null) {
    const golden = sma50 > sma200;
    score += golden ? 1 : -1;
    reasons.push(`50-day average ${golden ? "above" : "below"} the 200-day`);
  } else if (sma20 !== null && sma50 !== null) {
    score += sma20 > sma50 ? 1 : -1;
    reasons.push(`20-day average ${sma20 > sma50 ? "above" : "below"} the 50-day`);
  }
  if (sma50 !== null && sma50Before !== null) {
    const rising = sma50 > sma50Before;
    score += rising ? 1 : -1;
    reasons.push(`50-day average ${rising ? "rising" : "falling"}`);
  }
  const trend: Trend = score >= 2 ? "Uptrend" : score <= -2 ? "Downtrend" : "Sideways";

  const observations: string[] = [];
  const rsiNow = at(r, i);
  if (rsiNow !== null && rsiNow >= 70) observations.push(`RSI ${rsiNow.toFixed(0)}: overbought`);
  if (rsiNow !== null && rsiNow <= 30) observations.push(`RSI ${rsiNow.toFixed(0)}: oversold`);
  for (let k = 0; k < 5; k++) {
    const l0 = at(m.line, i - k);
    const g0 = at(m.signal, i - k);
    const l1 = at(m.line, i - k - 1);
    const g1 = at(m.signal, i - k - 1);
    if (l0 === null || g0 === null || l1 === null || g1 === null) break;
    if (l1 <= g1 && l0 > g0) {
      observations.push(`MACD crossed above its signal line ${k === 0 ? "today" : `${k} bars ago`}`);
      break;
    }
    if (l1 >= g1 && l0 < g0) {
      observations.push(`MACD crossed below its signal line ${k === 0 ? "today" : `${k} bars ago`}`);
      break;
    }
  }
  for (let k = 0; k < 10; k++) {
    const f0 = at(s50, i - k);
    const l0 = at(s200, i - k);
    const f1 = at(s50, i - k - 1);
    const l1 = at(s200, i - k - 1);
    if (f0 === null || l0 === null || f1 === null || l1 === null) break;
    if (f1 <= l1 && f0 > l0) {
      observations.push(`Golden cross: 50-day average moved above the 200-day ${k === 0 ? "today" : `${k} bars ago`}`);
      break;
    }
    if (f1 >= l1 && f0 < l0) {
      observations.push(`Death cross: 50-day average moved below the 200-day ${k === 0 ? "today" : `${k} bars ago`}`);
      break;
    }
  }
  const up = at(bb.upper, i);
  const lo = at(bb.lower, i);
  if (up !== null && last.close > up) observations.push("Close above the upper Bollinger band");
  if (lo !== null && last.close < lo) observations.push("Close below the lower Bollinger band");
  const volumeAvg20 = at(vAvg, i);
  const volumeRatio = volumeAvg20 ? last.volume / volumeAvg20 : null;
  if (volumeRatio !== null && volumeRatio >= 2) observations.push(`Volume ${volumeRatio.toFixed(1)}× its 20-day average`);
  const high52w = year.length ? Math.max(...year.map((c) => c.high)) : null;
  const low52w = year.length ? Math.min(...year.map((c) => c.low)) : null;
  if (high52w && last.close >= high52w * 0.97) observations.push("Within 3% of its 52-week high");
  if (low52w && last.close <= low52w * 1.03) observations.push("Within 3% of its 52-week low");

  // Classic floor pivots from the last session.
  const p = (last.high + last.low + last.close) / 3;
  const pivots = {
    p: roundToTick(p),
    r1: roundToTick(2 * p - last.low),
    r2: roundToTick(p + (last.high - last.low)),
    s1: roundToTick(2 * p - last.high),
    s2: roundToTick(p - (last.high - last.low)),
  };
  const swings = swingLevels(candles);
  const supports = swings.lows.filter((l) => l < last.close).slice(-2).reverse().map(roundToTick);
  const resistances = swings.highs.filter((h) => h > last.close).slice(0, 2).map(roundToTick);

  const bbMid = at(bb.mid, i);
  const macdLine = at(m.line, i);
  const macdSignal = at(m.signal, i);
  const macdHist = at(m.hist, i);
  const stochK = at(st.k, i);

  return {
    date: last.time,
    close: last.close,
    change: last.close - prev.close,
    changePct: prev.close > 0 ? last.close / prev.close - 1 : null,
    sma20,
    sma50,
    sma200,
    ema20: at(e20, i),
    rsi14: rsiNow,
    macd: macdLine !== null && macdSignal !== null && macdHist !== null ? { line: macdLine, signal: macdSignal, hist: macdHist } : null,
    bollinger:
      up !== null && lo !== null && bbMid !== null
        ? { upper: up, mid: bbMid, lower: lo, percentB: up > lo ? (last.close - lo) / (up - lo) : 0.5 }
        : null,
    stochastic: stochK !== null ? { k: stochK, d: at(st.d, i) } : null,
    atr14: at(a, i),
    volume: last.volume,
    volumeAvg20,
    volumeRatio,
    high52w,
    low52w,
    returns: { d5: pctChange(closes, 5), d20: pctChange(closes, 20), d60: pctChange(closes, 60), d250: pctChange(closes, 250) },
    trend,
    trendReasons: reasons,
    pivots,
    supports,
    resistances,
    observations,
    bars: n,
  };
}
