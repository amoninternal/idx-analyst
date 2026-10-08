"use client";

import clsx from "clsx";
import { Briefcase, KeyRound, LayoutDashboard, List, Menu, MessageSquare, Monitor, Moon, Newspaper, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAnalyst } from "../analyst/AnalystProvider";
import { ConnectForm } from "../ConnectForm";
import { useTheme } from "../ThemeProvider";
import type { ThemePref } from "@/lib/theme";

const LINKS = [
  { href: "/", label: "Markets", icon: LayoutDashboard },
  { href: "/stocks", label: "Stocks", icon: List },
  { href: "/news", label: "News", icon: Newspaper },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
];

type Props = {
  keyMode: "user" | "server";
  sectors: boolean;
  gemini: boolean;
  model: string;
};

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Device", icon: Monitor },
];

/** Light, dark, or whatever the phone or computer is set to. */
function Appearance() {
  const { pref, setPref } = useTheme();
  return (
    <section aria-labelledby="appearance-title" className="border-t border-board-rule px-4 py-4">
      <h2 id="appearance-title" className="text-sm font-semibold">
        Appearance
      </h2>
      <div role="radiogroup" aria-labelledby="appearance-title" className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-board-2 p-1">
        {THEMES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={pref === value}
            onClick={() => setPref(value)}
            className={clsx(
              "flex h-9 items-center justify-center gap-1.5 rounded text-[13px] font-medium",
              pref === value ? "bg-board-ink text-board" : "text-board-muted hover:text-board-ink",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function Dot({ on }: { on: boolean }) {
  return <span aria-hidden className={clsx("size-2 rounded-full", on ? "bg-up-board" : "bg-down-board")} />;
}

/** The ☰ menu: every page, the analyst chat, and the API keys. */
export function SidePanel({ keyMode, sectors, gemini, model }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { setOpen: openAnalyst } = useAnalyst();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  // Close after navigating.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      // Keep Tab inside the panel while it is open.
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])");
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="-ml-1.5 inline-flex size-9 shrink-0 items-center justify-center self-center rounded text-board-ink hover:bg-board-2"
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close the menu" tabIndex={-1} className="absolute inset-0 bg-board/40" onClick={() => setOpen(false)} />
          <aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="relative flex h-full w-[min(360px,90vw)] flex-col overflow-y-auto bg-board text-board-ink shadow-2xl"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-board-rule px-4">
              <span className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-[2px] bg-kunyit" />
                <span className="condensed text-lg font-extrabold tracking-tight">IDX Analyst</span>
              </span>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close the menu"
                className="inline-flex size-9 items-center justify-center rounded hover:bg-board-2"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <nav aria-label="Pages" className="px-2 py-3">
              <ul className="space-y-0.5">
                {LINKS.map(({ href, label, icon: Icon }) => {
                  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={clsx(
                          "flex h-10 items-center gap-3 rounded px-3 text-[15px] font-medium",
                          active ? "bg-board-2 text-board-ink" : "text-board-muted hover:bg-board-2 hover:text-board-ink",
                        )}
                      >
                        <Icon className={clsx("size-4", active && "text-kunyit")} aria-hidden />
                        {label}
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      openAnalyst(true);
                    }}
                    className="flex h-10 w-full items-center gap-3 rounded px-3 text-left text-[15px] font-medium text-board-muted hover:bg-board-2 hover:text-board-ink"
                  >
                    <MessageSquare className="size-4" aria-hidden />
                    Chat with the analyst
                  </button>
                </li>
              </ul>
            </nav>

            <div className="mt-auto" />
            <Appearance />
            <section aria-labelledby="keys-title" className="border-t border-board-rule px-4 py-4">
              <h2 id="keys-title" className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="size-4 text-kunyit" aria-hidden />
                API keys
              </h2>
              <ul className="mt-2 space-y-1 text-[13px]">
                <li className="flex items-center gap-2">
                  <Dot on={sectors} /> Sectors {sectors ? "connected" : "not connected"}
                </li>
                <li className="flex items-center gap-2">
                  <Dot on={gemini} /> Gemini {gemini ? "connected" : "not connected"}
                  {gemini && <span className="text-board-muted">({model})</span>}
                </li>
              </ul>
              {keyMode === "user" ? (
                <div className="mt-3">
                  <ConnectForm variant="panel" next={pathname} connected={{ sectors, gemini }} model={model} />
                </div>
              ) : (
                <p className="mt-3 text-[13px] leading-relaxed text-board-muted">
                  This copy runs on the keys in <code className="text-board-ink">.env.local</code> (<code className="text-board-ink">KEY_MODE=server</code>). On
                  a public copy, visitors sign in here with their own keys.
                </p>
              )}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
