import Link from "next/link";
import { connection } from "next/server";
import { config, hasSectorsKey } from "@/lib/config";
import { fmtDate, fmtPrice } from "@/lib/format";
import { listPositions } from "@/lib/portfolio";
import { getQuote } from "@/lib/prices";
import { getIndexSeries } from "@/lib/sectors/api";
import { Delta } from "../ui";

type Item = { kind: "index" | "stock"; label: string; value: number; pct: number | null };

const indexFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function indexItem(code: string, label: string): Promise<Item | null> {
  const series = await getIndexSeries(code, 14).catch(() => []);
  const last = series.at(-1);
  const prev = series.at(-2);
  if (!last) return null;
  return { kind: "index", label, value: last.value, pct: prev && prev.value > 0 ? last.value / prev.value - 1 : null };
}

/** The board's quote row: indices, then the stocks you hold. */
export async function QuoteStrip() {
  await connection();
  if (!hasSectorsKey()) {
    return (
      <p className="flex h-10 items-center overflow-x-auto border-t border-board-rule text-[13px] whitespace-nowrap text-board-muted">
        Broker data through {fmtDate(config.broksumLastComplete)}. Add a Sectors API key for live prices, news and fundamentals.
      </p>
    );
  }

  const { positions } = await listPositions();
  const [indices, holdings] = await Promise.all([
    Promise.all([indexItem("ihsg", "IHSG"), indexItem("lq45", "LQ45")]),
    Promise.all(
      positions.slice(0, 8).map(async (p): Promise<Item | null> => {
        const q = await getQuote(p.symbol).catch(() => null);
        return q ? { kind: "stock", label: p.symbol, value: q.price, pct: q.changePct } : null;
      }),
    ),
  ]);
  const groups = [indices, holdings].map((g) => g.filter((i): i is Item => i !== null)).filter((g) => g.length);
  if (!groups.length) return <div className="h-10 border-t border-board-rule" />;

  return (
    <div className="flex h-10 items-center gap-6 overflow-x-auto border-t border-board-rule text-[13px] whitespace-nowrap">
      {groups.map((group, g) => (
        <ul key={g} className={g > 0 ? "flex items-center gap-6 border-l border-board-rule pl-6" : "flex items-center gap-6"}>
          {group.map((item) => {
            const body = (
              <>
                <span className="condensed font-bold tracking-wide text-board-ink">{item.label}</span>
                <span className="tnum font-medium text-kunyit">{item.kind === "index" ? indexFmt.format(item.value) : fmtPrice(item.value)}</span>
                <Delta pct={item.pct} onBoard showValue={false} />
              </>
            );
            return (
              <li key={item.label}>
                {item.kind === "stock" ? (
                  <Link href={`/stocks/${item.label}`} className="flex items-baseline gap-2 hover:underline">
                    {body}
                  </Link>
                ) : (
                  <span className="flex items-baseline gap-2">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
