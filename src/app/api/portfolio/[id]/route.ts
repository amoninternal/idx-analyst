import { errorResponse } from "@/lib/http";
import { removePosition, updatePosition, type PositionInput } from "@/lib/portfolio";

export async function PATCH(request: Request, ctx: RouteContext<"/api/portfolio/[id]">) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json()) as Partial<PositionInput>;
    return Response.json(await updatePosition(id, body));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/portfolio/[id]">) {
  try {
    const { id } = await ctx.params;
    await removePosition(id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
