import { explainAgentError, runAnalyst, type AgentEvent, type ChatMessage } from "@/lib/ai/agent";
import { hasOpenAIKey } from "@/lib/config";
import { isValidSymbol, normalizeSymbol } from "@/lib/sectors/client";

const MAX_MESSAGES = 24;
const MAX_CHARS = 12_000;

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
  if (!hasOpenAIKey()) {
    return Response.json({ error: "Add OPENAI_API_KEY to .env.local, then restart the app, to use the analyst." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { messages?: unknown; symbol?: unknown } | null;
  const messages = parseMessages(body?.messages);
  if (!messages) return Response.json({ error: "Send at least one message, ending with the user's." }, { status: 400 });
  const symbol = typeof body?.symbol === "string" && isValidSymbol(body.symbol) ? normalizeSymbol(body.symbol) : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        for await (const event of runAnalyst(messages, { symbol }, request.signal)) send(event);
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
