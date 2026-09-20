import "server-only";
import { throwIfStopped } from "../abort";
import { cached } from "../cache";
import { config } from "../config";
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

// A cold stock page can ask for a dozen blocks and sections at once; keep at
// most a few requests in flight so bursts don't trip Sectors' rate limit.
const MAX_IN_FLIGHT = 5;
const gate = ((globalThis as { __idxSectorsGate?: { active: number; waiting: (() => void)[] } }).__idxSectorsGate ??= {
  active: 0,
  waiting: [],
});

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  throwIfStopped();
  if (gate.active >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => gate.waiting.push(resolve));
  gate.active++;
  try {
    // A chat stopped while this request waited for a slot doesn't send it.
    throwIfStopped();
    return await run();
  } finally {
    gate.active--;
    gate.waiting.shift()?.();
  }
}

function buildUrl(pathname: string, params: Params = {}): URL {
  const url = new URL(pathname.endsWith("/") ? pathname : `${pathname}/`, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url;
}

function errorFor(status: number, detail: string): SectorsError {
  if (status === 401 || status === 403) {
    return new SectorsError(status, "UNAUTHORIZED", "Sectors rejected the API key. Check SECTORS_API_KEY in .env.local.");
  }
  if (status === 404) return new SectorsError(status, "NOT_FOUND", detail || "Not found on Sectors.");
  if (status === 410) return new SectorsError(status, "GONE", "This Sectors endpoint has been retired.");
  if (status === 429) {
    return new SectorsError(status, "RATE_LIMITED", "Sectors rate limit or credit quota reached. Wait a moment and try again.");
  }
  if (status >= 500) return new SectorsError(status, "SERVER", `Sectors had a server error (${status}).`);
  return new SectorsError(status, "BAD_REQUEST", detail || `Sectors rejected the request (${status}).`);
}

async function fetchJson<T>(url: URL, cost: number): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: config.sectorsApiKey, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
    } catch (err) {
      if (attempt < 1) {
        await sleep(800);
        continue;
      }
      throw new SectorsError(0, "NETWORK", `Could not reach Sectors: ${(err as Error).message}`);
    }

    if (res.ok) {
      recordCredits(cost);
      return (await res.json()) as T;
    }

    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    const detail = body?.message || body?.error || res.statusText;
    const retryable = (res.status === 429 && attempt < 1) || (res.status >= 500 && attempt < 2);
    if (retryable) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 1200 * (attempt + 1));
      continue;
    }
    // Sectors bills a 404 as one credit: the lookup ran.
    if (res.status === 404) recordCredits(1);
    throw errorFor(res.status, detail);
  }
}

/** GET a Sectors v2 endpoint through the credit-saving cache. */
export async function sectorsGet<T>({ path, params, ttlMs, cost }: SectorsRequest): Promise<T> {
  if (!config.sectorsApiKey) {
    throw new SectorsError(401, "NO_KEY", "Add SECTORS_API_KEY to .env.local to load live market data.");
  }
  const url = buildUrl(path, params);
  return cached(`sectors:${url.pathname}${url.search}`, ttlMs, () => withSlot(() => fetchJson<T>(url, cost)), {
    staleOnError: (err) => err instanceof SectorsError && ["RATE_LIMITED", "SERVER", "NETWORK"].includes(err.code),
  });
}

export function describeError(err: unknown): string {
  if (err instanceof SectorsError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

export { isValidSymbol, normalizeSymbol } from "../symbols";
