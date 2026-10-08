import Link from "next/link";
import { config } from "@/lib/config";
import { fmtDate } from "@/lib/format";

const code = "rounded bg-sheet px-1";

/** Shown where live data would be when a key is missing: what to add, and what already works. */
export function SetupNotice({ sectors, gemini }: { sectors: boolean; gemini: boolean }) {
  if (sectors && gemini) return null;
  const visitorKeys = config.keyMode === "user";
  return (
    <section className="rounded-md border border-kunyit/60 bg-kunyit-wash px-5 py-4" aria-labelledby="setup-title">
      <h2 id="setup-title" className="font-semibold">
        {sectors ? "Add a Gemini key to use the analyst" : "Add your API keys to turn on live data"}
      </h2>
      {visitorKeys ? (
        <p className="mt-2 text-[13px] text-ink-2">
          {sectors
            ? "The analyst runs on your own Gemini key. "
            : "Prices, fundamentals, news and the screener run on your own Sectors key. "}
          <Link href="/connect" className="font-medium underline underline-offset-2">
            Connect your keys
          </Link>
          . They stay in an encrypted cookie in this browser and are never stored on the server.
        </p>
      ) : (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
          {!sectors && (
            <li>
              Put your Sectors key (Insider plan, from{" "}
              <a href="https://sectors.app/api" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                sectors.app/api
              </a>
              ) in <code className={code}>.env.local</code> as <code className={code}>SECTORS_API_KEY</code>. It powers prices,
              fundamentals, news, the screener and broker data after {fmtDate(config.broksumLastComplete)}.
            </li>
          )}
          {!gemini && (
            <li>
              Put your Gemini key (from{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                Google AI Studio
              </a>
              ) in the same file as <code className={code}>GEMINI_API_KEY</code> for the analyst chat.
            </li>
          )}
          <li>Restart the dev server so it reads the new keys.</li>
        </ol>
      )}
      {!sectors && (
        <p className="mt-2 text-[13px] text-ink-2">
          Until then, broker summaries, the broker flow scan and daily average-price charts work from the local data, where it is
          installed.
        </p>
      )}
    </section>
  );
}
