import type { Metadata } from "next";
import { connection } from "next/server";
import { ChatView } from "@/components/analyst/ChatView";
import { SetupNotice } from "@/components/SetupNotice";
import { config } from "@/lib/config";
import { getKeys } from "@/lib/keys";

export const metadata: Metadata = { title: "Analyst" };

export default async function AnalystPage() {
  await connection();
  const keys = await getKeys();
  return (
    <div className="flex h-[calc(100dvh-10rem)] min-h-[520px] flex-col">
      <div className="mb-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <span aria-hidden className="size-2.5 rounded-full bg-kunyit" />
          Analyst
        </h1>
        <p className="mt-1 max-w-2xl text-ink-2">
          An AI analyst (Gemini, {config.geminiModel}) that reads prices, broker flow, fundamentals, news and your portfolio before it answers. It
          can be wrong; check the numbers it cites.
        </p>
      </div>
      {!keys.gemini && <SetupNotice sectors={keys.sectors.length > 0} gemini={false} />}
      <div className="min-h-0 flex-1">
        <ChatView />
      </div>
    </div>
  );
}
