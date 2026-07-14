import Link from "next/link";
import { ClerkWidget } from "../../components/ClerkWidget";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main className="clerk-auth-page">
      <Link className="brand clerk-auth-brand" href="/"><span className="brand-mark">P</span><span>Pulso</span></Link>
      <section className="clerk-auth-copy"><span className="eyebrow">Panel administrativo</span><h1>Bienvenido de nuevo.</h1><p>Inicia sesión para crear encuestas y consultar sus resultados en tiempo real.</p></section>
      <div className="clerk-auth-card"><ClerkWidget mode="sign-in" publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} /></div>
    </main>
  );
}
