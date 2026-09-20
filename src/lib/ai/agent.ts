import "server-only";
import OpenAI from "openai";
import type { ResponseCreateParamsStreaming, ResponseFunctionToolCall, ResponseInput } from "openai/resources/responses/responses";
import { config } from "../config";
import { fmtDate } from "../format";
import { todayJakarta } from "../dates";
import { runTool, TOOL_DEFINITIONS, toolLabel } from "./tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatContext = { symbol?: string | null };

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; id: string; name: string; label: string; status: "running" | "done" | "error"; detail?: string }
  | { type: "error"; message: string }
  | { type: "done" };

const MAX_TOOL_ROUNDS = 6;

function instructions(context: ChatContext): string {
  const today = fmtDate(todayJakarta());
  return `You are the analyst inside IDX Analyst, a research desk for stocks listed on the Indonesia Stock Exchange (IDX). Today is ${today} in Jakarta.

How you work
- Take every fact from the tools. Never state a price, ratio, flow figure or date that did not come from a tool result in this conversation. If a tool fails or returns nothing, say so plainly and carry on with what you have.
- For a question about one stock, call get_stock_overview, get_technical_analysis, get_broker_flow and get_news in the same turn. Add get_fundamentals sections only when the question needs them.
- Tickers are four letters (BBCA, TLKM). If you are unsure of a company's ticker, find it with screen_stocks.
- Sectors API calls cost the user credits. Never repeat a call with the same arguments, and request only the fundamentals sections you need.
- The local broker data ends on ${fmtDate(config.broksumLastComplete)}; later days come from Sectors when available. Tool results say which source they used.

How you write
- Reply in the user's language, Indonesian or English.
- Lead with the answer in one or two sentences, then the evidence. Use short sections and markdown tables for comparisons. No filler, no restating the question.
- Give the date of the data you cite, for example "as of 18 Sep 2026".
- Rupiah as Rp with T, B and M for trillion, billion and million (Rp 1.2T). Volumes in lots (1 lot = 100 shares). Percentages to one or two decimals.
- Name a broker the first time you mention its code, for example "AK (UBS Sekuritas)". Broker categories are Foreign, Institution and Retail.
- The trend call, the accumulation/distribution read and the valuation read are rules of thumb. Present them that way, next to the numbers behind them.
- When the user is weighing a buy or sell decision, close with one short line saying this is research, not financial advice.${
    context.symbol ? `\n\nThe user is looking at ${context.symbol} right now. "It" or "this stock" means ${context.symbol}.` : ""
  }`;
}

// Some models don't accept reasoning settings; after one refusal, stop sending them.
const state = ((globalThis as { __idxAgent?: { reasoningUnsupported: Set<string> } }).__idxAgent ??= {
  reasoningUnsupported: new Set(),
});

async function openStream(client: OpenAI, params: ResponseCreateParamsStreaming, signal?: AbortSignal) {
  const effort = config.openaiReasoningEffort;
  const useReasoning = effort && !state.reasoningUnsupported.has(params.model ?? "");
  try {
    return await client.responses.create(
      useReasoning ? { ...params, reasoning: { effort: effort as "low" } } : params,
      { signal },
    );
  } catch (err) {
    if (useReasoning && err instanceof OpenAI.BadRequestError && /reasoning/i.test(err.message)) {
      state.reasoningUnsupported.add(params.model ?? "");
      return client.responses.create(params, { signal });
    }
    throw err;
  }
}

/**
 * Runs the tool-calling loop and yields text deltas and tool status as they
 * happen. Tool rounds chain with previous_response_id, so reasoning items and
 * earlier calls stay on OpenAI's side.
 */
export async function* runAnalyst(messages: ChatMessage[], context: ChatContext, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  const client = new OpenAI({ apiKey: config.openaiApiKey, maxRetries: 2 });
  let input: ResponseInput = messages.map((m) => ({ role: m.role, content: m.content }));
  let previousResponseId: string | undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const stream = await openStream(
      client,
      {
        model: config.openaiModel,
        instructions: instructions(context),
        input,
        tools: TOOL_DEFINITIONS,
        tool_choice: round === MAX_TOOL_ROUNDS ? "none" : "auto",
        parallel_tool_calls: true,
        previous_response_id: previousResponseId,
        store: true,
        stream: true,
      },
      signal,
    );

    const calls: ResponseFunctionToolCall[] = [];
    let responseId: string | undefined;
    for await (const event of stream) {
      switch (event.type) {
        case "response.output_text.delta":
          yield { type: "text", delta: event.delta };
          break;
        case "response.output_item.done":
          if (event.item.type === "function_call") calls.push(event.item);
          break;
        case "response.completed":
          responseId = event.response.id;
          break;
        case "response.incomplete":
          responseId = event.response.id;
          if (!calls.length) {
            const reason = event.response.incomplete_details?.reason ?? "unknown";
            yield { type: "text", delta: `\n\n_The answer was cut short (${reason.replaceAll("_", " ")})._` };
          }
          break;
        case "response.failed":
          throw new Error(event.response.error?.message ?? "The model could not finish this answer.");
        case "error":
          throw new Error(event.message);
      }
    }

    if (!calls.length) return;
    if (!responseId) throw new Error("The model response ended unexpectedly.");

    for (const call of calls) {
      yield { type: "tool", id: call.call_id, name: call.name, label: toolLabel(call.name, call.arguments), status: "running" };
    }
    const results = await Promise.all(calls.map((call) => runTool(call.name, call.arguments, signal)));
    for (const [i, call] of calls.entries()) {
      const r = results[i];
      yield {
        type: "tool",
        id: call.call_id,
        name: call.name,
        label: toolLabel(call.name, call.arguments),
        status: r.ok ? "done" : "error",
        detail: r.ok ? undefined : r.summary,
      };
    }

    input = calls.map((call, i) => ({ type: "function_call_output", call_id: call.call_id, output: results[i].output }));
    previousResponseId = responseId;
  }
}

/** Turns SDK errors into something a person can act on. */
export function explainAgentError(err: unknown): string {
  if (err instanceof OpenAI.AuthenticationError) return "OpenAI rejected the API key. Check OPENAI_API_KEY in .env.local.";
  if (err instanceof OpenAI.PermissionDeniedError) return `This OpenAI key can't use ${config.openaiModel}. Set OPENAI_MODEL to a model your key can access.`;
  if (err instanceof OpenAI.NotFoundError) return `OpenAI doesn't recognize the model "${config.openaiModel}". Set OPENAI_MODEL in .env.local.`;
  if (err instanceof OpenAI.RateLimitError) return "OpenAI rate limit or quota reached. Wait a moment, or check your OpenAI billing.";
  if (err instanceof OpenAI.APIConnectionError) return "Could not reach OpenAI. Check your internet connection.";
  if (err instanceof Error && err.name === "AbortError") return "Stopped.";
  return err instanceof Error ? err.message : "The analyst hit an unexpected error.";
}
