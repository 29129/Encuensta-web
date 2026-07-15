import type { Metadata } from "next";
import { headers } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import { isDemoMode } from "../lib/demo";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const description = "Crea encuestas, compártelas por enlace o QR y convierte respuestas en decisiones con resultados en vivo.";
  return {
    metadataBase: base,
    title: { default: "Pulso — Encuestas que se entienden", template: "%s | Pulso" },
    description,
    applicationName: "Pulso",
    keywords: ["encuestas", "formularios", "resultados", "gráficos", "QR"],
    openGraph: { title: "Pulso — Encuestas que se entienden", description, type: "website", images: [{ url: new URL("/og.png", base), width: 1739, height: 907, alt: "Pulso, encuestas claras y decisiones mejores" }] },
    twitter: { card: "summary_large_image", title: "Pulso — Encuestas que se entienden", description, images: [new URL("/og.png", base)] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const document = <html lang="es"><body>{children}</body></html>;
  if (isDemoMode()) return document;
  return <ClerkProvider localization={esES} signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/admin" signUpFallbackRedirectUrl="/admin">{document}</ClerkProvider>;
}
