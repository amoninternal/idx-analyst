import Link from "next/link";
import { Suspense } from "react";
import { config } from "@/lib/config";
import { getKeys } from "@/lib/keys";
import { StockSearch } from "../StockSearch";
import { QuoteStrip } from "./QuoteStrip";
import { SidePanel } from "./SidePanel";

/** The ☰ menu, with what is connected right now. */
async function Panel() {
  const keys = await getKeys();
  return <SidePanel keyMode={config.keyMode} sectors={keys.sectors.length > 0} gemini={keys.gemini.length > 0} model={config.geminiModel} />;
}

export function Board() {
  return (
    <header className="bg-board text-board-ink">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
        <div className="flex h-14 items-stretch gap-4 lg:gap-6">
          <Suspense fallback={<span className="-ml-1.5 size-9 shrink-0 self-center" />}>
            <Panel />
          </Suspense>
          <Link href="/" className="-ml-2 flex shrink-0 items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-[2px] bg-kunyit" />
            <span className="condensed text-lg font-extrabold tracking-tight">IDX Analyst</span>
          </Link>
          {/* Pages, the analyst chat and the API keys live in the ☰ panel. */}
          <div className="ml-auto flex items-center">
            <StockSearch variant="board" placeholder="Search stocks" className="w-40 sm:w-56 lg:w-72" />
          </div>
        </div>
        <Suspense fallback={<div className="h-10 border-t border-board-rule" />}>
          <QuoteStrip />
        </Suspense>
      </div>
    </header>
  );
}
