import type { NextRequest } from "next/server";
import { errorResponse, intParam, symbolFrom } from "@/lib/http";
import { getCandles } from "@/lib/prices";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/candles/[symbol]">) {
  try {
    const symbol = symbolFrom((await ctx.params).symbol);
    const days = intParam(request.nextUrl.searchParams.get("days"), 365, 30, 1100);
    return Response.json(await getCandles(symbol, days));
  } catch (err) {
    return errorResponse(err);
  }
}
