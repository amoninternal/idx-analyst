import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { config } from "./config";

// Checks a visitor's keys against the providers before they are sealed into a session.
// The keys go only to api.sectors.app and Google's Gemini endpoint, never anywhere a
// request can choose.

/** Printable ASCII without spaces, 16 to 512 characters: safe in an HTTP header. */
const KEY_SHAPE = /^[\x21-\x7e]{16,512}$/;

export function looksLikeKey(value: string): boolean {
  return KEY_SHAPE.test(value);
}

type Check = { ok: true } | { ok: false; message: string };

/** One small Sectors request (1 credit). A 2xx means the key works. */
export async function verifySectorsKey(key: string): Promise<Check> {
  let res: Response;
  try {
    res = await fetch("https://api.sectors.app/v2/subsectors/", {
      headers: { Authorization: key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return { ok: false, message: "Couldn't reach Sectors to check this key. Try again in a moment." };
  }
  await res.body?.cancel().catch(() => undefined);
  if (res.ok) return { ok: true };
  if (res.status === 401 || res.status === 403) return { ok: false, message: "Sectors rejected this key." };
  if (res.status === 429) return { ok: false, message: "Sectors says this key is rate limited or out of credits." };
  return { ok: false, message: `Sectors couldn't check this key right now (status ${res.status}).` };
}

/** Looks up the analyst's model with the key. Free, and confirms the key can use that model. */
export async function verifyGeminiKey(key: string): Promise<Check> {
  try {
    const ai = new GoogleGenAI({ apiKey: key, vertexai: false, httpOptions: { timeout: 12_000 } });
    await ai.models.get({ model: config.geminiModel });
    return { ok: true };
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 400 || err.status === 401) return { ok: false, message: "Google rejected this Gemini key." };
      if (err.status === 403) return { ok: false, message: `This Gemini key isn't allowed to use ${config.geminiModel}.` };
      if (err.status === 404) return { ok: false, message: `This Gemini key can't see the model ${config.geminiModel}.` };
      if (err.status === 429) return { ok: false, message: "This Gemini key is rate limited right now. Try again in a minute." };
      return { ok: false, message: `Google couldn't check this key right now (status ${err.status}).` };
    }
    return { ok: false, message: "Couldn't reach Google to check this key. Try again in a moment." };
  }
}
