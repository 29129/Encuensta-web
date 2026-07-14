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
