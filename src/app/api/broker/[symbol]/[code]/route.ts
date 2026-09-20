import type { NextRequest } from "next/server";
import { getBrokerDrilldown } from "@/lib/brokers";
import { BadRequest, errorResponse, symbolFrom } from "@/lib/http";
import { BROKER_PERIODS, type BrokerPeriod } from "@/lib/types";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/broker/[symbol]/[code]">) {
  try {
    const params = await ctx.params;
    const symbol = symbolFrom(params.symbol);
    if (!/^[A-Za-z]{2}$/.test(params.code)) throw new BadRequest("Broker codes are two letters, like YP.");
    const raw = request.nextUrl.searchParams.get("period") ?? "1M";
    const period = (BROKER_PERIODS as string[]).includes(raw) ? (raw as BrokerPeriod) : "1M";
    return Response.json(await getBrokerDrilldown(symbol, params.code, period));
  } catch (err) {
    return errorResponse(err);
  }
}
