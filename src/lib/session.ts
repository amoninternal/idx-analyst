// No "server-only" import: src/proxy.ts imports this file, and the proxy bundle isn't a
// React Server environment. The guard below keeps it out of the browser instead
// (SESSION_SECRET has no NEXT_PUBLIC_ prefix, so it is never inlined into client code).
if (typeof window !== "undefined") throw new Error("lib/session is server-only.");

// Encrypted session cookie that carries one visitor's API keys (KEY_MODE=user).
//
// - AES-256-GCM, key derived with HKDF from SESSION_SECRET. Tampering, truncation or a
//   different secret makes decryption fail, so a cookie can't be forged or edited.
// - The cookie is HttpOnly: page JavaScript (and so any injected script) can't read it.
// - The keys are never written to disk, a database or a log. The server sees them only
//   while handling a request from the visitor who holds the cookie.
// - Expiry is inside the encrypted payload, so it can't be extended by editing the cookie.
//
// Used by src/proxy.ts and the route handlers, both on the Node.js runtime.

export type SessionKeys = { sectors: string; gemini: string };

type Payload = { v: 1; s: string; g: string; iat: number; exp: number };

export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
/** Production cookies are Secure and use the __Host- prefix (no Domain, Path=/, HTTPS only). */
export const COOKIE_SECURE = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = COOKIE_SECURE ? "__Host-idx_keys" : "idx_keys";

const MIN_SECRET_LENGTH = 32;
const MAX_KEY_LENGTH = 512;
const AAD = new TextEncoder().encode("idx-analyst/session/v1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function secret(): string | null {
  const s = process.env.SESSION_SECRET?.trim() ?? "";
  return s.length >= MIN_SECRET_LENGTH ? s : null;
}

/** Null when sessions can work; otherwise what the operator has to fix. */
export function sessionConfigError(): string | null {
  return secret()
    ? null
    : `SESSION_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`;
}

type DerivedKeys = { material: string; encryption: CryptoKey; identity: CryptoKey };
const derived = ((globalThis as { __idxSessionKeys?: { current: DerivedKeys | null } }).__idxSessionKeys ??= { current: null });

async function derive(): Promise<DerivedKeys | null> {
  const material = secret();
  if (!material) return null;
  if (derived.current?.material === material) return derived.current;
  const base = await crypto.subtle.importKey("raw", encoder.encode(material), "HKDF", false, ["deriveKey"]);
  const hkdf = (info: string) => ({ name: "HKDF", hash: "SHA-256", salt: encoder.encode("idx-analyst"), info: encoder.encode(info) });
  const [encryption, identity] = await Promise.all([
    crypto.subtle.deriveKey(hkdf("session-encryption-v1"), base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
    crypto.subtle.deriveKey(hkdf("visitor-id-v1"), base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]),
  ]);
  derived.current = { material, encryption, identity };
  return derived.current;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const unb64 = (text: string) => new Uint8Array(Buffer.from(text, "base64url"));

/** Encrypts a visitor's keys into a cookie value. Throws if SESSION_SECRET isn't set. */
export async function sealSession(keys: SessionKeys): Promise<string> {
  const k = await derive();
  if (!k) throw new Error("SESSION_SECRET is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const payload: Payload = { v: 1, s: keys.sectors, g: keys.gemini, iat: now, exp: now + SESSION_MAX_AGE };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, k.encryption, encoder.encode(JSON.stringify(payload)));
  return `v1.${b64(iv)}.${b64(new Uint8Array(sealed))}`;
}

/** Decrypts and checks a cookie value. Null for anything missing, tampered, expired or malformed. */
export async function openSession(token: string | null | undefined): Promise<SessionKeys | null> {
  if (!token || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const k = await derive();
  if (!k) return null;
  try {
    const iv = unb64(parts[1]);
    if (iv.length !== 12) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: AAD }, k.encryption, unb64(parts[2]));
    const p = JSON.parse(decoder.decode(plain)) as Partial<Payload>;
    const now = Math.floor(Date.now() / 1000);
    if (p.v !== 1 || typeof p.s !== "string" || typeof p.g !== "string") return null;
    if (typeof p.exp !== "number" || p.exp <= now || typeof p.iat !== "number" || p.iat > now + 60) return null;
    if (!p.s || p.s.length > MAX_KEY_LENGTH || p.g.length > MAX_KEY_LENGTH) return null;
    return { sectors: p.s, gemini: p.g };
  } catch {
    return null;
  }
}

/**
 * A stable, non-reversible id for the visitor behind a Sectors key: HMAC with a key
 * derived from SESSION_SECRET. It names that visitor's cache entries, credit counter
 * and portfolio file. It can't be turned back into the key, and without the secret it
 * can't be computed from a key either.
 */
export async function visitorId(sectorsKey: string): Promise<string> {
  const k = await derive();
  if (!k) throw new Error("SESSION_SECRET is not configured.");
  const mac = await crypto.subtle.sign("HMAC", k.identity, encoder.encode(`sectors:${sectorsKey}`));
  return Buffer.from(mac).toString("hex").slice(0, 32);
}

/** Cookie attributes. SameSite=Lax keeps the visitor signed in when they follow a link here. */
export function sessionCookieOptions(maxAge = SESSION_MAX_AGE) {
  return { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax" as const, path: "/", maxAge, priority: "high" as const };
}
