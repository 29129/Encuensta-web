type QueryResponse<T> = {
  command: string;
  fields: Array<{ name: string; dataTypeID: number }>;
  rowCount: number;
  rows: T[];
};

type StatementData = { query: string; params: unknown[] };

function connectionString(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL no está configurada. Conecta una base PostgreSQL de Neon antes de usar Pulso.");
  return value;
}

function endpoint(value: string): string {
  const url = new URL(value);
  return `https://${url.hostname}/sql`;
}

function postgresQuery(query: string): string {
  let index = 0;
  return query.replace(/\?/g, () => `$${++index}`);
}

async function neonFetch<T>(body: StatementData | { queries: StatementData[] }): Promise<QueryResponse<T> | { results: QueryResponse<T>[] }> {
  const url = connectionString();
  const response = await fetch(endpoint(url), {
    method: "POST",
    headers: { "Content-Type": "application/json", "Neon-Connection-String": url },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as ({ message?: string; error?: string } & (QueryResponse<T> | { results: QueryResponse<T>[] })) | null;
  if (!response.ok) throw new Error(payload?.message ?? payload?.error ?? `Neon respondió con estado ${response.status}.`);
  if (!payload) throw new Error("Neon devolvió una respuesta vacía.");
  return payload;
}

export class PreparedStatement {
  private params: unknown[] = [];
  constructor(readonly query: string) {}
  bind(...params: unknown[]): PreparedStatement { this.params = params; return this; }
  data(): StatementData { return { query: postgresQuery(this.query), params: this.params }; }
  async all<T>(): Promise<{ results: T[] }> {
    const result = await neonFetch<T>(this.data()) as QueryResponse<T>;
    return { results: result.rows };
  }
  async first<T>(): Promise<T | null> { return (await this.all<T>()).results[0] ?? null; }
  async run(): Promise<{ meta: { changes: number } }> {
    const result = await neonFetch<unknown>(this.data()) as QueryResponse<unknown>;
    return { meta: { changes: result.rowCount ?? 0 } };
  }
}

export class DatabaseClient {
  prepare(query: string): PreparedStatement { return new PreparedStatement(query); }
  async batch(statements: PreparedStatement[]): Promise<void> {
    if (statements.length) await neonFetch({ queries: statements.map((statement) => statement.data()) });
  }
}

const database = new DatabaseClient();
export async function getDatabase(): Promise<DatabaseClient> { return database; }

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function makeSlug(title: string): string {
  const base = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42);
  return `${base || "encuesta"}-${crypto.randomUUID().slice(0, 6)}`;
}
