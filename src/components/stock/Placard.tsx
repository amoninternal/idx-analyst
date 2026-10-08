import { AskAnalystButton } from "../analyst/AnalystDrawer";
import { AddPositionButton } from "../portfolio/AddPositionButton";
import { Chip, Delta } from "../ui";
import { fmtDate, fmtIdr, fmtPrice } from "@/lib/format";
import type { ReportOverview } from "@/lib/sectors/types";
import type { CandleSeries } from "@/lib/types";

function extreme(overview: ReportOverview | undefined, key: string): { price: number; date: string } | null {
  const entry = overview?.all_time_price?.[key];
  if (!entry) return null;
  const [date, price] = Object.entries(entry)[0] ?? [];
  return typeof price === "number" && date ? { price, date } : null;
}

/** The stock page masthead: ticker as the anchor, then price and identity. */
export function Placard({
  symbol,
  name,
  overview,
  series,
}: {
  symbol: string;
  name: string | null;
  overview?: ReportOverview;
  series: CandleSeries;
}) {
  const last = series.candles.at(-1);
  const prev = series.candles.at(-2);
  const change = last && prev ? last.close - prev.close : null;
  const pct = last && prev && prev.close > 0 ? last.close / prev.close - 1 : null;
  const year = series.candles.slice(-250);
  const low = extreme(overview, "52_w_low") ?? (year.length ? { price: Math.min(...year.map((c) => c.low)), date: "" } : null);
  const high = extreme(overview, "52_w_high") ?? (year.length ? { price: Math.max(...year.map((c) => c.high)), date: "" } : null);

  return (
    <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 border-b border-rule pb-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
          <h1 className="condensed text-[64px] leading-[0.82] font-extrabold tracking-tight sm:text-[88px]">{symbol}</h1>
          <div className="min-w-0 pb-1">
            {name ? <p className="text-lg leading-snug font-medium">{name}</p> : <p className="text-[13px] text-ink-3">Company profile needs a Sectors API key</p>}
            {overview?.sector && (
              <p className="text-[13px] text-ink-3">
                {overview.sector}
                {overview.sub_sector && overview.sub_sector !== overview.sector ? `, ${overview.sub_sector}` : ""}
                {overview.listing_board ? ` (${overview.listing_board} board)` : ""}
              </p>
            )}
          </div>
        </div>

        {last && (
          <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-4xl leading-none font-semibold">{fmtPrice(last.close)}</span>
            <Delta value={change} pct={pct} className="text-lg font-medium" />
            <span className="text-[13px] text-ink-3">
              {series.source === "sectors" ? "Close" : "Daily average price"} on {fmtDate(last.time)}
            </span>
          </div>
        )}

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
          {typeof overview?.market_cap === "number" && (
            <div>
              <dt className="text-ink-3">Market cap</dt>
              <dd className="tnum font-medium">
                {fmtIdr(overview.market_cap)}
                {overview.market_cap_rank ? <span className="ml-1 text-ink-3">rank {overview.market_cap_rank}</span> : null}
              </dd>
            </div>
          )}
          {low && high && (
            <div>
              <dt className="text-ink-3">52-week range</dt>
              <dd className="tnum font-medium">
                {fmtPrice(low.price)} to {fmtPrice(high.price)}
              </dd>
            </div>
          )}
          {overview?.listing_date && (
            <div>
              <dt className="text-ink-3">Listed</dt>
              <dd className="font-medium">{fmtDate(overview.listing_date)}</dd>
            </div>
          )}
          {overview?.indices?.length ? (
            <div>
              <dt className="text-ink-3">Indices</dt>
              <dd className="mt-0.5 flex max-w-xl flex-wrap gap-1">
                {overview.indices.map((i) => (
                  <Chip key={i}>{i}</Chip>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="flex flex-wrap gap-2">
        <AddPositionButton symbol={symbol} price={last?.close ?? null} />
        <AskAnalystButton
          symbol={symbol}
          prompt={`Give me a full read on ${symbol}: trend, broker flow, valuation and news. What stands out?`}
          className="inline-flex h-9 items-center gap-2 rounded bg-ink px-3.5 text-sm font-medium text-sheet hover:bg-ink-hover"
        >
          <span aria-hidden className="size-2 rounded-full bg-kunyit" />
          Ask the analyst about {symbol}
        </AskAnalystButton>
      </div>
    </section>
  );
}
