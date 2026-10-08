import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ConnectForm } from "@/components/ConnectForm";
import { config } from "@/lib/config";
import { getKeys } from "@/lib/keys";
import { safeNextPath } from "@/lib/safe-path";
import { sessionConfigError } from "@/lib/session";

export const metadata: Metadata = { title: "Connect your API keys" };

export default async function ConnectPage(props: PageProps<"/connect">) {
  await connection();
  if (config.keyMode !== "user") redirect("/");
  // Same-site paths only, so the form can't be used to bounce a visitor to another site.
  const raw = (await props.searchParams).next;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);
  const misconfigured = sessionConfigError();
  const keys = await getKeys();

  return (
    <div className="mx-auto max-w-xl py-6">
      <h1 className="text-2xl font-semibold">Connect your API keys</h1>
      <p className="mt-2 text-ink-2">
        IDX Analyst runs on your own keys: Sectors for market data, Gemini for the AI analyst. Usage and costs stay on your accounts.
      </p>

      {misconfigured ? (
        <div role="alert" className="mt-6 rounded-md border border-down/30 bg-down-wash px-4 py-3 text-[13px]">
          <p className="font-semibold">This server isn&apos;t set up for visitor keys yet.</p>
          <p className="mt-1 text-ink-2">
            Its operator needs to set <code className="rounded bg-sheet px-1">SESSION_SECRET</code> (at least 32 random characters) and restart
            it.
          </p>
        </div>
      ) : (
        <ConnectForm next={next} connected={{ sectors: keys.sectors.length > 0, gemini: keys.gemini.length > 0 }} model={config.geminiModel} />
      )}

      <section className="mt-10 border-t border-rule pt-6 text-[13px] text-ink-2" aria-labelledby="how-title">
        <h2 id="how-title" className="font-semibold text-ink">
          What happens to your keys
        </h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            They are checked once: one small Sectors request (1 credit) and a model lookup at Google (free).
          </li>
          <li>
            They are then encrypted (AES-256-GCM) into a cookie that only this server can read and that page scripts can&apos;t
            access. It expires after 7 days. Disconnecting deletes it from this browser.
          </li>
          <li>
            Like any login cookie, a copy taken from your device keeps working until it expires. If that might have happened,
            rotate the keys at Sectors and Google: the old cookie stops working at once.
          </li>
          <li>They are never written to the server&apos;s disk, a database or a log, and never sent to the AI model.</li>
          <li>
            The server does handle them while it makes requests for you, so only connect keys to a server you trust. The code is
            open source, and you can run it yourself.
          </li>
          <li>
            For extra safety, restrict your Gemini key to the Gemini API in Google AI Studio, and rotate any key you think was
            exposed.
          </li>
        </ul>
      </section>
    </div>
  );
}
