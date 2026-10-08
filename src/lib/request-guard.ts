import "server-only";

// Small request checks for the routes that change state (connecting and disconnecting keys).

/**
 * True when the request was sent by a page on this site. Browsers attach Origin to every
 * POST/DELETE from fetch(), and a page on another site can't forge it, so this blocks
 * cross-site request forgery. Requests without an Origin (curl, scripts) are refused too:
 * the connect form always sends one.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  // Behind a reverse proxy the public host arrives in X-Forwarded-Host.
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  return Boolean(host) && originHost === host;
}

/**
 * The client's address, for rate limiting. Forwarding headers can be forged by anyone, so
 * they are read only behind a proxy that sets them itself: on Vercel, or when the operator
 * sets TRUST_PROXY_HEADERS=1. Otherwise every request counts as one client ("direct"):
 * Next.js route handlers can't see the socket address.
 */
export function clientAddress(request: Request): string {
  const trusted = process.env.VERCEL === "1" || process.env.TRUST_PROXY_HEADERS?.trim() === "1";
  if (!trusted) return "direct";
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

type Hits = number[];

/**
 * Attempt limits for connecting keys, in memory.
 *
 * - Each client gets `perClient` attempts per window, successful or not.
 * - Failed checks also count toward a server-wide budget. When it is used up, only
 *   clients that have failed recently are held back, so a flood of bad keys can't lock
 *   out someone connecting for the first time.
 *
 * Together with the cap on concurrent provider checks (see `createSemaphore`), this keeps
 * the endpoint from being used to test a list of stolen keys in bulk.
 */
export function createLimiter({ perClient, globalFailures, windowMs }: { perClient: number; globalFailures: number; windowMs: number }) {
  const attempts = new Map<string, Hits>();
  const failures = new Map<string, Hits>();
  const allFailures: Hits = [];

  const prune = (h: Hits, now: number) => {
    while (h.length && now - h[0] > windowMs) h.shift();
  };
  const sweep = (m: Map<string, Hits>, now: number) => {
    if (m.size > 5000) for (const [k, h] of m) if (!h.length || now - h.at(-1)! > windowMs) m.delete(k);
  };

  return {
    /** Call before doing any work. Counts the attempt when it is allowed. */
    attempt(client: string): { ok: true } | { ok: false; retryAfterSec: number } {
      const now = Date.now();
      const mine = attempts.get(client) ?? [];
      const myFails = failures.get(client) ?? [];
      prune(mine, now);
      prune(myFails, now);
      prune(allFailures, now);
      const retry = (since: number) => ({ ok: false as const, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - since)) / 1000)) });
      if (mine.length >= perClient) return retry(mine[0]);
      if (allFailures.length >= globalFailures && myFails.length > 0) return retry(myFails[0]);
      mine.push(now);
      attempts.set(client, mine);
      sweep(attempts, now);
      return { ok: true };
    },
    /** Call when a provider rejected the keys. */
    failed(client: string) {
      const now = Date.now();
      const myFails = failures.get(client) ?? [];
      myFails.push(now);
      failures.set(client, myFails);
      allFailures.push(now);
      sweep(failures, now);
    },
  };
}

/** At most `max` tasks at once; others wait up to `timeoutMs`, then get null. */
export function createSemaphore(max: number, timeoutMs: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T | null> {
    if (active >= max) {
      const admitted = await new Promise<boolean>((resolve) => {
        const go = () => {
          clearTimeout(timer);
          resolve(true);
        };
        const timer = setTimeout(() => {
          const i = waiting.indexOf(go);
          if (i >= 0) waiting.splice(i, 1);
          resolve(false);
        }, timeoutMs);
        waiting.push(go);
      });
      if (!admitted) return null;
    } else {
      active++;
    }
    try {
      return await task();
    } finally {
      // Hand the slot to the next waiter, or free it.
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

/**
 * Reads a request body as text, stopping as soon as it passes `maxBytes` (null then).
 * Content-Length can be left out (chunked uploads), so the limit is enforced while
 * reading rather than trusted from the header.
 */
export async function readBodyLimited(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return "";
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}
