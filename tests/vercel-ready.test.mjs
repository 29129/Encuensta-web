import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("usa Next.js nativo y el flujo de construcción de Vercel", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));
  assert.equal(packageJson.scripts.dev, "next dev");
  assert.equal(packageJson.scripts.build, "next build");
  assert.match(packageJson.scripts["vercel-build"], /db:migrate.*next build/);
  assert.equal(vercel.framework, "nextjs");
});

test("declara los secretos requeridos sin incluir valores reales", async () => {
  const example = await readFile(new URL(".env.example", root), "utf8");
  assert.match(example, /^DATABASE_URL=/m);
  assert.match(example, /^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=/m);
  assert.match(example, /^CLERK_SECRET_KEY=/m);
  assert.doesNotMatch(example, /sk_(?:test|live)_[A-Za-z0-9]{12,}/);
});

test("incluye una migración PostgreSQL idempotente", async () => {
  const migration = await readFile(new URL("drizzle/0000_pulso_postgres.sql", root), "utf8");
  for (const table of ["surveys", "questions", "responses", "answers"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.doesNotMatch(migration, /`/);
});

test("integra una entrada de voz protegida y editable en el AI Agent", async () => {
  const [route, recorder, chat, example] = await Promise.all([
    readFile(new URL("app/api/agent/transcription/route.ts", root), "utf8"),
    readFile(new URL("app/components/agent/useVoiceRecorder.ts", root), "utf8"),
    readFile(new URL("app/components/AIAgentChat.tsx", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
  ]);

  assert.match(route, /assertSameOrigin\(request\)/);
  assert.match(route, /requireAdmin\(request\)/);
  assert.match(route, /MAX_AUDIO_BYTES/);
  assert.match(route, /\/v1\/audio\/transcriptions/);
  assert.match(recorder, /MAX_AUDIO_DURATION_SECONDS/);
  assert.match(recorder, /fetch\("\/api\/agent\/transcription"/);
  assert.match(chat, /onTranscription: applyTranscription/);
  assert.match(chat, /Revisa el texto antes de enviarlo/);
  assert.match(example, /^OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe$/m);
});

test("mantiene herramientas disponibles durante operaciones encadenadas del agente", async () => {
  const route = await readFile(new URL("app/api/agent/route.ts", root), "utf8");

  assert.match(route, /const MAX_TOOL_STEPS = 6/);
  assert.match(route, /async function runToolLoop/);
  assert.match(route, /input\.push\(\.\.\.response\.output\)/);
  assert.match(route, /tools: AGENT_TOOLS/);
  assert.match(route, /publish_confirmation_required/);
  assert.match(route, /Nunca escribas llamadas, JSON, comandos ni sintaxis interna/);
});
