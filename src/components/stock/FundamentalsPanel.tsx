"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/fetcher";
import { fmtCompact, fmtDate, fmtIdr, fmtInt, fmtMultiple, fmtPct, fmtPrice } from "@/lib/format";
import { P } from "@/lib/palette";
import { normalizeSymbol } from "@/lib/symbols";
import type { CompanyReport, HistoricalRatios, QuarterlyFinancials } from "@/lib/sectors/types";
import { Button, Spinner } from "../controls";
import { ColumnChart, StackedBar } from "../charts/Bars";
import { Chip, Notice, Section, Stat } from "../ui";

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

function YearTable({
  years,
  rows,
}: {
  years: (string | number)[];
  rows: { label: string; values: (number | null)[]; format: (n: number) => string }[];
}) {
  const visible = rows.filter((r) => r.values.some((v) => v !== null));
  if (!visible.length) return null;
  return (
    <div className="overflow-x-auto rounded-md border border-rule bg-sheet">
      <table className="w-full text-[13px] tnum">
        <thead>
          <tr className="border-b border-rule text-right text-ink-3">
            <th className="px-3 py-2 text-left font-medium">
              <span className="sr-only">Metric</span>
            </th>
            {years.map((y, i) => (
              <th key={`${y}-${i}`} className="px-3 py-2 font-medium">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.label} className="border-t border-rule text-right first:border-t-0">
              <th scope="row" className="px-3 py-1.5 text-left font-normal text-ink-2">
                {r.label}
              </th>
              {r.values.map((v, i) => (
                <td key={i} className={clsx("px-3 py-1.5", v !== null && v < 0 && "text-down")}>
                  {v === null ? "—" : r.format(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const pct = (n: number) => fmtPct(n, { digits: 1 });
const idr = (n: number) => fmtIdr(n);
const times = (n: number) => fmtMultiple(n);

const FINANCIAL_ROWS: [string, string][] = [
  ["revenue", "Revenue"],
  ["gross_profit", "Gross profit"],
  ["operating_pnl", "Operating profit"],
  ["ebitda", "EBITDA"],
  ["earnings", "Net income"],
  ["net_interest_income", "Net interest income"],
  ["gross_loan", "Gross loans"],
  ["total_deposit", "Deposits"],
  ["total_assets", "Total assets"],
  ["total_liabilities", "Total liabilities"],
  ["total_equity", "Equity"],
  ["total_debt", "Debt"],
  ["operating_cash_flow", "Operating cash flow"],
  ["free_cash_flow", "Free cash flow"],
];

const RATIO_ROWS: [keyof Omit<HistoricalRatios, "year">, string, string, (n: number) => string][] = [
  ["profitability", "roe", "Return on equity", pct],
  ["profitability", "roa", "Return on assets", pct],
  ["profitability", "net_profit_margin", "Net margin", pct],
  ["profitability", "operating_profit_margin", "Operating margin", pct],
  ["profitability", "gross_profit_margin", "Gross margin", pct],
  ["profitability", "net_interest_margin", "Net interest margin", pct],
  ["profitability", "cost_to_income_ratio", "Cost to income", pct],
  ["leverage", "debt_to_equity_ratio", "Debt to equity", times],
  ["leverage", "debt_to_asset_ratio", "Debt to assets", pct],
  ["liquidity", "current_ratio", "Current ratio", times],
  ["liquidity", "loan_to_deposit_ratio", "Loan to deposit", pct],
  ["liquidity", "casa_ratio", "CASA ratio", pct],
  ["liquidity", "operating_cash_flow_margin", "Operating cash flow margin", pct],
  ["capital", "capital_adequacy_ratio", "Capital adequacy", pct],
  ["efficiency", "total_asset_turnover", "Asset turnover", times],
];

function Valuation({ report }: { report: CompanyReport }) {
  const v = report.valuation;
  if (!v) return null;
  const rows = [...(v.historical_valuation ?? [])].sort((a, b) => a.year - b.year).slice(-6);
  const latest = [...rows].reverse().find((r) => num(r.pe) !== null) ?? rows.at(-1);
  const price = num(v.last_close_price);
  const intrinsic = num(v.intrinsic_value);
  return (
    <Section title="Valuation" description={latest ? `Latest year ${latest.year}; peers are the other companies in the subsector.` : undefined}>
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="P/E" value={fmtMultiple(num(latest?.pe))} sub={latest?.pe_peer_avg ? `Peers ${fmtMultiple(num(latest.pe_peer_avg))}` : undefined} />
        <Stat label="P/B" value={fmtMultiple(num(latest?.pb))} sub={latest?.pb_peer_avg ? `Peers ${fmtMultiple(num(latest.pb_peer_avg))}` : undefined} />
        <Stat label="P/S" value={fmtMultiple(num(latest?.ps))} sub={latest?.ps_peer_avg ? `Peers ${fmtMultiple(num(latest.ps_peer_avg))}` : undefined} />
        <Stat label="Forward P/E" value={fmtMultiple(num(v.forward_pe))} sub="On next year's EPS estimate" />
        <Stat
          label="Intrinsic value"
          value={intrinsic ? fmtPrice(intrinsic) : "—"}
          sub={intrinsic && price ? `${fmtPct(intrinsic / price - 1, { sign: true, digits: 1 })} vs price ${fmtPrice(price)}` : "Sectors estimate"}
        />
      </div>
      <YearTable
        years={rows.map((r) => r.year)}
        rows={[
          { label: "P/E", values: rows.map((r) => num(r.pe)), format: times },
          { label: "Peer P/E", values: rows.map((r) => num(r.pe_peer_avg)), format: times },
          { label: "P/B", values: rows.map((r) => num(r.pb)), format: times },
          { label: "Peer P/B", values: rows.map((r) => num(r.pb_peer_avg)), format: times },
          { label: "P/S", values: rows.map((r) => num(r.ps)), format: times },
          { label: "Price to cash flow", values: rows.map((r) => num(r.pcf)), format: times },
          { label: "PEG", values: rows.map((r) => num(r.peg)), format: (n) => n.toFixed(2) },
          { label: "EV to EBITDA", values: rows.map((r) => num(r.enterprise_to_ebitda)), format: times },
        ]}
      />
    </Section>
  );
}

function Financials({ report }: { report: CompanyReport }) {
  const f = report.financials;
  if (!f) return null;
  const rows = [...(f.historical_financials ?? [])].sort((a, b) => a.year - b.year).slice(-6);
  const ratios = [...(f.historical_financial_ratio ?? [])].sort((a, b) => Number(a.year) - Number(b.year)).slice(-6);
  const epsYears = Object.keys(f.historical_eps ?? {}).sort();
  const lastEps = epsYears.length ? f.historical_eps![epsYears.at(-1)!] : null;
  return (
    <Section title="Financials" description="Annual figures from the audited reports.">
      <div className="mb-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Stat label="EPS" value={fmtPrice(num(f.eps))} sub={lastEps?.eps_growth != null ? `${fmtPct(num(lastEps.eps_growth), { sign: true, digits: 1 })} in ${epsYears.at(-1)}` : undefined} />
        <Stat label="Revenue growth" value={fmtPct(num(f.yoy_quarter_revenue_growth), { sign: true, digits: 1 })} sub="Latest quarter, year on year" />
        <Stat label="Earnings growth" value={fmtPct(num(f.yoy_quarter_earnings_growth), { sign: true, digits: 1 })} sub="Latest quarter, year on year" />
      </div>
      {rows.length > 0 && (
        <div className="mb-5">
          <ColumnChart
            caption="Revenue and net income by year"
            categories={rows.map((r) => String(r.year))}
            series={[
              { key: "revenue", label: "Revenue", color: P.s1, values: rows.map((r) => num(r.revenue)) },
              { key: "earnings", label: "Net income", color: P.s2, values: rows.map((r) => num(r.earnings)) },
            ]}
            format={(n) => fmtCompact(n)}
          />
        </div>
      )}
      <YearTable
        years={rows.map((r) => r.year)}
        rows={FINANCIAL_ROWS.map(([key, label]) => ({ label, values: rows.map((r) => num(r[key])), format: idr }))}
      />
      {ratios.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold">Ratios</h3>
          <YearTable
            years={ratios.map((r) => r.year)}
            rows={RATIO_ROWS.map(([group, key, label, format]) => ({ label, values: ratios.map((r) => num(r[group]?.[key])), format }))}
          />
        </div>
      )}
    </Section>
  );
}

function Dividends({ report }: { report: CompanyReport }) {
  const d = report.dividend;
  if (!d) return null;
  const years = Object.entries(d.historical_dividends ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8);
  const payments = years.flatMap(([, y]) => y.breakdown ?? []).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  return (
    <Section title="Dividends">
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Stat label="Yield, trailing 12 months" value={fmtPct(num(d.yield_ttm), { digits: 2 })} sub={d.dividend_ttm ? `Rp ${fmtPrice(num(d.dividend_ttm))} a share` : undefined} />
        <Stat label="Payout ratio" value={fmtPct(num(d.payout_ratio), { digits: 1 })} />
        <Stat
          label={`${num(d.dividend_yield_avg?.period) ?? 5}-year average yield`}
          value={fmtPct(num(d.dividend_yield_avg?.avg_yield), { digits: 2 })}
          sub={d.last_ex_dividend_date ? `Last ex-date ${fmtDate(d.last_ex_dividend_date)}` : undefined}
        />
      </div>
      {years.length > 0 ? (
        <ColumnChart
          caption="Dividend per share by year"
          categories={years.map(([y]) => y)}
          series={[{ key: "dps", label: "Dividend per share", color: P.s1, values: years.map(([, y]) => num(y.total_dividend)) }]}
          format={(n) => `Rp ${fmtPrice(n)}`}
          height={180}
        />
      ) : (
        <p className="text-[13px] text-ink-3">No dividend history.</p>
      )}
      {payments.length > 0 && (
        <ul className="mt-3 divide-y divide-rule text-[13px] tnum">
          {payments.map((p) => (
            <li key={p.date} className="flex justify-between py-1.5">
              <span className="text-ink-2">{fmtDate(p.date)}</span>
              <span>
                Rp {fmtPrice(num(p.total))}
                {p.yield != null && <span className="ml-2 text-ink-3">{fmtPct(num(p.yield), { digits: 2 })}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

const RATING_PARTS = [
  { key: "strong_buy", label: "Strong buy", color: "#184f95" },
  { key: "buy", label: "Buy", color: "#86b6ef" },
  { key: "hold", label: "Hold", color: "#c3c2b7" },
  { key: "sell", label: "Sell", color: "#ef9a9a" },
  { key: "strong_sell", label: "Strong sell", color: "#c62f32" },
] as const;

function AnalystView({ report }: { report: CompanyReport }) {
  const fut = report.future;
  if (!fut) return null;
  const r = fut.analyst_rating_breakdown;
  const rows = fut.company_value_forecasts ?? [];
  // The list mixes estimates with one row of actuals for the base year.
  const actual = rows.find((f) => f.estimate_year === undefined && f.financial_year !== undefined);
  const forecasts = rows
    .filter((f): f is typeof f & { estimate_year: number } => typeof f.estimate_year === "number")
    .sort((a, b) => a.estimate_year - b.estimate_year);
  const growth = new Map((fut.company_growth_forecasts ?? []).map((g) => [g.estimate_year, g]));
  const years = [...(actual ? [`${actual.financial_year} actual`] : []), ...forecasts.map((f) => `${f.estimate_year} estimate`)];
  const withActual = (a: number | null, est: (number | null)[]) => (actual ? [a, ...est] : est);
  return (
    <Section title="Analyst view" description={r?.updated_on ? `Ratings updated ${fmtDate(r.updated_on.slice(0, 10))}` : undefined}>
      {r && num(r.n_analyst) ? (
        <div className="mb-5">
          <p className="mb-2 text-[13px] text-ink-2">{num(r.n_analyst)} analysts cover the stock.</p>
          <StackedBar caption="Analyst ratings" parts={RATING_PARTS.map((p) => ({ label: p.label, color: p.color, value: num(r[p.key]) ?? 0 }))} />
        </div>
      ) : (
        <p className="mb-4 text-[13px] text-ink-3">No analyst ratings.</p>
      )}
      {forecasts.length > 0 && (
        <YearTable
          years={years}
          rows={[
            { label: "EPS", values: withActual(num(actual?.eps), forecasts.map((f) => num(f.eps_estimate))), format: (n) => `Rp ${fmtPrice(n)}` },
            {
              label: "EPS growth",
              values: withActual(null, forecasts.map((f) => num(growth.get(f.estimate_year)?.eps_growth))),
              format: (n) => fmtPct(n, { sign: true, digits: 1 }),
            },
            { label: "Revenue", values: withActual(num(actual?.total_revenue), forecasts.map((f) => num(f.revenue_estimate))), format: idr },
            {
              label: "Revenue growth",
              values: withActual(null, forecasts.map((f) => num(growth.get(f.estimate_year)?.revenue_growth))),
              format: (n) => fmtPct(n, { sign: true, digits: 1 }),
            },
          ]}
        />
      )}
    </Section>
  );
}

function Peers({ report, symbol }: { report: CompanyReport; symbol: string }) {
  const group = report.peers?.[0]?.peers_data;
  const companies = group?.companies ?? [];
  if (!companies.length) return null;
  return (
    <Section title="Peers" description={group?.group_name?.sub_industry ? `${group.group_name.sub_industry} companies, latest year.` : undefined}>
      <div className="overflow-x-auto rounded-md border border-rule bg-sheet">
        <table className="w-full text-[13px] tnum">
          <thead>
            <tr className="border-b border-rule text-right text-ink-3">
              <th className="px-3 py-2 text-left font-medium">Company</th>
              <th className="px-3 py-2 font-medium">Market cap</th>
              <th className="px-3 py-2 font-medium">P/E</th>
              <th className="px-3 py-2 font-medium">P/B</th>
              <th className="px-3 py-2 font-medium">Revenue</th>
              <th className="px-3 py-2 font-medium">Net income</th>
              <th className="px-3 py-2 font-medium">1Y market cap</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => {
              const sym = normalizeSymbol(c.symbol);
              const self = sym === symbol;
              return (
                <tr key={c.symbol} className={clsx("border-t border-rule text-right first:border-t-0", self && "bg-kunyit-wash")}>
                  <td className="px-3 py-1.5 text-left">
                    {self ? (
                      <span className="condensed font-bold">{sym}</span>
                    ) : (
                      <Link href={`/stocks/${sym}`} className="condensed font-bold hover:underline">
                        {sym}
                      </Link>
                    )}
                    <span className="ml-2 hidden text-xs text-ink-3 sm:inline">{c.company_name}</span>
                  </td>
                  <td className="px-3 py-1.5">{fmtIdr(num(c.market_cap))}</td>
                  <td className="px-3 py-1.5">{fmtMultiple(num(c.pe_ttm))}</td>
                  <td className="px-3 py-1.5">{fmtMultiple(num(c.pb_mrq))}</td>
                  <td className="px-3 py-1.5">{fmtIdr(num(c.total_revenue))}</td>
                  <td className={clsx("px-3 py-1.5", (num(c.net_income) ?? 0) < 0 && "text-down")}>{fmtIdr(num(c.net_income))}</td>
                  <td className={clsx("px-3 py-1.5", (num(c.yearly_mcap_chg) ?? 0) > 0 ? "text-up" : (num(c.yearly_mcap_chg) ?? 0) < 0 ? "text-down" : "")}>
                    {fmtPct(num(c.yearly_mcap_chg), { sign: true, digits: 1 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Ownership({ report }: { report: CompanyReport }) {
  const o = report.ownership;
  if (!o) return null;
  const holders = o.major_shareholders ?? [];
  const tx = o.top_transactions;
  return (
    <Section title="Ownership">
      {holders.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-rule bg-sheet">
          <table className="w-full text-[13px] tnum">
            <thead>
              <tr className="border-b border-rule text-right text-ink-3">
                <th className="px-3 py-2 text-left font-medium">Shareholder</th>
                <th className="px-3 py-2 font-medium">Stake</th>
                <th className="px-3 py-2 font-medium">Shares</th>
                <th className="px-3 py-2 font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {holders.slice(0, 12).map((h) => (
                <tr key={h.name} className="border-t border-rule text-right first:border-t-0">
                  <td className="px-3 py-1.5 text-left">{h.name}</td>
                  <td className="px-3 py-1.5">{fmtPct(num(h.share_percentage), { digits: 2 })}</td>
                  <td className="px-3 py-1.5">{fmtCompact(num(h.share_amount))}</td>
                  <td className="px-3 py-1.5">{fmtIdr(num(h.share_value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tx && (tx.top_buyers?.length || tx.top_sellers?.length) ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(
            [
              ["Largest buyers", tx.top_buyers],
              ["Largest sellers", tx.top_sellers],
            ] as const
          ).map(([title, list]) => (
            <div key={title}>
              <h3 className="mb-1 text-[13px] font-semibold">
                {title}
                {tx.date && <span className="ml-1 font-normal text-ink-3">as of {fmtDate(tx.date)}</span>}
              </h3>
              <ul className="space-y-1 text-[13px]">
                {(list ?? []).slice(0, 5).map((t) => (
                  <li key={t.name} className="flex justify-between gap-3">
                    <span className="truncate text-ink-2">{t.name}</span>
                    <span className={clsx("tnum shrink-0", t.changeAmount >= 0 ? "text-up" : "text-down")}>
                      {fmtCompact(t.changeAmount, { sign: true })} shares
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {(o.whale_investors?.length || o.conglomerates_group?.length) && (
        <dl className="mt-4 space-y-2 text-[13px]">
          {o.conglomerates_group?.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <dt className="mr-1 text-ink-3">Group</dt>
              {o.conglomerates_group.map((g) => (
                <dd key={g}>
                  <Chip>{g}</Chip>
                </dd>
              ))}
            </div>
          ) : null}
          {o.whale_investors?.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <dt className="mr-1 text-ink-3">Notable investors</dt>
              {o.whale_investors.map((w) => (
                <dd key={w}>
                  <Chip>{w}</Chip>
                </dd>
              ))}
            </div>
          ) : null}
        </dl>
      )}
    </Section>
  );
}

function Management({ report }: { report: CompanyReport }) {
  const m = report.management;
  if (!m?.key_executives?.length && !m?.executives_shareholdings?.length) return null;
  const holdings = new Map((m.executives_shareholdings ?? []).map((h) => [h.name, h]));
  return (
    <Section title="Management">
      <ul className="divide-y divide-rule rounded-md border border-rule bg-sheet text-[13px]">
        {(m.key_executives ?? []).slice(0, 12).map((e) => {
          const h = holdings.get(e.name);
          return (
            <li key={`${e.name}-${e.position}`} className="flex flex-wrap items-baseline justify-between gap-x-4 px-3 py-1.5">
              <span>
                {e.name}
                <span className="ml-2 text-ink-3">{e.position}</span>
              </span>
              {h?.share_amount ? <span className="tnum text-ink-2">{fmtCompact(num(h.share_amount))} shares</span> : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Profile({ report }: { report: CompanyReport }) {
  const o = report.overview;
  if (!o) return null;
  const items: [string, ReactNode][] = [
    ["Industry", o.sub_industry ?? o.industry],
    ["Listed", o.listing_date ? `${fmtDate(o.listing_date)}, ${o.listing_board ?? ""} board` : null],
    ["Employees", o.employee_num ? fmtInt(num(o.employee_num)) : null],
    ["ESG risk score", o.esg_score != null ? String(o.esg_score) : null],
    [
      "Website",
      o.website ? (
        <a href={o.website.startsWith("http") ? o.website : `https://${o.website}`} target="_blank" rel="noopener noreferrer" className="underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
          {o.website}
        </a>
      ) : null,
    ],
    ["Phone", o.phone],
    ["Email", o.email],
    ["Address", o.address],
  ];
  return (
    <Section title="Company">
      <dl className="grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
        {items
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-28 shrink-0 text-ink-3">{k}</dt>
              <dd className="min-w-0 whitespace-pre-line">{v}</dd>
            </div>
          ))}
      </dl>
      {(o.tags?.length || o.affiliates?.length) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[...(o.affiliates ?? []).map((a) => `Affiliate: ${a}`), ...(o.tags ?? []).map((t) => t.replaceAll("-", " "))].map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
      )}
    </Section>
  );
}

const QUARTER_ROWS: [string, string][] = [
  ["revenue", "Revenue"],
  ["gross_profit", "Gross profit"],
  ["operating_pnl", "Operating profit"],
  ["earnings", "Net income"],
  ["total_assets", "Total assets"],
  ["total_liabilities", "Total liabilities"],
  ["total_equity", "Equity"],
  ["operating_cash_flow", "Operating cash flow"],
  ["free_cash_flow", "Free cash flow"],
];

function Quarterly({ symbol }: { symbol: string }) {
  const [load, setLoad] = useState(false);
  const { data, error, isLoading } = useSWR<QuarterlyFinancials[]>(load ? `/api/quarterly/${symbol}?n=4` : null, swrFetcher, { revalidateOnFocus: false });
  return (
    <Section title="Quarterly results" description="The last four reported quarters.">
      {!load ? (
        <Button onClick={() => setLoad(true)}>Load last 4 quarters (4 Sectors credits)</Button>
      ) : isLoading ? (
        <Spinner label="Loading quarters" />
      ) : error ? (
        <Notice tone="error">{error.message}</Notice>
      ) : data?.length ? (
        <YearTable
          years={data.map((q) => fmtDate(String(q.date)))}
          rows={QUARTER_ROWS.map(([key, label]) => ({ label, values: data.map((q) => num(q[key])), format: idr }))}
        />
      ) : (
        <p className="text-[13px] text-ink-3">No quarterly reports available.</p>
      )}
    </Section>
  );
}

export function FundamentalsPanel({ symbol, hasSectors }: { symbol: string; hasSectors: boolean }) {
  const { data, error, isLoading } = useSWR<CompanyReport>(hasSectors ? `/api/fundamentals/${symbol}` : null, swrFetcher, {
    revalidateOnFocus: false,
  });
  if (!hasSectors) {
    return (
      <Notice title="Fundamentals come from the Sectors API">
        Add SECTORS_API_KEY to .env.local and restart the app to see valuation, financials, dividends, peers and ownership.
      </Notice>
    );
  }
  if (error) return <Notice tone="error" title="Could not load fundamentals">{error.message}</Notice>;
  if (isLoading || !data) return <Spinner label="Loading fundamentals" />;

  return (
    <div className="space-y-10">
      <Valuation report={data} />
      <Financials report={data} />
      <div className="grid gap-10 xl:grid-cols-2">
        <Dividends report={data} />
        <AnalystView report={data} />
      </div>
      <Peers report={data} symbol={symbol} />
      <div className="grid gap-10 xl:grid-cols-2">
        <Ownership report={data} />
        <Management report={data} />
      </div>
      <Quarterly symbol={symbol} />
      <Profile report={data} />
      <p className="text-xs text-ink-3">Source: Sectors Financial API. Reports are cached for 12 hours.</p>
    </div>
  );
}
