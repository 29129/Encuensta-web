import { apiError } from "../../../../../lib/http";
import { getPublicSurvey, PulsoError } from "../../../../../lib/surveys";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params; const survey = await getPublicSurvey(slug);
    if (!survey) throw new PulsoError("Esta encuesta no existe o todavía no está publicada.", 404);
    const now = new Date();
    const availability = survey.status === "closed" || (survey.endAt && now > new Date(survey.endAt)) ? "closed" : survey.startAt && now < new Date(survey.startAt) ? "scheduled" : "available";
    return Response.json({ survey, availability }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
