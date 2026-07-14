import { apiError } from "../../../../../../lib/http";
import { submitResponse } from "../../../../../../lib/surveys";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params; const payload = await request.json();
    return Response.json(await submitResponse(slug, payload), { status: 201 });
  } catch (error) { return apiError(error); }
}
