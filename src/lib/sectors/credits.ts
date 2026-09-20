import "server-only";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { todayJakarta } from "../dates";

// Counts Sectors API credits spent per day (Jakarta time), using the cost each
// endpoint documents. It is an estimate for the status page, not billing data.

const file = path.join(config.dataDir, "credits.json");

type Ledger = Record<string, number>;

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

export function recordCredits(cost: number) {
  const day = todayJakarta();
  const book = ledger();
  book[day] = (book[day] ?? 0) + cost;
  if (state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(ledger(), null, 1));
    } catch (err) {
      console.warn("[credits] could not save", err);
    }
  }, 2000);
}

export function creditsToday(): { date: string; today: number } {
  const date = todayJakarta();
  return { date, today: ledger()[date] ?? 0 };
}
