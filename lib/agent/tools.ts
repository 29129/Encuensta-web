import { createSurvey, getResults, getSurvey, listSurveys, PulsoError, setSurveyStatus, updateSurvey } from "../surveys";
import type { QuestionType, Survey, SurveyInput, SurveyQuestion } from "../types";

const QUESTION_TYPES: QuestionType[] = ["short_text", "long_text", "single_choice", "multiple_choice", "dropdown", "scale", "rating", "yes_no"];
type JsonSchema = Record<string, unknown>;

const questionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    prompt: { type: "string", description: "Texto de la pregunta." },
    type: { type: "string", enum: QUESTION_TYPES, description: "Tipo de pregunta." },
    required: { type: "boolean", description: "Si la pregunta es obligatoria." },
    options: { type: "array", items: { type: "string" }, description: "Opciones para preguntas de selección." },
    config: {
      type: "object",
      additionalProperties: false,
      properties: {
        min: { type: ["number", "null"] }, max: { type: ["number", "null"] },
        minLabel: { type: ["string", "null"] }, maxLabel: { type: ["string", "null"] },
      },
      required: ["min", "max", "minLabel", "maxLabel"],
    },
  },
  required: ["prompt", "type", "required", "options", "config"],
};

const surveyFields: JsonSchema = {
  description: { type: "string", description: "Descripción o propósito." },
  isAnonymous: { type: "boolean", description: "Si las respuestas serán anónimas." },
  collectName: { type: "boolean", description: "Si se solicitará el nombre." },
  collectEmail: { type: "boolean", description: "Si se solicitará el correo." },
  oneResponsePerDevice: { type: "boolean", description: "Si se limita a una respuesta por dispositivo." },
  startAt: { type: ["string", "null"], description: "Fecha ISO de inicio o null." },
  endAt: { type: ["string", "null"], description: "Fecha ISO de cierre o null." },
};

function functionTool(name: string, description: string, properties: JsonSchema, required: string[]): JsonSchema {
  return { type: "function", name, description, strict: true, parameters: { type: "object", additionalProperties: false, properties, required } };
}

function nullableSchema(schema: JsonSchema): JsonSchema {
  const type = schema.type;
  const types = Array.isArray(type) ? type : [type];
  return { ...schema, type: Array.from(new Set([...types, "null"])) };
}

export const AGENT_TOOLS: JsonSchema[] = [
  functionTool("listSurveys", "Lista las encuestas del administrador autenticado para identificar una encuesta existente.", {}, []),
  functionTool("getSurvey", "Obtiene una encuesta propia por su identificador, incluyendo sus preguntas.", { surveyId: { type: "string" } }, ["surveyId"]),
  functionTool("createSurvey", "Crea una encuesta nueva como borrador para el administrador autenticado.", { title: { type: "string" }, ...surveyFields, questions: { type: "array", minItems: 1, items: questionSchema } }, ["title", "description", "isAnonymous", "collectName", "collectEmail", "oneResponsePerDevice", "startAt", "endAt", "questions"]),
  functionTool("editSurvey", "Edita una encuesta propia sin respuestas. Usa null para conservar cada campo sin cambios.", { surveyId: { type: "string" }, title: nullableSchema({ type: "string" }), ...Object.fromEntries(Object.entries(surveyFields).map(([key, value]) => [key, nullableSchema(value as JsonSchema)])), questions: { type: ["array", "null"], items: questionSchema } }, ["surveyId", "title", "description", "isAnonymous", "collectName", "collectEmail", "oneResponsePerDevice", "startAt", "endAt", "questions"]),
  functionTool("publishSurvey", "Publica una encuesta propia después de que el administrador lo haya confirmado explícitamente.", { surveyId: { type: "string" } }, ["surveyId"]),
  functionTool("getResponses", "Obtiene respuestas de una encuesta propia para una consulta administrativa.", { surveyId: { type: "string" }, range: { type: "string", enum: ["7", "30", "all"] } }, ["surveyId", "range"]),
  functionTool("analyzeResponses", "Analiza resultados agregados de una encuesta propia y devuelve datos para generar recomendaciones.", { surveyId: { type: "string" }, range: { type: "string", enum: ["7", "30", "all"] } }, ["surveyId", "range"]),
];

type CreateArguments = { title: unknown; description: unknown; isAnonymous: unknown; collectName: unknown; collectEmail: unknown; oneResponsePerDevice: unknown; startAt: unknown; endAt: unknown; questions: unknown };
type EditArguments = CreateArguments & { surveyId: unknown };

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new PulsoError(`El campo ${field} no es válido.`);
  return value;
}

function flag(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new PulsoError(`El campo ${field} no es válido.`);
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  return value === null ? null : text(value, field);
}

function parseQuestions(value: unknown): SurveyQuestion[] {
  if (!Array.isArray(value) || value.length === 0) throw new PulsoError("La encuesta necesita al menos una pregunta.");
  return value.map((question, position) => {
    if (!question || typeof question !== "object" || Array.isArray(question)) throw new PulsoError(`La pregunta ${position + 1} no es válida.`);
    const raw = question as { prompt?: unknown; type?: unknown; required?: unknown; options?: unknown; config?: unknown };
    const type = text(raw.type, `questions[${position}].type`) as QuestionType;
    if (!QUESTION_TYPES.includes(type)) throw new PulsoError(`El tipo de la pregunta ${position + 1} no es válido.`);
    if (!Array.isArray(raw.options) || raw.options.some((option) => typeof option !== "string")) throw new PulsoError(`Las opciones de la pregunta ${position + 1} no son válidas.`);
    if (!raw.config || typeof raw.config !== "object" || Array.isArray(raw.config)) throw new PulsoError(`La configuración de la pregunta ${position + 1} no es válida.`);
    const config = raw.config as { min?: unknown; max?: unknown; minLabel?: unknown; maxLabel?: unknown };
    return {
      id: "", position, prompt: text(raw.prompt, `questions[${position}].prompt`), type,
      required: flag(raw.required, `questions[${position}].required`), options: raw.options,
      config: {
        ...(typeof config.min === "number" ? { min: config.min } : {}), ...(typeof config.max === "number" ? { max: config.max } : {}),
        ...(typeof config.minLabel === "string" ? { minLabel: config.minLabel } : {}), ...(typeof config.maxLabel === "string" ? { maxLabel: config.maxLabel } : {}),
      },
    };
  });
}

function createInput(value: unknown): SurveyInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PulsoError("Los datos de la encuesta no son válidos.");
  const input = value as CreateArguments;
  return {
    title: text(input.title, "title"), description: text(input.description, "description"), isAnonymous: flag(input.isAnonymous, "isAnonymous"),
    collectName: flag(input.collectName, "collectName"), collectEmail: flag(input.collectEmail, "collectEmail"), oneResponsePerDevice: flag(input.oneResponsePerDevice, "oneResponsePerDevice"),
    startAt: nullableText(input.startAt, "startAt"), endAt: nullableText(input.endAt, "endAt"), questions: parseQuestions(input.questions),
  };
}

function publicSurvey(survey: Survey) {
  const safe = { ...survey };
  delete safe.ownerEmail;
  return { ...safe, questionCount: survey.questions.length };
}

function surveyAction(type: string, survey: Survey) {
  return { type, surveyId: survey.id, title: survey.title, status: survey.status };
}

export async function executeAgentTool(name: string, argumentsJson: string, ownerId: string, confirmed = false) {
  let args: unknown;
  try { args = JSON.parse(argumentsJson); } catch { throw new PulsoError("El AI Agent devolvió datos inválidos."); }
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new PulsoError("Los datos de la herramienta no son válidos.");

  if (name === "listSurveys") {
    const surveys = await listSurveys(ownerId);
    return { action: null, output: { success: true, surveys: surveys.map(publicSurvey) } };
  }
  if (name === "getSurvey") {
    const surveyId = text((args as { surveyId?: unknown }).surveyId, "surveyId");
    const survey = await getSurvey(surveyId, ownerId); if (!survey) throw new PulsoError("Encuesta no encontrada.", 404);
    return { action: null, output: { success: true, survey: publicSurvey(survey) } };
  }
  if (name === "createSurvey") {
    const survey = await createSurvey(ownerId, createInput(args));
    return { action: surveyAction("survey_created", survey), output: { success: true, survey: publicSurvey(survey) } };
  }
  if (name === "editSurvey") {
    const input = args as EditArguments; const surveyId = text(input.surveyId, "surveyId"); const existing = await getSurvey(surveyId, ownerId);
    if (!existing) throw new PulsoError("Encuesta no encontrada.", 404);
    const current: SurveyInput = {
      title: input.title === null ? existing.title : text(input.title, "title"), description: input.description === null ? existing.description : text(input.description, "description"),
      isAnonymous: input.isAnonymous === null ? existing.isAnonymous : flag(input.isAnonymous, "isAnonymous"), collectName: input.collectName === null ? existing.collectName : flag(input.collectName, "collectName"),
      collectEmail: input.collectEmail === null ? existing.collectEmail : flag(input.collectEmail, "collectEmail"), oneResponsePerDevice: input.oneResponsePerDevice === null ? existing.oneResponsePerDevice : flag(input.oneResponsePerDevice, "oneResponsePerDevice"),
      startAt: input.startAt === null ? existing.startAt : nullableText(input.startAt, "startAt"), endAt: input.endAt === null ? existing.endAt : nullableText(input.endAt, "endAt"),
      questions: input.questions === null ? existing.questions : parseQuestions(input.questions),
    };
    const survey = await updateSurvey(surveyId, ownerId, current);
    return { action: surveyAction("survey_updated", survey), output: { success: true, survey: publicSurvey(survey) } };
  }
  if (name === "publishSurvey") {
    const surveyId = text((args as { surveyId?: unknown }).surveyId, "surveyId"); const existing = await getSurvey(surveyId, ownerId);
    if (!existing) throw new PulsoError("Encuesta no encontrada.", 404);
    if (!confirmed) return { action: { type: "publish_confirmation_required", surveyId: existing.id, title: existing.title, status: existing.status }, output: { success: false, requiresConfirmation: true, survey: publicSurvey(existing) } };
    const survey = await setSurveyStatus(surveyId, ownerId, "published");
    return { action: surveyAction("survey_published", survey), output: { success: true, survey: publicSurvey(survey) } };
  }
  if (name === "getResponses" || name === "analyzeResponses") {
    const input = args as { surveyId?: unknown; range?: unknown }; const surveyId = text(input.surveyId, "surveyId"); const range = input.range === "7" || input.range === "30" ? input.range : "all";
    const result = await getResults(surveyId, ownerId, range);
    const output = { success: true, survey: result.survey, responseCount: result.responseCount, responsesLast24Hours: result.responsesLast24Hours, lastResponseAt: result.lastResponseAt, questions: result.questions };
    if (name === "getResponses") return { action: null, output: { ...output, responses: result.rawResponses.slice(0, 50) } };
    return { action: { type: "responses_analyzed", surveyId, title: result.survey.title, status: "complete" }, output };
  }
  throw new PulsoError("La herramienta solicitada no está disponible.");
}
