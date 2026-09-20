import Link from "next/link";
import { Suspense } from "react";
import { AskAnalystButton } from "../analyst/AnalystDrawer";
import { StockSearch } from "../StockSearch";
import { NavLinks } from "./NavLinks";
import { QuoteStrip } from "./QuoteStrip";

export function Board() {
  return (
    <header className="bg-board text-board-ink">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
        <div className="flex h-14 items-stretch gap-4 lg:gap-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span aria-hidden className="size-2.5 rounded-[2px] bg-kunyit" />
            <span className="condensed text-lg font-extrabold tracking-tight">IDX Analyst</span>
          </Link>
          <NavLinks className="hidden md:block" />
          <div className="ml-auto flex items-center gap-2">
            <StockSearch variant="board" placeholder="Search stocks" className="w-40 sm:w-56 lg:w-72" />
            <AskAnalystButton className="hidden h-9 items-center gap-2 rounded border border-board-rule px-3 text-sm font-medium text-board-ink hover:bg-board-2 sm:inline-flex">
              <span aria-hidden className="size-2 rounded-full bg-kunyit" />
              Ask the analyst
            </AskAnalystButton>
          </div>
        </div>
        <NavLinks className="-mx-1 h-10 overflow-x-auto border-t border-board-rule md:hidden" />
        <Suspense fallback={<div className="h-10 border-t border-board-rule" />}>
          <QuoteStrip />
        </Suspense>
      </div>
    </header>
  );
}
