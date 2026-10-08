import { NextResponse, type NextRequest } from "next/server";
import { keyMode } from "@/lib/mode";
import { safeNextPath } from "@/lib/safe-path";
import { openSession, SESSION_COOKIE } from "@/lib/session";

// Runs before every page and API request (Node.js runtime).
//
// 1. Content Security Policy with a fresh nonce per request: only this app's own scripts
//    run, the page can't be framed, and the browser won't send data to other origins.
// 2. Requests that change something (API calls other than GET/HEAD) must come from a
//    page on this site, in both key modes. Otherwise any website you visit could make
//    your browser spend your keys, for example by posting to a self-hosted app on
//    localhost.
// 3. With KEY_MODE=user, visitors without a valid key session are sent to /connect
//    (pages) or refused (API), and cross-site requests to the API are refused.
// 4. API responses are marked private and uncacheable, so a shared cache or CDN never
//    hands one visitor's data to another.
//
// The gate here is a convenience, not the security boundary. Even if a request got past
// it, lib/keys.ts would find no keys in it, and every paid call would fail before it was
// sent. Next.js says as much: proxy is for optimistic checks, not authorization.

const OPEN_PATHS = new Set(["/connect", "/api/session"]);

function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // React needs eval only in development, for its error overlays.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Style attributes come from React's style prop and from the chart library.
    "style-src 'self' 'unsafe-inline'",
    // News thumbnails come from the publishers' own hosts.
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Same check as lib/request-guard isSameOrigin, inlined because that file is server-only. */
function fromThisSite(request: NextRequest): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  // Older browsers without Fetch Metadata: fall back to Origin, which they do send on POST.
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

function withSecurityHeaders(request: NextRequest, isApi: boolean): NextResponse {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  // Next.js reads the nonce from the request's CSP header and stamps it on its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (isApi) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi && !SAFE_METHODS.has(request.method) && !fromThisSite(request)) {
    return NextResponse.json({ error: "This request didn't come from this site." }, { status: 403 });
  }

  if (keyMode() === "user") {
    // A request another site made the browser send (a link, an <img>, a form) never reflects
    // what the visitor meant to do with their own keys. "none" is a typed URL or a bookmark.
    const site = request.headers.get("sec-fetch-site");
    if (isApi && site && site !== "same-origin" && site !== "none") {
      return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    }

    if (!OPEN_PATHS.has(pathname)) {
      const session = await openSession(request.cookies.get(SESSION_COOKIE)?.value);
      if (!session) {
        if (isApi) return NextResponse.json({ error: "Connect your API keys first." }, { status: 401, headers: { "Cache-Control": "no-store" } });
        const url = new URL("/connect", request.url);
        const next = safeNextPath(`${pathname}${search}`);
        if (next !== "/") url.searchParams.set("next", next);
        return NextResponse.redirect(url);
      }
    }
  }

  return withSecurityHeaders(request, isApi);
}

export const config = {
  // Everything except Next.js internals (build assets, dev reload) and the favicon.
  matcher: ["/((?!_next/|__nextjs|favicon.ico).*)"],
};
