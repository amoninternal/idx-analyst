"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { fetchJson } from "@/lib/fetcher";
import { fmtCompact, fmtDecimal } from "@/lib/format";
import type { ScreenerResult } from "@/lib/sectors/types";
import { Button, Spinner } from "../controls";
import { Notice } from "../ui";

const EXAMPLES = [
  "Banks with ROE above 15% and P/E below 12",
  "Top 10 companies by dividend yield with market cap above 10 trillion",
  "Coal miners with net profit growth above 20%",
  "Stocks within 5% of their 52-week low",
];

function formatValue(key: string, v: unknown): string {
  if (typeof v !== "number") return v === null || v === undefined ? "—" : String(v);
  if (/yield|roe|roa|margin|growth|change|ratio/i.test(key) && Math.abs(v) < 5) return `${(v * 100).toFixed(1)}%`;
  if (Math.abs(v) >= 1e6) return fmtCompact(v);
  return fmtDecimal(v, Math.abs(v) < 100 ? 2 : 0);
}

const label = (key: string) => key.replace(/_/g, " ").replace(/\[(.+)\]/, " ($1)");

/** Plain-language screening through the Sectors screener. Each query costs 3 credits. */
export function Screener() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ScreenerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (q: string) => {
    if (q.trim().length < 3) return;
    setQuestion(q);
    setLoading(true);
    setError(null);
    try {
      setResult(await fetchJson<ScreenerResult>(`/api/screener?q=${encodeURIComponent(q)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The screener failed.");
    } finally {
      setLoading(false);
    }
  };

  const columns = result ? [...new Set(result.rows.flatMap((r) => Object.keys(r.values)))].slice(0, 6) : [];

  return (
    <section aria-labelledby="screener-title" className="rounded-md border border-rule bg-sheet p-4 sm:p-5">
      <h2 id="screener-title" className="text-lg font-semibold">
        Screen in plain language
      </h2>
      <p className="mt-1 text-[13px] text-ink-3">Describe what you want. Sectors translates it into a filter over every listed company. Each search uses 3 credits.</p>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          run(question);
        }}
        className="mt-3 flex flex-wrap gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. banks with ROE above 15% and P/E below 12"
          aria-label="Screening question"
          className="h-9 min-w-0 flex-1 rounded border border-rule-strong bg-sheet px-3 text-sm placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        <Button type="submit" variant="primary" disabled={loading || question.trim().length < 3}>
          Screen
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => run(ex)} disabled={loading} className="rounded border border-rule px-2 py-0.5 text-xs text-ink-2 hover:border-rule-strong hover:text-ink">
            {ex}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mt-4">
          <Spinner label="Screening" />
        </div>
      )}
      {error && (
        <Notice tone="error" className="mt-4">
          {error}
        </Notice>
      )}
      {result && !loading && (
        <div className="mt-4 space-y-2">
          <p className="text-[13px] text-ink-3">
            {result.total} {result.total === 1 ? "match" : "matches"}
            {result.translated?.where && (
              <>
                {" "}
                for <code className="rounded bg-wash px-1 text-ink-2">{result.translated.where}</code>
              </>
            )}
            {result.translated?.order_by && (
              <>
                , sorted by <code className="rounded bg-wash px-1 text-ink-2">{result.translated.order_by}</code>
              </>
            )}
          </p>
          {result.message && <p className="text-[13px] text-ink-2">{result.message}</p>}
          {result.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px] tnum">
                <thead>
                  <tr className="border-b border-rule text-ink-3">
                    <th className="py-1.5 pr-3 text-left font-medium">Stock</th>
                    {columns.map((c) => (
                      <th key={c} className="px-3 py-1.5 text-right font-medium whitespace-nowrap">
                        {label(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {result.rows.map((r) => (
                    <tr key={r.symbol}>
                      <td className="max-w-0 py-1.5 pr-3">
                        <div className="flex items-baseline gap-2">
                          <Link href={`/stocks/${r.symbol}`} className="condensed font-bold hover:underline">
                            {r.symbol}
                          </Link>
                          <span className="truncate text-xs text-ink-3">{r.name}</span>
                        </div>
                      </td>
                      {columns.map((c) => (
                        <td key={c} className="px-3 py-1.5 text-right">
                          {formatValue(c, r.values[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
