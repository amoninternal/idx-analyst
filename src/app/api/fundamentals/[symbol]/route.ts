import type { NextRequest } from "next/server";
import { errorResponse, symbolFrom } from "@/lib/http";
import { getCompanyReport } from "@/lib/sectors/api";
import { REPORT_SECTIONS, type ReportSection } from "@/lib/sectors/types";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/fundamentals/[symbol]">) {
  try {
    const symbol = symbolFrom((await ctx.params).symbol);
    const requested = (request.nextUrl.searchParams.get("sections") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is ReportSection => (REPORT_SECTIONS as string[]).includes(s));
    const sections = requested.length ? [...new Set(requested)] : REPORT_SECTIONS;
    return Response.json(await getCompanyReport(symbol, sections));
  } catch (err) {
    return errorResponse(err);
  }
}
