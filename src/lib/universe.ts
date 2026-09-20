import "server-only";
import { localTickers } from "./broksum/queries";
import { config, hasSectorsKey } from "./config";
import { getSectorsUniverse } from "./sectors/api";
import { describeError } from "./sectors/client";
import type { Universe, UniverseEntry } from "./types";

const LOCAL_NOTE = "Showing stocks from the local broker data, priced at their last daily average. Add a Sectors API key for names, sectors and fundamentals.";

/** Every listed stock: from the Sectors screener when possible, else the local export. */
export async function getUniverse(): Promise<Universe> {
  let problem: string | null = null;
  if (hasSectorsKey()) {
    try {
      const entries = await getSectorsUniverse();
      if (entries.length) return { source: "sectors", entries };
    } catch (err) {
      problem = describeError(err);
    }
  }
  const rows = await localTickers(config.broksumLastComplete).catch(() => []);
  return {
    source: "local",
    entries: rows.map((r) => ({
      symbol: r.ticker,
      name: null,
      sector: null,
      subSector: null,
      marketCap: null,
      lastPrice: r.vwap,
      change1d: null,
      peTtm: null,
      pbMrq: null,
      roeTtm: null,
      yieldTtm: null,
      value30d: r.value30,
    })),
    note: problem ? `${problem} ${LOCAL_NOTE}` : LOCAL_NOTE,
  };
}

/** Ranks exact symbol, symbol prefix, name word prefix, then name substring. */
export function rankMatches(entries: UniverseEntry[], rawQuery: string, limit = 8): UniverseEntry[] {
  const q = rawQuery.trim().toUpperCase();
  if (!q) return [];
  const scored: { entry: UniverseEntry; score: number }[] = [];
  for (const entry of entries) {
    const name = (entry.name ?? "").toUpperCase();
    let score = 0;
    if (entry.symbol === q) score = 100;
    else if (entry.symbol.startsWith(q)) score = 80;
    else if (name.split(/\s+/).some((w) => w.replace(/^PT\.?$/, "").startsWith(q))) score = 60;
    else if (q.length >= 3 && name.includes(q)) score = 40;
    if (score) scored.push({ entry, score: score + Math.min(10, Math.log10((entry.marketCap ?? 1) + 1) / 2) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.entry);
}

export async function searchStocks(query: string, limit = 8): Promise<UniverseEntry[]> {
  const universe = await getUniverse();
  return rankMatches(universe.entries, query, limit);
}
