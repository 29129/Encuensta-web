import { readFile } from "node:fs/promises";

try { process.loadEnvFile?.(".env.local"); } catch { /* Vercel injects variables directly. */ }

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL no está configurada.");

const endpoint = `https://${new URL(connectionString).hostname}/sql`;
const migration = await readFile(new URL("../drizzle/0000_pulso_postgres.sql", import.meta.url), "utf8");
const statements = migration.split("--> statement-breakpoint").map((statement) => statement.trim()).filter(Boolean);

for (const query of statements) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Neon-Connection-String": connectionString },
    body: JSON.stringify({ query, params: [] }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message ?? payload.error ?? `La migración falló con estado ${response.status}.`);
  }
}

console.log(`Base de datos preparada (${statements.length} operaciones).`);
