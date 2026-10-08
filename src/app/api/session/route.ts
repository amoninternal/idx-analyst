import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { clientAddress, createLimiter, createSemaphore, isSameOrigin, readBodyLimited } from "@/lib/request-guard";
import { SESSION_COOKIE, sealSession, sessionConfigError, sessionCookieOptions } from "@/lib/session";
import { looksLikeKey, verifyGeminiKey, verifySectorsKey } from "@/lib/verify-keys";

// Connect (POST) and disconnect (DELETE) a visitor's own API keys. KEY_MODE=user only.

const guards = ((globalThis as { __idxConnectGuards?: { limiter: ReturnType<typeof createLimiter>; checks: ReturnType<typeof createSemaphore> } }).__idxConnectGuards ??= {
  limiter: createLimiter({ perClient: 8, globalFailures: 120, windowMs: 10 * 60_000 }),
  // Provider checks in flight at once, across all visitors.
  checks: createSemaphore(4, 20_000),
});

const MAX_BODY = 4096;

const NO_STORE = { "Cache-Control": "no-store" };

const fail = (status: number, error: string, fields?: { sectors?: string; gemini?: string }, headers?: Record<string, string>) =>
  NextResponse.json({ error, fields }, { status, headers: { ...NO_STORE, ...headers } });

export async function POST(request: Request) {
  if (config.keyMode !== "user") return fail(404, "Not found.");
  if (!isSameOrigin(request)) return fail(403, "This request didn't come from this site.");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return fail(415, "Send JSON.");

  const misconfigured = sessionConfigError();
  if (misconfigured) {
    console.error(`[session] ${misconfigured}`);
    return fail(500, "This server isn't set up for visitor keys yet: its operator needs to set SESSION_SECRET.");
  }

  const client = clientAddress(request);
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY) return fail(413, "That's too much data for two keys.");
  const rate = guards.limiter.attempt(client);
  if (!rate.ok) {
    return fail(429, `Too many attempts. Try again in ${Math.ceil(rate.retryAfterSec / 60)} minute(s).`, undefined, {
      "Retry-After": String(rate.retryAfterSec),
    });
  }

  const raw = await readBodyLimited(request, MAX_BODY);
  if (raw === null) return fail(413, "That's too much data for two keys.");
  type Body = { sectors?: unknown; gemini?: unknown } | null;
  let body: Body = null;
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    return fail(400, "Send the keys as JSON.");
  }
  const sectors = typeof body?.sectors === "string" ? body.sectors.trim() : "";
  const gemini = typeof body?.gemini === "string" ? body.gemini.trim() : "";

  const fields: { sectors?: string; gemini?: string } = {};
  if (!sectors) fields.sectors = "A Sectors key is required.";
  else if (!looksLikeKey(sectors)) fields.sectors = "That doesn't look like an API key.";
  if (gemini && !looksLikeKey(gemini)) fields.gemini = "That doesn't look like an API key.";
  if (fields.sectors || fields.gemini) return fail(400, "Check the highlighted keys.", fields);

  const checked = await guards.checks(() =>
    Promise.all([verifySectorsKey(sectors), gemini ? verifyGeminiKey(gemini) : Promise.resolve({ ok: true as const })]),
  );
  if (!checked) return fail(503, "The server is busy checking other keys. Try again in a moment.", undefined, { "Retry-After": "10" });
  const [s, g] = checked;
  if (!s.ok) fields.sectors = s.message;
  if (!g.ok) fields.gemini = g.message;
  if (fields.sectors || fields.gemini) {
    guards.limiter.failed(client);
    return fail(400, "One of the keys didn't work.", fields);
  }

  const res = NextResponse.json({ ok: true, gemini: Boolean(gemini) }, { headers: NO_STORE });
  res.cookies.set(SESSION_COOKIE, await sealSession({ sectors, gemini }), sessionCookieOptions());
  return res;
}

export async function DELETE(request: Request) {
  if (config.keyMode !== "user") return fail(404, "Not found.");
  if (!isSameOrigin(request)) return fail(403, "This request didn't come from this site.");
  const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
  res.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return res;
}
