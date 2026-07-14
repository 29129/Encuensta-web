import { apiError, assertSameOrigin, requireAdmin } from "../../../../lib/http";
import { createSurvey, ensureLocalDemoSurvey, listSurveys } from "../../../../lib/surveys";
import type { SurveyInput } from "../../../../lib/types";

export async function GET(request: Request) {
  try {
    const identity = await requireAdmin(request);
    if (identity.isLocalDemo) await ensureLocalDemoSurvey(identity.email);
    return Response.json({ surveys: await listSurveys(identity.email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const identity = await requireAdmin(request); const input = await request.json() as SurveyInput;
    return Response.json({ survey: await createSurvey(identity.email, input) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
