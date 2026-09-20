"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { P } from "@/lib/palette";

// Small SVG/HTML charts for fundamentals and the portfolio. Marks follow the
// app's chart rules: bars at most 24px thick with 4px rounded ends, hairline
// grid, a legend for two or more series, and a tooltip on hover and focus.

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag;
  const ticks: number[] = [];
  for (let t = Math.floor(min / step) * step; t <= max + step * 0.001; t += step) ticks.push(Math.abs(t) < step / 1e6 ? 0 : t);
  return ticks;
}

/** A bar path with a rounded data end and a square baseline end. */
function barPath(x: number, w: number, y0: number, y1: number) {
  const top = Math.min(y0, y1);
  const h = Math.abs(y1 - y0);
  const r = Math.min(4, w / 2, h);
  if (y1 <= y0) {
    return `M${x},${y0} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${y0} Z`;
  }
  const bottom = top + h;
  return `M${x},${y0} V${bottom - r} Q${x},${bottom} ${x + r},${bottom} H${x + w - r} Q${x + w},${bottom} ${x + w},${bottom - r} V${y0} Z`;
}

export type ColumnSeries = { key: string; label: string; color: string; values: (number | null)[] };

export function LegendRow({ items }: { items: { label: string; color: string; shape?: "rect" | "line" }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={it.shape === "line" ? "h-0.5 w-3 rounded-full" : "size-2.5 rounded-[2px]"} style={{ background: it.color }} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

export function ColumnChart({
  categories,
  series,
  format,
  height = 220,
  caption,
}: {
  categories: string[];
  series: ColumnSeries[];
  format: (n: number) => string;
  height?: number;
  caption: string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const values = series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v)));
  if (!categories.length || !values.length) return null;

  const left = 64;
  const right = 8;
  const top = 8;
  const bottom = 24;
  const plotW = Math.max(0, width - left - right);
  const plotH = height - top - bottom;
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const lo = Math.min(...ticks);
  const hi = Math.max(...ticks);
  const y = (v: number) => top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const band = plotW / categories.length;
  const barW = Math.max(3, Math.min(24, (band * 0.64 - (series.length - 1) * 2) / series.length));
  const groupW = barW * series.length + (series.length - 1) * 2;

  return (
    <figure className="relative">
      {series.length > 1 && (
        <div className="mb-2">
          <LegendRow items={series.map((s) => ({ label: s.label, color: s.color }))} />
        </div>
      )}
      <div ref={ref} className="relative w-full">
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={caption} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? P.ruleStrong : P.grid} strokeWidth={1} />
                <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={P.ink3} className="tnum">
                  {format(t)}
                </text>
              </g>
            ))}
            {categories.map((cat, i) => {
              const x0 = left + i * band + (band - groupW) / 2;
              return (
                <g key={cat}>
                  {series.map((s, j) => {
                    const v = s.values[i];
                    if (v === null || !Number.isFinite(v)) return null;
                    const x = x0 + j * (barW + 2);
                    return (
                      <path
                        key={s.key}
                        d={barPath(x, barW, y(0), y(v))}
                        fill={s.color}
                        opacity={hover === null || hover === i ? 1 : 0.55}
                      />
                    );
                  })}
                  <text x={left + i * band + band / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={P.ink3}>
                    {cat}
                  </text>
                  <rect
                    x={left + i * band}
                    y={top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${cat}: ${series.map((s) => `${s.label} ${s.values[i] === null ? "no data" : format(s.values[i]!)}`).join(", ")}`}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="outline-none"
                  />
                </g>
              );
            })}
          </svg>
        )}
        {hover !== null && width > 0 && (
          <div
            className="pointer-events-none absolute z-10 min-w-36 rounded border border-rule bg-sheet px-2.5 py-2 text-xs"
            style={{
              left: Math.min(width - 160, Math.max(0, left + hover * band + band / 2 - 72)),
              top: 0,
            }}
          >
            <div className="mb-1 font-semibold">{categories[hover]}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-ink-3">
                  <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tnum font-semibold text-ink">{s.values[hover] === null ? "—" : format(s.values[hover]!)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

/** Horizontal bars, one series: labels left, values right. */
export function BarList({
  items,
  format,
  color = P.s1,
}: {
  items: { key: string; label: ReactNode; value: number; note?: ReactNode }[];
  format: (n: number) => string;
  color?: string;
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-[13px]">
          <span className="truncate">{it.label}</span>
          <span className="h-3 rounded-r bg-transparent" aria-hidden>
            <span className="block h-3 max-w-full rounded-r-[4px]" style={{ width: `${max > 0 ? (it.value / max) * 100 : 0}%`, background: color }} />
          </span>
          <span className="tnum text-right text-ink-2">
            {format(it.value)}
            {it.note && <span className="ml-2 text-ink-3">{it.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** One horizontal bar split into parts, separated by 2px gaps. */
export function StackedBar({ parts, caption }: { parts: { label: string; value: number; color: string }[]; caption: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return null;
  const shown = parts.filter((p) => p.value > 0);
  return (
    <figure>
      <div className="flex h-4 w-full gap-0.5" role="img" aria-label={`${caption}: ${shown.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
        {shown.map((p, i) => (
          <span
            key={p.label}
            title={`${p.label}: ${p.value}`}
            className={i === 0 ? "rounded-l-[4px]" : i === shown.length - 1 ? "rounded-r-[4px]" : ""}
            style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
          />
        ))}
      </div>
      <figcaption className="mt-2">
        <LegendRow items={parts.map((p) => ({ label: `${p.label} ${p.value}`, color: p.color }))} />
      </figcaption>
    </figure>
  );
}
