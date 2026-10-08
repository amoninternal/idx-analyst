"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

// Interactive primitives.

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-ink text-sheet hover:bg-ink-hover",
        variant === "secondary" && "border border-rule-strong bg-sheet text-ink hover:bg-wash",
        variant === "ghost" && "text-ink-2 hover:bg-wash hover:text-ink",
        variant === "danger" && "border border-down/40 bg-sheet text-down hover:bg-down-wash",
        className,
      )}
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: readonly (T | { value: T; label: ReactNode; disabled?: boolean })[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded border border-rule-strong bg-sheet p-0.5">
      {options.map((opt) => {
        const o = typeof opt === "string" ? { value: opt, label: opt, disabled: false } : opt;
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={clsx(
              "rounded-[3px] font-medium tnum transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]",
              active ? "bg-ink text-sheet" : "text-ink-2 hover:bg-wash hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  children,
  swatch,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  swatch?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "inline-flex h-7 items-center gap-1.5 rounded border px-2 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-ink bg-ink text-sheet" : "border-rule-strong bg-sheet text-ink-2 hover:bg-wash",
      )}
    >
      {swatch && <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: swatch }} />}
      {children}
    </button>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-ink-3" role="status">
      <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-rule-strong border-t-ink-2" />
      {label}
    </span>
  );
}

/**
 * A button that opens a small panel (chart type, indicators, settings). Closes on a click
 * outside, on Escape, or when `children` calls `close`.
 */
export function Menu({
  label,
  children,
  align = "left",
  title,
  ariaLabel,
  active,
}: {
  label: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  title?: string;
  /** Spoken name when the visible label alone lacks context, e.g. "Chart type: Line". */
  ariaLabel?: string;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={title}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "inline-flex h-7 items-center gap-1.5 rounded border px-2 text-[13px] whitespace-nowrap transition-colors",
          active || open ? "border-ink bg-ink text-sheet" : "border-rule-strong bg-sheet text-ink-2 hover:bg-wash hover:text-ink",
        )}
      >
        {label}
      </button>
      {open && (
        <div
          id={id}
          className={clsx(
            "absolute z-40 mt-1 min-w-52 rounded-md border border-rule bg-sheet p-1.5 text-[13px] text-ink shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** A row in a Menu: a checkable or selectable option. */
export function MenuItem({
  checked,
  onSelect,
  children,
  role = "menuitemcheckbox",
  disabled,
  swatch,
}: {
  checked?: boolean;
  onSelect: () => void;
  children: ReactNode;
  role?: "menuitemcheckbox" | "menuitemradio" | "menuitem";
  disabled?: boolean;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitem" ? undefined : Boolean(checked)}
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-wash disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span aria-hidden className={clsx("flex size-3.5 items-center justify-center text-[11px]", role === "menuitemradio" && "rounded-full")}>
        {checked ? "✓" : ""}
      </span>
      {swatch && <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: swatch }} />}
      <span className="flex flex-1 items-center gap-2">{children}</span>
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">{children}</p>;
}

/** Square icon button for toolbars. `pressed` makes it a toggle. */
export function IconButton({
  label,
  pressed,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      {...props}
      className={clsx(
        "inline-flex size-7 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        pressed ? "border-ink bg-ink text-sheet" : "border-rule-strong bg-sheet text-ink-2 hover:bg-wash hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}
