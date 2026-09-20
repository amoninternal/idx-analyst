import { connection } from "next/server";
import { fmtDate } from "@/lib/format";
import { getStatus } from "@/lib/status";

/** Where the data comes from, and how many Sectors credits today's browsing has used. */
export async function SiteFooter() {
  await connection();
  const s = await getStatus();
  const items = [
    s.sectors ? "Sectors API connected" : "Sectors API key not set",
    s.broksum.ok ? `Local broker data ${fmtDate(s.broksum.firstDate)} to ${fmtDate(s.broksum.lastComplete)}` : "Local broker data unavailable",
    s.openai ? `Analyst model ${s.model}` : "OpenAI key not set",
    s.sectors ? `About ${s.credits.today.toLocaleString("en-US")} Sectors credits used today` : null,
  ].filter(Boolean);
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-[1440px] flex-wrap gap-x-6 gap-y-1 px-4 py-4 text-xs text-ink-3 sm:px-6">
        {items.map((item) => (
          <span key={item}>{item}</span>
        ))}
        <span>Research, not investment advice.</span>
      </div>
    </footer>
  );
}
