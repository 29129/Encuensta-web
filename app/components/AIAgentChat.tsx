"use client";

import Link from "next/link";
import { useState } from "react";

type ChatTurn = { role: "user" | "assistant"; content: string };
type AgentAction = { type: string; surveyId?: string; title?: string; status?: string };

const welcome: ChatTurn = {
  role: "assistant",
  content: "Hola, soy AI Agent. Puedo ayudarte a consultar, crear, editar, publicar y analizar tus encuestas. ¿Qué necesitas preparar?",
};

export default function AIAgentChat() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([welcome]);
  const [pending, setPending] = useState<AgentAction | null>(null);
  const [lastAction, setLastAction] = useState<AgentAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function send(content: string, confirmAction?: { type: "publishSurvey"; surveyId: string }) {
    const message = content.trim();
    if (!message || loading) return;
    const nextTurns = [...turns, { role: "user" as const, content: message }];
    setTurns(nextTurns); setDraft(""); setError(""); setPending(null); setLastAction(null); setLoading(true);
    try {
      const response = await fetch("/api/agent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, messages: nextTurns.filter((turn) => turn !== welcome), ...(confirmAction ? { confirmAction } : {}) }),
      });
      const data = await response.json() as { message?: string; error?: string; actions?: AgentAction[] };
      if (!response.ok) throw new Error(data.error || "No se pudo contactar al AI Agent.");
      setTurns((current) => [...current, { role: "assistant", content: data.message || "No recibí una respuesta del AI Agent." }]);
      const action = data.actions?.[0] ?? null;
      setLastAction(action); setPending(action?.type === "publish_confirmation_required" ? action : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo contactar al AI Agent.");
    } finally { setLoading(false); }
  }

  function reset() { setTurns([welcome]); setPending(null); setLastAction(null); setError(""); setDraft(""); }

  const actionLink = lastAction?.surveyId && lastAction.type !== "publish_confirmation_required" ? `/admin/encuestas/${lastAction.surveyId}/${lastAction.type === "responses_analyzed" || lastAction.type === "survey_published" ? "resultados" : "editar"}` : null;
  const actionLabel = lastAction?.type === "survey_created" ? "Encuesta creada como borrador" : lastAction?.type === "survey_updated" ? "Encuesta actualizada" : lastAction?.type === "survey_published" ? "Encuesta publicada" : lastAction?.type === "responses_analyzed" ? "Análisis listo" : "";

  return (
    <>
      {open && <section className="ai-agent-panel" aria-label="Conversación con AI Agent">
        <header className="ai-agent-head"><div><span className="ai-agent-orb">✦</span><span><strong>AI Agent</strong><small>Asistente de Pulso</small></span></div><div className="ai-agent-head-actions"><button type="button" onClick={reset} aria-label="Reiniciar conversación">↻</button><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar AI Agent">×</button></div></header>
        <div className="ai-agent-messages" aria-live="polite">
          {turns.map((turn, index) => <div className={`ai-agent-message ai-agent-${turn.role}`} key={`${turn.role}-${index}`}><span>{turn.role === "assistant" ? "✦" : "Tú"}</span><p>{turn.content}</p></div>)}
          {loading && <div className="ai-agent-message ai-agent-assistant"><span>✦</span><p className="ai-agent-typing"><i /><i /><i /></p></div>}
          {actionLink && actionLabel && <div className="ai-agent-action"><strong>{actionLabel}</strong><small>{lastAction?.title || ""}</small><Link className="button button-soft" href={actionLink}>Abrir en Pulso →</Link></div>}
          {pending?.surveyId && <div className="ai-agent-confirm"><strong>¿Quieres publicar “{pending.title || "esta encuesta"}”?</strong><p>Se hará visible para las personas que tengan el enlace.</p><button className="button button-primary" type="button" onClick={() => void send("Confirmo la publicación de esta encuesta.", { type: "publishSurvey", surveyId: pending.surveyId! })} disabled={loading}>Publicar encuesta</button></div>}
          {error && <div className="ai-agent-error" role="alert">{error}</div>}
        </div>
        <form className="ai-agent-form" onSubmit={(event) => { event.preventDefault(); void send(draft); }}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escribe una solicitud..." rows={2} disabled={loading} aria-label="Mensaje para AI Agent" /><div><small>Enter para enviar · Shift+Enter para saltar línea</small><button className="button button-dark" type="submit" disabled={loading || !draft.trim()} aria-label="Enviar mensaje">↑</button></div></form>
        <footer className="ai-agent-footer"><span>Las acciones se ejecutan sobre tus datos.</span>{turns.some((turn) => turn.role === "assistant" && turn !== welcome) && <Link href="/admin">Volver al panel</Link>}</footer>
      </section>}
      {!open && <button className="ai-agent-launcher" type="button" onClick={() => setOpen(true)} aria-label="Abrir AI Agent"><span>✦</span><strong>AI Agent</strong></button>}
    </>
  );
}
