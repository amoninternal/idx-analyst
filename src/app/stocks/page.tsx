import type { Metadata } from "next";
import { connection } from "next/server";
import { Screener } from "@/components/stocks/Screener";
import { StockTable } from "@/components/stocks/StockTable";
import { hasSectorsKey } from "@/lib/config";
import { getUniverse } from "@/lib/universe";

export const metadata: Metadata = { title: "Stocks" };

export default async function StocksPage() {
  await connection();
  const universe = await getUniverse();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Stocks</h1>
        <p className="mt-1 max-w-2xl text-ink-2">
          Every stock on the Indonesia Stock Exchange. Open one for its chart, broker summary, fundamentals and news.
        </p>
      </div>
      {hasSectorsKey() && <Screener />}
      <StockTable universe={universe} />
    </div>
  );
}
