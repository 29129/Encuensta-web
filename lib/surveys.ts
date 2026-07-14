import { getD1, makeSlug, newId } from "./db";
import type { AnswerInput, QuestionResult, QuestionType, ResultsPayload, Survey, SurveyInput, SurveyQuestion, SurveyStatus } from "./types";

type SurveyRow = {
  id: string; owner_email: string; title: string; description: string; status: SurveyStatus; slug: string;
  is_anonymous: number; collect_name: number; collect_email: number; one_response_per_device: number;
  start_at: string | null; end_at: string | null; created_at: string; updated_at: string; response_count?: number;
};
type QuestionRow = { id: string; survey_id: string; prompt: string; type: QuestionType; required: number; position: number; options_json: string; config_json: string };
type ResponseRow = { id: string; survey_id: string; respondent_name: string | null; respondent_email: string | null; submitted_at: string };
type AnswerRow = { response_id: string; question_id: string; value_json: string };

export class PulsoError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function json<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function rowToSurvey(row: SurveyRow, questions: SurveyQuestion[] = []): Survey {
  return {
    id: row.id, ownerEmail: row.owner_email, title: row.title, description: row.description, status: row.status,
    slug: row.slug, isAnonymous: Boolean(row.is_anonymous), collectName: Boolean(row.collect_name),
    collectEmail: Boolean(row.collect_email), oneResponsePerDevice: Boolean(row.one_response_per_device),
    startAt: row.start_at, endAt: row.end_at, createdAt: row.created_at, updatedAt: row.updated_at,
    responseCount: Number(row.response_count ?? 0), questions,
  };
}

function rowToQuestion(row: QuestionRow): SurveyQuestion {
  return { id: row.id, prompt: row.prompt, type: row.type, required: Boolean(row.required), position: row.position, options: json<string[]>(row.options_json, []), config: json(row.config_json, {}) };
}

function cleanInput(input: SurveyInput): SurveyInput {
  const questions = (input.questions ?? []).map((question, position) => ({
    ...question,
    id: question.id || newId("q"),
    prompt: String(question.prompt ?? "").trim().slice(0, 500),
    position,
    options: Array.from(new Set((question.options ?? []).map((item) => String(item).trim()).filter(Boolean))).slice(0, 30),
    config: question.config ?? {},
  }));
  return {
    title: String(input.title ?? "").trim().slice(0, 160), description: String(input.description ?? "").trim().slice(0, 2000),
    isAnonymous: Boolean(input.isAnonymous), collectName: Boolean(input.collectName), collectEmail: Boolean(input.collectEmail),
    oneResponsePerDevice: Boolean(input.oneResponsePerDevice), startAt: input.startAt || null, endAt: input.endAt || null, questions,
  };
}

export async function listSurveys(ownerEmail: string): Promise<Survey[]> {
  const db = await getD1();
  const result = await db.prepare(`SELECT s.*, COUNT(r.id) AS response_count FROM surveys s LEFT JOIN responses r ON r.survey_id = s.id WHERE s.owner_email = ? GROUP BY s.id ORDER BY s.updated_at DESC`).bind(ownerEmail).all<SurveyRow>();
  return result.results.map((row) => rowToSurvey(row));
}

export async function getSurvey(id: string, ownerEmail?: string): Promise<Survey | null> {
  const db = await getD1();
  const condition = ownerEmail ? "s.id = ? AND s.owner_email = ?" : "s.id = ?";
  const row = await db.prepare(`SELECT s.*, COUNT(r.id) AS response_count FROM surveys s LEFT JOIN responses r ON r.survey_id = s.id WHERE ${condition} GROUP BY s.id`).bind(...(ownerEmail ? [id, ownerEmail] : [id])).first<SurveyRow>();
  if (!row) return null;
  const q = await db.prepare("SELECT * FROM questions WHERE survey_id = ? ORDER BY position ASC").bind(id).all<QuestionRow>();
  return rowToSurvey(row, q.results.map(rowToQuestion));
}

export async function getPublicSurvey(slug: string): Promise<Survey | null> {
  const db = await getD1();
  const row = await db.prepare("SELECT s.*, COUNT(r.id) AS response_count FROM surveys s LEFT JOIN responses r ON r.survey_id = s.id WHERE s.slug = ? GROUP BY s.id").bind(slug).first<SurveyRow>();
  if (!row || row.status === "draft") return null;
  const q = await db.prepare("SELECT * FROM questions WHERE survey_id = ? ORDER BY position ASC").bind(row.id).all<QuestionRow>();
  const survey = rowToSurvey(row, q.results.map(rowToQuestion));
  delete survey.ownerEmail;
  return survey;
}

function questionStatements(db: D1Database, surveyId: string, questions: SurveyQuestion[]): D1PreparedStatement[] {
  return questions.map((question, position) => db.prepare("INSERT INTO questions (id, survey_id, prompt, type, required, position, options_json, config_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(
    question.id || newId("q"), surveyId, question.prompt, question.type, question.required ? 1 : 0, position, JSON.stringify(question.options ?? []), JSON.stringify(question.config ?? {}),
  ));
}

export async function createSurvey(ownerEmail: string, rawInput: SurveyInput): Promise<Survey> {
  const input = cleanInput(rawInput); const db = await getD1(); const id = newId("srv"); const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO surveys (id, owner_email, title, description, status, slug, is_anonymous, collect_name, collect_email, one_response_per_device, start_at, end_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
      id, ownerEmail, input.title || "Encuesta sin título", input.description, makeSlug(input.title), input.isAnonymous ? 1 : 0, input.collectName ? 1 : 0, input.collectEmail ? 1 : 0, input.oneResponsePerDevice ? 1 : 0, input.startAt, input.endAt, now, now,
    ),
    ...questionStatements(db, id, input.questions),
  ]);
  return (await getSurvey(id, ownerEmail))!;
}

export async function updateSurvey(id: string, ownerEmail: string, rawInput: SurveyInput): Promise<Survey> {
  const existing = await getSurvey(id, ownerEmail); if (!existing) throw new PulsoError("Encuesta no encontrada.", 404);
  if ((existing.responseCount ?? 0) > 0) throw new PulsoError("Esta encuesta ya tiene respuestas. Duplica la encuesta para cambiar sus preguntas.", 409);
  const input = cleanInput(rawInput); const db = await getD1(); const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE surveys SET title = ?, description = ?, is_anonymous = ?, collect_name = ?, collect_email = ?, one_response_per_device = ?, start_at = ?, end_at = ?, updated_at = ? WHERE id = ? AND owner_email = ?").bind(
      input.title || "Encuesta sin título", input.description, input.isAnonymous ? 1 : 0, input.collectName ? 1 : 0, input.collectEmail ? 1 : 0, input.oneResponsePerDevice ? 1 : 0, input.startAt, input.endAt, now, id, ownerEmail,
    ),
    db.prepare("DELETE FROM questions WHERE survey_id = ?").bind(id),
    ...questionStatements(db, id, input.questions),
  ]);
  return (await getSurvey(id, ownerEmail))!;
}

function validateForPublish(survey: Survey): void {
  if (!survey.title.trim()) throw new PulsoError("Añade un título antes de publicar.");
  if (!survey.questions.length) throw new PulsoError("Añade al menos una pregunta antes de publicar.");
  survey.questions.forEach((question, index) => {
    if (!question.prompt.trim()) throw new PulsoError(`Completa el texto de la pregunta ${index + 1}.`);
    if (["single_choice", "multiple_choice", "dropdown"].includes(question.type) && question.options.length < 2) throw new PulsoError(`La pregunta ${index + 1} necesita al menos dos opciones.`);
  });
}

export async function setSurveyStatus(id: string, ownerEmail: string, status: SurveyStatus): Promise<Survey> {
  const survey = await getSurvey(id, ownerEmail); if (!survey) throw new PulsoError("Encuesta no encontrada.", 404);
  if (status === "published") validateForPublish(survey);
  const db = await getD1(); await db.prepare("UPDATE surveys SET status = ?, updated_at = ? WHERE id = ? AND owner_email = ?").bind(status, new Date().toISOString(), id, ownerEmail).run();
  return (await getSurvey(id, ownerEmail))!;
}

export async function deleteSurvey(id: string, ownerEmail: string): Promise<void> {
  const db = await getD1(); const result = await db.prepare("DELETE FROM surveys WHERE id = ? AND owner_email = ?").bind(id, ownerEmail).run();
  if (!result.meta.changes) throw new PulsoError("Encuesta no encontrada.", 404);
}

function isEmpty(value: unknown): boolean { return value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0); }

function validateAnswer(question: SurveyQuestion, value: AnswerInput["value"]): void {
  if (isEmpty(value)) { if (question.required) throw new PulsoError(`Responde la pregunta: ${question.prompt}`); return; }
  if (["single_choice", "dropdown"].includes(question.type) && (typeof value !== "string" || !question.options.includes(value))) throw new PulsoError("Una respuesta contiene una opción no válida.");
  if (question.type === "multiple_choice" && (!Array.isArray(value) || value.some((item) => !question.options.includes(item)))) throw new PulsoError("Una respuesta múltiple contiene opciones no válidas.");
  if (["scale", "rating"].includes(question.type)) {
    const numeric = Number(value); const min = question.config.min ?? 1; const max = question.config.max ?? (question.type === "rating" ? 5 : 10);
    if (!Number.isFinite(numeric) || numeric < min || numeric > max) throw new PulsoError("Una valoración está fuera del rango permitido.");
  }
}

export async function submitResponse(slug: string, payload: { respondentName?: string; respondentEmail?: string; respondentToken?: string; answers?: AnswerInput[] }): Promise<{ responseId: string }> {
  const survey = await getPublicSurvey(slug); if (!survey) throw new PulsoError("Esta encuesta no existe o todavía no está publicada.", 404);
  const now = new Date();
  if (survey.status === "closed" || (survey.endAt && now > new Date(survey.endAt))) throw new PulsoError("Esta encuesta ya está cerrada.", 410);
  if (survey.startAt && now < new Date(survey.startAt)) throw new PulsoError("Esta encuesta todavía no está disponible.", 409);
  const email = String(payload.respondentEmail ?? "").trim(); if (survey.collectEmail && !/^\S+@\S+\.\S+$/.test(email)) throw new PulsoError("Escribe un correo válido.");
  if (survey.collectName && !String(payload.respondentName ?? "").trim()) throw new PulsoError("Escribe tu nombre.");
  const answerMap = new Map((payload.answers ?? []).map((answer) => [answer.questionId, answer.value]));
  survey.questions.forEach((question) => validateAnswer(question, answerMap.get(question.id) as AnswerInput["value"]));
  const db = await getD1(); const token = survey.oneResponsePerDevice ? String(payload.respondentToken ?? "").slice(0, 120) || null : null;
  if (token) {
    const duplicate = await db.prepare("SELECT id FROM responses WHERE survey_id = ? AND respondent_token = ? LIMIT 1").bind(survey.id, token).first<{ id: string }>();
    if (duplicate) throw new PulsoError("Este dispositivo ya registró una respuesta.", 409);
  }
  const responseId = newId("rsp"); const submittedAt = now.toISOString();
  const statements: D1PreparedStatement[] = [db.prepare("INSERT INTO responses (id, survey_id, respondent_name, respondent_email, respondent_token, submitted_at) VALUES (?, ?, ?, ?, ?, ?)").bind(
    responseId, survey.id, survey.isAnonymous ? null : String(payload.respondentName ?? "").trim() || null, survey.isAnonymous ? null : email || null, token, submittedAt,
  )];
  for (const question of survey.questions) {
    const value = answerMap.get(question.id); if (isEmpty(value)) continue;
    statements.push(db.prepare("INSERT INTO answers (id, response_id, question_id, value_json) VALUES (?, ?, ?, ?)").bind(newId("ans"), responseId, question.id, JSON.stringify(value)));
  }
  try { await db.batch(statements); } catch (error) {
    if (String(error).toLowerCase().includes("unique")) throw new PulsoError("Este dispositivo ya registró una respuesta.", 409);
    throw error;
  }
  return { responseId };
}

export async function getResults(id: string, ownerEmail: string, range: "7" | "30" | "all" = "all"): Promise<ResultsPayload> {
  const survey = await getSurvey(id, ownerEmail); if (!survey) throw new PulsoError("Encuesta no encontrada.", 404);
  const db = await getD1(); const days = range === "all" ? null : Number(range); const since = days ? new Date(Date.now() - days * 86400000).toISOString() : null;
  const responseQuery = since ? "SELECT * FROM responses WHERE survey_id = ? AND submitted_at >= ? ORDER BY submitted_at DESC" : "SELECT * FROM responses WHERE survey_id = ? ORDER BY submitted_at DESC";
  const responseRows = await db.prepare(responseQuery).bind(...(since ? [id, since] : [id])).all<ResponseRow>();
  const answerQuery = since ? "SELECT a.response_id, a.question_id, a.value_json FROM answers a JOIN responses r ON r.id = a.response_id WHERE r.survey_id = ? AND r.submitted_at >= ?" : "SELECT a.response_id, a.question_id, a.value_json FROM answers a JOIN responses r ON r.id = a.response_id WHERE r.survey_id = ?";
  const answerRows = await db.prepare(answerQuery).bind(...(since ? [id, since] : [id])).all<AnswerRow>();
  const valuesByResponse = new Map<string, Record<string, string | string[] | number>>();
  for (const answer of answerRows.results) {
    const values = valuesByResponse.get(answer.response_id) ?? {}; values[answer.question_id] = json(answer.value_json, ""); valuesByResponse.set(answer.response_id, values);
  }
  const questionResults: QuestionResult[] = survey.questions.map((question) => {
    const values = answerRows.results.filter((answer) => answer.question_id === question.id).map((answer) => json<string | string[] | number>(answer.value_json, "")).filter((value) => !isEmpty(value));
    const labels = ["single_choice", "multiple_choice", "dropdown"].includes(question.type) ? question.options : question.type === "yes_no" ? ["Sí", "No"] : ["scale", "rating"].includes(question.type) ? Array.from({ length: (question.config.max ?? (question.type === "rating" ? 5 : 10)) - (question.config.min ?? 1) + 1 }, (_, index) => String((question.config.min ?? 1) + index)) : [];
    const counts = new Map(labels.map((label) => [label, 0]));
    for (const value of values) for (const item of Array.isArray(value) ? value : [value]) counts.set(String(item), (counts.get(String(item)) ?? 0) + 1);
    return {
      questionId: question.id, prompt: question.prompt, type: question.type, totalAnswered: values.length,
      choices: Array.from(counts, ([label, count]) => ({ label, count, percentage: values.length ? Math.round((count / values.length) * 1000) / 10 : 0 })),
      textAnswers: ["short_text", "long_text"].includes(question.type) ? values.map(String).slice(0, 200) : [],
    };
  });
  const timelineMap = new Map<string, number>();
  responseRows.results.forEach((response) => { const date = response.submitted_at.slice(0, 10); timelineMap.set(date, (timelineMap.get(date) ?? 0) + 1); });
  const windowDays = range === "30" ? 30 : 7; const timeline: Array<{ date: string; count: number }> = [];
  for (let offset = windowDays - 1; offset >= 0; offset--) { const date = new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10); timeline.push({ date, count: timelineMap.get(date) ?? 0 }); }
  const recent = await db.prepare("SELECT COUNT(*) AS count FROM responses WHERE survey_id = ? AND submitted_at >= ?").bind(id, new Date(Date.now() - 86400000).toISOString()).first<{ count: number }>();
  const { questions: _questions, ...surveySummary } = survey;
  return {
    survey: { ...surveySummary, questionCount: survey.questions.length }, responseCount: responseRows.results.length,
    responsesLast24Hours: Number(recent?.count ?? 0), lastResponseAt: responseRows.results[0]?.submitted_at ?? null, timeline,
    questions: questionResults,
    rawResponses: responseRows.results.map((response) => ({ id: response.id, respondentName: response.respondent_name, respondentEmail: response.respondent_email, submittedAt: response.submitted_at, answers: valuesByResponse.get(response.id) ?? {} })),
  };
}

export async function ensureLocalDemoSurvey(ownerEmail: string): Promise<void> {
  if ((await listSurveys(ownerEmail)).length) return;
  const baseQuestions: SurveyQuestion[] = [
    { id: newId("q"), prompt: "¿Cómo calificarías tu experiencia general?", type: "single_choice", required: true, position: 0, options: ["Excelente", "Buena", "Regular", "Mala"], config: {} },
    { id: newId("q"), prompt: "¿Qué aspectos deberíamos mejorar?", type: "multiple_choice", required: true, position: 1, options: ["Atención", "Rapidez", "Información", "Accesibilidad"], config: {} },
    { id: newId("q"), prompt: "¿Qué tan probable es que nos recomiendes?", type: "scale", required: true, position: 2, options: [], config: { min: 1, max: 10, minLabel: "Nada probable", maxLabel: "Muy probable" } },
    { id: newId("q"), prompt: "Cuéntanos qué fue lo mejor de tu experiencia", type: "long_text", required: false, position: 3, options: [], config: {} },
    { id: newId("q"), prompt: "¿Recibiste la información que necesitabas?", type: "yes_no", required: true, position: 4, options: [], config: {} },
    { id: newId("q"), prompt: "Valora la atención recibida", type: "rating", required: true, position: 5, options: [], config: { min: 1, max: 5 } },
  ];
  const survey = await createSurvey(ownerEmail, { title: "Experiencia estudiantil 2026", description: "Ayúdanos a mejorar los servicios y la atención para toda la comunidad.", isAnonymous: true, collectName: false, collectEmail: false, oneResponsePerDevice: true, startAt: null, endAt: null, questions: baseQuestions });
  await setSurveyStatus(survey.id, ownerEmail, "published");
  const db = await getD1(); const experiences = ["Excelente", "Buena", "Buena", "Excelente", "Regular", "Buena", "Excelente", "Buena", "Regular", "Excelente", "Buena", "Buena"];
  const comments = ["La atención fue clara y amable.", "Me gustó la rapidez del proceso.", "El equipo resolvió todas mis dudas.", "Sería útil tener más información en línea.", "Muy buena experiencia en general.", "El seguimiento fue excelente."];
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < experiences.length; index++) {
    const responseId = newId("rsp"); const submittedAt = new Date(Date.now() - (experiences.length - index) * 10 * 3600000).toISOString();
    statements.push(db.prepare("INSERT INTO responses (id, survey_id, respondent_token, submitted_at) VALUES (?, ?, ?, ?)").bind(responseId, survey.id, `demo-${index}`, submittedAt));
    const values: Array<string | string[] | number> = [experiences[index], index % 3 === 0 ? ["Información", "Accesibilidad"] : ["Rapidez"], 6 + (index % 5), comments[index % comments.length], index % 5 === 0 ? "No" : "Sí", 3 + (index % 3)];
    baseQuestions.forEach((question, qIndex) => statements.push(db.prepare("INSERT INTO answers (id, response_id, question_id, value_json) VALUES (?, ?, ?, ?)").bind(newId("ans"), responseId, question.id, JSON.stringify(values[qIndex]))));
  }
  await db.batch(statements);
}
