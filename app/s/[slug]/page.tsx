import type { Metadata } from "next";
import PublicSurvey from "../../components/PublicSurvey";

export const metadata: Metadata = { title: "Responder encuesta", description: "Completa esta encuesta creada con Pulso." };

export default async function SurveyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicSurvey slug={slug} />;
}
