import { errorResponse } from "@/lib/http";
import { addPosition, updateSettings, valuePortfolio, type PositionInput } from "@/lib/portfolio";
import type { PortfolioSettings } from "@/lib/types";

export async function GET() {
  try {
    return Response.json(await valuePortfolio());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PositionInput;
    return Response.json(await addPosition(body), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Update fee settings. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Partial<PortfolioSettings>;
    return Response.json(await updateSettings(body));
  } catch (err) {
    return errorResponse(err);
  }
}
