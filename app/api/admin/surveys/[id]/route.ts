import { apiError, assertSameOrigin, requireAdmin } from "../../../../../lib/http";
import { deleteSurvey, getSurvey, PulsoError, updateSurvey } from "../../../../../lib/surveys";
import type { SurveyInput } from "../../../../../lib/types";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireAdmin(request); const { id } = await context.params; const survey = await getSurvey(id, identity.email);
    if (!survey) throw new PulsoError("Encuesta no encontrada.", 404);
    return Response.json({ survey }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); const identity = await requireAdmin(request); const { id } = await context.params; const input = await request.json() as SurveyInput;
    return Response.json({ survey: await updateSurvey(id, identity.email, input) });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request); const identity = await requireAdmin(request); const { id } = await context.params; await deleteSurvey(id, identity.email);
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
