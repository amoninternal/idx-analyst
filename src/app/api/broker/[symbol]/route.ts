import type { NextRequest } from "next/server";
import { getBrokerSummary } from "@/lib/brokers";
import { errorResponse, symbolFrom } from "@/lib/http";
import { BROKER_PERIODS, type BrokerPeriod } from "@/lib/types";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/broker/[symbol]">) {
  try {
    const symbol = symbolFrom((await ctx.params).symbol);
    const raw = request.nextUrl.searchParams.get("period") ?? "1M";
    const period = (BROKER_PERIODS as string[]).includes(raw) ? (raw as BrokerPeriod) : "1M";
    return Response.json(await getBrokerSummary(symbol, period));
  } catch (err) {
    return errorResponse(err);
  }
}
