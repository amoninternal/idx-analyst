import type { NextRequest } from "next/server";
import { errorResponse, intParam } from "@/lib/http";
import { getIndexCandles, indexCodeFrom } from "@/lib/index-series";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/index/[code]">) {
  try {
    const code = indexCodeFrom((await ctx.params).code);
    const days = intParam(request.nextUrl.searchParams.get("days"), 365, 30, 1100);
    return Response.json(await getIndexCandles(code, days));
  } catch (err) {
    return errorResponse(err);
  }
}
