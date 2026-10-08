import { explainAgentError, runAnalyst, type AgentEvent, type ChatMessage } from "@/lib/ai/agent";
import { config } from "@/lib/config";
import { getKeys, withKeys } from "@/lib/keys";
import { readBodyLimited } from "@/lib/request-guard";
import { isValidSymbol, normalizeSymbol } from "@/lib/sectors/client";

const MAX_MESSAGES = 24;
const MAX_CHARS = 12_000;
const MAX_BODY = MAX_MESSAGES * MAX_CHARS * 2;

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const messages = raw
    .filter(
      (m): m is ChatMessage =>
        m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    .slice(-MAX_MESSAGES);
  if (!messages.length || messages.at(-1)!.role !== "user") return null;
  return messages;
}

export async function POST(request: Request) {
  // Resolve this visitor's keys once; the stream and every tool call below use exactly these.
  const keys = await getKeys();
  if (!keys.gemini) {
    const fix =
      config.keyMode === "user"
        ? "Connect a Gemini API key on the Connect page to use the analyst."
        : "Add GEMINI_API_KEY to .env.local, then restart the app, to use the analyst.";
    return Response.json({ error: fix }, { status: 503 });
  }
  const raw = await readBodyLimited(request, MAX_BODY);
  if (raw === null) return Response.json({ error: "The conversation is too long to send." }, { status: 413 });
  type Body = { messages?: unknown; symbol?: unknown };
  let body: Body | null = null;
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    // Handled below as a bad request.
  }
  const messages = parseMessages(body?.messages);
  if (!messages) return Response.json({ error: "Send at least one message, ending with the user's." }, { status: 400 });
  const symbol = typeof body?.symbol === "string" && isValidSymbol(body.symbol) ? normalizeSymbol(body.symbol) : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await withKeys(keys, async () => {
          for await (const event of runAnalyst(messages, { symbol }, keys.gemini, request.signal)) send(event);
        });
        send({ type: "done" });
      } catch (err) {
        if (!request.signal.aborted) send({ type: "error", message: explainAgentError(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // The client already went away.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // no-transform stops response compression from buffering the stream.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
