import "server-only";
import { throwIfStopped } from "../abort";
import { cached } from "../cache";
import { config } from "../config";
import { dataScope, getKeys } from "../keys";
import { recordCredits } from "./credits";

const BASE_URL = "https://api.sectors.app";

export type SectorsErrorCode =
  | "NO_KEY"
  | "UNAUTHORIZED"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "GONE"
  | "RATE_LIMITED"
  | "SERVER"
  | "NETWORK";

export class SectorsError extends Error {
  constructor(
    public status: number,
    public code: SectorsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SectorsError";
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

export type SectorsRequest = {
  path: string;
  params?: Params;
  /** How long a successful response stays fresh. */
  ttlMs: number;
  /** Credits the endpoint documents for a 2xx response. */
  cost: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A cold stock page can ask for a dozen blocks and sections at once; keep at most a
// few requests in flight per key so bursts don't trip Sectors' rate limit. Each
// visitor has their own gate, under a larger shared cap, so one visitor (or one key
// that has run out of credits) can't hold up anyone else's requests.
const MAX_IN_FLIGHT_PER_SCOPE = 5;
const MAX_IN_FLIGHT_TOTAL = 24;

type Gate = { active: number; waiting: (() => void)[] };
const gates = ((globalThis as { __idxSectorsGates?: { total: Gate; byScope: Map<string, Gate> } }).__idxSectorsGates ??= {
  total: { active: 0, waiting: [] },
  byScope: new Map(),
});

/** Waits for a slot. A released slot is handed straight to the next waiter, so the cap is exact. */
function acquire(g: Gate, max: number): Promise<void> {
  if (g.active < max) {
    g.active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => g.waiting.push(resolve));
}

function release(g: Gate) {
  const next = g.waiting.shift();
  if (next) next();
  else g.active--;
}

async function withSlot<T>(scopeId: string, run: () => Promise<T>): Promise<T> {
  throwIfStopped();
  let mine = gates.byScope.get(scopeId);
  if (!mine) gates.byScope.set(scopeId, (mine = { active: 0, waiting: [] }));
  await acquire(mine, MAX_IN_FLIGHT_PER_SCOPE);
  try {
    await acquire(gates.total, MAX_IN_FLIGHT_TOTAL);
    try {
      // A chat stopped while this request waited for a slot doesn't send it.
      throwIfStopped();
      return await run();
    } finally {
      release(gates.total);
    }
  } finally {
    release(mine);
    if (mine.active === 0 && mine.waiting.length === 0) gates.byScope.delete(scopeId);
  }
}

function buildUrl(pathname: string, params: Params = {}): URL {
  const url = new URL(pathname.endsWith("/") ? pathname : `${pathname}/`, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

const KEY_HINT = config.keyMode === "user" ? "Reconnect your key on the Connect page." : "Check SECTORS_API_KEY in .env.local.";

function errorFor(status: number, detail: string): SectorsError {
  if (status === 401 || status === 403) {
    return new SectorsError(status, "UNAUTHORIZED", `Sectors rejected the API key. ${KEY_HINT}`);
  }
  if (status === 404) return new SectorsError(status, "NOT_FOUND", detail || "Not found on Sectors.");
  if (status === 410) return new SectorsError(status, "GONE", "This Sectors endpoint has been retired.");
  if (status === 429) {
    return new SectorsError(status, "RATE_LIMITED", "Sectors rate limit or credit quota reached. Wait a moment and try again.");
  }
  if (status >= 500) return new SectorsError(status, "SERVER", `Sectors had a server error (${status}).`);
  return new SectorsError(status, "BAD_REQUEST", detail || `Sectors rejected the request (${status}).`);
}

type Attempt<T> = { ok: true; data: T } | { ok: false; status: number; detail: string; retryAfter: number } | { ok: false; network: Error };

/** One request, holding a slot only while it is on the wire. */
async function attemptOnce<T>(url: URL, apiKey: string): Promise<Attempt<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    return { ok: false, network: err as Error };
  }
  if (res.ok) return { ok: true, data: (await res.json()) as T };
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  return { ok: false, status: res.status, detail: body?.message || body?.error || res.statusText, retryAfter: Number(res.headers.get("retry-after")) };
}

async function fetchJson<T>(url: URL, cost: number, apiKey: string, scopeId: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    // Retries sleep outside the slot, so a waiting retry doesn't block other requests.
    const res = await withSlot(scopeId, () => attemptOnce<T>(url, apiKey));
    if ("network" in res) {
      if (attempt < 1) {
        await sleep(800);
        continue;
      }
      throw new SectorsError(0, "NETWORK", `Could not reach Sectors: ${res.network.message}`);
    }
    if (res.ok) {
      recordCredits(scopeId, cost);
      return res.data;
    }

    const detail = res.detail;
    const retryable = (res.status === 429 && attempt < 1) || (res.status >= 500 && attempt < 2);
    if (retryable) {
      const retryAfter = res.retryAfter;
      await sleep(retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 1200 * (attempt + 1));
      continue;
    }
    // Sectors bills a 404 as one credit: the lookup ran.
    if (res.status === 404) recordCredits(scopeId, 1);
    throw errorFor(res.status, detail);
  }
}

/** GET a Sectors v2 endpoint through the credit-saving cache. */
export async function sectorsGet<T>({ path, params, ttlMs, cost }: SectorsRequest): Promise<T> {
  const { sectors: apiKey } = await getKeys();
  if (!apiKey) {
    throw new SectorsError(
      401,
      "NO_KEY",
      config.keyMode === "user" ? "Connect your Sectors API key to load live market data." : "Add SECTORS_API_KEY to .env.local to load live market data.",
    );
  }
  const url = buildUrl(path, params);
  const scopeId = await dataScope();
  // Running it yourself keeps the original cache keys, so an existing .data/cache stays valid.
  // With visitor keys, each visitor's entries are kept apart.
  const key = scopeId === "local" ? `sectors:${url.pathname}${url.search}` : `sectors:${scopeId}:${url.pathname}${url.search}`;
  return cached(key, ttlMs, () => fetchJson<T>(url, cost, apiKey, scopeId), {
    persist: scopeId === "local",
    staleOnError: (err) => err instanceof SectorsError && ["RATE_LIMITED", "SERVER", "NETWORK"].includes(err.code),
  });
}

export function describeError(err: unknown): string {
  if (err instanceof SectorsError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export { isValidSymbol, normalizeSymbol } from "../symbols";
