import "server-only";
import path from "node:path";
import { keyMode } from "./mode";

const env = (name: string) => process.env[name]?.trim() ?? "";

/**
 * Where API keys come from.
 *
 *   user    Every visitor connects their own Sectors and Gemini keys on /connect. The keys
 *           live only in that visitor's encrypted session cookie. Keys in the environment
 *           are never read, so a public deployment can't spend the host's credits.
 *   server  Keys come from SECTORS_API_KEY and GEMINI_API_KEY. For running it yourself.
 *
 * "user" is the default, so a fresh deployment of the open-source code is safe as-is.
 * See lib/mode.ts.
 */
export const config = {
  keyMode: keyMode(),
  geminiModel: env("GEMINI_MODEL") || "gemini-3.8-flash",
  geminiThinkingLevel: env("GEMINI_THINKING_LEVEL").toLowerCase() || "low",
  // Runtime data folders, not source: keep them out of Turbopack's file tracing.
  broksumDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), env("BROKSUM_DIR") || "../broksum-data"),
  dataDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), ".data"),
  // The local export is complete for every stock through this date.
  // Anything later is fetched from the Sectors broker-summary endpoint.
  broksumLastComplete: env("BROKSUM_LAST_COMPLETE") || "2026-09-10",
};

/**
 * Keys from the environment. Only lib/keys.ts may call this, and only in server mode.
 * Nothing else reads SECTORS_API_KEY or GEMINI_API_KEY.
 */
export function environmentKeys(): { sectors: string; gemini: string } {
  return { sectors: env("SECTORS_API_KEY"), gemini: env("GEMINI_API_KEY") };
}
