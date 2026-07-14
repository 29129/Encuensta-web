import { apiError, assertSameOrigin, requireAdmin } from "../../../../../../lib/http";
import { PulsoError, setSurveyStatus } from "../../../../../../lib/surveys";
import type { SurveyStatus } from "../../../../../../lib/types";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); const identity = await requireAdmin(request); const { id } = await context.params;
    const { status } = await request.json() as { status: SurveyStatus };
    if (!["draft", "published", "closed"].includes(status)) throw new PulsoError("Estado no válido.");
    return Response.json({ survey: await setSurveyStatus(id, identity.email, status) });
  } catch (error) { return apiError(error); }
}
