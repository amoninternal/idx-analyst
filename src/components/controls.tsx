"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

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
        variant === "primary" && "bg-ink text-white hover:bg-[#23324f]",
        variant === "secondary" && "border border-rule-strong bg-sheet text-ink hover:bg-wash",
        variant === "ghost" && "text-ink-2 hover:bg-wash hover:text-ink",
        variant === "danger" && "border border-down/40 bg-sheet text-down hover:bg-[#fdf1f1]",
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
              active ? "bg-ink text-white" : "text-ink-2 hover:bg-wash hover:text-ink",
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
        checked ? "border-ink bg-ink text-white" : "border-rule-strong bg-sheet text-ink-2 hover:bg-wash",
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
