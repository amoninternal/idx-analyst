"use client";

import clsx from "clsx";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { fetchJson, swrFetcher } from "@/lib/fetcher";
import { fmtDate, fmtIdr, fmtInt, fmtPct, fmtPrice } from "@/lib/format";
import type { PortfolioSettings, PortfolioSnapshot, ValuedPosition } from "@/lib/types";
import { AskAnalystButton } from "../analyst/AnalystDrawer";
import { BarList } from "../charts/Bars";
import { Button, Spinner } from "../controls";
import { Delta, Notice, Section, Signed, Stat } from "../ui";
import { PositionForm } from "./PositionForm";

const field = "h-8 w-full rounded border border-rule-strong bg-sheet px-2 text-[13px] tnum focus:border-ink focus:outline-none";

function EditRow({ position, colSpan, onDone }: { position: ValuedPosition; colSpan: number; onDone: () => void }) {
  const [lots, setLots] = useState(String(position.lots));
  const [avgPrice, setAvgPrice] = useState(String(position.avgPrice));
  const [openedAt, setOpenedAt] = useState(position.openedAt ?? "");
  const [notes, setNotes] = useState(position.notes);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await fetchJson(`/api/portfolio/${position.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lots: Number(lots), avgPrice: Number(avgPrice), openedAt: openedAt || null, notes }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-kunyit-wash">
      <td colSpan={colSpan} className="px-3 py-3">
        <form onSubmit={save} className="flex flex-wrap items-end gap-3">
          <label className="w-24 text-xs text-ink-2">
            Lots
            <input value={lots} inputMode="numeric" onChange={(e) => setLots(e.target.value.replace(/\D/g, ""))} className={field} />
          </label>
          <label className="w-32 text-xs text-ink-2">
            Average price
            <input value={avgPrice} inputMode="decimal" onChange={(e) => setAvgPrice(e.target.value.replace(/[^\d.]/g, ""))} className={field} />
          </label>
          <label className="w-40 text-xs text-ink-2">
            Bought on
            <input type="date" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)} className={field} />
          </label>
          <label className="min-w-48 flex-1 text-xs text-ink-2">
            Note
            <input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} className={field} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
          {error && (
            <p role="alert" className="w-full text-[13px] text-down">
              {error}
            </p>
          )}
        </form>
      </td>
    </tr>
  );
}

function FeeSettings({ settings, onSaved }: { settings: PortfolioSettings; onSaved: () => void }) {
  const [buy, setBuy] = useState(String(settings.buyFeePct));
  const [sell, setSell] = useState(String(settings.sellFeePct));
  const [status, setStatus] = useState<string | null>(null);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await fetchJson("/api/portfolio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyFeePct: Number(buy), sellFeePct: Number(sell) }),
      });
      setStatus("Fees saved.");
      onSaved();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save fees.");
    }
  };
  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-3 text-[13px]">
      <label className="w-28 text-xs text-ink-2">
        Buy fee, %
        <input value={buy} inputMode="decimal" onChange={(e) => setBuy(e.target.value)} className={field} />
      </label>
      <label className="w-28 text-xs text-ink-2">
        Sell fee, %
        <input value={sell} inputMode="decimal" onChange={(e) => setSell(e.target.value)} className={field} />
      </label>
      <Button type="submit" size="sm">
        Save fees
      </Button>
      {status && <span className="text-ink-3">{status}</span>}
    </form>
  );
}

export function PortfolioView() {
  const router = useRouter();
  const { data, error, isLoading, isValidating, mutate } = useSWR<PortfolioSnapshot>("/api/portfolio", swrFetcher, {
    revalidateOnFocus: false,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    await mutate();
    router.refresh();
  };

  const remove = async (p: ValuedPosition) => {
    if (!window.confirm(`Remove ${p.symbol} (${p.lots} lots) from your portfolio?`)) return;
    try {
      await fetchJson(`/api/portfolio/${p.id}`, { method: "DELETE" });
      setMessage(`Removed ${p.symbol}.`);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove the position.");
    }
  };

  if (error && !data) return <Notice tone="error" title="Could not load your portfolio">{error.message}</Notice>;
  if (isLoading || !data) return <Spinner label="Valuing your portfolio" />;

  const { positions, totals } = data;
  const empty = positions.length === 0;
  const bySector = Object.entries(
    positions.reduce<Record<string, number>>((acc, p) => {
      if (p.marketValue !== null) acc[p.sector ?? "Unknown sector"] = (acc[p.sector ?? "Unknown sector"] ?? 0) + p.marketValue;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const addForm = (
    <div className="max-w-xl rounded-md border border-rule bg-sheet p-4">
      <PositionForm
        onDone={(m) => {
          setMessage(m);
          setShowAdd(false);
          void refresh();
        }}
      />
    </div>
  );

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          <p className="mt-1 text-ink-2">
            {empty
              ? "Track the stocks you hold."
              : `${positions.length} ${positions.length === 1 ? "position" : "positions"}${data.asOf ? `, valued at the latest price on ${fmtDate(data.asOf)}` : ""}.`}
          </p>
        </div>
        {!empty && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowAdd((s) => !s)} aria-expanded={showAdd}>
              <Plus aria-hidden className="size-4" />
              Add a position
            </Button>
            <AskAnalystButton
              symbol={null}
              prompt="Review my portfolio: concentration by stock and sector, the weakest and strongest positions, broker flow on my biggest holdings, and anything I should watch."
              className="inline-flex h-9 items-center gap-2 rounded bg-ink px-3.5 text-sm font-medium text-sheet hover:bg-ink-hover"
            >
              <span aria-hidden className="size-2 rounded-full bg-kunyit" />
              Ask the analyst to review it
            </AskAnalystButton>
          </div>
        )}
      </div>

      {message && <Notice>{message}</Notice>}
      {data.warnings.map((w) => (
        <Notice key={w}>{w}</Notice>
      ))}

      {empty ? (
        <Section title="Add your first position" description="Enter the lots you hold and your average buy price. Everything is saved on this computer.">
          {addForm}
        </Section>
      ) : (
        <>
          {showAdd && addForm}

          <div className={clsx("grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-5", isValidating && "opacity-60")}>
            <div className="col-span-2">
              <div className="text-[13px] text-ink-3">Market value</div>
              <div className="mt-1 text-5xl leading-none font-semibold">{fmtIdr(totals.marketValue)}</div>
              <div className="mt-2 text-[13px] tnum text-ink-2">Rp {fmtInt(totals.marketValue)}</div>
            </div>
            <Stat
              label="Unrealized P&L"
              value={<Signed value={totals.pnl}>{fmtIdr(totals.pnl, { sign: true })}</Signed>}
              sub={<Signed value={totals.pnlPct}>{fmtPct(totals.pnlPct, { sign: true })}</Signed>}
            />
            <Stat
              label="Today"
              value={<Signed value={totals.dayChange}>{fmtIdr(totals.dayChange, { sign: true })}</Signed>}
              sub={<Delta pct={totals.dayChangePct} showValue={false} />}
            />
            <Stat
              label="After selling fees"
              value={<Signed value={totals.netPnl}>{fmtIdr(totals.netPnl, { sign: true })}</Signed>}
              sub={`Cost ${fmtIdr(totals.cost)} incl. buy fees`}
            />
          </div>

          <Section title="Positions">
            <div className="overflow-x-auto rounded-md border border-rule bg-sheet">
              <table className="w-full text-[13px] tnum">
                <thead>
                  <tr className="border-b border-rule text-right text-ink-3">
                    <th className="px-3 py-2 text-left font-medium">Stock</th>
                    <th className="px-3 py-2 font-medium">Lots</th>
                    <th className="px-3 py-2 font-medium">Avg price</th>
                    <th className="px-3 py-2 font-medium">Last</th>
                    <th className="px-3 py-2 font-medium">Today</th>
                    <th className="px-3 py-2 font-medium">Market value</th>
                    <th className="px-3 py-2 font-medium">P&amp;L</th>
                    <th className="px-3 py-2 font-medium">Weight</th>
                    <th className="px-3 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) =>
                    editing === p.id ? (
                      <EditRow
                        key={p.id}
                        position={p}
                        colSpan={9}
                        onDone={() => {
                          setEditing(null);
                          void refresh();
                        }}
                      />
                    ) : (
                      <tr key={p.id} className="border-t border-rule text-right first:border-t-0 hover:bg-wash">
                        <td className="px-3 py-2 text-left">
                          <Link href={`/stocks/${p.symbol}`} className="condensed font-bold tracking-wide hover:underline">
                            {p.symbol}
                          </Link>
                          <div className="max-w-56 truncate text-xs text-ink-3">{p.name ?? p.notes ?? ""}</div>
                        </td>
                        <td className="px-3 py-2">{fmtInt(p.lots)}</td>
                        <td className="px-3 py-2">{fmtPrice(p.avgPrice)}</td>
                        <td className="px-3 py-2">
                          {fmtPrice(p.lastPrice)}
                          {p.priceSource === "local-vwap" && <span className="ml-1 text-xs text-ink-3">avg</span>}
                        </td>
                        <td className="px-3 py-2">
                          <Delta pct={p.dayChangePct} showValue={false} />
                        </td>
                        <td className="px-3 py-2">{fmtIdr(p.marketValue)}</td>
                        <td className="px-3 py-2">
                          <Signed value={p.pnl}>{fmtIdr(p.pnl, { sign: true })}</Signed>
                          <div className="text-xs">
                            <Signed value={p.pnlPct}>{fmtPct(p.pnlPct, { sign: true, digits: 1 })}</Signed>
                          </div>
                        </td>
                        <td className="px-3 py-2">{fmtPct(p.weight, { digits: 1 })}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditing(p.id)}
                              className="rounded p-1.5 text-ink-3 hover:bg-sheet hover:text-ink"
                              aria-label={`Edit ${p.symbol}`}
                            >
                              <Pencil aria-hidden className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(p)}
                              className="rounded p-1.5 text-ink-3 hover:bg-sheet hover:text-down"
                              aria-label={`Remove ${p.symbol}`}
                            >
                              <Trash2 aria-hidden className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid gap-10 lg:grid-cols-2">
            <Section title="By stock" description="Share of market value.">
              <BarList
                items={positions
                  .filter((p) => p.weight !== null)
                  .map((p) => ({ key: p.id, label: <span className="condensed font-bold">{p.symbol}</span>, value: p.weight! }))}
                format={(n) => fmtPct(n, { digits: 1 })}
              />
            </Section>
            <Section title="By sector" description={bySector.some(([s]) => s === "Unknown sector") ? "Sectors need the Sectors API." : "Share of market value."}>
              <BarList
                items={bySector.map(([sector, value]) => ({ key: sector, label: sector, value: totals.marketValue > 0 ? value / totals.marketValue : 0 }))}
                format={(n) => fmtPct(n, { digits: 1 })}
              />
            </Section>
          </div>

          <Section title="Fees" description="Used for cost and the after-fee P&L. Typical IDX online brokers charge about 0.15% to buy and 0.25% to sell, tax included.">
            <FeeSettings settings={data.settings} onSaved={refresh} />
          </Section>
        </>
      )}
    </div>
  );
}
