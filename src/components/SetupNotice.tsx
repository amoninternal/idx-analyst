import { config } from "@/lib/config";
import { fmtDate } from "@/lib/format";

/** Shown where live data would be when a key is missing: what to add, and what already works. */
export function SetupNotice({ sectors, openai }: { sectors: boolean; openai: boolean }) {
  if (sectors && openai) return null;
  return (
    <section className="rounded-md border border-kunyit/60 bg-kunyit-wash px-5 py-4" aria-labelledby="setup-title">
      <h2 id="setup-title" className="font-semibold">
        {sectors ? "Add an OpenAI key to use the analyst" : "Add your API keys to turn on live data"}
      </h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
        {!sectors && (
          <li>
            Put your Sectors key (Insider plan, from{" "}
            <a href="https://sectors.app/api" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              sectors.app/api
            </a>
            ) in <code className="rounded bg-sheet px-1">.env.local</code> as <code className="rounded bg-sheet px-1">SECTORS_API_KEY</code>. It
            powers prices, fundamentals, news, the screener and broker data after {fmtDate(config.broksumLastComplete)}.
          </li>
        )}
        {!openai && (
          <li>
            Put your OpenAI key in the same file as <code className="rounded bg-sheet px-1">OPENAI_API_KEY</code> for the analyst chat.
          </li>
        )}
        <li>Restart the dev server so it reads the new keys.</li>
      </ol>
      <p className="mt-2 text-[13px] text-ink-2">
        Until then, broker summaries, the broker flow scan and daily average-price charts work from the local data for 887 stocks.
      </p>
    </section>
  );
}
