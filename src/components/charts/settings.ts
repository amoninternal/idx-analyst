"use client";

import { useCallback, useEffect, useState } from "react";
import type { Interval } from "@/lib/candles";

export type ChartType = "candles" | "hollow" | "bars" | "heikin" | "line" | "area" | "baseline";
export type Scale = "normal" | "log" | "percent";
export type Crosshair = "normal" | "magnet" | "hidden";
export type Grid = "both" | "horz" | "vert" | "none";

export type Overlays = { sma20: boolean; sma50: boolean; sma200: boolean; ema20: boolean; bollinger: boolean; levels: boolean };
export type Panes = { rsi: boolean; macd: boolean; stochastic: boolean };

export type ChartSettings = {
  type: ChartType;
  interval: Interval;
  scale: Scale;
  grid: Grid;
  crosshair: Crosshair;
  volume: boolean;
  priceLine: boolean;
  watermark: boolean;
  overlays: Overlays;
  panes: Panes;
};

export const CHART_TYPES: { value: ChartType; label: string; needsOhlc: boolean }[] = [
  { value: "candles", label: "Candles", needsOhlc: true },
  { value: "hollow", label: "Hollow candles", needsOhlc: true },
  { value: "bars", label: "Bars (OHLC)", needsOhlc: true },
  { value: "heikin", label: "Heikin-Ashi", needsOhlc: true },
  { value: "line", label: "Line", needsOhlc: false },
  { value: "area", label: "Area", needsOhlc: false },
  { value: "baseline", label: "Baseline", needsOhlc: false },
];

// The starting chart: OHLC bars with volume underneath. Every other indicator is opt-in.
export const DEFAULT_SETTINGS: ChartSettings = {
  type: "bars",
  interval: "D",
  scale: "normal",
  grid: "both",
  crosshair: "normal",
  volume: true,
  priceLine: true,
  watermark: true,
  overlays: { sma20: false, sma50: false, sma200: false, ema20: false, bollinger: false, levels: false },
  panes: { rsi: false, macd: false, stochastic: false },
};

// v3: bars and volume became the defaults; older saved settings are left behind once.
const SETTINGS_KEY = "idx.chart.v3";

/** Merges a stored object over the defaults, keeping only known keys with valid values. */
function restore(raw: unknown): ChartSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS;
  const r = raw as Partial<ChartSettings>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
  const bools = <T extends Record<string, boolean>>(v: unknown, d: T): T => {
    const out = { ...d };
    if (v && typeof v === "object")
      for (const k of Object.keys(d))
        if (typeof (v as Record<string, unknown>)[k] === "boolean") (out as Record<string, boolean>)[k] = (v as Record<string, boolean>)[k];
    return out;
  };
  const d = DEFAULT_SETTINGS;
  return {
    type: pick(
      r.type,
      CHART_TYPES.map((t) => t.value),
      d.type,
    ),
    interval: pick(r.interval, ["D", "W", "M"] as const, d.interval),
    scale: pick(r.scale, ["normal", "log", "percent"] as const, d.scale),
    grid: pick(r.grid, ["both", "horz", "vert", "none"] as const, d.grid),
    crosshair: pick(r.crosshair, ["normal", "magnet", "hidden"] as const, d.crosshair),
    volume: typeof r.volume === "boolean" ? r.volume : d.volume,
    priceLine: typeof r.priceLine === "boolean" ? r.priceLine : d.priceLine,
    watermark: typeof r.watermark === "boolean" ? r.watermark : d.watermark,
    overlays: bools(r.overlays, d.overlays),
    panes: bools(r.panes, d.panes),
  };
}

/** Chart settings, remembered in this browser. Falls back to defaults if storage is blocked. */
export function useChartSettings() {
  const [settings, setSettings] = useState<ChartSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount; the server render can't see localStorage
      if (saved) setSettings(restore(JSON.parse(saved)));
    } catch {
      // Private mode or blocked storage: keep the defaults.
    }
  }, []);
  const update = useCallback((patch: Partial<ChartSettings> | ((s: ChartSettings) => Partial<ChartSettings>)) => {
    setSettings((s) => {
      const next = { ...s, ...(typeof patch === "function" ? patch(s) : patch) };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Not remembered, still applied.
      }
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch {
      // Ignore.
    }
  }, []);
  return { settings, update, reset };
}

/** Horizontal price lines drawn on one stock, remembered in this browser. */
export function useHorizontalLines(symbol: string) {
  const key = `idx.hlines.${symbol}`;
  const [lines, setLines] = useState<number[]>([]);
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- per-symbol storage read after mount
      setLines(Array.isArray(raw) ? raw.filter((n): n is number => typeof n === "number" && Number.isFinite(n)).slice(0, 50) : []);
    } catch {
      setLines([]);
    }
  }, [key]);
  const save = useCallback(
    (next: number[]) => {
      setLines(next);
      try {
        if (next.length) localStorage.setItem(key, JSON.stringify(next));
        else localStorage.removeItem(key);
      } catch {
        // Not remembered.
      }
    },
    [key],
  );
  return {
    lines,
    add: useCallback((price: number) => save([...lines.filter((p) => p !== price), price].slice(-50)), [lines, save]),
    clear: useCallback(() => save([]), [save]),
  };
}
