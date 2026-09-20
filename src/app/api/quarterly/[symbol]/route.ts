import type { NextRequest } from "next/server";
import { errorResponse, intParam, symbolFrom } from "@/lib/http";
import { getQuarterlyFinancials } from "@/lib/sectors/api";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/quarterly/[symbol]">) {
  try {
    const symbol = symbolFrom((await ctx.params).symbol);
    const quarters = intParam(request.nextUrl.searchParams.get("n"), 4, 1, 8);
    return Response.json(await getQuarterlyFinancials(symbol, quarters));
  } catch (err) {
    return errorResponse(err);
  }
}
