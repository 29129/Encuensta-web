import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const surveys = sqliteTable("surveys", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status", { enum: ["draft", "published", "closed"] }).notNull().default("draft"),
  slug: text("slug").notNull(),
  isAnonymous: integer("is_anonymous", { mode: "boolean" }).notNull().default(true),
  collectName: integer("collect_name", { mode: "boolean" }).notNull().default(false),
  collectEmail: integer("collect_email", { mode: "boolean" }).notNull().default(false),
  oneResponsePerDevice: integer("one_response_per_device", { mode: "boolean" }).notNull().default(true),
  startAt: text("start_at"),
  endAt: text("end_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("surveys_slug_unique").on(table.slug), index("surveys_owner_idx").on(table.ownerEmail)]);

export const questions = sqliteTable("questions", {
  id: text("id").primaryKey(),
  surveyId: text("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  type: text("type").notNull(),
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull(),
  optionsJson: text("options_json").notNull().default("[]"),
  configJson: text("config_json").notNull().default("{}"),
}, (table) => [index("questions_survey_position_idx").on(table.surveyId, table.position)]);

export const responses = sqliteTable("responses", {
  id: text("id").primaryKey(),
  surveyId: text("survey_id").notNull().references(() => surveys.id, { onDelete: "cascade" }),
  respondentName: text("respondent_name"),
  respondentEmail: text("respondent_email"),
  respondentToken: text("respondent_token"),
  submittedAt: text("submitted_at").notNull(),
}, (table) => [index("responses_survey_submitted_idx").on(table.surveyId, table.submittedAt), uniqueIndex("responses_device_idx").on(table.surveyId, table.respondentToken)]);

export const answers = sqliteTable("answers", {
  id: text("id").primaryKey(),
  responseId: text("response_id").notNull().references(() => responses.id, { onDelete: "cascade" }),
  questionId: text("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
  valueJson: text("value_json").notNull(),
}, (table) => [index("answers_response_idx").on(table.responseId), index("answers_question_idx").on(table.questionId)]);
