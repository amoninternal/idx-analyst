"use client";

import { useMemo } from "react";
import { fmtCompact, fmtDate, fmtPrice } from "@/lib/format";
import { technicalSnapshot } from "@/lib/indicators";
import type { CandleSeries } from "@/lib/types";
import { ChartWorkspace } from "../charts/ChartWorkspace";
import { TechnicalSummary } from "./TechnicalSummary";

const INITIAL_DAYS = 400; // what the stock page loads

function PriceTable({ series }: { series: CandleSeries }) {
  const ohlc = series.source === "sectors";
  return (
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
  );
}

function Summary({ series }: { series: CandleSeries }) {
  const snapshot = useMemo(() => technicalSnapshot(series.candles), [series]);
  return <TechnicalSummary snapshot={snapshot} source={series.source} />;
}

export function ChartPanel({ symbol, initial }: { symbol: string; initial: CandleSeries }) {
  return (
    <ChartWorkspace
      id={symbol}
      initial={initial}
      initialDays={INITIAL_DAYS}
      // Longer OHLC history comes from Sectors; the local export is already complete.
      historyUrl={initial.source === "sectors" ? (days) => `/api/candles/${symbol}?days=${days}` : null}
      below={(series) => <PriceTable series={series} />}
      side={(series) => <Summary series={series} />}
    />
  );
}
