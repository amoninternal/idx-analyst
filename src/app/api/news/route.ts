import type { NextRequest } from "next/server";
import { errorResponse, intParam, symbolFrom } from "@/lib/http";
import { getNews } from "@/lib/sectors/api";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams;
    const symbol = q.get("symbol");
    const tags = q.get("tags");
    return Response.json(
      await getNews({
        symbols: symbol ? [symbolFrom(symbol)] : undefined,
        tags: tags ? tags.split(",").filter(Boolean) : undefined,
        keyword: q.get("keyword")?.trim() || undefined,
        subSector: q.get("subSector") || undefined,
        limit: intParam(q.get("limit"), 20, 1, 30),
        offset: intParam(q.get("offset"), 0, 0, 100_000),
      }),
    );
  } catch (err) {
    return errorResponse(err);
  }
}
