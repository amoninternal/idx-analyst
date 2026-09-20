import "server-only";
import { coverage } from "./broksum/queries";
import { config, hasOpenAIKey, hasSectorsKey } from "./config";
import { creditsToday } from "./sectors/credits";
import { describeError } from "./sectors/client";
import type { ServiceStatus } from "./types";

export async function getStatus(): Promise<ServiceStatus> {
  let broksum: ServiceStatus["broksum"];
  try {
    const c = await coverage();
    broksum = { ok: true, ...c, lastComplete: config.broksumLastComplete };
  } catch (err) {
    broksum = { ok: false, firstDate: null, lastDate: null, tickers: 0, lastComplete: config.broksumLastComplete, error: describeError(err) };
  }
  return {
    sectors: hasSectorsKey(),
    openai: hasOpenAIKey(),
    model: config.openaiModel,
    broksum,
    credits: creditsToday(),
  };
}
