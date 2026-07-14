import { apiError, requireAdmin } from "../../../../../../lib/http";
import { getResults } from "../../../../../../lib/surveys";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireAdmin(request); const { id } = await context.params; const value = new URL(request.url).searchParams.get("range");
    const range = value === "7" || value === "30" ? value : "all";
    return Response.json(await getResults(id, identity.email, range), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
