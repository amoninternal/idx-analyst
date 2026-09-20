"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { addDays } from "@/lib/dates";
import { swrFetcher } from "@/lib/fetcher";
import { fmtCompact, fmtDate, fmtPrice } from "@/lib/format";
import { technicalSnapshot } from "@/lib/indicators";
import { P } from "@/lib/palette";
import type { CandleSeries } from "@/lib/types";
import { Segmented, Spinner, Toggle } from "../controls";
import { OVERLAY_META, PriceChart, type Overlays, type Panes } from "../charts/PriceChart";
import { Notice } from "../ui";
import { TechnicalSummary } from "./TechnicalSummary";

const RANGES = ["3M", "6M", "1Y", "2Y"] as const;
type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Range, number> = { "3M": 91, "6M": 182, "1Y": 365, "2Y": 730 };

export function ChartPanel({ symbol, initial }: { symbol: string; initial: CandleSeries }) {
  const [range, setRange] = useState<Range>("1Y");
  const [overlays, setOverlays] = useState<Overlays>({ sma20: true, sma50: true, sma200: false, ema20: false, bollinger: false, levels: false });
  const [panes, setPanes] = useState<Panes>({ rsi: true, macd: false, stochastic: false });

  // The page loads ~400 days; two years (plus warm-up for the 200-day average) loads on demand.
  const wantLong = range === "2Y" && initial.source === "sectors";
  const { data: long, isLoading } = useSWR<CandleSeries>(wantLong ? `/api/candles/${symbol}?days=950` : null, swrFetcher, {
    revalidateOnFocus: false,
  });
  const series = wantLong && long ? long : initial;
  const snapshot = useMemo(() => technicalSnapshot(series.candles), [series]);
  const last = series.candles.at(-1)?.time;
  const visibleFrom = last ? addDays(last, -RANGE_DAYS[range]) : null;
  const ohlc = series.source === "sectors";

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Segmented label="Range" options={RANGES} value={range} onChange={setRange} />
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Overlays">
            {OVERLAY_META.map((o) => (
              <Toggle key={o.key} checked={overlays[o.key]} swatch={o.color} onChange={(v) => setOverlays((s) => ({ ...s, [o.key]: v }))}>
                {o.label}
              </Toggle>
            ))}
            <Toggle checked={overlays.bollinger} swatch={P.band} onChange={(v) => setOverlays((s) => ({ ...s, bollinger: v }))}>
              Bollinger
            </Toggle>
            <Toggle checked={overlays.levels} onChange={(v) => setOverlays((s) => ({ ...s, levels: v }))}>
              Support/resistance
            </Toggle>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Indicator panes">
            <Toggle checked={panes.rsi} onChange={(v) => setPanes((s) => ({ ...s, rsi: v }))}>
              RSI
            </Toggle>
            <Toggle checked={panes.macd} onChange={(v) => setPanes((s) => ({ ...s, macd: v }))}>
              MACD
            </Toggle>
            <Toggle checked={panes.stochastic && ohlc} disabled={!ohlc} onChange={(v) => setPanes((s) => ({ ...s, stochastic: v }))}>
              Stochastic
            </Toggle>
          </div>
          {wantLong && isLoading && <Spinner label="Loading two years" />}
        </div>

        {series.note && <Notice>{series.note}</Notice>}

        <PriceChart series={series} overlays={overlays} panes={panes} visibleFrom={visibleFrom} />

        <details className="rounded-md border border-rule bg-sheet">
          <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-ink-2 hover:text-ink">Price table, last 30 sessions</summary>
          <div className="overflow-x-auto border-t border-rule">
            <table className="w-full text-[13px] tnum">
              <thead>
                <tr className="text-left text-ink-3">
                  <th className="px-3 py-2 font-medium">Date</th>
                  {ohlc && <th className="px-3 py-2 text-right font-medium">Open</th>}
                  {ohlc && <th className="px-3 py-2 text-right font-medium">High</th>}
                  {ohlc && <th className="px-3 py-2 text-right font-medium">Low</th>}
                  <th className="px-3 py-2 text-right font-medium">{ohlc ? "Close" : "Average price"}</th>
                  <th className="px-3 py-2 text-right font-medium">Volume (lots)</th>
                </tr>
              </thead>
              <tbody>
                {series.candles
                  .slice(-30)
                  .reverse()
                  .map((c) => (
                    <tr key={c.time} className="border-t border-rule">
                      <td className="px-3 py-1.5">{fmtDate(c.time)}</td>
                      {ohlc && <td className="px-3 py-1.5 text-right">{fmtPrice(c.open)}</td>}
                      {ohlc && <td className="px-3 py-1.5 text-right">{fmtPrice(c.high)}</td>}
                      {ohlc && <td className="px-3 py-1.5 text-right">{fmtPrice(c.low)}</td>}
                      <td className="px-3 py-1.5 text-right">{fmtPrice(c.close)}</td>
                      <td className="px-3 py-1.5 text-right">{fmtCompact(c.volume / 100)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
      <TechnicalSummary snapshot={snapshot} source={series.source} />
    </div>
  );
}
