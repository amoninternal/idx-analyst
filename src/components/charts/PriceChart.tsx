"use client";

import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  createTextWatermark,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ITextWatermarkPluginApi,
  type LogicalRange,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { heikinAshi, resample } from "@/lib/candles";
import { fmtCompact, fmtDate, fmtDecimal, fmtPrice } from "@/lib/format";
import { bollinger, ema, macd, rsi, sma, stochastic, technicalSnapshot, type Series } from "@/lib/indicators";
import { chartColors, P, resolveColor, withAlpha } from "@/lib/palette";
import { useResolvedTheme } from "../ThemeProvider";
import type { Candle, CandleSeries } from "@/lib/types";
import { decimalFormat, lineData, makeChart, priceFormat } from "./base";
import { CHART_TYPES, type ChartSettings, type Overlays } from "./settings";

export type { Overlays, Panes } from "./settings";

export const OVERLAY_META: { key: Exclude<keyof Overlays, "levels" | "bollinger">; label: string; color: string }[] = [
  { key: "sma20", label: "MA 20", color: P.s1 },
  { key: "sma50", label: "MA 50", color: P.s2 },
  { key: "sma200", label: "MA 200", color: P.s3 },
  { key: "ema20", label: "EMA 20", color: P.s4 },
];

/** What the toolbar can ask of the chart. */
export type ChartHandle = { screenshot: (filename: string) => void; resetView: () => void };

const INTERVAL_LABEL = { D: "1D", W: "1W", M: "1M" } as const;

function useIndicators(candles: Candle[]) {
  return useMemo(() => {
    const closes = candles.map((x) => x.close);
    return {
      times: candles.map((x) => x.time),
      sma20: sma(closes, 20),
      sma50: sma(closes, 50),
      sma200: sma(closes, 200),
      ema20: ema(closes, 20),
      bb: bollinger(closes),
      rsi: rsi(closes),
      macd: macd(closes),
      stoch: stochastic(candles),
      snapshot: technicalSnapshot(candles),
    };
  }, [candles]);
}

const SCALE_MODE = { normal: PriceScaleMode.Normal, log: PriceScaleMode.Logarithmic, percent: PriceScaleMode.Percentage } as const;
const CROSSHAIR_MODE = { normal: CrosshairMode.Normal, magnet: CrosshairMode.Magnet, hidden: CrosshairMode.Hidden } as const;

export function PriceChart({
  series,
  settings,
  visibleFrom,
  rangeNonce,
  hlines,
  drawing,
  onDraw,
  handleRef,
  height = 520,
}: {
  series: CandleSeries;
  settings: ChartSettings;
  /** First date to show; earlier bars stay loaded so long averages are complete. */
  visibleFrom: string | null;
  /** Bumped when the user picks a range, so the same range can be re-applied. */
  rangeNonce: number;
  hlines: number[];
  drawing: boolean;
  onDraw: (price: number) => void;
  handleRef: RefObject<ChartHandle | null>;
  height?: number | string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const viewRef = useRef<{ key: string; range: LogicalRange } | null>(null);
  // The chart's click handler reads these through a ref, so changing them doesn't rebuild the chart.
  const drawRef = useRef({ drawing, onDraw });
  useEffect(() => {
    drawRef.current = { drawing, onDraw };
  }, [drawing, onDraw]);
  const [build, setBuild] = useState(0);
  // Canvas colors are read at build time, so a theme change rebuilds the chart.
  const theme = useResolvedTheme();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const ohlc = series.source === "sectors";
  const hasVolume = useMemo(() => series.candles.some((c) => c.volume > 0), [series]);
  const type = !ohlc && CHART_TYPES.find((t) => t.value === settings.type)?.needsOhlc ? "line" : settings.type;
  const candles = useMemo(() => resample(series.candles, settings.interval), [series, settings.interval]);
  const shown = useMemo(() => (type === "heikin" ? heikinAshi(candles) : candles), [candles, type]);
  // Indicators read the real candles, never the smoothed Heikin-Ashi ones.
  const ind = useIndicators(candles);
  const { overlays, panes } = settings;
  const viewKey = `${settings.interval}|${candles.length}|${candles[0]?.time ?? ""}`;

  // Build the chart. Anything that changes series or panes rebuilds it; cosmetic options
  // are applied by the next effect without a rebuild.
  useEffect(() => {
    const el = ref.current;
    if (!el || shown.length === 0) return;
    const chart = makeChart(el);
    chartRef.current = chart;
    // Canvas needs real values: the current theme's colors.
    const C = chartColors();
    const { times } = ind;

    let main: ISeriesApi<SeriesType>;
    const common = { priceLineVisible: false, priceFormat } as const;
    if (type === "candles" || type === "hollow" || type === "heikin") {
      main = chart.addSeries(CandlestickSeries, {
        ...common,
        upColor: type === "hollow" ? C.sheet : C.upMark,
        borderUpColor: C.upMark,
        wickUpColor: C.upMark,
        downColor: C.downMark,
        borderDownColor: C.downMark,
        wickDownColor: C.downMark,
      });
      main.setData(shown.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    } else if (type === "bars") {
      main = chart.addSeries(BarSeries, { ...common, upColor: C.upMark, downColor: C.downMark, thinBars: false });
      main.setData(shown.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    } else if (type === "area") {
      main = chart.addSeries(AreaSeries, { ...common, lineColor: C.ink, lineWidth: 2, topColor: withAlpha(C.ink, 0.16), bottomColor: withAlpha(C.ink, 0) });
      main.setData(shown.map((c) => ({ time: c.time, value: c.close })));
    } else if (type === "baseline") {
      const from = visibleFrom ?? shown[0].time;
      const base = (shown.find((c) => c.time >= from) ?? shown[0]).close;
      main = chart.addSeries(BaselineSeries, {
        ...common,
        baseValue: { type: "price", price: base },
        topLineColor: C.upMark,
        topFillColor1: withAlpha(C.upMark, 0.18),
        topFillColor2: withAlpha(C.upMark, 0.02),
        bottomLineColor: C.downMark,
        bottomFillColor1: withAlpha(C.downMark, 0.02),
        bottomFillColor2: withAlpha(C.downMark, 0.18),
      });
      main.setData(shown.map((c) => ({ time: c.time, value: c.close })));
    } else {
      main = chart.addSeries(LineSeries, { ...common, color: C.ink, lineWidth: 2 });
      main.setData(shown.map((c) => ({ time: c.time, value: c.close })));
    }
    mainRef.current = main;

    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const upVol = withAlpha(C.upMark, 0.3);
    const downVol = withAlpha(C.downMark, 0.3);
    volume.setData(candles.map((c) => ({ time: c.time, value: c.volume, color: c.close >= c.open ? upVol : downVol })));
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 }, visible: false });
    volumeRef.current = volume;

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
    for (const o of OVERLAY_META) if (overlays[o.key]) line(ind[o.key], resolveColor(o.color, C));
    if (overlays.bollinger) {
      line(ind.bb.upper, C.band, 1);
      line(ind.bb.lower, C.band, 1);
    }
    if (overlays.levels && ind.snapshot) {
      const levels = [
        ...ind.snapshot.supports.map((price, i) => ({ price, title: `S${i + 1}` })),
        ...ind.snapshot.resistances.map((price, i) => ({ price, title: `R${i + 1}` })),
      ];
      for (const lvl of levels) {
        main.createPriceLine({ price: lvl.price, color: C.ink3, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: lvl.title });
      }
    }

    let pane = 0;
    const guide = (s: ReturnType<typeof line>, price: number) =>
      s.createPriceLine({ price, color: C.ruleStrong, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
    if (panes.rsi) {
      pane += 1;
      const r = line(ind.rsi, C.ink2, 2, pane);
      guide(r, 70);
      guide(r, 30);
    }
    if (panes.macd) {
      pane += 1;
      const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: decimalFormat(1) }, pane);
      hist.setData(
        times.flatMap((time, i) => {
          const v = ind.macd.hist[i];
          return v === null ? [] : [{ time, value: v, color: v >= 0 ? withAlpha(C.upMark, 0.45) : withAlpha(C.downMark, 0.45) }];
        }),
      );
      line(ind.macd.line, C.s1, 2, pane);
      line(ind.macd.signal, C.s2, 2, pane);
    }
    if (panes.stochastic && ohlc) {
      pane += 1;
      const k = line(ind.stoch.k, C.s1, 2, pane);
      line(ind.stoch.d, C.s2, 2, pane);
      guide(k, 80);
      guide(k, 20);
    }
    const allPanes = chart.panes();
    allPanes[0]?.setStretchFactor(3.2);
    for (let i = 1; i < allPanes.length; i++) allPanes[i].setStretchFactor(1);

    watermarkRef.current = createTextWatermark(allPanes[0], {
      horzAlign: "center",
      vertAlign: "center",
      lines: [{ text: `${series.symbol} · ${INTERVAL_LABEL[settings.interval]}`, color: C.watermark, fontSize: 44, fontStyle: "bold" }],
    });

    const indexByTime = new Map(times.map((t, i) => [t, i]));
    let frame = 0;
    const onMove = (param: MouseEventParams<Time>) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setHoverIndex(param.time ? (indexByTime.get(String(param.time)) ?? null) : null));
    };
    const onClick = (param: MouseEventParams<Time>) => {
      if (!drawRef.current.drawing || !param.point || (param.paneIndex ?? 0) !== 0) return;
      const price = main.coordinateToPrice(param.point.y);
      if (price !== null && Number.isFinite(price) && price > 0) drawRef.current.onDraw(Math.round(price));
    };
    const onRange = (range: LogicalRange | null) => {
      if (range) viewRef.current = { key: viewKey, range };
    };
    chart.subscribeCrosshairMove(onMove);
    chart.subscribeClick(onClick);

    // Keep the user's zoom across rebuilds (toggling an indicator shouldn't reset it);
    // a new interval or more history starts from the selected range instead.
    const saved = viewRef.current;
    if (saved && saved.key === viewKey) chart.timeScale().setVisibleLogicalRange(saved.range);
    else applyRange(chart, shown, visibleFrom);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    setBuild((b) => b + 1);

    return () => {
      cancelAnimationFrame(frame);
      chart.unsubscribeCrosshairMove(onMove);
      chart.unsubscribeClick(onClick);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      volumeRef.current = null;
      watermarkRef.current = null;
      priceLinesRef.current = [];
    };
    // visibleFrom is read once per build; picking a range is handled by the range effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, candles, ind, type, overlays, panes, ohlc, hasVolume, series.symbol, settings.interval, viewKey, theme]);

  // Cosmetic options, applied in place.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      grid: {
        vertLines: { visible: settings.grid === "both" || settings.grid === "vert" },
        horzLines: { visible: settings.grid === "both" || settings.grid === "horz" },
      },
      crosshair: { mode: CROSSHAIR_MODE[settings.crosshair] },
    });
    // Room for volume bars at the bottom while they are shown.
    mainRef.current
      ?.priceScale()
      .applyOptions({ mode: SCALE_MODE[settings.scale], scaleMargins: { top: 0.06, bottom: settings.volume && hasVolume ? 0.24 : 0.06 } });
    mainRef.current?.applyOptions({ priceLineVisible: settings.priceLine, lastValueVisible: settings.priceLine });
    volumeRef.current?.applyOptions({ visible: settings.volume });
    watermarkRef.current?.applyOptions({ visible: settings.watermark });
  }, [build, settings.grid, settings.crosshair, settings.scale, settings.priceLine, settings.volume, settings.watermark, hasVolume]);

  // Drawn horizontal lines.
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    for (const l of priceLinesRef.current) main.removePriceLine(l);
    const color = chartColors().kunyitDeep;
    priceLinesRef.current = hlines.map((price) =>
      main.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" }),
    );
  }, [build, hlines]);

  // Picking a range moves the window; nothing is refetched or rebuilt.
  useEffect(() => {
    const chart = chartRef.current;
    if (chart) applyRange(chart, shown, visibleFrom);
    // Only a new pick moves the view; data changes are handled when the chart rebuilds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleFrom, rangeNonce]);

  useEffect(() => {
    handleRef.current = {
      screenshot(filename) {
        const canvas = chartRef.current?.takeScreenshot(true, false);
        canvas?.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }, "image/png");
      },
      resetView() {
        const chart = chartRef.current;
        if (!chart) return;
        viewRef.current = null;
        chart.priceScale("right").applyOptions({ autoScale: true });
        applyRange(chart, shown, visibleFrom);
      },
    };
  }, [handleRef, shown, visibleFrom]);

  if (series.candles.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-md border border-rule bg-sheet text-[13px] text-ink-3" style={{ height }}>
        {series.note ?? "No price data for this range."}
      </div>
    );
  }

  const i = Math.min(hoverIndex ?? shown.length - 1, shown.length - 1);
  const bar = shown[i];
  const prev = shown[i - 1];
  const change = prev ? bar.close / prev.close - 1 : null;
  const showOhlc = ohlc && type !== "line" && type !== "area" && type !== "baseline";

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-t-md border-x border-t border-rule bg-sheet px-3 py-2 text-xs tnum">
        <span className="font-semibold text-ink">{fmtDate(bar.time)}</span>
        {settings.interval !== "D" && <span className="text-ink-3">{settings.interval === "W" ? "week of" : "month"}</span>}
        {showOhlc ? (
          <>
            {(["open", "high", "low", "close"] as const).map((k) => (
              <span key={k}>
                <span className="text-ink-3">{k[0].toUpperCase()} </span>
                {fmtPrice(bar[k])}
              </span>
            ))}
          </>
        ) : (
          <span>
            <span className="text-ink-3">{ohlc ? "C " : series.source === "index" ? "Close " : "VWAP "}</span>
            {fmtPrice(bar.close)}
          </span>
        )}
        {change !== null && (
          <span className={change > 0 ? "text-up" : change < 0 ? "text-down" : "text-ink-3"}>
            {change > 0 ? "+" : change < 0 ? "−" : ""}
            {Math.abs(change * 100).toFixed(2)}%
          </span>
        )}
        {hasVolume && settings.volume && (
          <span>
            <span className="text-ink-3">Vol </span>
            {fmtCompact(bar.volume / 100)} lots
          </span>
        )}
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
      <div
        ref={ref}
        className="rounded-b-md border border-rule bg-sheet"
        style={{ height, cursor: drawing ? "crosshair" : undefined }}
        aria-label={`${series.symbol} price chart`}
        role="img"
      />
    </div>
  );
}

/** Shows `from` to the last bar, or everything when `from` is before the data. */
function applyRange(chart: IChartApi, candles: Candle[], from: string | null) {
  const first = candles[0]?.time;
  const last = candles.at(-1)?.time;
  if (!first || !last) return;
  if (from && from > first) chart.timeScale().setVisibleRange({ from: from as Time, to: last as Time });
  else chart.timeScale().fitContent();
}
