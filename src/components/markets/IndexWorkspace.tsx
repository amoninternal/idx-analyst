"use client";

import type { CandleSeries } from "@/lib/types";
import { ChartWorkspace } from "../charts/ChartWorkspace";

/** The market index with the full chart toolbar. Longer history loads on demand. */
export function IndexWorkspace({ code, initial, initialDays }: { code: string; initial: CandleSeries; initialDays: number }) {
  return (
    <ChartWorkspace
      id={initial.symbol}
      initial={initial}
      initialDays={initialDays}
      historyUrl={(days) => `/api/index/${code}?days=${days}`}
      height={420}
    />
  );
}
