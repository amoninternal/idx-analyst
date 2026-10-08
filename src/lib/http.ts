import "server-only";
import { PortfolioError } from "./portfolio";
import { readBodyLimited } from "./request-guard";
import { describeError, isValidSymbol, normalizeSymbol, SectorsError } from "./sectors/client";

export class BadRequest extends Error {}

const SECTORS_STATUS: Record<SectorsError["code"], number> = {
  NO_KEY: 503,
  UNAUTHORIZED: 502,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  GONE: 502,
  RATE_LIMITED: 429,
  SERVER: 502,
  NETWORK: 504,
};

export function errorResponse(err: unknown): Response {
  let status = 500;
  if (err instanceof SectorsError) status = SECTORS_STATUS[err.code];
  else if (err instanceof BadRequest || err instanceof PortfolioError || err instanceof SyntaxError) status = 400;
  if (status === 500) console.error(err);
  return Response.json({ error: describeError(err) }, { status });
}

export function symbolFrom(raw: string): string {
  if (!isValidSymbol(raw)) throw new BadRequest(`"${raw}" is not a four-letter IDX ticker.`);
  return normalizeSymbol(raw);
}

export function intParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

/** Parses a small JSON request body (16 KB at most), or throws BadRequest. */
export async function readJson<T>(request: Request, maxBytes = 16_384): Promise<T> {
  const raw = await readBodyLimited(request, maxBytes);
  if (raw === null) throw new BadRequest("That request is too large.");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new BadRequest("Send the request as JSON.");
  }
}
