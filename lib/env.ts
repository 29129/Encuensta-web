export function environmentValue(name: string, fallback = ""): string {
  const raw = process.env[name]?.trim() || fallback;
  const withoutAssignment = raw.replace(new RegExp(`^${name}\\s*=\\s*`, "i"), "");
  return withoutAssignment.replace(/^['"]|['"]$/g, "").trim();
}

export function booleanEnvironmentValue(name: string, fallback: boolean): boolean {
  const value = environmentValue(name).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}
