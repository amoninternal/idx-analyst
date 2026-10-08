import clsx from "clsx";
import type { ReactNode } from "react";
import { direction, fmtPct, fmtPrice } from "@/lib/format";
import { CATEGORY_LABEL, type BrokerCategory } from "@/lib/types";

// Presentational pieces shared by server and client components.

export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={clsx("min-w-0", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          {description && <p className="mt-1 text-[13px] text-ink-3">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Sheet({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("rounded-md border border-rule bg-sheet", className)}>{children}</div>;
}

const ARROW = { up: "▲", down: "▼", flat: "" } as const;

/** A price change: arrow, sign and color together, so direction never rests on color alone. */
export function Delta({
  value,
  pct,
  onBoard = false,
  className,
  showValue = true,
}: {
  value?: number | null;
  pct?: number | null;
  onBoard?: boolean;
  className?: string;
  showValue?: boolean;
}) {
  const dir = direction(pct ?? value ?? null);
  const color =
    dir === "up" ? (onBoard ? "text-up-board" : "text-up") : dir === "down" ? (onBoard ? "text-down-board" : "text-down") : onBoard ? "text-board-muted" : "text-ink-3";
  const parts: string[] = [];
  if (showValue && value !== undefined && value !== null) parts.push(`${value > 0 ? "+" : ""}${fmtPrice(value)}`);
  if (pct !== undefined && pct !== null) parts.push(showValue && value != null ? `(${fmtPct(pct, { sign: true })})` : fmtPct(pct, { sign: true }));
  if (!parts.length) return <span className={clsx("text-ink-3", className)}>—</span>;
  return (
    <span className={clsx("tnum whitespace-nowrap", color, className)}>
      {ARROW[dir] && (
        <span aria-hidden className="mr-0.5 text-[0.7em]">
          {ARROW[dir]}
        </span>
      )}
      {parts.join(" ")}
    </span>
  );
}

/** Colored text for a signed amount that is not a price change (net flows, P&L). */
export function Signed({ value, children, className }: { value: number | null | undefined; children: ReactNode; className?: string }) {
  const dir = direction(value);
  return <span className={clsx("tnum", dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-ink-2", className)}>{children}</span>;
}

export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("min-w-0", className)}>
      <div className="text-[13px] text-ink-3">{label}</div>
      <div className="mt-0.5 text-xl font-semibold leading-tight">{value}</div>
      {sub && <div className="mt-1 text-[13px] text-ink-2">{sub}</div>}
    </div>
  );
}

export const CATEGORY_COLOR: Record<BrokerCategory, string> = {
  foreign: "var(--color-foreign)",
  institution: "var(--color-institution)",
  retail: "var(--color-retail)",
  other: "var(--color-other)",
};

export function CategoryDot({ category, className }: { category: BrokerCategory; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: CATEGORY_COLOR[category] }}
    />
  );
}

/** Two-letter broker code with its category marker; the full name is in the tooltip. */
export function BrokerCode({ code, name, category }: { code: string; name?: string; category: BrokerCategory }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={name ? `${name} (${CATEGORY_LABEL[category]})` : CATEGORY_LABEL[category]}>
      <CategoryDot category={category} />
      <span className="condensed font-bold tracking-wide">{code}</span>
      <span className="sr-only">{CATEGORY_LABEL[category]}</span>
    </span>
  );
}

export function CategoryLegend({ categories = ["foreign", "institution", "retail"] }: { categories?: BrokerCategory[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
      {categories.map((c) => (
        <li key={c} className="inline-flex items-center gap-1.5">
          <CategoryDot category={c} />
          {CATEGORY_LABEL[c]}
        </li>
      ))}
    </ul>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "error";
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={clsx(
        "rounded-md border px-4 py-3 text-[13px]",
        tone === "error" ? "border-down/30 bg-down-wash text-ink" : "border-kunyit/50 bg-kunyit-wash text-ink",
        className,
      )}
    >
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={clsx("text-ink-2", title && "mt-0.5")}>{children}</div>}
    </div>
  );
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("text-[13px] text-ink-3", className)}>{children}</p>;
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded border border-rule bg-sheet px-1.5 py-0.5 text-2xs text-ink-2", className)}>
      {children}
    </span>
  );
}

export const TONE_GLYPH = {
  positive: { glyph: "▲", color: "text-up" },
  negative: { glyph: "▼", color: "text-down" },
  neutral: { glyph: "■", color: "text-ink-3" },
  unknown: { glyph: "○", color: "text-ink-3" },
} as const;
