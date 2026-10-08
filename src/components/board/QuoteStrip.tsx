import Link from "next/link";
import { connection } from "next/server";
import { config } from "@/lib/config";
import { fmtDate } from "@/lib/format";
import { hasSectorsKey } from "@/lib/keys";
import { listPositions } from "@/lib/portfolio";
import { getQuote } from "@/lib/prices";
import { getIndexSeries, getSectorsUniverse } from "@/lib/sectors/api";
import { TickerTape, type TapeGroup, type TapeItem } from "./TickerTape";

const INDICES = [
  { code: "ihsg", label: "IHSG" },
  { code: "lq45", label: "LQ45" },
  { code: "idx30", label: "IDX30" },
  { code: "kompas100", label: "KOMPAS100" },
];
const LARGEST = 30;

async function indexItem(code: string, label: string): Promise<TapeItem | null> {
  const series = await getIndexSeries(code, 14).catch(() => []);
  const last = series.at(-1);
  const prev = series.at(-2);
  if (!last) return null;
  return { kind: "index", label, value: last.value, pct: prev && prev.value > 0 ? last.value / prev.value - 1 : null };
}

/**
 * The board's ticker tape: the main indices, then the stocks you hold, then the largest
 * companies on IDX, each with its last close and day change. Prices are end of day.
 */
export async function QuoteStrip() {
  await connection();
  if (!(await hasSectorsKey())) {
    return (
      <p className="flex h-10 items-center overflow-x-auto border-t border-board-rule text-[13px] whitespace-nowrap text-board-muted">
        {config.keyMode === "user" ? (
          <>
            <Link href="/connect" className="mr-1 font-medium text-board-ink underline underline-offset-2">
              Connect your Sectors key
            </Link>
            for live prices, news and fundamentals.
          </>
        ) : (
          <>Broker data through {fmtDate(config.broksumLastComplete)}. Add a Sectors API key for live prices, news and fundamentals.</>
        )}
      </p>
    );
  }

  const { positions } = await listPositions().catch(() => ({ positions: [] as { symbol: string }[] }));
  const held = new Set(positions.map((p) => p.symbol));
  const [indices, holdings, universe] = await Promise.all([
    Promise.all(INDICES.map((i) => indexItem(i.code, i.label))),
    Promise.all(
      positions.slice(0, 12).map(async (p): Promise<TapeItem | null> => {
        const q = await getQuote(p.symbol).catch(() => null);
        return q ? { kind: "stock", label: p.symbol, value: q.price, pct: q.changePct, held: true } : null;
      }),
    ),
    // Shared with search and the stock list, refreshed once a day after the close.
    getSectorsUniverse().catch(() => []),
  ]);
  const largest: TapeItem[] = universe
    .filter((e) => e.lastPrice !== null && !held.has(e.symbol))
    .slice(0, LARGEST)
    .map((e) => ({ kind: "stock", label: e.symbol, value: e.lastPrice!, pct: e.change1d }));

  const groups: TapeGroup[] = [
    { name: "Indices", items: indices.filter((i): i is TapeItem => i !== null) },
    { name: "Your stocks", items: holdings.filter((i): i is TapeItem => i !== null) },
    { name: "Largest companies", items: largest },
  ].filter((g) => g.items.length > 0);
  if (!groups.length) return <div className="h-10 border-t border-board-rule" />;
  return <TickerTape groups={groups} />;
}
