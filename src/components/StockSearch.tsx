"use client";

import clsx from "clsx";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { fetchJson } from "@/lib/fetcher";
import { fmtIdr } from "@/lib/format";
import type { UniverseEntry } from "@/lib/types";

/**
 * Ticker search. By default choosing a result opens its stock page; pass
 * `onSelect` to use it as a picker instead (e.g. in the portfolio form).
 */
export function StockSearch({
  variant = "light",
  onSelect,
  placeholder = "Search stocks",
  className,
  autoFocus,
  value,
}: {
  variant?: "board" | "light";
  onSelect?: (entry: { symbol: string; name: string | null; lastPrice: number | null }) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  value?: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState(value ?? "");
  const [results, setResults] = useState<UniverseEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const id = ++requestRef.current;
    const timer = setTimeout(async () => {
      try {
        const rows = await fetchJson<UniverseEntry[]>(`/api/search?q=${encodeURIComponent(q)}`);
        if (id === requestRef.current) {
          setResults(rows);
          setActive(0);
        }
      } catch {
        if (id === requestRef.current) setResults([]);
      }
    }, 140);
    return () => clearTimeout(timer);
  }, [query]);

  const choose = (entry: { symbol: string; name: string | null; lastPrice: number | null }) => {
    setOpen(false);
    if (onSelect) {
      setQuery(entry.symbol);
      onSelect(entry);
    } else {
      setQuery("");
      router.push(`/stocks/${entry.symbol}`);
    }
  };

  // Results for an older query stay in state; show nothing once the box is cleared.
  const matches = query.trim() ? results : [];

  const submitTyped = () => {
    const pick = matches[active];
    if (pick) return choose(pick);
    const typed = query.trim().toUpperCase();
    if (/^[A-Z]{4}$/.test(typed)) choose({ symbol: typed, name: null, lastPrice: null });
  };

  const board = variant === "board";
  const showList = open && matches.length > 0;

  return (
    <div className={clsx("relative", className)}>
      <Search
        aria-hidden
        className={clsx("pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2", board ? "text-board-muted" : "text-ink-3")}
      />
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        aria-label="Search stocks by ticker or name"
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(matches.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            submitTyped();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={clsx(
          "h-9 w-full rounded pr-3 pl-8 text-sm focus:outline-none",
          board
            ? "border border-board-rule bg-board-2 text-board-ink placeholder:text-board-muted focus:border-board-muted"
            : "border border-rule-strong bg-sheet text-ink placeholder:text-ink-3 focus:border-ink",
        )}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-40 mt-1 max-h-80 overflow-y-auto rounded-md border border-rule bg-sheet py-1 text-ink"
        >
          {matches.map((r, i) => (
            <li
              key={r.symbol}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx("flex cursor-pointer items-baseline gap-3 px-3 py-1.5", i === active && "bg-wash")}
            >
              <span className="condensed w-12 shrink-0 font-bold">{r.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{r.name ?? "No name in local data"}</span>
              {r.marketCap !== null && <span className="tnum shrink-0 text-xs text-ink-3">{fmtIdr(r.marketCap)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
