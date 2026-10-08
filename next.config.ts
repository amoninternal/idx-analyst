import type { NextConfig } from "next";

// Response headers for every route. The Content Security Policy is set per request in
// src/proxy.ts, because it carries a fresh nonce.
const securityHeaders = [
  // No framing (clickjacking on the key form); CSP frame-ancestors says the same to newer browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Browsers only honor this over HTTPS; it pins the site to HTTPS for a year once seen.
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  // DuckDB ships a native binary; load it with Node's require instead of bundling it.
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
  poweredByHeader: false,
  experimental: {
    // src/proxy.ts runs on every request, so Next.js buffers request bodies for it. The
    // largest legitimate body (a long analyst conversation) is well under this.
    proxyClientMaxBodySize: "1mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
