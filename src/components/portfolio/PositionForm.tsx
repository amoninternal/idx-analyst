"use client";

import { useState, type FormEvent } from "react";
import { mutate } from "swr";
import { useRouter } from "next/navigation";
import { todayJakarta } from "@/lib/dates";
import { fetchJson } from "@/lib/fetcher";
import { fmtPrice } from "@/lib/format";
import type { Position } from "@/lib/types";
import { Button } from "../controls";
import { StockSearch } from "../StockSearch";

const field = "h-9 w-full rounded border border-rule-strong bg-sheet px-2.5 text-sm tnum focus:border-ink focus:outline-none";

/** Add a position. With `symbol` set, the stock is fixed; otherwise the user picks one. */
export function PositionForm({
  symbol: fixedSymbol,
  price,
  onDone,
}: {
  symbol?: string;
  price?: number | null;
  onDone?: (message: string) => void;
}) {
  const router = useRouter();
  const [symbol, setSymbol] = useState(fixedSymbol ?? "");
  const [lots, setLots] = useState("1");
  const [avgPrice, setAvgPrice] = useState(price ? String(Math.round(price)) : "");
  const [openedAt, setOpenedAt] = useState(todayJakarta());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { position, merged } = await fetchJson<{ position: Position; merged: boolean }>("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, lots: Number(lots), avgPrice: Number(avgPrice), openedAt: openedAt || null, notes }),
      });
      await mutate("/api/portfolio");
      router.refresh();
      onDone?.(
        merged
          ? `Added to your ${position.symbol} position: now ${position.lots} lots at ${fmtPrice(position.avgPrice)} average.`
          : `Added ${position.lots} lots of ${position.symbol} at ${fmtPrice(position.avgPrice)}.`,
      );
      if (!fixedSymbol) setSymbol("");
      setLots("1");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the position.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {!fixedSymbol && (
          <div className="col-span-2">
            <label className="mb-1 block text-[13px] text-ink-2">Stock</label>
            <StockSearch
              placeholder="Ticker or company"
              onSelect={(entry) => {
                setSymbol(entry.symbol);
                if (entry.lastPrice && !avgPrice) setAvgPrice(String(Math.round(entry.lastPrice)));
              }}
            />
          </div>
        )}
        <div>
          <label htmlFor="pf-lots" className="mb-1 block text-[13px] text-ink-2">
            Lots <span className="text-ink-3">(100 shares)</span>
          </label>
          <input id="pf-lots" inputMode="numeric" required value={lots} onChange={(e) => setLots(e.target.value.replace(/\D/g, ""))} className={field} />
        </div>
        <div>
          <label htmlFor="pf-price" className="mb-1 block text-[13px] text-ink-2">
            Average price (Rp)
          </label>
          <input
            id="pf-price"
            inputMode="decimal"
            required
            value={avgPrice}
            onChange={(e) => setAvgPrice(e.target.value.replace(/[^\d.]/g, ""))}
            className={field}
          />
        </div>
        <div>
          <label htmlFor="pf-date" className="mb-1 block text-[13px] text-ink-2">
            Bought on
          </label>
          <input id="pf-date" type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="pf-notes" className="mb-1 block text-[13px] text-ink-2">
            Note
          </label>
          <input id="pf-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className={field} placeholder="Optional" />
        </div>
      </div>
      {symbol && lots && avgPrice && (
        <p className="text-[13px] text-ink-3">
          {Number(lots).toLocaleString("en-US")} lots of {symbol} = {(Number(lots) * 100).toLocaleString("en-US")} shares, Rp{" "}
          {(Number(lots) * 100 * Number(avgPrice)).toLocaleString("en-US", { maximumFractionDigits: 0 })} before fees. Buying a stock
          you already hold adds to that position.
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-down">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={saving || !symbol || !lots || !avgPrice}>
        {saving ? "Adding…" : "Add position"}
      </Button>
    </form>
  );
}
