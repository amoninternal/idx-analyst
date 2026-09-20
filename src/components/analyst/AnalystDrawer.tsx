"use client";

import { Maximize2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAnalyst } from "./AnalystProvider";
import { ChatView } from "./ChatView";

export function AnalystDrawer() {
  const { open, setOpen } = useAnalyst();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // The full page already shows the conversation.
  if (!open || pathname === "/analyst") return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close the analyst" className="absolute inset-0 bg-board/25" onClick={() => setOpen(false)} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="analyst-title"
        className="relative flex h-full w-full flex-col border-l border-rule bg-sheet sm:w-[480px]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-rule px-5 py-3">
          <h2 id="analyst-title" className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden className="size-2 rounded-full bg-kunyit" />
            Analyst
          </h2>
          <div className="flex items-center gap-1">
            <Link
              href="/analyst"
              onClick={() => setOpen(false)}
              className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-[13px] text-ink-2 hover:bg-wash hover:text-ink"
            >
              <Maximize2 aria-hidden className="size-3.5" />
              Full page
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex size-7 items-center justify-center rounded text-ink-2 hover:bg-wash hover:text-ink"
              aria-label="Close"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </div>
        <ChatView compact />
      </aside>
    </div>
  );
}

/** Opens the analyst drawer, optionally with a question and a stock as context. */
export function AskAnalystButton({
  prompt,
  symbol,
  children,
  className,
}: {
  prompt?: string;
  symbol?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const { ask, setOpen, setSymbol, busy } = useAnalyst();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (symbol !== undefined) setSymbol(symbol);
        if (prompt && !busy) ask(prompt, { symbol: symbol ?? null, openDrawer: true });
        else setOpen(true);
      }}
    >
      {children}
    </button>
  );
}
