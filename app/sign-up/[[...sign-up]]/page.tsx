import Link from "next/link";
import { ClerkWidget } from "../../components/ClerkWidget";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return (
    <main className="clerk-auth-page">
      <Link className="brand clerk-auth-brand" href="/"><span className="brand-mark">P</span><span>Pulso</span></Link>
      <section className="clerk-auth-copy"><span className="eyebrow">Crea tu cuenta</span><h1>Empieza a escuchar mejor.</h1><p>Registra tu cuenta administrativa para comenzar a crear y compartir encuestas.</p></section>
      <div className="clerk-auth-card"><ClerkWidget mode="sign-up" publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} /></div>
    </main>
  );
}
