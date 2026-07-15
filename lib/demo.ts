const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isDemoMode(): boolean {
  return ENABLED_VALUES.has(process.env.DEMO_MODE?.trim().toLowerCase() ?? "");
}

export function getDemoIdentity() {
  return {
    email: process.env.DEMO_ADMIN_EMAIL?.trim() || "demo@pulso.local",
    name: process.env.DEMO_ADMIN_NAME?.trim() || "Jurado Demo",
    isLocalDemo: true as const,
  };
}
