import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isDemoMode } from "../../../lib/demo";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  if (isDemoMode()) redirect("/admin");
  return (
    <main className="clerk-auth-page">
      <Link className="brand clerk-auth-brand" href="/"><span className="brand-mark">P</span><span>Pulso</span></Link>
      <section className="clerk-auth-copy"><span className="eyebrow">Panel administrativo</span><h1>Bienvenido de nuevo.</h1><p>Inicia sesión para crear encuestas y consultar sus resultados en tiempo real.</p></section>
      <div className="clerk-auth-card"><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/admin" /></div>
    </main>
  );
}
