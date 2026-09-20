"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/fetcher";
import { fmtCompact, fmtDate, fmtIdr, fmtInt, fmtPct, fmtPrice } from "@/lib/format";
import { BROKER_PERIODS, CATEGORY_LABEL, type BrokerDrilldown, type BrokerPeriod, type BrokerRow, type BrokerSummary } from "@/lib/types";
import { Button, Segmented, Spinner } from "../controls";
import { BrokerPositionChart, CategoryFlowChart } from "../charts/FlowCharts";
import { BrokerCode, CategoryLegend, Notice, Signed, Stat, TONE_GLYPH } from "../ui";

const PERIOD_LABEL: Record<BrokerPeriod, string> = {
  "1D": "Last day",
  "1W": "1 week",
  "1M": "1 month",
  "3M": "3 months",
  "6M": "6 months",
  "1Y": "1 year",
};

function SideTable({
  title,
  rows,
  side,
  selected,
  onSelect,
}: {
  title: string;
  rows: BrokerRow[];
  side: "buy" | "sell";
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="overflow-x-auto rounded-md border border-rule bg-sheet">
        <table className="w-full text-[13px] tnum">
          <thead>
            <tr className="border-b border-rule text-left text-ink-3">
              <th className="px-3 py-2 font-medium">Broker</th>
              <th className="px-3 py-2 text-right font-medium">Net value</th>
              <th className="px-3 py-2 text-right font-medium">Net lots</th>
              <th className="px-3 py-2 text-right font-medium">{side === "buy" ? "Avg buy" : "Avg sell"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-ink-3">
                  No net {side === "buy" ? "buyers" : "sellers"} in this period.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.code} className={clsx("border-t border-rule first:border-t-0", selected === r.code ? "bg-kunyit-wash" : "hover:bg-wash")}>
                <td className="px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => onSelect(r.code)}
                    aria-pressed={selected === r.code}
                    className="flex w-full min-w-0 items-center gap-2 text-left"
                    title={`Show ${r.name}'s position over time`}
                  >
                    <BrokerCode code={r.code} name={r.name} category={r.category} />
                    <span className="hidden truncate text-xs text-ink-3 sm:inline">{r.name}</span>
                  </button>
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Signed value={r.netValue}>{fmtIdr(r.netValue, { sign: true })}</Signed>
                </td>
                <td className="px-3 py-1.5 text-right">{fmtCompact(r.netVolume / 100, { sign: true })}</td>
                <td className="px-3 py-1.5 text-right">{fmtPrice(side === "buy" ? r.buyAvg : r.sellAvg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AllBrokers({ rows, selected, onSelect }: { rows: BrokerRow[]; selected: string | null; onSelect: (code: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-md border border-rule bg-sheet">
      <table className="w-full text-[13px] tnum">
        <thead>
          <tr className="border-b border-rule text-right text-ink-3">
            <th className="px-3 py-2 text-left font-medium">Broker</th>
            <th className="px-3 py-2 font-medium">Buy value</th>
            <th className="px-3 py-2 font-medium">Buy lots</th>
            <th className="px-3 py-2 font-medium">Avg buy</th>
            <th className="px-3 py-2 font-medium">Sell value</th>
            <th className="px-3 py-2 font-medium">Sell lots</th>
            <th className="px-3 py-2 font-medium">Avg sell</th>
            <th className="px-3 py-2 font-medium">Net value</th>
            <th className="px-3 py-2 font-medium">Net lots</th>
            <th className="px-3 py-2 font-medium">Trades</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className={clsx("border-t border-rule text-right", selected === r.code ? "bg-kunyit-wash" : "hover:bg-wash")}>
              <td className="px-3 py-1.5 text-left">
                <button type="button" onClick={() => onSelect(r.code)} className="flex items-center gap-2" title={r.name}>
                  <BrokerCode code={r.code} name={r.name} category={r.category} />
                  <span className="hidden max-w-44 truncate text-xs text-ink-3 lg:inline">{r.name}</span>
                </button>
              </td>
              <td className="px-3 py-1.5">{fmtIdr(r.buyValue)}</td>
              <td className="px-3 py-1.5">{fmtCompact(r.buyVolume / 100)}</td>
              <td className="px-3 py-1.5">{fmtPrice(r.buyAvg)}</td>
              <td className="px-3 py-1.5">{fmtIdr(r.sellValue)}</td>
              <td className="px-3 py-1.5">{fmtCompact(r.sellVolume / 100)}</td>
              <td className="px-3 py-1.5">{fmtPrice(r.sellAvg)}</td>
              <td className="px-3 py-1.5">
                <Signed value={r.netValue}>{fmtIdr(r.netValue, { sign: true })}</Signed>
              </td>
              <td className="px-3 py-1.5">{fmtCompact(r.netVolume / 100, { sign: true })}</td>
              <td className="px-3 py-1.5">{fmtInt(r.buyFreq + r.sellFreq)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Drilldown({ symbol, code, period, row, onClose }: { symbol: string; code: string; period: BrokerPeriod; row: BrokerRow | undefined; onClose: () => void }) {
  const { data, error, isLoading } = useSWR<BrokerDrilldown>(`/api/broker/${symbol}/${code}?period=${period}`, swrFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const last = data?.days.at(-1);
  return (
    <section className="rounded-md border border-kunyit/60 bg-sheet p-4" aria-label={`${code} position in ${symbol}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            {row ? <BrokerCode code={code} name={row.name} category={row.category} /> : code}
            <span>{data?.name ?? row?.name}</span>
          </h3>
          <p className="text-[13px] text-ink-3">
            {row ? `${CATEGORY_LABEL[row.category]} broker. ` : ""}Its running net position in {symbol} over {PERIOD_LABEL[period].toLowerCase()},
            and the average cost of that position.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X aria-hidden className="size-3.5" />
          Close
        </Button>
      </div>
      {error && <Notice tone="error">{error.message}</Notice>}
      {isLoading && !data && <Spinner label={`Loading ${code}`} />}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Net position" value={`${fmtCompact((last?.cumVolume ?? 0) / 100, { sign: true })} lots`} />
            <Stat label="Average cost" value={fmtPrice(last?.avgCost)} sub={last?.avgCost && last.vwap ? `Price ${fmtPct(last.vwap / last.avgCost - 1, { sign: true, digits: 1 })} vs cost` : "No net long position"} />
            <Stat label="Avg buy" value={fmtPrice(row?.buyAvg)} />
            <Stat label="Avg sell" value={fmtPrice(row?.sellAvg)} />
          </div>
          {data.days.length > 1 ? <BrokerPositionChart drill={data} /> : <p className="text-[13px] text-ink-3">One trading day: no position chart.</p>}
        </div>
      )}
    </section>
  );
}

export function BrokerPanel({ symbol }: { symbol: string }) {
  const [period, setPeriod] = useState<BrokerPeriod>("1M");
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { data, error, isValidating } = useSWR<BrokerSummary>(`/api/broker/${symbol}?period=${period}`, swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  const toggle = (code: string) => setSelected((s) => (s === code ? null : code));

  const filters = (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented label="Period" options={BROKER_PERIODS} value={period} onChange={setPeriod} />
      {isValidating && <Spinner label="Updating" />}
    </div>
  );

  if (error && !data) {
    return (
      <div className="space-y-4">
        {filters}
        <Notice tone="error" title="Broker data is unavailable">
          {error.message}
        </Notice>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        {filters}
        <Spinner label="Loading broker summary" />
      </div>
    );
  }

  const buyers = data.rows.filter((r) => r.netValue > 0).slice(0, 10);
  const sellers = data.rows.filter((r) => r.netValue < 0).reverse().slice(0, 10);
  const signal = data.signal;
  const tone = signal ? TONE_GLYPH[/accumulation/i.test(signal.label) ? "positive" : /distribution/i.test(signal.label) ? "negative" : "neutral"] : TONE_GLYPH.unknown;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {filters}
        <p className="text-[13px] text-ink-3">
          {data.dates.length} trading {data.dates.length === 1 ? "day" : "days"}, {fmtDate(data.start)} to {fmtDate(data.end)}.{" "}
          {data.sources
            .map((s) => `${s.kind === "local" ? "Local broker data" : "Sectors live data"} covers ${fmtDate(s.from, { year: false })} to ${fmtDate(s.to)}`)
            .join("; ")}
          .
        </p>
        {data.notes.map((n) => (
          <Notice key={n}>{n}</Notice>
        ))}
      </div>

      {data.rows.length === 0 ? (
        <p className="text-[13px] text-ink-3">No broker trades for {symbol} in this period.</p>
      ) : (
        <div className={clsx("space-y-8 transition-opacity", isValidating && "opacity-60")}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 xl:grid-cols-5">
            {(["foreign", "institution", "retail"] as const).map((c) => (
              <Stat
                key={c}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--color-${c})` }} />
                    {CATEGORY_LABEL[c]} net
                  </span>
                }
                value={<Signed value={data.categories[c].net}>{fmtIdr(data.categories[c].net, { sign: true })}</Signed>}
                sub={`Bought ${fmtIdr(data.categories[c].buy)}, sold ${fmtIdr(data.categories[c].sell)}`}
              />
            ))}
            <Stat
              label="Flow read"
              value={
                <span className="inline-flex items-baseline gap-2">
                  <span aria-hidden className={clsx("text-[0.65em]", tone.color)}>
                    {tone.glyph}
                  </span>
                  {signal?.label ?? "Not enough data"}
                </span>
              }
              sub={
                signal
                  ? `Top 3 buyers ${fmtIdr(signal.top3Buy)} vs top 3 sellers ${fmtIdr(signal.top3Sell)}, ${signal.buyers} buyers and ${signal.sellers} sellers`
                  : undefined
              }
            />
            <Stat label="Value traded" value={fmtIdr(data.totals.value)} sub={`${fmtCompact(data.totals.volume / 100)} lots, ${fmtInt(data.totals.freq)} trades`} />
          </div>

          {data.daily.length > 1 && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h3 className="text-sm font-semibold">Who has been buying, day by day</h3>
                <CategoryLegend />
              </div>
              <p className="text-[13px] text-ink-3">
                Top: the daily average price. Bottom: each broker category&apos;s running net value since {fmtDate(data.start)}. A rising line
                means that group keeps buying more than it sells.
              </p>
              <CategoryFlowChart daily={data.daily} />
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <SideTable title="Top net buyers" rows={buyers} side="buy" selected={selected} onSelect={toggle} />
            <SideTable title="Top net sellers" rows={sellers} side="sell" selected={selected} onSelect={toggle} />
          </div>
          <p className="-mt-5 text-xs text-ink-3">Select a broker to see its position build up over the period.</p>

          {selected && (
            <Drilldown symbol={symbol} code={selected} period={period} row={data.rows.find((r) => r.code === selected)} onClose={() => setSelected(null)} />
          )}

          {data.unusual.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">Unusually large on {fmtDate(data.unusual[0].date)}</h3>
              <p className="mb-2 text-[13px] text-ink-3">Brokers whose net that day was at least 3 standard deviations above their usual daily net in {symbol}.</p>
              <ul className="divide-y divide-rule rounded-md border border-rule bg-sheet">
                {data.unusual.map((u) => (
                  <li key={u.code} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2 text-[13px]">
                    <button type="button" onClick={() => toggle(u.code)} className="flex items-center gap-2">
                      <BrokerCode code={u.code} name={u.name} category={u.category} />
                      <span className="text-ink-2">{u.name}</span>
                    </button>
                    <Signed value={u.netValue} className="font-medium">
                      {fmtIdr(u.netValue, { sign: true })}
                    </Signed>
                    <span className="text-ink-3 tnum">
                      {(Math.abs(u.netValue) / u.usualAbsNet).toFixed(1)}× its usual {fmtIdr(u.usualAbsNet)} a day
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">All {data.rows.length} brokers</h3>
              <Button size="sm" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll}>
                {showAll ? "Hide table" : "Show table"}
              </Button>
            </div>
            {showAll && <AllBrokers rows={data.rows} selected={selected} onSelect={toggle} />}
          </section>

          <details className="text-[13px] text-ink-3">
            <summary className="cursor-pointer text-ink-2 hover:text-ink">How to read this</summary>
            <div className="mt-2 max-w-3xl space-y-2">
              <p>
                Foreign brokers are the eight whose clients are mostly foreign investors (estimated from IDX foreign-flow data). Retail are the
                retail trading platforms. Institution covers the other local brokers.
              </p>
              <p>
                The flow read compares the top three net buyers with the top three net sellers, as a share of all value traded. A difference
                of 3% or more reads as accumulation, 10% or more as big accumulation, and the same below zero for distribution. It is a rule
                of thumb, not a signal to trade.
              </p>
              <p>Average prices are value divided by shares, adjusted for stock splits.</p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
