import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SignalStrip, SignalStripFallback } from "@/components/stock/SignalStrip";
import { Placard } from "@/components/stock/Placard";
import { StockTabs } from "@/components/stock/StockTabs";
import { hasSectorsKey } from "@/lib/config";
import { technicalSnapshot } from "@/lib/indicators";
import { getCandles } from "@/lib/prices";
import { getCompanyReport } from "@/lib/sectors/api";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbols";

async function loadReport(symbol: string) {
  if (!hasSectorsKey()) return null;
  return getCompanyReport(symbol, ["overview", "valuation"]).catch(() => null);
}

export async function generateMetadata(props: PageProps<"/stocks/[symbol]">): Promise<Metadata> {
  const { symbol } = await props.params;
  if (!isValidSymbol(symbol)) return { title: "Stock not found" };
  const sym = normalizeSymbol(symbol);
  const report = await loadReport(sym);
  return { title: report?.company_name ? `${sym}, ${report.company_name}` : sym };
}

export default async function StockPage(props: PageProps<"/stocks/[symbol]">) {
  await connection();
  const { symbol: raw } = await props.params;
  if (!isValidSymbol(raw)) notFound();
  const symbol = normalizeSymbol(raw);
  if (raw !== symbol) redirect(`/stocks/${symbol}`);

  // ~400 calendar days: a full year on screen plus warm-up for the 200-day average.
  const [report, series] = await Promise.all([loadReport(symbol), getCandles(symbol, 400)]);
  if (!report && series.candles.length === 0) notFound();
  const snapshot = technicalSnapshot(series.candles);

  return (
    <>
      <Placard symbol={symbol} name={report?.company_name ?? null} overview={report?.overview} series={series} />
      <Suspense fallback={<SignalStripFallback />}>
        <SignalStrip symbol={symbol} report={report} snapshot={snapshot} />
      </Suspense>
      <Suspense>
        <StockTabs symbol={symbol} initial={series} hasSectors={hasSectorsKey()} />
      </Suspense>
    </>
  );
}
