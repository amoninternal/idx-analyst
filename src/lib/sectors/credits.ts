import "server-only";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { addDays, todayJakarta } from "../dates";

// Counts Sectors API credits spent per day (Jakarta time), using the cost each
// endpoint documents. It is an estimate for the status page, not billing data.
// With visitor keys, each visitor has their own counter (keyed by their data scope).

const file = path.join(config.dataDir, "credits.json");

type Ledger = Record<string, number>;

/** "2026-10-08" when you run it yourself (the original format), "v-…|2026-10-08" per visitor. */
const entry = (scopeId: string, day: string) => (scopeId === "local" ? day : `${scopeId}|${day}`);

const state = ((globalThis as { __idxCredits?: { ledger: Ledger | null; timer: NodeJS.Timeout | null } }).__idxCredits ??= {
  ledger: null,
  timer: null,
});

function ledger(): Ledger {
  if (!state.ledger) {
    try {
      state.ledger = JSON.parse(fs.readFileSync(file, "utf8")) as Ledger;
    } catch {
      state.ledger = {};
    }
  }
  return state.ledger;
}

export function recordCredits(scopeId: string, cost: number) {
  const day = entry(scopeId, todayJakarta());
  const book = ledger();
  book[day] = (book[day] ?? 0) + cost;
  if (state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    // Keep a month of history; older days (and visitors who stopped coming) drop out.
    const cutoff = addDays(todayJakarta(), -31);
    for (const k of Object.keys(book)) if ((k.split("|").at(-1) ?? k) < cutoff) delete book[k];
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(ledger(), null, 1));
    } catch (err) {
      console.warn("[credits] could not save", err);
    }
  }, 2000);
}

export function creditsToday(scopeId: string): { date: string; today: number } {
  const date = todayJakarta();
  return { date, today: ledger()[entry(scopeId, date)] ?? 0 };
}
