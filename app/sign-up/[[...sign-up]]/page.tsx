import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isDemoMode } from "../../../lib/demo";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  if (isDemoMode()) redirect("/admin");
  return (
    <main className="clerk-auth-page">
      <Link className="brand clerk-auth-brand" href="/"><span className="brand-mark">P</span><span>Pulso</span></Link>
      <section className="clerk-auth-copy"><span className="eyebrow">Crea tu cuenta</span><h1>Empieza a escuchar mejor.</h1><p>Registra tu cuenta administrativa para comenzar a crear y compartir encuestas.</p></section>
      <div className="clerk-auth-card"><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/admin" /></div>
    </main>
  );
}
