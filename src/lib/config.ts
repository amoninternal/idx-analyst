import "server-only";
import path from "node:path";

const env = (name: string) => process.env[name]?.trim() ?? "";

export const config = {
  sectorsApiKey: env("SECTORS_API_KEY"),
  openaiApiKey: env("OPENAI_API_KEY"),
  openaiModel: env("OPENAI_MODEL") || "gpt-5.6-terra",
  openaiReasoningEffort: env("OPENAI_REASONING_EFFORT") || "low",
  // Runtime data folders, not source: keep them out of Turbopack's file tracing.
  broksumDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), env("BROKSUM_DIR") || "../broksum-data"),
  dataDir: path.resolve(/*turbopackIgnore: true*/ process.cwd(), ".data"),
  // The local export is complete for every stock through this date.
  // Anything later is fetched from the Sectors broker-summary endpoint.
  broksumLastComplete: env("BROKSUM_LAST_COMPLETE") || "2026-09-10",
};

export const hasSectorsKey = () => config.sectorsApiKey.length > 0;
export const hasOpenAIKey = () => config.openaiApiKey.length > 0;
