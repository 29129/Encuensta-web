"use client";

import { useEffect, useRef, useState } from "react";

type ClerkBrowser = {
  load: (options?: Record<string, unknown>) => Promise<void>;
  mountSignIn: (node: HTMLDivElement, options?: Record<string, unknown>) => void;
  mountSignUp: (node: HTMLDivElement, options?: Record<string, unknown>) => void;
  unmountSignIn?: (node: HTMLDivElement) => void;
  unmountSignUp?: (node: HTMLDivElement) => void;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
};

declare global {
  interface Window {
    Clerk?: ClerkBrowser;
    __internal_ClerkUICtor?: unknown;
  }
}

function decodeDomain(publishableKey: string): string {
  const encoded = publishableKey.split("_")[2] ?? "";
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  return atob(normalized).replace(/\$$/, "");
}

function loadScript(src: string, attributes: Record<string, string> = {}): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset.loaded === "true") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    Object.entries(attributes).forEach(([key, value]) => script.setAttribute(key, value));
    script.addEventListener("load", () => { script.dataset.loaded = "true"; resolve(); }, { once: true });
    script.addEventListener("error", () => reject(new Error("No se pudo cargar Clerk.")), { once: true });
    if (!existing) document.head.appendChild(script);
  });
}

export function ClerkWidget({ publishableKey, mode }: { publishableKey?: string; mode: "sign-in" | "sign-up" }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!publishableKey || !container.current) return;
    const node = container.current;
    let active = true;
    let clerk: ClerkBrowser | undefined;

    async function mount() {
      try {
        const domain = decodeDomain(publishableKey!);
        await loadScript(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`);
        await loadScript(`https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, { "data-clerk-publishable-key": publishableKey! });
        clerk = window.Clerk;
        if (!clerk || !active) throw new Error("Clerk no pudo iniciarse.");
        await clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor }, signInUrl: "/sign-in", signUpUrl: "/sign-up" });
        if (!active) return;
        const options = { routing: "path", path: mode === "sign-in" ? "/sign-in" : "/sign-up", fallbackRedirectUrl: "/admin" };
        if (mode === "sign-in") clerk.mountSignIn(node, { ...options, signUpUrl: "/sign-up" });
        else clerk.mountSignUp(node, { ...options, signInUrl: "/sign-in" });
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "No se pudo iniciar Clerk.");
      }
    }

    void mount();
    return () => {
      active = false;
      if (clerk) mode === "sign-in" ? clerk.unmountSignIn?.(node) : clerk.unmountSignUp?.(node);
    };
  }, [mode, publishableKey]);

  if (!publishableKey) return <div className="alert alert-error">Agrega las claves de Clerk en <code>.env.local</code>.</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  return <div ref={container} aria-live="polite"><span className="clerk-loading">Cargando acceso seguro…</span></div>;
}

export function ClerkSignOutButton() {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    if (!window.Clerk) return;
    setBusy(true);
    await window.Clerk.signOut({ redirectUrl: "/" });
  }
  return <button className="signout-button" type="button" aria-label="Cerrar sesión" disabled={busy} onClick={() => void signOut()}>↗</button>;
}
