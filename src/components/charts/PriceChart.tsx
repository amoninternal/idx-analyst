"use client";

import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtCompact, fmtDate, fmtDecimal, fmtPrice } from "@/lib/format";
import { bollinger, ema, macd, rsi, sma, stochastic, technicalSnapshot, type Series } from "@/lib/indicators";
import { P } from "@/lib/palette";
import type { CandleSeries } from "@/lib/types";
import { decimalFormat, lineData, makeChart, priceFormat } from "./base";

export type Overlays = { sma20: boolean; sma50: boolean; sma200: boolean; ema20: boolean; bollinger: boolean; levels: boolean };
export type Panes = { rsi: boolean; macd: boolean; stochastic: boolean };

export const OVERLAY_META: { key: Exclude<keyof Overlays, "levels" | "bollinger">; label: string; color: string }[] = [
  { key: "sma20", label: "MA 20", color: P.s1 },
  { key: "sma50", label: "MA 50", color: P.s2 },
  { key: "sma200", label: "MA 200", color: P.s3 },
  { key: "ema20", label: "EMA 20", color: P.s4 },
];

function useIndicators(series: CandleSeries) {
  return useMemo(() => {
    const c = series.candles;
    const closes = c.map((x) => x.close);
    return {
      times: c.map((x) => x.time),
      sma20: sma(closes, 20),
      sma50: sma(closes, 50),
      sma200: sma(closes, 200),
      ema20: ema(closes, 20),
      bb: bollinger(closes),
      rsi: rsi(closes),
      macd: macd(closes),
      stoch: stochastic(c),
      snapshot: technicalSnapshot(c),
    };
  }, [series]);
}

export function PriceChart({
  series,
  overlays,
  panes,
  visibleFrom,
  height = 520,
}: {
  series: CandleSeries;
  overlays: Overlays;
  panes: Panes;
  /** First date to show; earlier bars stay loaded so long averages are complete. */
  visibleFrom: string | null;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const ind = useIndicators(series);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const ohlc = series.source === "sectors";

  useEffect(() => {
    const el = ref.current;
    if (!el || series.candles.length === 0) return;
    const chart = makeChart(el);
    chartRef.current = chart;
    const { times } = ind;

    const main = ohlc
      ? chart.addSeries(CandlestickSeries, {
          upColor: P.sheet,
          borderUpColor: P.upMark,
          wickUpColor: P.upMark,
          downColor: P.downMark,
          borderDownColor: P.downMark,
          wickDownColor: P.downMark,
          priceLineVisible: false,
          priceFormat,
        })
      : chart.addSeries(LineSeries, { color: P.ink, lineWidth: 2, priceLineVisible: false, priceFormat });
    if (ohlc) {
      main.setData(series.candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    } else {
      main.setData(series.candles.map((c) => ({ time: c.time, value: c.close })));
    }
    main.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } });

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      color: P.volume,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.setData(series.candles.map((c) => ({ time: c.time, value: c.volume })));
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false });

    const line = (values: Series, color: string, width: 1 | 2 = 2, pane = 0) => {
      const s = chart.addSeries(
        LineSeries,
        {
          color,
          lineWidth: width,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceFormat: pane === 0 ? priceFormat : decimalFormat(1),
        },
        pane,
      );
      s.setData(lineData(times, values));
      return s;
    };
    for (const o of OVERLAY_META) if (overlays[o.key]) line(ind[o.key], o.color);
    if (overlays.bollinger) {
      line(ind.bb.upper, P.band, 1);
      line(ind.bb.lower, P.band, 1);
    }
    if (overlays.levels && ind.snapshot) {
      const levels = [
        ...ind.snapshot.supports.map((price, i) => ({ price, title: `S${i + 1}` })),
        ...ind.snapshot.resistances.map((price, i) => ({ price, title: `R${i + 1}` })),
      ];
      for (const lvl of levels) {
        main.createPriceLine({ price: lvl.price, color: P.ink3, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: lvl.title });
      }
    }

    let pane = 0;
    const guide = (s: ReturnType<typeof line>, price: number) =>
      s.createPriceLine({ price, color: P.ruleStrong, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
    if (panes.rsi) {
      pane += 1;
      const r = line(ind.rsi, P.ink2, 2, pane);
      guide(r, 70);
      guide(r, 30);
    }
    if (panes.macd) {
      pane += 1;
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: decimalFormat(1) }, pane);
      hist.setData(
        times.flatMap((time, i) => {
          const v = ind.macd.hist[i];
          return v === null ? [] : [{ time, value: v, color: v >= 0 ? P.upWash : P.downWash }];
        }),
      );
      line(ind.macd.line, P.s1, 2, pane);
      line(ind.macd.signal, P.s2, 2, pane);
    }
    if (panes.stochastic && ohlc) {
      pane += 1;
      const k = line(ind.stoch.k, P.s1, 2, pane);
      line(ind.stoch.d, P.s2, 2, pane);
      guide(k, 80);
      guide(k, 20);
    }
    const allPanes = chart.panes();
    allPanes[0]?.setStretchFactor(3.2);
    for (let i = 1; i < allPanes.length; i++) allPanes[i].setStretchFactor(1);

    const indexByTime = new Map(times.map((t, i) => [t, i]));
    let frame = 0;
    const onMove = (param: MouseEventParams<Time>) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setHoverIndex(param.time ? (indexByTime.get(String(param.time)) ?? null) : null));
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      cancelAnimationFrame(frame);
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
    };
  }, [series, ind, overlays, panes, ohlc]);

  // Changing the range only moves the window; nothing is refetched or redrawn.
  useEffect(() => {
    const chart = chartRef.current;
    const last = series.candles.at(-1)?.time;
    if (!chart || !last) return;
    if (visibleFrom && visibleFrom > (series.candles[0]?.time ?? "")) {
      chart.timeScale().setVisibleRange({ from: visibleFrom as Time, to: last as Time });
    } else {
      chart.timeScale().fitContent();
    }
  }, [visibleFrom, series, overlays, panes]);

  if (series.candles.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-rule bg-sheet text-[13px] text-ink-3" style={{ height }}>
        {series.note ?? "No price data for this range."}
      </div>
    );
  }

  const i = hoverIndex ?? series.candles.length - 1;
  const bar = series.candles[i];
  const prev = series.candles[i - 1];
  const change = prev ? bar.close / prev.close - 1 : null;

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-x border-t border-rule bg-sheet px-3 py-2 text-xs tnum rounded-t-md">
        <span className="font-semibold text-ink">{fmtDate(bar.time)}</span>
        {ohlc ? (
          <>
            <span>
              <span className="text-ink-3">O </span>
              {fmtPrice(bar.open)}
            </span>
            <span>
              <span className="text-ink-3">H </span>
              {fmtPrice(bar.high)}
            </span>
            <span>
              <span className="text-ink-3">L </span>
              {fmtPrice(bar.low)}
            </span>
            <span>
              <span className="text-ink-3">C </span>
              {fmtPrice(bar.close)}
            </span>
          </>
        ) : (
          <span>
            <span className="text-ink-3">VWAP </span>
            {fmtPrice(bar.close)}
          </span>
        )}
        {change !== null && (
          <span className={change > 0 ? "text-up" : change < 0 ? "text-down" : "text-ink-3"}>
            {change > 0 ? "+" : change < 0 ? "−" : ""}
            {Math.abs(change * 100).toFixed(2)}%
          </span>
        )}
        <span>
          <span className="text-ink-3">Vol </span>
          {fmtCompact(bar.volume / 100)} lots
        </span>
        {OVERLAY_META.filter((o) => overlays[o.key]).map((o) => (
          <span key={o.key} className="inline-flex items-center gap-1">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: o.color }} />
            <span className="text-ink-3">{o.label}</span> {fmtPrice(ind[o.key][i])}
          </span>
        ))}
        {panes.rsi && (
          <span>
            <span className="text-ink-3">RSI </span>
            {fmtDecimal(ind.rsi[i], 1)}
          </span>
        )}
        {panes.macd && (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: P.s1 }} />
            <span className="text-ink-3">MACD</span> {fmtDecimal(ind.macd.line[i], 1)}
            <span aria-hidden className="ml-1 h-0.5 w-3 rounded-full" style={{ background: P.s2 }} />
            <span className="text-ink-3">Signal</span> {fmtDecimal(ind.macd.signal[i], 1)}
          </span>
        )}
        {panes.stochastic && ohlc && (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: P.s1 }} />
            <span className="text-ink-3">%K</span> {fmtDecimal(ind.stoch.k[i], 1)}
            <span aria-hidden className="ml-1 h-0.5 w-3 rounded-full" style={{ background: P.s2 }} />
            <span className="text-ink-3">%D</span> {fmtDecimal(ind.stoch.d[i], 1)}
          </span>
        )}
      </div>
      <div ref={ref} className="rounded-b-md border border-rule bg-sheet" style={{ height }} />
    </div>
  );
}
