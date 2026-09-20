"use client";

import { AreaSeries, LineSeries, LineStyle, type MouseEventParams, type Time } from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtCompact, fmtDate, fmtIdr, fmtPrice } from "@/lib/format";
import { CATEGORY_HEX, P } from "@/lib/palette";
import { CATEGORY_LABEL, type BrokerCategory, type BrokerDrilldown, type DailyFlow } from "@/lib/types";
import { idrFormat, lineData, makeChart, priceFormat } from "./base";

const lotFormat = { type: "custom" as const, formatter: (v: number) => fmtCompact(v), minMove: 1 };

function useHover(times: string[]) {
  const [index, setIndex] = useState<number | null>(null);
  const handler = useMemo(() => {
    const byTime = new Map(times.map((t, i) => [t, i]));
    return (param: MouseEventParams<Time>) => setIndex(param.time ? (byTime.get(String(param.time)) ?? null) : null);
  }, [times]);
  return { index, handler };
}

const FLOW_CATEGORIES: BrokerCategory[] = ["foreign", "institution", "retail"];

/** Price on top; running net value by broker category below. Two panes, one scale each. */
export function CategoryFlowChart({ daily, height = 380 }: { daily: DailyFlow[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const times = useMemo(() => daily.map((d) => d.date), [daily]);
  const cumulative = useMemo(() => {
    const run: Record<BrokerCategory, number> = { foreign: 0, institution: 0, retail: 0, other: 0 };
    return daily.map((d) => {
      for (const c of FLOW_CATEGORIES) run[c] += d.net[c];
      return { ...run };
    });
  }, [daily]);
  const { index, handler } = useHover(times);

  useEffect(() => {
    const el = ref.current;
    if (!el || daily.length === 0) return;
    const chart = makeChart(el);
    const price = chart.addSeries(LineSeries, { color: P.ink, lineWidth: 2, priceLineVisible: false, priceFormat });
    price.setData(lineData(times, daily.map((d) => d.vwap)));
    for (const c of FLOW_CATEGORIES) {
      const s = chart.addSeries(
        LineSeries,
        { color: CATEGORY_HEX[c], lineWidth: 2, priceLineVisible: false, lastValueVisible: true, priceFormat: idrFormat },
        1,
      );
      s.setData(lineData(times, cumulative.map((r) => r[c])));
      if (c === "foreign") s.createPriceLine({ price: 0, color: P.ruleStrong, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
    }
    chart.panes()[0]?.setStretchFactor(1);
    chart.panes()[1]?.setStretchFactor(1.3);
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove(handler);
    return () => {
      chart.unsubscribeCrosshairMove(handler);
      chart.remove();
    };
  }, [daily, times, cumulative, handler]);

  if (daily.length === 0) return null;
  const i = index ?? daily.length - 1;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-t-md border-x border-t border-rule bg-sheet px-3 py-2 text-xs tnum">
        <span className="font-semibold">{fmtDate(daily[i].date)}</span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: P.ink }} />
          <span className="text-ink-3">Avg price</span> {fmtPrice(daily[i].vwap)}
        </span>
        {FLOW_CATEGORIES.map((c) => (
          <span key={c} className="inline-flex items-center gap-1">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: CATEGORY_HEX[c] }} />
            <span className="text-ink-3">{CATEGORY_LABEL[c]} net, running</span> {fmtIdr(cumulative[i][c], { sign: true })}
          </span>
        ))}
      </div>
      <div ref={ref} className="rounded-b-md border border-rule bg-sheet" style={{ height }} />
    </div>
  );
}

/** One broker: its average cost against the market's daily average, and its running net position. */
export function BrokerPositionChart({ drill, height = 340 }: { drill: BrokerDrilldown; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const times = useMemo(() => drill.days.map((d) => d.date), [drill]);
  const { index, handler } = useHover(times);
  const color = CATEGORY_HEX[drill.category];

  useEffect(() => {
    const el = ref.current;
    if (!el || drill.days.length === 0) return;
    const chart = makeChart(el);
    const price = chart.addSeries(LineSeries, { color: P.ink, lineWidth: 2, priceLineVisible: false, priceFormat });
    price.setData(lineData(times, drill.days.map((d) => d.vwap)));
    const cost = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      priceFormat,
    });
    cost.setData(lineData(times, drill.days.map((d) => d.avgCost)));
    const position = chart.addSeries(
      AreaSeries,
      {
        lineColor: color,
        topColor: `${color}26`,
        bottomColor: `${color}08`,
        lineWidth: 2,
        priceLineVisible: false,
        priceFormat: lotFormat,
      },
      1,
    );
    position.setData(lineData(times, drill.days.map((d) => d.cumVolume / 100)));
    position.createPriceLine({ price: 0, color: P.ruleStrong, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove(handler);
    return () => {
      chart.unsubscribeCrosshairMove(handler);
      chart.remove();
    };
  }, [drill, times, color, handler]);

  if (drill.days.length === 0) return null;
  const d = drill.days[index ?? drill.days.length - 1];
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-t-md border-x border-t border-rule bg-sheet px-3 py-2 text-xs tnum">
        <span className="font-semibold">{fmtDate(d.date)}</span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: P.ink }} />
          <span className="text-ink-3">Market avg price</span> {fmtPrice(d.vwap)}
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="h-0.5 w-3 border-t-2 border-dashed" style={{ borderColor: color }} />
          <span className="text-ink-3">{drill.code} avg cost</span> {fmtPrice(d.avgCost)}
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-sm" style={{ background: color }} />
          <span className="text-ink-3">{drill.code} net position</span> {fmtCompact(d.cumVolume / 100, { sign: true })} lots
        </span>
        <span>
          <span className="text-ink-3">That day </span>
          {fmtCompact(d.netVolume / 100, { sign: true })} lots
        </span>
      </div>
      <div ref={ref} className="rounded-b-md border border-rule bg-sheet" style={{ height }} />
    </div>
  );
}

/** Single-series area chart for an index. */
export function IndexChart({ points, height = 220 }: { points: { time: string; value: number }[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || points.length === 0) return;
    const chart = makeChart(el);
    const s = chart.addSeries(AreaSeries, {
      priceFormat: { type: "custom", formatter: (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 }), minMove: 0.01 },
      lineColor: P.ink,
      topColor: "rgba(21, 33, 59, 0.10)",
      bottomColor: "rgba(21, 33, 59, 0.01)",
      lineWidth: 2,
      priceLineVisible: false,
    });
    s.setData(points);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points]);
  return <div ref={ref} className="w-full" style={{ height }} />;
}
