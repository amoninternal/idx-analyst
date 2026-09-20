import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { searchStocks } from "@/lib/universe";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") ?? "";
    return Response.json(q.trim() ? await searchStocks(q, 8) : []);
  } catch (err) {
    return errorResponse(err);
  }
}
