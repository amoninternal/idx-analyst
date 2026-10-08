import "server-only";
import { BadRequest } from "./http";
import { getIndexSeries } from "./sectors/api";
import type { CandleSeries } from "./types";

/** Index codes the app charts. Anything else is refused before a paid call. */
const INDEX_LABELS: Record<string, string> = { ihsg: "IHSG", lq45: "LQ45" };

export function indexCodeFrom(raw: string): string {
  const code = raw.toLowerCase();
  if (!(code in INDEX_LABELS)) throw new BadRequest(`Unknown index "${raw.slice(0, 20)}".`);
  return code;
}

/** An index as a candle series for the chart: closes only, no volume. */
export async function getIndexCandles(code: string, days: number): Promise<CandleSeries> {
  const points = await getIndexSeries(code, days);
  return {
    symbol: INDEX_LABELS[code] ?? code.toUpperCase(),
    source: "index",
    candles: points.map((p) => ({ time: p.time, open: p.value, high: p.value, low: p.value, close: p.value, volume: 0 })),
  };
}
