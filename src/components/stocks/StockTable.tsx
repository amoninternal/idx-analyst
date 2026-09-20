"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtIdr, fmtMultiple, fmtPct, fmtPrice } from "@/lib/format";
import type { Universe, UniverseEntry } from "@/lib/types";
import { Button } from "../controls";
import { Delta, Notice } from "../ui";

type Column = {
  key: keyof UniverseEntry;
  label: string;
  numeric: boolean;
  render: (e: UniverseEntry) => React.ReactNode;
};

const COLUMNS: Column[] = [
  { key: "name", label: "Company", numeric: false, render: (e) => <span className="block max-w-72 truncate text-ink-2">{e.name ?? "—"}</span> },
  { key: "sector", label: "Sector", numeric: false, render: (e) => <span className="block max-w-44 truncate text-ink-2">{e.subSector ?? e.sector ?? "—"}</span> },
  { key: "lastPrice", label: "Price", numeric: true, render: (e) => fmtPrice(e.lastPrice) },
  { key: "change1d", label: "1 day", numeric: true, render: (e) => <Delta pct={e.change1d} showValue={false} /> },
  { key: "marketCap", label: "Market cap", numeric: true, render: (e) => fmtIdr(e.marketCap) },
  { key: "peTtm", label: "P/E", numeric: true, render: (e) => fmtMultiple(e.peTtm) },
  { key: "pbMrq", label: "P/B", numeric: true, render: (e) => fmtMultiple(e.pbMrq) },
  { key: "roeTtm", label: "ROE", numeric: true, render: (e) => fmtPct(e.roeTtm, { digits: 1 }) },
  { key: "yieldTtm", label: "Yield", numeric: true, render: (e) => fmtPct(e.yieldTtm, { digits: 1 }) },
  { key: "value30d", label: "Value traded, 30 days", numeric: true, render: (e) => fmtIdr(e.value30d) },
];

const PAGE = 50;

export function StockTable({ universe }: { universe: Universe }) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState<{ key: keyof UniverseEntry; desc: boolean }>({
    key: universe.source === "local" ? "value30d" : "marketCap",
    desc: true,
  });
  const [page, setPage] = useState(0);

  // Only show columns the source actually filled in.
  const columns = useMemo(() => COLUMNS.filter((c) => universe.entries.some((e) => e[c.key] !== null && e[c.key] !== undefined)), [universe]);
  const sectors = useMemo(
    () => [...new Set(universe.entries.map((e) => e.sector).filter((s): s is string => Boolean(s)))].sort(),
    [universe],
  );

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const filtered = universe.entries.filter(
      (e) => (!q || e.symbol.includes(q) || (e.name ?? "").toUpperCase().includes(q)) && (!sector || e.sector === sector),
    );
    const dir = sort.desc ? -1 : 1;
    return filtered.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return (typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv))) * dir;
    });
  }, [universe, query, sector, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE, current * PAGE + PAGE);

  const sortBy = (key: keyof UniverseEntry, numeric: boolean) => {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: numeric }));
    setPage(0);
  };

  return (
    <div className="space-y-3">
      {universe.note && <Notice>{universe.note}</Notice>}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Filter by ticker or name"
          aria-label="Filter stocks by ticker or name"
          className="h-9 w-full max-w-xs rounded border border-rule-strong bg-sheet px-3 text-sm placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        {sectors.length > 0 && (
          <select
            value={sector}
            onChange={(e) => {
              setSector(e.target.value);
              setPage(0);
            }}
            aria-label="Filter by sector"
            className="h-9 rounded border border-rule-strong bg-sheet px-2 text-sm focus:border-ink focus:outline-none"
          >
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <span className="text-[13px] text-ink-3 tnum">{rows.length.toLocaleString("en-US")} stocks</span>
      </div>

      <div className={clsx("overflow-x-auto rounded-md border border-rule bg-sheet", columns.length <= 3 && "max-w-2xl")}>
        <table className="w-full text-[13px] tnum">
          <thead>
            <tr className="border-b border-rule text-ink-3">
              <th className="px-3 py-2 text-left font-medium">
                <button type="button" onClick={() => sortBy("symbol", false)} className="inline-flex items-center gap-1 hover:text-ink">
                  Ticker
                  {sort.key === "symbol" && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                </button>
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}
                  className={clsx("px-3 py-2 font-medium whitespace-nowrap", c.numeric ? "text-right" : "text-left")}
                >
                  <button type="button" onClick={() => sortBy(c.key, c.numeric)} className="inline-flex items-center gap-1 hover:text-ink">
                    {c.label}
                    {sort.key === c.key && (sort.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr key={e.symbol} className="border-t border-rule first:border-t-0 hover:bg-wash">
                <td className="px-3 py-1.5">
                  <Link href={`/stocks/${e.symbol}`} className="condensed font-bold tracking-wide hover:underline">
                    {e.symbol}
                  </Link>
                </td>
                {columns.map((c) => (
                  <td key={c.key} className={clsx("px-3 py-1.5", c.numeric && "text-right")}>
                    {c.render(e)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => setPage(current - 1)} disabled={current === 0}>
            Previous
          </Button>
          <span className="text-[13px] text-ink-3 tnum">
            Page {current + 1} of {pages}
          </span>
          <Button size="sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
