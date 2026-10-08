"use client";

import clsx from "clsx";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { safeNextPath } from "@/lib/safe-path";
import { Button } from "./controls";

type Fields = { sectors?: string; gemini?: string };

function KeyField({
  label,
  hint,
  value,
  onChange,
  error,
  required,
}: {
  label: string;
  hint: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="flex items-baseline gap-2 text-sm font-medium">
        {label}
        {!required && <span className="text-xs font-normal text-ink-3">optional</span>}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          className={clsx(
            "h-10 w-full rounded border bg-sheet pr-10 pl-3 font-mono text-[13px] outline-none focus:border-ink",
            error ? "border-down" : "border-rule-strong",
          )}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? `Hide ${label}` : `Show ${label}`}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-3 hover:text-ink"
        >
          {shown ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      <p id={`${id}-hint`} className="mt-1 text-xs text-ink-3">
        {hint}
      </p>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs font-medium text-down">
          {error}
        </p>
      )}
    </div>
  );
}

export function ConnectForm({
  next,
  connected,
  model,
  variant = "page",
}: {
  next: string;
  connected: { sectors: boolean; gemini: boolean };
  model: string;
  /** "panel" is the compact version in the side menu. */
  variant?: "page" | "panel";
}) {
  const panel = variant === "panel";
  const [sectors, setSectors] = useState("");
  const [gemini, setGemini] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({});
  // Checked again here, right before navigating: never trust a destination that came from a URL.
  const destination = safeNextPath(next);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectors, gemini }),
        credentials: "same-origin",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Fields };
      if (!res.ok) {
        setError(data.error ?? `Couldn't connect (${res.status}).`);
        setFields(data.fields ?? {});
        return;
      }
      setSectors("");
      setGemini("");
      // A full load, so every server-rendered part of the page picks up the new session.
      window.location.assign(destination);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    await fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    // A full reload, not router.push: nothing rendered for the old session may stay in the client cache.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/connect");
  }

  return (
    <div className={panel ? "space-y-4" : "mt-6 space-y-6"}>
      {connected.sectors && !panel && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-up/30 bg-up-wash px-4 py-3 text-[13px]">
          <span>
            Connected: Sectors{connected.gemini ? " and Gemini" : ""}. Enter new keys below to replace them.
          </span>
          <span className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.location.assign(destination)}>
              Open the app
            </Button>
            <Button size="sm" variant="danger" onClick={disconnect} disabled={busy}>
              Disconnect
            </Button>
          </span>
        </div>
      )}

      <form onSubmit={submit} className={clsx("rounded-md border border-rule bg-sheet text-ink", panel ? "space-y-4 p-4" : "space-y-5 p-5")} noValidate>
        <KeyField
          label="Sectors API key"
          required
          value={sectors}
          onChange={setSectors}
          error={fields.sectors}
          hint={
            <>
              Insider plan. Create one at{" "}
              <a href="https://sectors.app/api" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                sectors.app/api
              </a>
              .
            </>
          }
        />
        <KeyField
          label="Gemini API key"
          value={gemini}
          onChange={setGemini}
          error={fields.gemini}
          hint={
            <>
              For the AI analyst ({model}). Create one in{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                Google AI Studio
              </a>
              . Without it, everything except the analyst works.
            </>
          }
        />
        {error && (
          <p role="alert" className="text-[13px] font-medium text-down">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy || !sectors.trim()} className="w-full">
          <KeyRound className="size-4" aria-hidden />
          {busy ? "Checking your keys…" : connected.sectors ? "Replace keys" : "Connect"}
        </Button>
      </form>
      {connected.sectors && panel && (
        <Button variant="danger" onClick={disconnect} disabled={busy} className="w-full">
          Disconnect and forget my keys
        </Button>
      )}
    </div>
  );
}
