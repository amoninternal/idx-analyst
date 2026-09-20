import { connection } from "next/server";
import { Suspense } from "react";
import {
  ForeignScan,
  IndexHero,
  LatestNews,
  MarketForeignFlow,
  MostTraded,
  Movers,
  SectionFallback,
} from "@/components/markets/MarketSections";
import { SetupNotice } from "@/components/SetupNotice";
import { hasOpenAIKey, hasSectorsKey } from "@/lib/config";

export default async function MarketsPage() {
  await connection();
  const sectors = hasSectorsKey();
  const openai = hasOpenAIKey();

  return (
    <div className="space-y-12">
      <h1 className="sr-only">Markets</h1>
      <SetupNotice sectors={sectors} openai={openai} />

      {sectors && (
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Suspense fallback={<div className="h-[300px]" aria-busy="true" />}>
            <IndexHero />
          </Suspense>
          <Suspense fallback={<SectionFallback title="Foreign investors, whole market" rows={3} />}>
            <MarketForeignFlow />
          </Suspense>
        </div>
      )}

      {sectors && (
        <div className="grid gap-10 md:grid-cols-2 xl:grid-cols-3">
          <Suspense
            fallback={
              <>
                <SectionFallback title="Top gainers" />
                <SectionFallback title="Top losers" />
              </>
            }
          >
            <Movers />
          </Suspense>
          <Suspense fallback={<SectionFallback title="Most traded" />}>
            <MostTraded />
          </Suspense>
        </div>
      )}

      <Suspense fallback={<SectionFallback title="Foreign brokers bought" />}>
        <ForeignScan />
      </Suspense>

      {sectors && (
        <Suspense fallback={<SectionFallback title="Latest news" />}>
          <LatestNews />
        </Suspense>
      )}
    </div>
  );
}
