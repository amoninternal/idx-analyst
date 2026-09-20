import Link from "next/link";
import type { ReactNode } from "react";
import { flowLeaders } from "@/lib/brokers";
import { config } from "@/lib/config";
import { addDays } from "@/lib/dates";
import { fmtCompact, fmtDate, fmtIdr, fmtPct, fmtPrice } from "@/lib/format";
import { getForeignFlow, getIndexSeries, getMostTraded, getNews, getTopMovers } from "@/lib/sectors/api";
import { describeError } from "@/lib/sectors/client";
import { IndexChart } from "../charts/FlowCharts";
import { NewsItem } from "../news/NewsFeed";
import { Delta, Notice, Section, Signed, Stat } from "../ui";

function Failed({ what, err }: { what: string; err: unknown }) {
  return (
    <Notice tone="error" title={`${what} is unavailable`}>
      {describeError(err)}
    </Notice>
  );
}

function StockLink({ symbol }: { symbol: string }) {
  return (
    <Link href={`/stocks/${symbol}`} className="condensed font-bold tracking-wide hover:underline">
      {symbol}
    </Link>
  );
}

function MiniTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] tnum">
        <thead>
          <tr className="border-b border-rule text-ink-3">{head}</tr>
        </thead>
        <tbody className="divide-y divide-rule">{children}</tbody>
      </table>
    </div>
  );
}

export async function IndexHero() {
  let points;
  try {
    points = await getIndexSeries("ihsg", 365);
  } catch (err) {
    return <Failed what="The IHSG index" err={err} />;
  }
  const last = points.at(-1);
  const prev = points.at(-2);
  const yearAgo = points[0];
  if (!last) return <Notice>No IHSG data returned.</Notice>;
  return (
    <section aria-label="IHSG composite index">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <div className="text-[13px] text-ink-3">IHSG composite, close on {fmtDate(last.time)}</div>
          <div className="mt-1 text-5xl leading-none font-semibold">{last.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
        </div>
        <div className="pb-1 text-base">
          <Delta value={prev ? last.value - prev.value : null} pct={prev ? last.value / prev.value - 1 : null} />
          <span className="ml-3 text-[13px] text-ink-3">
            1 year <span className="tnum">{fmtPct(yearAgo ? last.value / yearAgo.value - 1 : null, { sign: true, digits: 1 })}</span>
          </span>
        </div>
      </div>
      <div className="mt-4">
        <IndexChart points={points} />
      </div>
    </section>
  );
}

export async function MarketForeignFlow() {
  let days;
  try {
    days = await getForeignFlow("IHSG", 30);
  } catch (err) {
    return <Failed what="Market foreign flow" err={err} />;
  }
  const last = days.at(-1);
  const sum = (n: number) => days.slice(-n).reduce((s, d) => s + d.netForeign, 0);
  return (
    <Section title="Foreign investors, whole market" description={last ? `Net buying by foreign investors across IDX, to ${fmtDate(last.date)}.` : undefined}>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Last day" value={<Signed value={last?.netForeign}>{fmtIdr(last?.netForeign, { sign: true })}</Signed>} />
        <Stat label="5 days" value={<Signed value={sum(5)}>{fmtIdr(sum(5), { sign: true })}</Signed>} />
        <Stat label="30 days" value={<Signed value={sum(days.length)}>{fmtIdr(sum(days.length), { sign: true })}</Signed>} />
      </div>
    </Section>
  );
}

export async function Movers() {
  let movers;
  try {
    movers = await getTopMovers("1d", 8);
  } catch (err) {
    return <Failed what="Top movers" err={err} />;
  }
  const date = movers.gainers[0]?.date ?? movers.losers[0]?.date;
  const table = (rows: typeof movers.gainers) => (
    <MiniTable
      head={
        <>
          <th className="py-1.5 text-left font-medium">Stock</th>
          <th className="py-1.5 text-right font-medium">Price</th>
          <th className="py-1.5 text-right font-medium">Change</th>
        </>
      }
    >
      {rows.map((r) => (
        <tr key={r.symbol}>
          <td className="max-w-0 py-1.5 pr-3">
            <div className="flex items-baseline gap-2">
              <StockLink symbol={r.symbol} />
              <span className="truncate text-xs text-ink-3" title={r.name}>
                {r.name}
              </span>
            </div>
          </td>
          <td className="py-1.5 text-right">{fmtPrice(r.lastPrice)}</td>
          <td className="py-1.5 pl-3 text-right">
            <Delta pct={r.change} showValue={false} />
          </td>
        </tr>
      ))}
    </MiniTable>
  );
  return (
    <>
      <Section title="Top gainers" description={date ? `Large caps (above Rp 5T), ${fmtDate(date)}` : undefined}>
        {table(movers.gainers)}
      </Section>
      <Section title="Top losers" description={date ? `Large caps (above Rp 5T), ${fmtDate(date)}` : undefined}>
        {table(movers.losers)}
      </Section>
    </>
  );
}

export async function MostTraded() {
  let traded;
  try {
    traded = await getMostTraded(8);
  } catch (err) {
    return <Failed what="Most traded" err={err} />;
  }
  return (
    <Section title="Most traded" description={traded.date ? `By volume, ${fmtDate(traded.date)}` : undefined}>
      <MiniTable
        head={
          <>
            <th className="py-1.5 text-left font-medium">Stock</th>
            <th className="py-1.5 text-right font-medium">Price</th>
            <th className="py-1.5 text-right font-medium">Lots</th>
          </>
        }
      >
        {traded.rows.map((r) => (
          <tr key={r.symbol}>
            <td className="max-w-0 py-1.5 pr-3">
              <div className="flex items-baseline gap-2">
                <StockLink symbol={r.symbol} />
                <span className="truncate text-xs text-ink-3" title={r.name}>
                  {r.name}
                </span>
              </div>
            </td>
            <td className="py-1.5 text-right">{fmtPrice(r.price)}</td>
            <td className="py-1.5 pl-3 text-right">{fmtCompact(r.volume / 100)}</td>
          </tr>
        ))}
      </MiniTable>
    </Section>
  );
}

/** Market-wide scan of the local broker data: where did foreign brokers net buy and sell? */
export async function ForeignScan() {
  const end = config.broksumLastComplete;
  const start = addDays(end, -6);
  let buys, sells;
  try {
    [buys, sells] = await Promise.all([flowLeaders("foreign", start, end, "buy", 8), flowLeaders("foreign", start, end, "sell", 8)]);
  } catch (err) {
    return <Failed what="The broker flow scan" err={err} />;
  }
  const table = (rows: typeof buys) => (
    <MiniTable
      head={
        <>
          <th className="py-1.5 text-left font-medium">Stock</th>
          <th className="py-1.5 text-right font-medium">Foreign net</th>
          <th className="py-1.5 text-right font-medium">Share of value</th>
        </>
      }
    >
      {rows.map((r) => (
        <tr key={r.ticker}>
          <td className="py-1.5">
            <StockLink symbol={r.ticker} />
          </td>
          <td className="py-1.5 text-right">
            <Signed value={r.net}>{fmtIdr(r.net, { sign: true })}</Signed>
          </td>
          <td className="py-1.5 pl-3 text-right text-ink-2">{r.value > 0 ? fmtPct(r.net / r.value, { sign: true, digits: 1 }) : "—"}</td>
        </tr>
      ))}
    </MiniTable>
  );
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <Section title="Foreign brokers bought" description={`Largest net buying by foreign brokers, ${fmtDate(start, { year: false })} to ${fmtDate(end)}, local broker data.`}>
        {table(buys)}
      </Section>
      <Section title="Foreign brokers sold" description={`Largest net selling by foreign brokers over the same week.`}>
        {table(sells)}
      </Section>
    </div>
  );
}

export async function LatestNews() {
  let page;
  try {
    page = await getNews({ limit: 8 });
  } catch (err) {
    return <Failed what="News" err={err} />;
  }
  return (
    <Section
      title="Latest news"
      actions={
        <Link href="/news" className="text-[13px] font-medium text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink">
          All news
        </Link>
      }
    >
      <div className="divide-y divide-rule">
        {page.articles.map((a) => (
          <NewsItem key={`${a.url}-${a.publishedAt}`} article={a} />
        ))}
      </div>
    </Section>
  );
}

export function SectionFallback({ title, rows = 6 }: { title: string; rows?: number }) {
  return (
    <section aria-busy="true">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="space-y-2.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-3.5 rounded bg-wash" style={{ width: `${88 - ((i * 13) % 30)}%` }} />
        ))}
      </div>
    </section>
  );
}
