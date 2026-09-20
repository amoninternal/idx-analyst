"use client";

import clsx from "clsx";
import { Check, CircleAlert, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "../controls";
import { useAnalyst, type ToolChip, type UiMessage } from "./AnalystProvider";

function suggestionsFor(symbol: string | null): string[] {
  if (symbol) {
    return [
      `Give me a full read on ${symbol}: trend, broker flow, valuation and news.`,
      `Who has been accumulating ${symbol} over the last 3 months, and at what average price?`,
      `Is ${symbol} cheap against its peers? Show P/E, P/B and ROE.`,
      `What are the key support and resistance levels for ${symbol} right now?`,
    ];
  }
  return [
    "How is the market today? Summarize IHSG, top movers and foreign flows.",
    "Which stocks have foreign brokers been accumulating over the last two weeks?",
    "Find banks with ROE above 15% and P/E below 12.",
    "Review my portfolio: concentration, weak spots and anything to watch.",
  ];
}

function ToolChips({ tools }: { tools: ToolChip[] }) {
  if (!tools.length) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Data the analyst read">
      {tools.map((t) => (
        <li
          key={t.id}
          title={t.detail}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs",
            t.status === "error" ? "border-down/30 text-down" : "border-rule bg-paper text-ink-2",
          )}
        >
          {t.status === "running" ? (
            <span aria-hidden className="size-2.5 animate-spin rounded-full border-[1.5px] border-rule-strong border-t-kunyit-deep" />
          ) : t.status === "done" ? (
            <Check aria-hidden className="size-3 text-ink-3" />
          ) : (
            <CircleAlert aria-hidden className="size-3" />
          )}
          {t.label}
          {t.status === "error" && t.detail && <span className="sr-only">: {t.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

function AssistantMessage({ message }: { message: UiMessage }) {
  return (
    <div>
      <ToolChips tools={message.tools ?? []} />
      {message.content ? (
        <div className="prose-note">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="table-wrap">
                  <table>{children}</table>
                </div>
              ),
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      ) : message.pending && !message.tools?.length ? (
        <p className="text-[13px] text-ink-3">Reading the question…</p>
      ) : null}
      {message.error && (
        <p role="alert" className="mt-2 text-[13px] text-down">
          {message.error}
        </p>
      )}
    </div>
  );
}

export function ChatView({ compact = false }: { compact?: boolean }) {
  const { messages, busy, ask, stop, clear, symbol } = useAnalyst();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || busy) return;
    stickRef.current = true;
    ask(draft);
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className={clsx("min-h-0 flex-1 overflow-y-auto", compact ? "px-5 py-4" : "py-6")}
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className={clsx(!compact && "max-w-2xl")}>
            <p className="text-[15px] text-ink-2">
              Ask about any IDX stock, the market, or your portfolio. The analyst reads live data from Sectors and the broker
              summaries, and says where each number came from.
            </p>
            <ul className="mt-4 space-y-2">
              {suggestionsFor(symbol).map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => ask(s)}
                    className="w-full rounded border border-rule bg-sheet px-3 py-2 text-left text-sm text-ink hover:border-rule-strong hover:bg-wash"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className={clsx("space-y-6", !compact && "max-w-3xl")}>
            {messages.map((m) => (
              <li key={m.id}>
                {m.role === "user" ? (
                  <div className="border-l-2 border-kunyit pl-3">
                    <p className="text-[15px] font-semibold whitespace-pre-wrap">{m.content}</p>
                    {m.symbol && <p className="mt-0.5 text-xs text-ink-3">While viewing {m.symbol}</p>}
                  </div>
                ) : (
                  <AssistantMessage message={m} />
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={submit} className={clsx("border-t border-rule bg-sheet", compact ? "px-5 py-3" : "py-4")}>
        <label htmlFor="analyst-input" className="sr-only">
          Ask the analyst
        </label>
        <textarea
          id="analyst-input"
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={compact ? 2 : 3}
          placeholder={symbol ? `Ask about ${symbol} or anything on IDX` : "Ask about a stock, the market, or your portfolio"}
          className="w-full resize-none rounded border border-rule-strong bg-sheet px-3 py-2 text-sm placeholder:text-ink-3 focus:border-ink focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={clear} disabled={messages.length === 0}>
            <Trash2 aria-hidden className="size-3.5" />
            Clear chat
          </Button>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-ink-3 sm:inline">Enter to send, Shift+Enter for a new line</span>
            {busy ? (
              <Button variant="secondary" size="sm" onClick={stop}>
                <Square aria-hidden className="size-3" />
                Stop
              </Button>
            ) : (
              <Button type="submit" variant="primary" size="sm" disabled={!draft.trim()}>
                Send
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
