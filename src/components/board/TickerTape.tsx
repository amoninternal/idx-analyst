"use client";

import clsx from "clsx";
import { Pause, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { fmtPrice } from "@/lib/format";
import { Delta } from "../ui";

export type TapeItem = { kind: "index" | "stock"; label: string; value: number; pct: number | null; held?: boolean };
export type TapeGroup = { name: string; items: TapeItem[] };

const indexFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SECONDS_PER_ITEM = 3.2;

function Quote({ item, copy }: { item: TapeItem; copy: boolean }) {
  const body = (
    <>
      {item.held && <span aria-hidden title="You hold this" className="size-1.5 self-center rounded-full bg-kunyit" />}
      <span className="condensed font-bold tracking-wide text-board-ink">{item.label}</span>
      <span className="tnum font-medium text-kunyit">{item.kind === "index" ? indexFmt.format(item.value) : fmtPrice(item.value)}</span>
      <Delta pct={item.pct} onBoard showValue={false} />
    </>
  );
  return (
    <li className="shrink-0">
      {item.kind === "stock" ? (
        <Link href={`/stocks/${item.label}`} tabIndex={copy ? -1 : undefined} className="flex items-baseline gap-2 rounded px-1 hover:bg-board-2">
          {body}
        </Link>
      ) : (
        <span className="flex items-baseline gap-2 px-1">{body}</span>
      )}
    </li>
  );
}

/** One full pass of the tape. Rendered twice so the loop has no seam. */
function Pass({ groups, copy }: { groups: TapeGroup[]; copy: boolean }) {
  return (
    <div aria-hidden={copy || undefined} className="flex shrink-0 items-center">
      {groups.map((g) => (
        <ul key={g.name} aria-label={copy ? undefined : g.name} className="flex shrink-0 items-center gap-5 border-r border-board-rule pr-5 pl-5">
          {g.items.map((item) => (
            <Quote key={`${g.name}-${item.label}`} item={item} copy={copy} />
          ))}
        </ul>
      ))}
    </div>
  );
}

/**
 * A scrolling quote board. It stops while the pointer or keyboard focus is on it, the button
 * at the right pauses it for good, and with reduced motion turned on it doesn't move at all
 * (it scrolls sideways by hand instead).
 */
export function TickerTape({ groups }: { groups: TapeGroup[] }) {
  const [paused, setPaused] = useState(false);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className="flex h-10 items-center border-t border-board-rule text-[13px] whitespace-nowrap">
      <section aria-label="Market quotes" data-paused={paused || undefined} className="tape min-w-0 flex-1 self-stretch">
        <div className="tape-track" style={{ animationDuration: `${Math.max(30, count * SECONDS_PER_ITEM)}s` }}>
          <Pass groups={groups} copy={false} />
          <Pass groups={groups} copy />
        </div>
      </section>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? "Play the ticker" : "Pause the ticker"}
        title={paused ? "Play the ticker" : "Pause the ticker"}
        className={clsx(
          "ml-2 inline-flex size-7 shrink-0 items-center justify-center rounded text-board-muted hover:bg-board-2 hover:text-board-ink",
          "tape-toggle",
        )}
      >
        {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
      </button>
    </div>
  );
}
