import { getStatus } from "@/lib/status";

export async function GET() {
  return Response.json(await getStatus());
}
