"use client";

import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PositionForm } from "./PositionForm";

export function AddPositionButton({ symbol, price }: { symbol: string; price: number | null }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setMessage(null);
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded border border-rule-strong bg-sheet px-3.5 text-sm font-medium hover:bg-wash"
      >
        <Plus aria-hidden className="size-4" />
        Add to portfolio
      </button>
      {open && (
        <div className="absolute top-full right-0 z-30 mt-2 w-[min(92vw,380px)] rounded-md border border-rule bg-sheet p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Add {symbol} to your portfolio</h3>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded p-1 text-ink-3 hover:bg-wash hover:text-ink">
              <X aria-hidden className="size-4" />
            </button>
          </div>
          {message ? (
            <div className="space-y-3">
              <p className="text-sm">{message}</p>
              <div className="flex gap-2">
                <Link href="/portfolio" className="inline-flex h-8 items-center rounded bg-ink px-3 text-[13px] font-medium text-sheet hover:bg-ink-hover">
                  Open portfolio
                </Link>
                <button type="button" onClick={() => setMessage(null)} className="h-8 rounded px-3 text-[13px] text-ink-2 hover:bg-wash">
                  Add more
                </button>
              </div>
            </div>
          ) : (
            <PositionForm symbol={symbol} price={price} onDone={setMessage} />
          )}
        </div>
      )}
    </div>
  );
}
