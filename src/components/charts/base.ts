"use client";

import {
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  type ChartOptions,
  type DeepPartial,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import { fmtIdr, fmtPrice } from "@/lib/format";
import { P } from "@/lib/palette";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(time: Time): { year: number; month: number; day: number } {
  if (typeof time === "string") {
    const [y, m, d] = time.split("-").map(Number);
    return { year: y, month: m, day: d };
  }
  if (typeof time === "number") {
    const dt = new Date(time * 1000);
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
  }
  return time;
}

/** Axis ticks: the year at year starts, the month at month starts, otherwise "2 Apr". */
function tickLabel(time: Time, type: TickMarkType): string {
  const { year, month, day } = parts(time);
  if (type === TickMarkType.Year) return String(year);
  if (type === TickMarkType.Month) return MONTHS[month - 1];
  return `${day} ${MONTHS[month - 1]}`;
}

// Each series formats its own scale. (A chart-wide localization.priceFormatter
// would override these for every pane.)
export const priceFormat = { type: "custom" as const, formatter: (v: number) => fmtPrice(v), minMove: 0.01 };
export const idrFormat = { type: "custom" as const, formatter: (v: number) => fmtIdr(v), minMove: 1 };
export const decimalFormat = (digits: number) => ({
  type: "custom" as const,
  formatter: (v: number) => v.toFixed(digits),
  minMove: 1 / 10 ** digits,
});

/** A chart styled with the app's tokens: hairline grid, ink crosshair, readable date ticks. */
export function makeChart(el: HTMLElement, overrides: DeepPartial<ChartOptions> = {}): IChartApi {
  const fontFamily = getComputedStyle(document.body).fontFamily;
  return createChart(el, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: P.sheet },
      textColor: P.ink3,
      fontFamily,
      fontSize: 11,
      panes: { separatorColor: P.rule, separatorHoverColor: P.grid, enableResize: false },
    },
    grid: { vertLines: { color: P.grid }, horzLines: { color: P.grid } },
    rightPriceScale: { borderColor: P.rule },
    timeScale: {
      borderColor: P.rule,
      rightOffset: 3,
      fixLeftEdge: true,
      lockVisibleTimeRangeOnResize: true,
      tickMarkFormatter: tickLabel,
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: P.ink3, width: 1, style: LineStyle.Solid, labelBackgroundColor: P.ink },
      horzLine: { color: P.ink3, width: 1, style: LineStyle.Solid, labelBackgroundColor: P.ink },
    },
    handleScroll: { vertTouchDrag: false },
    ...overrides,
  });
}

/** lightweight-charts wants ascending, unique times; drop nulls for line data. */
export function lineData(times: string[], values: (number | null)[]) {
  const out: { time: string; value: number }[] = [];
  for (let i = 0; i < times.length; i++) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) out.push({ time: times[i], value: v });
  }
  return out;
}
