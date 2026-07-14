import { env } from "cloudflare:workers";

let initialized = false;

export async function getD1(): Promise<D1Database> {
  const db = env.DB;
  if (!db) throw new Error("El almacenamiento de Pulso no está disponible.");
  if (!initialized) {
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS surveys (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', slug TEXT NOT NULL UNIQUE, is_anonymous INTEGER NOT NULL DEFAULT 1, collect_name INTEGER NOT NULL DEFAULT 0, collect_email INTEGER NOT NULL DEFAULT 0, one_response_per_device INTEGER NOT NULL DEFAULT 1, start_at TEXT, end_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE, prompt TEXT NOT NULL, type TEXT NOT NULL, required INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL, options_json TEXT NOT NULL DEFAULT '[]', config_json TEXT NOT NULL DEFAULT '{}')`),
      db.prepare(`CREATE TABLE IF NOT EXISTS responses (id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE, respondent_name TEXT, respondent_email TEXT, respondent_token TEXT, submitted_at TEXT NOT NULL)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS answers (id TEXT PRIMARY KEY, response_id TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE, question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE, value_json TEXT NOT NULL)`),
      db.prepare("CREATE INDEX IF NOT EXISTS surveys_owner_idx ON surveys(owner_email)"),
      db.prepare("CREATE INDEX IF NOT EXISTS questions_survey_position_idx ON questions(survey_id, position)"),
      db.prepare("CREATE INDEX IF NOT EXISTS responses_survey_submitted_idx ON responses(survey_id, submitted_at)"),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS responses_device_idx ON responses(survey_id, respondent_token)"),
      db.prepare("CREATE INDEX IF NOT EXISTS answers_response_idx ON answers(response_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS answers_question_idx ON answers(question_id)"),
    ]);
    initialized = true;
  }
  return db;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function makeSlug(title: string): string {
  const base = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42);
  return `${base || "encuesta"}-${crypto.randomUUID().slice(0, 6)}`;
}
