import "server-only";
import { coverage } from "./broksum/queries";
import { config } from "./config";
import { dataScope, getKeys } from "./keys";
import { creditsToday } from "./sectors/credits";
import { describeError } from "./sectors/client";
import type { ServiceStatus } from "./types";

export async function getStatus(): Promise<ServiceStatus> {
  let broksum: ServiceStatus["broksum"];
  try {
    const c = await coverage();
    broksum = { ok: true, ...c, lastComplete: config.broksumLastComplete };
  } catch (err) {
    // Visitors don't need (and shouldn't see) server paths or file system errors.
    const detail = describeError(err);
    if (config.keyMode === "user") console.error(`[status] broker summary unavailable: ${detail}`);
    const error = config.keyMode === "user" ? "Broker summary data isn't available on this server." : detail;
    broksum = { ok: false, firstDate: null, lastDate: null, tickers: 0, lastComplete: config.broksumLastComplete, error };
  }
  const keys = await getKeys();
  return {
    keyMode: config.keyMode,
    sectors: keys.sectors.length > 0,
    gemini: keys.gemini.length > 0,
    model: config.geminiModel,
    broksum,
    credits: creditsToday(await dataScope()),
  };
}
