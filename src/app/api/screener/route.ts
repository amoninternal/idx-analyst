import type { NextRequest } from "next/server";
import { BadRequest, errorResponse } from "@/lib/http";
import { screenCompanies } from "@/lib/sectors/api";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 3) throw new BadRequest("Describe the stocks you want, for example: banks with ROE above 15%.");
    return Response.json(await screenCompanies(q));
  } catch (err) {
    return errorResponse(err);
  }
}
