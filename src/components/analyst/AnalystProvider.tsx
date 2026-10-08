"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

// Conversation state shared by the analyst drawer and the /analyst page, so a
// chat started on a stock page continues on the full page. Saved in
// localStorage on this browser only.

export type ToolChip = { id: string; label: string; status: "running" | "done" | "error"; detail?: string };

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolChip[];
  error?: string;
  pending?: boolean;
  symbol?: string | null;
};

type AnalystContextValue = {
  messages: UiMessage[];
  busy: boolean;
  open: boolean;
  symbol: string | null;
  setOpen: (open: boolean) => void;
  setSymbol: (symbol: string | null) => void;
  ask: (prompt: string, opts?: { symbol?: string | null; openDrawer?: boolean }) => void;
  /** Replace one of your messages and ask again from there; everything after it is dropped. */
  edit: (messageId: string, prompt: string) => void;
  /** Ask the same question again: from a user message, or for an answer, its question. */
  regenerate: (messageId: string) => void;
  stop: () => void;
  /** Start a new chat. */
  clear: () => void;
};

const AnalystContext = createContext<AnalystContextValue | null>(null);

const STORAGE_KEY = "idx-analyst.chat.v1";
const MAX_SAVED = 40;

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; label: string; status: ToolChip["status"]; detail?: string }
  | { type: "error"; message: string }
  | { type: "done" };

export function AnalystProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Nothing is written back until the saved chat has been restored into state;
  // otherwise the first save (with an empty list) would erase it.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as UiMessage[];
      if (Array.isArray(saved)) setMessages(saved.filter((m) => !m.pending));
    } catch {
      // Private mode or corrupted storage: start empty.
    } finally {
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!restored || busy) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_SAVED)));
    } catch {
      // Storage full or unavailable.
    }
  }, [messages, busy, restored]);

  const patchAssistant = useCallback((id: string, fn: (m: UiMessage) => UiMessage) => {
    setMessages((all) => all.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  /**
   * Sends `prompt` after the messages in `base` (the conversation up to that point) and
   * streams the answer in. Asking, editing and regenerating all come through here.
   */
  const send = useCallback(
    (prompt: string, contextSymbol: string | null, base: UiMessage[]) => {
      const text = prompt.trim();
      if (!text || abortRef.current) return;

      const user: UiMessage = { id: newId(), role: "user", content: text, symbol: contextSymbol };
      const reply: UiMessage = { id: newId(), role: "assistant", content: "", tools: [], pending: true };
      const history = [...base.filter((m) => !m.error && m.content.trim()), user].map((m) => ({ role: m.role, content: m.content }));
      setMessages([...base, user, reply]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        try {
          const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: history, symbol: contextSymbol }),
            signal: controller.signal,
          });
          if (!res.ok || !res.body) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(body?.error ?? `The analyst is unavailable (${res.status}).`);
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const event = JSON.parse(line) as StreamEvent;
              if (event.type === "text") {
                patchAssistant(reply.id, (m) => ({ ...m, content: m.content + event.delta }));
              } else if (event.type === "tool") {
                patchAssistant(reply.id, (m) => {
                  const tools = [...(m.tools ?? [])];
                  const i = tools.findIndex((t) => t.id === event.id);
                  const chip = { id: event.id, label: event.label, status: event.status, detail: event.detail };
                  if (i >= 0) tools[i] = chip;
                  else tools.push(chip);
                  return { ...m, tools };
                });
              } else if (event.type === "error") {
                patchAssistant(reply.id, (m) => ({ ...m, error: event.message }));
              }
            }
          }
        } catch (err) {
          const aborted = controller.signal.aborted;
          patchAssistant(reply.id, (m) => ({
            ...m,
            error: aborted ? undefined : err instanceof Error ? err.message : "The analyst stopped unexpectedly.",
            content: aborted && !m.content ? "_Stopped._" : m.content,
          }));
        } finally {
          patchAssistant(reply.id, (m) => ({
            ...m,
            pending: false,
            tools: m.tools?.map((t) => (t.status === "running" ? { ...t, status: "error", detail: "Stopped" } : t)),
          }));
          // A new chat may already have started its own request; leave that one alone.
          if (abortRef.current === controller) {
            abortRef.current = null;
            setBusy(false);
          }
        }
      })();
    },
    [patchAssistant],
  );

  const ask = useCallback(
    (prompt: string, opts: { symbol?: string | null; openDrawer?: boolean } = {}) => {
      if (abortRef.current) return;
      const contextSymbol = opts.symbol === undefined ? symbol : opts.symbol;
      if (opts.symbol !== undefined) setSymbol(opts.symbol);
      if (opts.openDrawer) setOpen(true);
      send(prompt, contextSymbol, messages);
    },
    [messages, send, symbol],
  );

  const edit = useCallback(
    (messageId: string, prompt: string) => {
      const i = messages.findIndex((m) => m.id === messageId && m.role === "user");
      if (i < 0 || abortRef.current) return;
      send(prompt, messages[i].symbol ?? null, messages.slice(0, i));
    },
    [messages, send],
  );

  const regenerate = useCallback(
    (messageId: string) => {
      let i = messages.findIndex((m) => m.id === messageId);
      // For an answer, go back to the question that produced it.
      while (i >= 0 && messages[i].role !== "user") i--;
      if (i < 0 || abortRef.current) return;
      send(messages[i].content, messages[i].symbol ?? null, messages.slice(0, i));
    },
    [messages, send],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setMessages([]);
  }, []);

  const value = useMemo(
    () => ({ messages, busy, open, symbol, setOpen, setSymbol, ask, edit, regenerate, stop, clear }),
    [messages, busy, open, symbol, ask, edit, regenerate, stop, clear],
  );
  return <AnalystContext.Provider value={value}>{children}</AnalystContext.Provider>;
}

export function useAnalyst(): AnalystContextValue {
  const ctx = useContext(AnalystContext);
  if (!ctx) throw new Error("useAnalyst must be used inside AnalystProvider");
  return ctx;
}
