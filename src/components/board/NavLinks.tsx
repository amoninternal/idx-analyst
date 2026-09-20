"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Markets" },
  { href: "/stocks", label: "Stocks" },
  { href: "/news", label: "News" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/analyst", label: "Analyst" },
];

export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex h-full items-stretch gap-1">
        {LINKS.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "relative flex items-center px-2.5 text-sm font-medium transition-colors",
                  active ? "text-board-ink" : "text-board-muted hover:text-board-ink",
                )}
              >
                {label}
                {active && <span aria-hidden className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-kunyit" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
