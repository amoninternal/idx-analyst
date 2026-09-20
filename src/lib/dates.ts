// Date helpers on plain `YYYY-MM-DD` strings. All arithmetic runs in UTC so a
// calendar date never shifts with the machine's timezone.

const DAY_MS = 86_400_000;

const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export function isWeekend(date: string): boolean {
  const day = new Date(toUtc(date)).getUTCDay();
  return day === 0 || day === 6;
}

/** Today's date in Jakarta (WIB), where IDX trades. */
export function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

/**
 * The latest `end` date safe to send to Sectors. Its servers reject future dates;
 * the UTC date is never ahead of Jakarta's, so it is always accepted.
 */
export function apiToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUtc(value));
}
