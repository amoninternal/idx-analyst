import clsx from "clsx";
import { getBrokerSummary } from "@/lib/brokers";
import { hasSectorsKey } from "@/lib/keys";
import type { TechnicalSnapshot } from "@/lib/indicators";
import { getNews } from "@/lib/sectors/api";
import type { CompanyReport } from "@/lib/sectors/types";
import { flowLens, newsLens, trendLens, valueLens, type Lens } from "@/lib/signals";
import { TONE_GLYPH } from "../ui";

function LensTile({ lens }: { lens: Lens }) {
  const tone = TONE_GLYPH[lens.tone];
  return (
    <li
      className="group relative min-w-0 bg-paper px-4 py-4 odd:pl-0 sm:px-5 sm:odd:pl-0 lg:odd:pl-5 lg:first:pl-0"
      tabIndex={0}
      aria-describedby={`lens-rule-${lens.key}`}
    >
      <div className="text-[13px] text-ink-3">{lens.title}</div>
      <div className="mt-1 flex items-baseline gap-2 text-[17px] leading-tight font-semibold">
        <span aria-hidden className={clsx("text-[0.7em]", tone.color)}>
          {tone.glyph}
        </span>
        {lens.verdict}
      </div>
      <p className="mt-1 text-[13px] text-ink-2">{lens.detail}</p>
      <p
        id={`lens-rule-${lens.key}`}
        role="tooltip"
        className="pointer-events-none absolute top-full left-4 z-20 mt-1 hidden w-64 rounded border border-rule bg-sheet px-3 py-2 text-xs text-ink-2 group-hover:block group-focus:block"
      >
        How this is read: {lens.rule}
      </p>
    </li>
  );
}

/** Four one-line reads, one per feature. Each is a rule of thumb, and says so on hover. */
export async function SignalStrip({
  symbol,
  report,
  snapshot,
}: {
  symbol: string;
  report: CompanyReport | null;
  snapshot: TechnicalSnapshot | null;
}) {
  const [summary, articles] = await Promise.all([
    getBrokerSummary(symbol, "1M").catch(() => null),
    (await hasSectorsKey())
      ? getNews({ symbols: [symbol], limit: 30 })
          .then((p) => p.articles)
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  const lenses = [trendLens(snapshot), flowLens(summary, "the last month"), valueLens(report), newsLens(articles)];
  // 1px gaps over a rule-colored ground draw the hairlines between tiles.
  return (
    <ul className="grid grid-cols-2 gap-px border-b border-rule bg-rule lg:grid-cols-4">
      {lenses.map((lens) => (
        <LensTile key={lens.key} lens={lens} />
      ))}
    </ul>
  );
}

export function SignalStripFallback() {
  return (
    <div className="grid grid-cols-2 gap-px border-b border-rule bg-rule lg:grid-cols-4" aria-hidden>
      {["Trend", "Broker flow", "Valuation", "News"].map((t) => (
        <div key={t} className="bg-paper px-4 py-4 odd:pl-0 sm:px-5 sm:odd:pl-0 lg:odd:pl-5 lg:first:pl-0">
          <div className="text-[13px] text-ink-3">{t}</div>
          <div className="mt-2 h-4 w-28 rounded bg-wash" />
          <div className="mt-2 h-3 w-40 rounded bg-wash" />
        </div>
      ))}
    </div>
  );
}
