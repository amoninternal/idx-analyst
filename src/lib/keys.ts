import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cookies } from "next/headers";
import { config, environmentKeys } from "./config";
import { openSession, SESSION_COOKIE, visitorId } from "./session";

// The one place that decides which API keys a request may use.
//
// KEY_MODE=user: only the keys in the requesting visitor's own session cookie. With no
// valid cookie there are no keys, and every paid call fails before it is sent. The
// environment keys are never consulted in this mode, so there is no fallback to abuse:
// getting past the /connect page (even by bypassing src/proxy.ts) leaves a request
// with nothing to spend.
//
// KEY_MODE=server: the keys in the environment, for running the app yourself.

export type ApiKeys = { sectors: string; gemini: string };

const NONE: ApiKeys = { sectors: "", gemini: "" };

// Lets long-running work (the analyst's streamed answer and its tool calls) carry the
// keys that the route handler resolved, instead of re-reading the cookie mid-stream.
const scope = new AsyncLocalStorage<ApiKeys>();

export function withKeys<T>(keys: ApiKeys, run: () => T): T {
  return scope.run(keys, run);
}

export async function getKeys(): Promise<ApiKeys> {
  if (config.keyMode === "server") return environmentKeys();
  const scoped = scope.getStore();
  if (scoped) return scoped;
  try {
    const jar = await cookies();
    return (await openSession(jar.get(SESSION_COOKIE)?.value)) ?? NONE;
  } catch {
    // Outside a request (build time, background work): no visitor, so no keys.
    return NONE;
  }
}

export async function hasSectorsKey(): Promise<boolean> {
  return (await getKeys()).sectors.length > 0;
}

export async function hasGeminiKey(): Promise<boolean> {
  return (await getKeys()).gemini.length > 0;
}

/**
 * Names whose data a request is touching: "local" when you run it yourself, otherwise a
 * per-visitor id. Cache entries, the credit counter and the portfolio are kept apart by it,
 * so one visitor never sees another's portfolio or rides on their paid requests.
 */
export async function dataScope(): Promise<string> {
  if (config.keyMode === "server") return "local";
  const { sectors } = await getKeys();
  return sectors ? `v-${await visitorId(sectors)}` : "anonymous";
}
