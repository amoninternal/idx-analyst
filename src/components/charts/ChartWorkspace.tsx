"use client";

import {
  AreaChart,
  BarChart3,
  Camera,
  CandlestickChart,
  ChevronDown,
  Eraser,
  Grid3x3,
  LineChart,
  Maximize2,
  Minimize2,
  Minus,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import useSWR from "swr";
import { addDays } from "@/lib/dates";
import { swrFetcher } from "@/lib/fetcher";
import { P } from "@/lib/palette";
import type { CandleSeries } from "@/lib/types";
import { IconButton, Menu, MenuItem, MenuLabel, Segmented, Spinner } from "../controls";
import { Notice } from "../ui";
import { OVERLAY_META, PriceChart, type ChartHandle } from "./PriceChart";
import { CHART_TYPES, useChartSettings, useHorizontalLines, type ChartType, type Crosshair, type Grid } from "./settings";

export const RANGES = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "3Y", "All"] as const;
export type Range = (typeof RANGES)[number];
const RANGE_DAYS: Record<Exclude<Range, "YTD" | "All">, number> = { "1M": 31, "3M": 92, "6M": 183, "1Y": 365, "2Y": 730, "3Y": 1095 };
// Extra history so long averages are already warmed up at the left edge of the view.
const WARMUP_DAYS = { D: 300, W: 420, M: 700 } as const;
const MAX_DAYS = 1100; // what the history endpoints allow

const TYPE_ICON: Record<ChartType, typeof CandlestickChart> = {
  candles: CandlestickChart,
  hollow: CandlestickChart,
  bars: BarChart3,
  heikin: CandlestickChart,
  line: LineChart,
  area: AreaChart,
  baseline: AreaChart,
};

/**
 * A TradingView-style chart with its toolbar: range, interval, chart type, indicators,
 * grid, scale, crosshair, horizontal lines, screenshot and full screen. Used for stocks
 * (OHLC candles) and indices (closes only).
 */
export function ChartWorkspace({
  id,
  initial,
  initialDays,
  historyUrl,
  height = 520,
  defaultRange = "1Y",
  side,
  below,
}: {
  /** Ticker or index code: names the watermark, the saved lines and the screenshot. */
  id: string;
  initial: CandleSeries;
  /** How many calendar days `initial` covers. */
  initialDays: number;
  /** Where to load longer history, or null when `initial` is all there is. */
  historyUrl: ((days: number) => string) | null;
  height?: number;
  defaultRange?: Range;
  side?: (series: CandleSeries) => ReactNode;
  below?: (series: CandleSeries) => ReactNode;
}) {
  const symbol = id;
  const { settings, update, reset } = useChartSettings();
  const { lines, add, clear } = useHorizontalLines(symbol);
  const [range, setRange] = useState<Range>(defaultRange);
  const [rangeNonce, setRangeNonce] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartHandle | null>(null);

  const ohlc = initial.source === "sectors";
  const lastInitial = initial.candles.at(-1)?.time ?? null;
  const rangeDays =
    range === "All"
      ? MAX_DAYS
      : range === "YTD"
        ? lastInitial
          ? Math.round((Date.parse(lastInitial) - Date.parse(`${lastInitial.slice(0, 4)}-01-01`)) / 86_400_000) + 1
          : 365
        : RANGE_DAYS[range];
  // Load more history only when the view needs it, in two steps so SWR can reuse them.
  const need = Math.min(MAX_DAYS, rangeDays + WARMUP_DAYS[settings.interval]);
  const fetchDays = historyUrl && need > initialDays ? (need <= 760 ? 760 : MAX_DAYS) : null;
  const { data: more, isLoading } = useSWR<CandleSeries>(fetchDays && historyUrl ? historyUrl(fetchDays) : null, swrFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const series = fetchDays && more && more.candles.length > initial.candles.length ? more : initial;
  const last = series.candles.at(-1)?.time;
  const visibleFrom = !last || range === "All" ? null : range === "YTD" ? `${last.slice(0, 4)}-01-01` : addDays(last, -rangeDays);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!drawing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawing(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawing]);

  const pickRange = (r: Range) => {
    setRange(r);
    setRangeNonce((n) => n + 1);
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen().catch(() => undefined);
  };
  const overlayCount = OVERLAY_META.filter((o) => settings.overlays[o.key]).length + Number(settings.overlays.bollinger) + Number(settings.overlays.levels);
  const hasVolume = series.candles.some((c) => c.volume > 0);
  const paneCount = Number(settings.panes.rsi) + Number(settings.panes.macd) + Number(settings.panes.stochastic && ohlc);
  const indicatorCount = Number(settings.volume && hasVolume) + overlayCount + paneCount;
  const typeMeta = CHART_TYPES.find((t) => t.value === settings.type)!;
  const effectiveType = !ohlc && typeMeta.needsOhlc ? "line" : settings.type;
  const TypeIcon = TYPE_ICON[effectiveType];

  return (
    <div className={side ? "grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]" : undefined}>
      <div className="min-w-0 space-y-3">
        <div ref={wrapRef} className={fullscreen ? "flex h-full flex-col gap-2 overflow-auto bg-paper p-3" : "space-y-2"}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2" role="toolbar" aria-label="Chart controls">
            <Segmented label="Range" size="sm" options={RANGES} value={range} onChange={pickRange} />
            <Segmented
              label="Interval"
              size="sm"
              options={[
                { value: "D", label: <span title="Daily candles">1D</span> },
                { value: "W", label: <span title="Weekly candles">1W</span> },
                { value: "M", label: <span title="Monthly candles">1M</span> },
              ]}
              value={settings.interval}
              onChange={(interval) => update({ interval })}
            />

            <Menu
              title="Chart type"
              ariaLabel={`Chart type: ${CHART_TYPES.find((t) => t.value === effectiveType)!.label}`}
              label={
                <>
                  <TypeIcon className="size-3.5" aria-hidden />
                  {CHART_TYPES.find((t) => t.value === effectiveType)!.label}
                  <ChevronDown className="size-3" aria-hidden />
                </>
              }
            >
              {(close) =>
                CHART_TYPES.map((t) => (
                  <MenuItem
                    key={t.value}
                    role="menuitemradio"
                    checked={effectiveType === t.value}
                    disabled={t.needsOhlc && !ohlc}
                    onSelect={() => {
                      update({ type: t.value });
                      close();
                    }}
                  >
                    {t.label}
                    {t.needsOhlc && !ohlc && <span className="text-xs text-ink-3">needs OHLC</span>}
                  </MenuItem>
                ))
              }
            </Menu>

            <Menu
              title="Indicators"
              label={
                <>
                  Indicators
                  {indicatorCount > 0 && <span className="rounded bg-kunyit px-1 text-[11px] font-semibold text-board tnum">{indicatorCount}</span>}
                  <ChevronDown className="size-3" aria-hidden />
                </>
              }
            >
              {() => (
                <>
                  {hasVolume && (
                    <>
                      <MenuLabel>Base</MenuLabel>
                      <MenuItem checked={settings.volume} onSelect={() => update((s) => ({ volume: !s.volume }))}>
                        Volume
                      </MenuItem>
                    </>
                  )}
                  <MenuLabel>On the price</MenuLabel>
                  {OVERLAY_META.map((o) => (
                    <MenuItem
                      key={o.key}
                      checked={settings.overlays[o.key]}
                      swatch={o.color}
                      onSelect={() => update((s) => ({ overlays: { ...s.overlays, [o.key]: !s.overlays[o.key] } }))}
                    >
                      {o.label}
                    </MenuItem>
                  ))}
                  <MenuItem
                    checked={settings.overlays.bollinger}
                    swatch={P.band}
                    onSelect={() => update((s) => ({ overlays: { ...s.overlays, bollinger: !s.overlays.bollinger } }))}
                  >
                    Bollinger bands (20, 2)
                  </MenuItem>
                  <MenuItem checked={settings.overlays.levels} onSelect={() => update((s) => ({ overlays: { ...s.overlays, levels: !s.overlays.levels } }))}>
                    Support and resistance
                  </MenuItem>
                  <MenuLabel>Below the price</MenuLabel>
                  <MenuItem checked={settings.panes.rsi} onSelect={() => update((s) => ({ panes: { ...s.panes, rsi: !s.panes.rsi } }))}>
                    RSI (14)
                  </MenuItem>
                  <MenuItem checked={settings.panes.macd} onSelect={() => update((s) => ({ panes: { ...s.panes, macd: !s.panes.macd } }))}>
                    MACD (12, 26, 9)
                  </MenuItem>
                  <MenuItem
                    checked={settings.panes.stochastic && ohlc}
                    disabled={!ohlc}
                    onSelect={() => update((s) => ({ panes: { ...s.panes, stochastic: !s.panes.stochastic } }))}
                  >
                    Stochastic (14, 3)
                  </MenuItem>
                </>
              )}
            </Menu>

            <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
              <IconButton
                label={settings.grid === "none" ? "Show grid lines" : "Hide grid lines"}
                pressed={settings.grid !== "none"}
                onClick={() => update((s) => ({ grid: s.grid === "none" ? "both" : "none" }))}
              >
                <Grid3x3 className="size-3.5" aria-hidden />
              </IconButton>
              <Segmented
                label="Price scale"
                size="sm"
                options={[
                  { value: "normal", label: <span title="Linear price scale">Auto</span> },
                  { value: "log", label: <span title="Logarithmic price scale">Log</span> },
                  { value: "percent", label: <span title="Percent change from the first visible bar">%</span> },
                ]}
                value={settings.scale}
                onChange={(scale) => update({ scale })}
              />
              <IconButton
                label={drawing ? "Cancel drawing (Esc)" : "Draw a horizontal line: click the chart"}
                pressed={drawing}
                onClick={() => setDrawing((d) => !d)}
              >
                <Minus className="size-3.5" aria-hidden />
              </IconButton>
              {lines.length > 0 && (
                <IconButton label={`Remove ${lines.length} drawn line${lines.length > 1 ? "s" : ""}`} onClick={clear}>
                  <Eraser className="size-3.5" aria-hidden />
                </IconButton>
              )}
              <IconButton label="Reset the view" onClick={() => chartRef.current?.resetView()}>
                <RotateCcw className="size-3.5" aria-hidden />
              </IconButton>
              <IconButton
                label="Save the chart as an image"
                onClick={() => chartRef.current?.screenshot(`${symbol}-${settings.interval}-${last ?? "chart"}.png`)}
              >
                <Camera className="size-3.5" aria-hidden />
              </IconButton>
              <IconButton label={fullscreen ? "Exit full screen (Esc)" : "Full screen"} pressed={fullscreen} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
              </IconButton>
              <Menu
                align="right"
                title="Chart settings"
                label={
                  <>
                    <Settings2 className="size-3.5" aria-hidden />
                    <span className="sr-only">Chart settings</span>
                  </>
                }
              >
                {() => (
                  <>
                    <MenuLabel>Grid lines</MenuLabel>
                    {(
                      [
                        ["both", "Both"],
                        ["horz", "Horizontal only"],
                        ["vert", "Vertical only"],
                        ["none", "None"],
                      ] as [Grid, string][]
                    ).map(([g, label]) => (
                      <MenuItem key={g} role="menuitemradio" checked={settings.grid === g} onSelect={() => update({ grid: g })}>
                        {label}
                      </MenuItem>
                    ))}
                    <MenuLabel>Crosshair</MenuLabel>
                    {(
                      [
                        ["normal", "Free"],
                        ["magnet", "Magnet (snaps to close)"],
                        ["hidden", "Hidden"],
                      ] as [Crosshair, string][]
                    ).map(([c, label]) => (
                      <MenuItem key={c} role="menuitemradio" checked={settings.crosshair === c} onSelect={() => update({ crosshair: c })}>
                        {label}
                      </MenuItem>
                    ))}
                    <MenuLabel>Show</MenuLabel>
                    <MenuItem checked={settings.priceLine} onSelect={() => update((s) => ({ priceLine: !s.priceLine }))}>
                      Last price line
                    </MenuItem>
                    <MenuItem checked={settings.watermark} onSelect={() => update((s) => ({ watermark: !s.watermark }))}>
                      Symbol watermark
                    </MenuItem>
                    <div className="mt-1 border-t border-rule pt-1">
                      <MenuItem role="menuitem" onSelect={reset}>
                        Restore default settings
                      </MenuItem>
                    </div>
                  </>
                )}
              </Menu>
            </div>
          </div>

          {drawing && <p className="text-xs text-ink-3">Click the price chart to place a horizontal line. Esc to cancel.</p>}
          {fetchDays && isLoading && <Spinner label={`Loading ${fetchDays >= MAX_DAYS ? "three years" : "two years"} of prices`} />}
          {series.note && <Notice>{series.note}</Notice>}

          <PriceChart
            series={series}
            settings={settings}
            visibleFrom={visibleFrom}
            rangeNonce={rangeNonce}
            hlines={lines}
            drawing={drawing}
            onDraw={(price) => {
              add(price);
              setDrawing(false);
            }}
            handleRef={chartRef}
            height={fullscreen ? "calc(100dvh - 120px)" : height}
          />
        </div>

        {below?.(series)}
      </div>
      {side?.(series)}
    </div>
  );
}
