import type { Metadata } from "next";
import { connection } from "next/server";
import { NewsFeed } from "@/components/news/NewsFeed";
import { SetupNotice } from "@/components/SetupNotice";
import { hasOpenAIKey, hasSectorsKey } from "@/lib/config";

export const metadata: Metadata = { title: "News" };

export default async function NewsPage() {
  await connection();
  const sectors = hasSectorsKey();
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">News</h1>
        <p className="mt-1 text-ink-2">Indonesian market news with each article&apos;s stocks and a bullish or bearish tag from Sectors.</p>
      </div>
      {sectors ? <NewsFeed showSearch /> : <SetupNotice sectors={false} openai={hasOpenAIKey()} />}
    </div>
  );
}
