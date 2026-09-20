// Number and date formatting shared by server and client code.
// IDX conventions: prices in whole rupiah, 1 lot = 100 shares.

const MINUS = "−";

const intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDpFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDpFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function withSign(text: string, n: number, sign: boolean): string {
  if (n < 0) return MINUS + text;
  if (sign && n > 0) return "+" + text;
  return text;
}

/** A share price: whole rupiah, one decimal below Rp 100 (averages can be fractional). */
export function fmtPrice(n: number | null | undefined): string {
  if (!isNum(n)) return "—";
  const abs = Math.abs(n);
  return withSign(abs < 100 && !Number.isInteger(abs) ? oneDpFmt.format(abs) : intFmt.format(Math.round(abs)), n, false);
}

export function fmtInt(n: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (!isNum(n)) return "—";
  return withSign(intFmt.format(Math.abs(Math.round(n))), n, opts.sign ?? false);
}

/** 1.23T, 412.5B, 12.3M, 950K. */
export function fmtCompact(n: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (!isNum(n)) return "—";
  const abs = Math.abs(n);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  let text = intFmt.format(abs);
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = abs / size;
      text = (scaled >= 100 ? intFmt.format(scaled) : scaled >= 10 ? oneDpFmt.format(scaled) : twoDpFmt.format(scaled)) + suffix;
      break;
    }
  }
  return withSign(text, n, opts.sign ?? false);
}

/** Rupiah amount, compact: Rp 1.23T. */
export function fmtIdr(n: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (!isNum(n)) return "—";
  const text = fmtCompact(Math.abs(n));
  return withSign(`Rp ${text}`, n, opts.sign ?? false);
}

/** Shares to lots, compact. */
export function fmtLots(shares: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (!isNum(shares)) return "—";
  return fmtCompact(shares / 100, opts);
}

/** A ratio (0.0141) as a percentage (1.41%). */
export function fmtPct(ratio: number | null | undefined, opts: { sign?: boolean; digits?: number } = {}): string {
  if (!isNum(ratio)) return "—";
  const digits = opts.digits ?? 2;
  const text = `${Math.abs(ratio * 100).toFixed(digits)}%`;
  return withSign(text, ratio, opts.sign ?? false);
}

/** A multiple such as P/E: 17.2×. */
export function fmtMultiple(n: number | null | undefined): string {
  if (!isNum(n)) return "—";
  return withSign(`${oneDpFmt.format(Math.abs(n))}×`, n, false);
}

export function fmtDecimal(n: number | null | undefined, digits = 1): string {
  if (!isNum(n)) return "—";
  return withSign(Math.abs(n).toFixed(digits), n, false);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 2026-09-18 → 18 Sep 2026 */
export function fmtDate(iso: string | null | undefined, opts: { year?: boolean } = {}): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  const base = `${Number(d)} ${MONTHS[Number(m) - 1]}`;
  return opts.year === false ? base : `${base} ${y}`;
}

/** Sectors timestamps carry no zone and are Jakarta time (WIB, UTC+7). */
export function parseWib(iso: string): number {
  return Date.parse(iso.endsWith("Z") || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}+07:00`);
}

export function fmtTimeAgo(iso: string, now = Date.now()): string {
  const then = parseWib(iso);
  if (Number.isNaN(then)) return iso;
  const minutes = Math.round((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso.slice(0, 10), { year: days > 300 });
}

/** Direction of a change, for coloring and arrows. */
export function direction(n: number | null | undefined): "up" | "down" | "flat" {
  if (!isNum(n) || n === 0) return "flat";
  return n > 0 ? "up" : "down";
}
