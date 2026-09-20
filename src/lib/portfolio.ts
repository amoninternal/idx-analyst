import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config, hasSectorsKey } from "./config";
import { isIsoDate } from "./dates";
import { getQuote } from "./prices";
import { getCompanyReport, getSectorsUniverse } from "./sectors/api";
import { isValidSymbol, normalizeSymbol } from "./sectors/client";
import type { PortfolioSettings, PortfolioSnapshot, Position, ValuedPosition } from "./types";

// Positions live in .data/portfolio.json, one position per stock. Adding a
// stock you already hold merges into it at the combined average price.

const file = path.join(config.dataDir, "portfolio.json");

type Store = { positions: Position[]; settings: PortfolioSettings };

const DEFAULT_SETTINGS: PortfolioSettings = { buyFeePct: 0.15, sellFeePct: 0.25 };

export class PortfolioError extends Error {}

async function load(): Promise<Store> {
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as Partial<Store>;
    return { positions: raw.positions ?? [], settings: { ...DEFAULT_SETTINGS, ...raw.settings } };
  } catch {
    return { positions: [], settings: { ...DEFAULT_SETTINGS } };
  }
}

async function save(store: Store) {
  await fs.mkdir(config.dataDir, { recursive: true });
  const tmp = `${file}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2));
  await fs.rename(tmp, file);
}

// Writes are serialized so two quick edits can't overwrite each other.
const state = ((globalThis as { __idxPortfolio?: { queue: Promise<unknown> } }).__idxPortfolio ??= { queue: Promise.resolve() });

function mutate<T>(fn: (store: Store) => T): Promise<T> {
  const run = state.queue.then(async () => {
    const store = await load();
    const result = fn(store);
    await save(store);
    return result;
  });
  state.queue = run.catch(() => undefined);
  return run;
}

export type PositionInput = { symbol: string; lots: number; avgPrice: number; openedAt?: string | null; notes?: string };

function validate(input: Partial<PositionInput>, partial: boolean): Partial<PositionInput> {
  const out: Partial<PositionInput> = {};
  if (input.symbol !== undefined || !partial) {
    if (typeof input.symbol !== "string" || !isValidSymbol(input.symbol)) throw new PortfolioError("Enter a four-letter IDX symbol, like BBCA.");
    out.symbol = normalizeSymbol(input.symbol);
  }
  if (input.lots !== undefined || !partial) {
    const lots = Number(input.lots);
    if (!Number.isInteger(lots) || lots <= 0 || lots > 10_000_000) throw new PortfolioError("Lots must be a whole number above zero.");
    out.lots = lots;
  }
  if (input.avgPrice !== undefined || !partial) {
    const price = Number(input.avgPrice);
    if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) throw new PortfolioError("Average price must be above zero.");
    out.avgPrice = price;
  }
  if (input.openedAt !== undefined && input.openedAt !== null && input.openedAt !== "") {
    if (!isIsoDate(input.openedAt)) throw new PortfolioError("Buy date must be YYYY-MM-DD.");
    out.openedAt = input.openedAt;
  } else if (input.openedAt !== undefined) {
    out.openedAt = null;
  }
  if (input.notes !== undefined) out.notes = String(input.notes).slice(0, 500);
  return out;
}

export async function listPositions(): Promise<Store> {
  return load();
}

export async function addPosition(input: PositionInput): Promise<{ position: Position; merged: boolean }> {
  const clean = validate(input, false) as Required<Pick<PositionInput, "symbol" | "lots" | "avgPrice">> & PositionInput;
  return mutate((store) => {
    const now = new Date().toISOString();
    const existing = store.positions.find((p) => p.symbol === clean.symbol);
    if (existing) {
      const lots = existing.lots + clean.lots;
      existing.avgPrice = (existing.lots * existing.avgPrice + clean.lots * clean.avgPrice) / lots;
      existing.lots = lots;
      if (clean.openedAt && (!existing.openedAt || clean.openedAt < existing.openedAt)) existing.openedAt = clean.openedAt;
      if (clean.notes) existing.notes = existing.notes ? `${existing.notes}\n${clean.notes}` : clean.notes;
      existing.updatedAt = now;
      return { position: existing, merged: true };
    }
    const position: Position = {
      id: crypto.randomUUID(),
      symbol: clean.symbol,
      lots: clean.lots,
      avgPrice: clean.avgPrice,
      openedAt: clean.openedAt ?? null,
      notes: clean.notes ?? "",
      createdAt: now,
      updatedAt: now,
    };
    store.positions.push(position);
    return { position, merged: false };
  });
}

export async function updatePosition(id: string, patch: Partial<PositionInput>): Promise<Position> {
  const clean = validate(patch, true);
  return mutate((store) => {
    const position = store.positions.find((p) => p.id === id);
    if (!position) throw new PortfolioError("That position no longer exists.");
    if (clean.symbol && clean.symbol !== position.symbol && store.positions.some((p) => p.symbol === clean.symbol)) {
      throw new PortfolioError(`You already hold ${clean.symbol}. Edit that position instead.`);
    }
    Object.assign(position, clean, { updatedAt: new Date().toISOString() });
    return position;
  });
}

export async function removePosition(id: string): Promise<void> {
  await mutate((store) => {
    const before = store.positions.length;
    store.positions = store.positions.filter((p) => p.id !== id);
    if (store.positions.length === before) throw new PortfolioError("That position no longer exists.");
  });
}

export async function updateSettings(patch: Partial<PortfolioSettings>): Promise<PortfolioSettings> {
  const pct = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 5) throw new PortfolioError("Fees must be between 0% and 5%.");
    return n;
  };
  return mutate((store) => {
    if (patch.buyFeePct !== undefined) store.settings.buyFeePct = pct(patch.buyFeePct);
    if (patch.sellFeePct !== undefined) store.settings.sellFeePct = pct(patch.sellFeePct);
    return store.settings;
  });
}

async function companyInfo(symbols: string[]): Promise<Map<string, { name: string | null; sector: string | null }>> {
  const info = new Map<string, { name: string | null; sector: string | null }>();
  if (!hasSectorsKey() || symbols.length === 0) return info;
  const universe = await getSectorsUniverse().catch(() => []);
  for (const e of universe) info.set(e.symbol, { name: e.name, sector: e.sector });
  // The screener may not return sectors; the overview section always does (1 credit, cached 12h).
  await Promise.all(
    symbols
      .filter((s) => !info.get(s)?.sector)
      .map(async (s) => {
        try {
          const report = await getCompanyReport(s, ["overview"]);
          info.set(s, { name: report.company_name ?? info.get(s)?.name ?? null, sector: report.overview?.sector ?? null });
        } catch {
          // Leave the sector blank.
        }
      }),
  );
  return info;
}

/** Positions valued at the latest close, with P&L, day change and weights. */
export async function valuePortfolio(): Promise<PortfolioSnapshot> {
  const { positions, settings } = await load();
  const warnings: string[] = [];
  const symbols = positions.map((p) => p.symbol);
  const [quotes, info] = await Promise.all([
    Promise.all(symbols.map((s) => getQuote(s).catch(() => null))),
    companyInfo(symbols),
  ]);

  const valued: ValuedPosition[] = positions.map((p, i) => {
    const q = quotes[i];
    const shares = p.lots * 100;
    const cost = shares * p.avgPrice * (1 + settings.buyFeePct / 100);
    const marketValue = q ? shares * q.price : null;
    const pnl = marketValue !== null ? marketValue - cost : null;
    const sellFee = marketValue !== null ? marketValue * (settings.sellFeePct / 100) : null;
    const dayChange = q && q.change !== null ? shares * q.change : null;
    if (!q) warnings.push(`No price for ${p.symbol}.`);
    return {
      ...p,
      name: info.get(p.symbol)?.name ?? null,
      sector: info.get(p.symbol)?.sector ?? null,
      lastPrice: q?.price ?? null,
      lastDate: q?.date ?? null,
      prevClose: q?.prevClose ?? null,
      cost,
      marketValue,
      pnl,
      pnlPct: pnl !== null && cost > 0 ? pnl / cost : null,
      netPnl: pnl !== null && sellFee !== null ? pnl - sellFee : null,
      dayChange,
      dayChangePct: q?.changePct ?? null,
      weight: null,
      priceSource: q?.source ?? null,
    };
  });

  const priced = valued.filter((v) => v.marketValue !== null);
  const marketValue = priced.reduce((s, v) => s + v.marketValue!, 0);
  for (const v of valued) v.weight = v.marketValue !== null && marketValue > 0 ? v.marketValue / marketValue : null;
  const pricedCost = priced.reduce((s, v) => s + v.cost, 0);
  const pnl = priced.reduce((s, v) => s + v.pnl!, 0);
  const netPnl = priced.reduce((s, v) => s + (v.netPnl ?? 0), 0);
  const dayChange = priced.reduce((s, v) => s + (v.dayChange ?? 0), 0);
  const prevValue = marketValue - dayChange;
  if (valued.some((v) => v.priceSource === "local-vwap")) {
    warnings.push("Some prices are daily averages from the local broker data, not closing prices.");
  }
  const dates = valued.map((v) => v.lastDate).filter((d): d is string => Boolean(d)).sort();

  return {
    positions: valued.sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0)),
    settings,
    totals: {
      cost: valued.reduce((s, v) => s + v.cost, 0),
      marketValue,
      pnl,
      pnlPct: pricedCost > 0 ? pnl / pricedCost : null,
      netPnl,
      dayChange,
      dayChangePct: prevValue > 0 ? dayChange / prevValue : null,
    },
    asOf: dates.at(-1) ?? null,
    warnings,
  };
}
