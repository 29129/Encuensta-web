"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AIAgentChat from "./AIAgentChat";
import type { QuestionResult, QuestionType, ResultsPayload, Survey, SurveyInput, SurveyQuestion, SurveyStatus } from "../../lib/types";

type AdminUser = { email: string; name: string; isLocalDemo: boolean };
type ChartKind = "bar" | "horizontal" | "donut" | "line" | "area" | "radar" | "table";
type ChartDatum = { label: string; value: number };

const QUESTION_TYPES: Array<{ type: QuestionType; label: string; hint: string; mark: string }> = [
  { type: "short_text", label: "Respuesta corta", hint: "Nombres, cargos o ideas breves", mark: "Aa" },
  { type: "long_text", label: "Texto largo", hint: "Opiniones y comentarios amplios", mark: "¶" },
  { type: "single_choice", label: "Opción única", hint: "Una respuesta entre varias", mark: "◉" },
  { type: "multiple_choice", label: "Selección múltiple", hint: "Varias respuestas posibles", mark: "☑" },
  { type: "dropdown", label: "Lista desplegable", hint: "Muchas opciones en poco espacio", mark: "⌄" },
  { type: "scale", label: "Escala numérica", hint: "Valoración dentro de un rango", mark: "1—10" },
  { type: "rating", label: "Estrellas", hint: "Valoración visual de 1 a 5", mark: "★" },
  { type: "yes_no", label: "Sí o no", hint: "Una decisión binaria", mark: "S/N" },
];

const STATUS_LABEL: Record<SurveyStatus, string> = { draft: "Borrador", published: "Activa", closed: "Cerrada" };
const COLORS = ["#1f6b52", "#9bd72f", "#ff835f", "#6f7bf7", "#f4bf3b", "#2aa7a1", "#d25a8a", "#8b6f47"];

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "Sin actividad";
  return new Intl.DateTimeFormat("es-EC", withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(value));
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "P";
}

function publicUrl(slug: string) {
  return typeof window === "undefined" ? `/s/${slug}` : `${window.location.origin}/s/${slug}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación.");
  return data;
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal-card ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Cerrar ventana">×</button></div>
        {children}
      </section>
    </div>
  );
}

function Toast({ message, kind = "success" }: { message: string; kind?: "success" | "error" }) {
  return <div className={`toast toast-${kind}`} role={kind === "error" ? "alert" : "status"}><span>{kind === "success" ? "✓" : "!"}</span>{message}</div>;
}

function ShareModal({ survey, onClose }: { survey: Survey; onClose: () => void }) {
  const [copied, setCopied] = useState(false); const url = publicUrl(survey.slug);
  async function copy() { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  return (
    <Modal title="Comparte tu encuesta" onClose={onClose}>
      <div className="share-layout">
        <div className="qr-frame"><img src={`/api/qr?data=${encodeURIComponent(url)}`} alt={`Código QR para ${survey.title}`} /></div>
        <div className="share-copy">
          <span className={`status-badge status-${survey.status}`}>{STATUS_LABEL[survey.status]}</span>
          <h3>{survey.title}</h3>
          <p>Quien tenga este enlace podrá responder desde cualquier dispositivo.</p>
          <label className="field-label" htmlFor="share-url">Enlace público</label>
          <div className="copy-field"><input id="share-url" value={url} readOnly /><button className="button button-dark" onClick={copy}>{copied ? "Copiado" : "Copiar"}</button></div>
          <div className="share-actions"><a className="button button-soft" href={`/api/qr?data=${encodeURIComponent(url)}`} download={`qr-${survey.slug}.svg`}>Descargar QR</a><a className="text-link" href={`/s/${survey.slug}`} target="_blank" rel="noreferrer">Abrir encuesta ↗</a></div>
        </div>
      </div>
    </Modal>
  );
}

function AdminShell({ user, path, children }: { user: AdminUser; path: string[]; children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false); const isDashboard = path.length === 0; const isBuilder = path[0] === "nueva" || path.at(-1) === "editar"; const isResults = path.at(-1) === "resultados";
  const title = isDashboard ? "Tus encuestas" : isBuilder ? "Editor de encuesta" : isResults ? "Resultados" : "Panel";
  return (
    <div className="admin-app">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <aside className={`admin-sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand brand-admin"><span className="brand-mark">P</span><span>Pulso</span></div>
        <nav aria-label="Navegación principal">
          <Link className={`side-link ${isDashboard ? "active" : ""}`} href="/admin" onClick={() => setMenuOpen(false)}><span className="side-icon">⌂</span>Resumen</Link>
          <Link className={`side-link ${isBuilder ? "active" : ""}`} href="/admin/nueva" onClick={() => setMenuOpen(false)}><span className="side-icon">＋</span>Nueva encuesta</Link>
          {isResults && <span className="side-link active"><span className="side-icon">↗</span>Resultados</span>}
        </nav>
        <div className="sidebar-tip"><span className="tip-dot" /><strong>Consejo rápido</strong><p>Las encuestas cortas suelen recibir más respuestas.</p></div>
        <div className="sidebar-user"><span className="avatar">{initials(user.name)}</span><span><strong>{user.name}</strong><small>{user.isLocalDemo ? "Modo demo del concurso" : "Cuenta de administrador"}</small></span>{!user.isLocalDemo && <SignOutButton redirectUrl="/"><button className="signout-button" type="button" aria-label="Cerrar sesión">↗</button></SignOutButton>}</div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" />}
      <div className="admin-stage">
        <header className="mobile-admin-head"><button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">☰</button><div className="brand"><span className="brand-mark">P</span><span>Pulso</span></div><span className="avatar avatar-small">{initials(user.name)}</span></header>
        <div className="admin-topline"><div><span className="eyebrow">Panel administrativo</span><h1>{title}</h1></div><div className="topline-user"><span>Hola, {user.name.split(" ")[0]}</span><span className="avatar">{initials(user.name)}</span></div></div>
        <main id="main-content" className="admin-content">{children}</main><AIAgentChat />
      </div>
    </div>
  );
}

export default function AdminClient({ user, path }: { user: AdminUser; path: string[] }) {
  let content: React.ReactNode;
  if (path[0] === "nueva") content = <SurveyBuilder />;
  else if (path[0] === "encuestas" && path[1] && path[2] === "editar") content = <SurveyBuilder surveyId={path[1]} />;
  else if (path[0] === "encuestas" && path[1] && path[2] === "resultados") content = <ResultsDashboard surveyId={path[1]} />;
  else content = <Dashboard />;
  return <AdminShell user={user} path={path}>{content}</AdminShell>;
}

function Dashboard() {
  const [surveys, setSurveys] = useState<Survey[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState<"all" | SurveyStatus>("all"); const [share, setShare] = useState<Survey | null>(null); const [toast, setToast] = useState("");
  const load = useCallback(async () => { try { setError(""); const data = await api<{ surveys: Survey[] }>("/api/admin/surveys"); setSurveys(data.surveys); } catch (err) { setError(err instanceof Error ? err.message : "No se pudieron cargar las encuestas."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const filtered = useMemo(() => surveys.filter((survey) => (filter === "all" || survey.status === filter) && survey.title.toLowerCase().includes(query.toLowerCase())), [surveys, filter, query]);
  const totalResponses = surveys.reduce((sum, survey) => sum + (survey.responseCount ?? 0), 0); const active = surveys.filter((survey) => survey.status === "published").length;

  async function changeStatus(survey: Survey, status: SurveyStatus) {
    try { const data = await api<{ survey: Survey }>(`/api/admin/surveys/${survey.id}/status`, { method: "POST", body: JSON.stringify({ status }) }); setSurveys((current) => current.map((item) => item.id === survey.id ? data.survey : item)); setToast(status === "closed" ? "Encuesta cerrada." : "Encuesta activada."); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo cambiar el estado."); }
  }
  async function remove(survey: Survey) {
    if (!window.confirm(`¿Eliminar “${survey.title}”? Esta acción también eliminará sus resultados.`)) return;
    try { await api(`/api/admin/surveys/${survey.id}`, { method: "DELETE" }); setSurveys((current) => current.filter((item) => item.id !== survey.id)); setToast("Encuesta eliminada."); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo eliminar."); }
  }
  async function copy(survey: Survey) { await navigator.clipboard.writeText(publicUrl(survey.slug)); setToast("Enlace copiado."); }

  return (
    <>
      {toast && <Toast message={toast} />}{error && <Toast message={error} kind="error" />}
      <section className="dashboard-intro"><div><h2>Todo lo importante, en un vistazo.</h2><p>Crea, comparte y analiza las respuestas desde un solo lugar.</p></div><Link className="button button-primary" href="/admin/nueva"><span>＋</span> Crear encuesta</Link></section>
      <section className="metric-grid" aria-label="Resumen de actividad">
        <article className="metric-card metric-dark"><span className="metric-kicker">Respuestas totales</span><strong>{totalResponses.toLocaleString("es-EC")}</strong><small>En todas tus encuestas</small><span className="metric-spark">↗</span></article>
        <article className="metric-card"><span className="metric-kicker">Encuestas activas</span><strong>{active}</strong><small>Recibiendo respuestas ahora</small><span className="metric-icon green">●</span></article>
        <article className="metric-card"><span className="metric-kicker">Tasa de actividad</span><strong>{surveys.length ? Math.round((active / surveys.length) * 100) : 0}%</strong><small>De tus encuestas publicadas</small><span className="metric-icon coral">◒</span></article>
      </section>
      <section className="survey-section">
        <div className="section-heading"><div><h2>Encuestas recientes</h2><p>{surveys.length} {surveys.length === 1 ? "encuesta" : "encuestas"} en tu espacio</p></div><div className="filter-tools"><label className="search-box"><span>⌕</span><span className="sr-only">Buscar encuesta</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar encuesta…" /></label><select aria-label="Filtrar por estado" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">Todos los estados</option><option value="published">Activas</option><option value="draft">Borradores</option><option value="closed">Cerradas</option></select></div></div>
        {loading ? <div className="loading-grid"><span /><span /><span /></div> : filtered.length === 0 ? (
          <div className="empty-state"><span className="empty-mark">＋</span><h3>{surveys.length ? "No hay coincidencias" : "Crea tu primera encuesta"}</h3><p>{surveys.length ? "Prueba con otra búsqueda o filtro." : "Empieza con preguntas abiertas, opciones o escalas y compártela en minutos."}</p>{!surveys.length && <Link className="button button-primary" href="/admin/nueva">Crear encuesta</Link>}</div>
        ) : <div className="survey-card-grid">{filtered.map((survey) => (
          <article className="survey-card" key={survey.id}>
            <div className="survey-card-top"><span className={`status-badge status-${survey.status}`}><i />{STATUS_LABEL[survey.status]}</span><button className="icon-button menu-dots" aria-label={`Más acciones para ${survey.title}`} onClick={() => remove(survey)}>···</button></div>
            <div><h3>{survey.title}</h3><p>{survey.description || "Sin descripción"}</p></div>
            <div className="survey-stats"><span><strong>{survey.responseCount ?? 0}</strong> respuestas</span><span><strong>{survey.questions.length || "—"}</strong> preguntas</span></div>
            <div className="survey-updated">Actualizada {formatDate(survey.updatedAt)}</div>
            <div className="survey-actions"><Link className="button button-soft" href={`/admin/encuestas/${survey.id}/${(survey.responseCount ?? 0) > 0 ? "resultados" : "editar"}`}>{(survey.responseCount ?? 0) > 0 ? "Ver resultados" : "Editar"}</Link><button className="icon-button" onClick={() => copy(survey)} aria-label={`Copiar enlace de ${survey.title}`}>⌁</button><button className="icon-button" onClick={() => setShare(survey)} aria-label={`Compartir ${survey.title}`}>↗</button></div>
            <div className="survey-quick-row">{survey.status === "published" ? <button onClick={() => changeStatus(survey, "closed")}>Cerrar encuesta</button> : survey.status === "closed" ? <button onClick={() => changeStatus(survey, "published")}>Reabrir encuesta</button> : <Link href={`/admin/encuestas/${survey.id}/editar`}>Continuar borrador</Link>}<Link href={`/admin/encuestas/${survey.id}/resultados`}>Analizar</Link></div>
          </article>
        ))}</div>}
      </section>
      {share && <ShareModal survey={share} onClose={() => setShare(null)} />}
    </>
  );
}

function makeQuestion(type: QuestionType): SurveyQuestion {
  const definition = QUESTION_TYPES.find((item) => item.type === type)!;
  return { id: `q_${crypto.randomUUID().replaceAll("-", "")}`, prompt: definition.label, type, required: false, position: 0, options: ["single_choice", "multiple_choice", "dropdown"].includes(type) ? ["Opción 1", "Opción 2"] : [], config: type === "scale" ? { min: 1, max: 10, minLabel: "Nada", maxLabel: "Mucho" } : type === "rating" ? { min: 1, max: 5 } : {} };
}

function blankSurvey(): SurveyInput {
  return { title: "", description: "", isAnonymous: true, collectName: false, collectEmail: false, oneResponsePerDevice: true, startAt: null, endAt: null, questions: [{ ...makeQuestion("single_choice"), prompt: "¿Cómo calificarías tu experiencia?", required: true, position: 0 }, { ...makeQuestion("long_text"), prompt: "¿Qué podríamos mejorar?", position: 1 }] };
}

function SurveyBuilder({ surveyId }: { surveyId?: string }) {
  const router = useRouter(); const [survey, setSurvey] = useState<SurveyInput>(blankSurvey); const [savedSurvey, setSavedSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(Boolean(surveyId)); const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle"); const [message, setMessage] = useState("");
  const [typeMenu, setTypeMenu] = useState(false); const [preview, setPreview] = useState(false); const [share, setShare] = useState(false); const locked = (savedSurvey?.responseCount ?? 0) > 0;
  useEffect(() => { if (!surveyId) return; void api<{ survey: Survey }>(`/api/admin/surveys/${surveyId}`).then(({ survey: loaded }) => { setSavedSurvey(loaded); setSurvey(loaded); }).catch((error) => setMessage(error.message)).finally(() => setLoading(false)); }, [surveyId]);
  function updateQuestion(id: string, patch: Partial<SurveyQuestion>) { setSurvey((current) => ({ ...current, questions: current.questions.map((question) => question.id === id ? { ...question, ...patch } : question) })); setSaving("idle"); }
  function addQuestion(type: QuestionType) { const next = makeQuestion(type); setSurvey((current) => ({ ...current, questions: [...current.questions, { ...next, position: current.questions.length }] })); setTypeMenu(false); setSaving("idle"); }
  function moveQuestion(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= survey.questions.length) return; const next = [...survey.questions]; [next[index], next[target]] = [next[target], next[index]]; setSurvey((current) => ({ ...current, questions: next.map((question, position) => ({ ...question, position })) })); }
  function removeQuestion(id: string) { setSurvey((current) => ({ ...current, questions: current.questions.filter((question) => question.id !== id).map((question, position) => ({ ...question, position })) })); }
  function duplicateQuestion(question: SurveyQuestion) { const copy = { ...question, id: `q_${crypto.randomUUID().replaceAll("-", "")}`, prompt: `${question.prompt} (copia)`, position: survey.questions.length }; setSurvey((current) => ({ ...current, questions: [...current.questions, copy] })); }
  async function save(): Promise<Survey | null> {
    if (locked) { setMessage("La encuesta ya tiene respuestas y sus preguntas están bloqueadas."); return savedSurvey; }
    try {
      setSaving("saving"); setMessage(""); const endpoint = savedSurvey ? `/api/admin/surveys/${savedSurvey.id}` : "/api/admin/surveys"; const method = savedSurvey ? "PUT" : "POST";
      const data = await api<{ survey: Survey }>(endpoint, { method, body: JSON.stringify(survey) }); setSavedSurvey(data.survey); setSurvey(data.survey); setSaving("saved");
      if (!savedSurvey) router.replace(`/admin/encuestas/${data.survey.id}/editar`); return data.survey;
    } catch (error) { setSaving("error"); setMessage(error instanceof Error ? error.message : "No se pudo guardar."); return null; }
  }
  async function publish() { const saved = await save(); if (!saved) return; try { const data = await api<{ survey: Survey }>(`/api/admin/surveys/${saved.id}/status`, { method: "POST", body: JSON.stringify({ status: "published" }) }); setSavedSurvey(data.survey); setShare(true); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo publicar."); } }
  if (loading) return <div className="builder-loading"><span /><p>Preparando el editor…</p></div>;

  return (
    <>
      {message && <Toast message={message} kind="error" />}
      {locked && <div className="notice notice-warning"><strong>Preguntas bloqueadas</strong><span>Esta encuesta ya recibió respuestas. Puedes consultar los resultados o crear una nueva para cambiar su estructura.</span><Link href={`/admin/encuestas/${savedSurvey!.id}/resultados`}>Ver resultados</Link></div>}
      <div className="builder-toolbar"><Link className="back-link" href="/admin">← Volver</Link><div className="save-state" aria-live="polite"><i className={`save-dot save-${saving}`} />{saving === "saving" ? "Guardando…" : saving === "saved" ? "Cambios guardados" : saving === "error" ? "Error al guardar" : "Cambios sin guardar"}</div><div className="builder-actions"><button className="button button-soft" onClick={() => setPreview(true)}>Vista previa</button><button className="button button-dark" onClick={() => void save()} disabled={saving === "saving" || locked}>Guardar</button><button className="button button-primary" onClick={() => void publish()} disabled={saving === "saving" || locked}>{savedSurvey?.status === "published" ? "Actualizar" : "Publicar"}</button></div></div>
      <div className="builder-grid">
        <section className="builder-main">
          <article className="survey-title-card"><span className="eyebrow">Información de la encuesta</span><label htmlFor="survey-title">Título</label><input id="survey-title" className="title-input" value={survey.title} onChange={(event) => { setSurvey({ ...survey, title: event.target.value }); setSaving("idle"); }} placeholder="Ej. Encuesta de satisfacción 2026" disabled={locked} /><label htmlFor="survey-description">Descripción o instrucciones</label><textarea id="survey-description" value={survey.description} onChange={(event) => setSurvey({ ...survey, description: event.target.value })} placeholder="Explica el propósito y cuánto tiempo tomará responder…" rows={3} disabled={locked} /></article>
          <div className="question-list">{survey.questions.map((question, index) => <QuestionEditor key={question.id} question={question} index={index} total={survey.questions.length} disabled={locked} onChange={(patch) => updateQuestion(question.id, patch)} onMove={(direction) => moveQuestion(index, direction)} onDuplicate={() => duplicateQuestion(question)} onRemove={() => removeQuestion(question.id)} />)}</div>
          {!locked && <div className="add-question-wrap"><button className="add-question-button" onClick={() => setTypeMenu((value) => !value)} aria-expanded={typeMenu}><span>＋</span><strong>Añadir pregunta</strong><small>Elige entre 8 tipos</small></button>{typeMenu && <div className="question-type-menu" role="menu">{QUESTION_TYPES.map((item) => <button key={item.type} onClick={() => addQuestion(item.type)} role="menuitem"><span>{item.mark}</span><span><strong>{item.label}</strong><small>{item.hint}</small></span></button>)}</div>}</div>}
        </section>
        <aside className="builder-settings"><div className="settings-sticky"><span className="eyebrow">Configuración</span><h2>Detalles de publicación</h2><SettingSwitch label="Encuesta anónima" hint="No guardar nombre ni correo" checked={survey.isAnonymous} onChange={(checked) => setSurvey({ ...survey, isAnonymous: checked, collectName: checked ? false : survey.collectName, collectEmail: checked ? false : survey.collectEmail })} disabled={locked} />{!survey.isAnonymous && <><SettingSwitch label="Solicitar nombre" hint="Identifica a cada participante" checked={survey.collectName} onChange={(checked) => setSurvey({ ...survey, collectName: checked })} disabled={locked} /><SettingSwitch label="Solicitar correo" hint="Valida un correo por respuesta" checked={survey.collectEmail} onChange={(checked) => setSurvey({ ...survey, collectEmail: checked })} disabled={locked} /></>}<SettingSwitch label="Una respuesta por dispositivo" hint="Reduce respuestas duplicadas" checked={survey.oneResponsePerDevice} onChange={(checked) => setSurvey({ ...survey, oneResponsePerDevice: checked })} disabled={locked} /><div className="date-fields"><label>Disponible desde<input type="datetime-local" value={survey.startAt?.slice(0, 16) ?? ""} onChange={(event) => setSurvey({ ...survey, startAt: event.target.value ? new Date(event.target.value).toISOString() : null })} disabled={locked} /></label><label>Cierre automático<input type="datetime-local" value={survey.endAt?.slice(0, 16) ?? ""} onChange={(event) => setSurvey({ ...survey, endAt: event.target.value ? new Date(event.target.value).toISOString() : null })} disabled={locked} /></label></div><div className="builder-summary"><span><strong>{survey.questions.length}</strong> preguntas</span><span><strong>{survey.questions.filter((question) => question.required).length}</strong> obligatorias</span></div></div></aside>
      </div>
      {preview && <Modal title="Vista previa de la encuesta" onClose={() => setPreview(false)} wide><div className="preview-shell"><div className="preview-browser"><span /><span /><span /></div><div className="preview-survey"><span className="brand-mark">P</span><h2>{survey.title || "Encuesta sin título"}</h2><p>{survey.description || "Añade una descripción para orientar a las personas."}</p>{survey.questions.map((question, index) => <QuestionPreview key={question.id} question={question} index={index} />)}</div></div></Modal>}
      {share && savedSurvey && <ShareModal survey={savedSurvey} onClose={() => setShare(false)} />}
    </>
  );
}

function SettingSwitch({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className={`setting-switch ${disabled ? "disabled" : ""}`}><span><strong>{label}</strong><small>{hint}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} /><i aria-hidden="true" /></label>;
}

function QuestionEditor({ question, index, total, disabled, onChange, onMove, onDuplicate, onRemove }: { question: SurveyQuestion; index: number; total: number; disabled: boolean; onChange: (patch: Partial<SurveyQuestion>) => void; onMove: (direction: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void }) {
  const hasOptions = ["single_choice", "multiple_choice", "dropdown"].includes(question.type); const typeDef = QUESTION_TYPES.find((item) => item.type === question.type)!;
  function setOption(optionIndex: number, value: string) { const options = [...question.options]; options[optionIndex] = value; onChange({ options }); }
  return <article className="question-editor"><div className="question-number">{String(index + 1).padStart(2, "0")}</div><div className="question-editor-main"><div className="question-editor-head"><div className="type-select-wrap"><span>{typeDef.mark}</span><select aria-label={`Tipo de la pregunta ${index + 1}`} value={question.type} onChange={(event) => { const next = makeQuestion(event.target.value as QuestionType); onChange({ type: next.type, options: next.options, config: next.config }); }} disabled={disabled}>{QUESTION_TYPES.map((type) => <option value={type.type} key={type.type}>{type.label}</option>)}</select></div><div className="question-order"><button onClick={() => onMove(-1)} disabled={disabled || index === 0} aria-label={`Mover pregunta ${index + 1} hacia arriba`}>↑</button><button onClick={() => onMove(1)} disabled={disabled || index === total - 1} aria-label={`Mover pregunta ${index + 1} hacia abajo`}>↓</button></div></div><label className="sr-only" htmlFor={`question-${question.id}`}>Texto de la pregunta {index + 1}</label><input id={`question-${question.id}`} className="question-prompt" value={question.prompt} onChange={(event) => onChange({ prompt: event.target.value })} placeholder="Escribe tu pregunta…" disabled={disabled} />
    {hasOptions && <div className="option-editor">{question.options.map((option, optionIndex) => <div className="option-row" key={optionIndex}><span>{question.type === "multiple_choice" ? "□" : "○"}</span><input aria-label={`Opción ${optionIndex + 1} de la pregunta ${index + 1}`} value={option} onChange={(event) => setOption(optionIndex, event.target.value)} disabled={disabled} /><button onClick={() => onChange({ options: question.options.filter((_, itemIndex) => itemIndex !== optionIndex) })} disabled={disabled || question.options.length <= 2} aria-label={`Eliminar opción ${optionIndex + 1}`}>×</button></div>)}<button className="add-option" onClick={() => onChange({ options: [...question.options, `Opción ${question.options.length + 1}`] })} disabled={disabled}>＋ Añadir opción</button></div>}
    {question.type === "scale" && <div className="scale-editor"><label>Mínimo<input type="number" min="0" max="9" value={question.config.min ?? 1} onChange={(event) => onChange({ config: { ...question.config, min: Number(event.target.value) } })} disabled={disabled} /></label><label>Máximo<input type="number" min="2" max="20" value={question.config.max ?? 10} onChange={(event) => onChange({ config: { ...question.config, max: Number(event.target.value) } })} disabled={disabled} /></label><label>Etiqueta izquierda<input value={question.config.minLabel ?? ""} onChange={(event) => onChange({ config: { ...question.config, minLabel: event.target.value } })} disabled={disabled} /></label><label>Etiqueta derecha<input value={question.config.maxLabel ?? ""} onChange={(event) => onChange({ config: { ...question.config, maxLabel: event.target.value } })} disabled={disabled} /></label></div>}
    <div className="question-footer"><label className="required-toggle"><input type="checkbox" checked={question.required} onChange={(event) => onChange({ required: event.target.checked })} disabled={disabled} /><span>Obligatoria</span></label><div><button onClick={onDuplicate} disabled={disabled} aria-label={`Duplicar pregunta ${index + 1}`}>▣</button><button className="danger-icon" onClick={onRemove} disabled={disabled} aria-label={`Eliminar pregunta ${index + 1}`}>×</button></div></div></div></article>;
}

function QuestionPreview({ question, index }: { question: SurveyQuestion; index: number }) {
  return <div className="question-preview"><span className="preview-index">{index + 1}</span><h3>{question.prompt || "Pregunta sin texto"}{question.required && <sup>*</sup>}</h3>{["single_choice", "multiple_choice"].includes(question.type) && question.options.map((option) => <label key={option}><input type={question.type === "multiple_choice" ? "checkbox" : "radio"} disabled />{option}</label>)}{question.type === "dropdown" && <select disabled><option>Selecciona una opción</option>{question.options.map((option) => <option key={option}>{option}</option>)}</select>}{question.type === "short_text" && <input placeholder="Tu respuesta" disabled />}{question.type === "long_text" && <textarea placeholder="Escribe tu respuesta" disabled />}{question.type === "yes_no" && <div className="preview-choice-row"><button disabled>Sí</button><button disabled>No</button></div>}{question.type === "rating" && <div className="preview-stars">★★★★★</div>}{question.type === "scale" && <div className="preview-scale">{Array.from({ length: Math.min(10, (question.config.max ?? 10) - (question.config.min ?? 1) + 1) }, (_, item) => <button key={item} disabled>{(question.config.min ?? 1) + item}</button>)}</div>}</div>;
}

function ResultsDashboard({ surveyId }: { surveyId: string }) {
  const [data, setData] = useState<ResultsPayload | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [paused, setPaused] = useState(false); const [range, setRange] = useState<"7" | "30" | "all">("all"); const [lastUpdate, setLastUpdate] = useState<Date | null>(null); const [chartKinds, setChartKinds] = useState<Record<string, ChartKind>>({}); const [share, setShare] = useState(false);
  const load = useCallback(async (quiet = false) => { try { if (!quiet) setLoading(true); const result = await api<ResultsPayload>(`/api/admin/surveys/${surveyId}/results?range=${range}`); setData(result); setLastUpdate(new Date()); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "No se pudieron actualizar los resultados."); } finally { setLoading(false); } }, [surveyId, range]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => { if (paused) return; const timer = window.setInterval(() => void load(true), 4000); return () => window.clearInterval(timer); }, [paused, load]);
  if (loading && !data) return <div className="builder-loading"><span /><p>Calculando resultados…</p></div>;
  if (!data) return <div className="empty-state"><h3>No pudimos cargar los resultados</h3><p>{error}</p><button className="button button-dark" onClick={() => void load()}>Reintentar</button></div>;
  const surveyForShare = { ...data.survey, questions: [] } as Survey;
  return <>{error && <Toast message={error} kind="error" />}<div className="results-toolbar"><Link className="back-link" href="/admin">← Volver</Link><div className="live-control"><span className={paused ? "live-dot paused" : "live-dot"} />{paused ? "Actualización pausada" : "En vivo"}<button onClick={() => setPaused((value) => !value)}>{paused ? "Reanudar" : "Pausar"}</button></div><div className="results-actions"><select aria-label="Período de resultados" value={range} onChange={(event) => setRange(event.target.value as typeof range)}><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="all">Todo el período</option></select><button className="button button-soft" onClick={() => setShare(true)}>Compartir</button><ExportMenu data={data} /></div></div>
    <section className="results-heading"><div><span className={`status-badge status-${data.survey.status}`}>{STATUS_LABEL[data.survey.status]}</span><h2>{data.survey.title}</h2><p>{data.survey.description}</p></div><small>Última actualización: {lastUpdate ? lastUpdate.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</small></section>
    <section className="metric-grid results-metrics"><article className="metric-card metric-dark"><span className="metric-kicker">Respuestas</span><strong>{data.responseCount}</strong><small>En el período seleccionado</small></article><article className="metric-card"><span className="metric-kicker">Últimas 24 horas</span><strong>+{data.responsesLast24Hours}</strong><small>Nuevas participaciones</small></article><article className="metric-card"><span className="metric-kicker">Última respuesta</span><strong className="metric-date">{data.lastResponseAt ? formatDate(data.lastResponseAt, true) : "Sin respuestas"}</strong><small>{data.survey.questionCount} preguntas publicadas</small></article></section>
    <section className="analytics-card timeline-card"><div className="analytics-head"><div><span className="eyebrow">Evolución</span><h3>Respuestas a lo largo del tiempo</h3></div><span className="data-note">Actualización cada 4 s</span></div><CanvasChart kind="area" title="Respuestas por día" data={data.timeline.map((item) => ({ label: new Date(`${item.date}T12:00:00`).toLocaleDateString("es-EC", { day: "2-digit", month: "short" }), value: item.count }))} /></section>
    <div className="question-results"><div className="section-heading"><div><h2>Resultados por pregunta</h2><p>Elige la representación que mejor explique cada respuesta.</p></div></div>{data.questions.map((question, index) => { const kind = chartKinds[question.questionId] ?? "bar"; return <QuestionAnalytics key={question.questionId} question={question} index={index} kind={kind} onKind={(next) => setChartKinds((current) => ({ ...current, [question.questionId]: next }))} />; })}</div>
    <ResponsesTable data={data} />{share && <ShareModal survey={surveyForShare} onClose={() => setShare(false)} />}</>;
}

function QuestionAnalytics({ question, index, kind, onKind }: { question: QuestionResult; index: number; kind: ChartKind; onKind: (kind: ChartKind) => void }) {
  const isText = ["short_text", "long_text"].includes(question.type); const values = question.choices.map((choice) => ({ label: choice.label, value: choice.count })); const average = ["scale", "rating"].includes(question.type) && question.totalAnswered ? question.choices.reduce((sum, choice) => sum + Number(choice.label) * choice.count, 0) / question.totalAnswered : null;
  return <article className="analytics-card question-analytics"><div className="analytics-head"><div className="question-analytics-title"><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{question.prompt}</h3><p>{question.totalAnswered} respuestas{average !== null ? ` · Promedio ${average.toFixed(1)}` : ""}</p></div></div>{!isText && <div className="chart-tools"><select aria-label={`Tipo de gráfico para ${question.prompt}`} value={kind} onChange={(event) => onKind(event.target.value as ChartKind)}><option value="bar">Barras</option><option value="horizontal">Barras horizontales</option><option value="donut">Dona</option><option value="line">Líneas</option><option value="area">Área</option><option value="radar">Radar</option><option value="table">Tabla</option></select><button className="icon-button" onClick={() => downloadChart(question.prompt, values, kind)} aria-label={`Descargar gráfico de ${question.prompt}`}>⇩</button></div>}</div>{isText ? <OpenAnswers answers={question.textAnswers} /> : kind === "table" ? <DataTable choices={question.choices} /> : <><CanvasChart kind={kind} title={question.prompt} data={values} /><details className="accessible-data"><summary>Ver datos en tabla</summary><DataTable choices={question.choices} /></details></>}</article>;
}

function OpenAnswers({ answers }: { answers: string[] }) {
  const keywords = useMemo(() => { const stop = new Set(["para", "como", "pero", "porque", "esta", "este", "muy", "con", "que", "una", "los", "las", "del"]); const counts = new Map<string, number>(); answers.join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-zñ]+/).filter((word) => word.length > 3 && !stop.has(word)).forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1)); return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6); }, [answers]);
  return <div className="open-answers">{keywords.length > 0 && <div className="keyword-row"><span>Temas frecuentes</span>{keywords.map(([word, count]) => <i key={word}>{word} <small>{count}</small></i>)}</div>}{answers.length ? <div className="answer-list">{answers.slice(0, 8).map((answer, index) => <blockquote key={index}>{answer}</blockquote>)}</div> : <div className="chart-empty">Aún no hay respuestas abiertas.</div>}</div>;
}

function DataTable({ choices }: { choices: QuestionResult["choices"] }) { return <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Respuesta</th><th>Frecuencia</th><th>Porcentaje</th></tr></thead><tbody>{choices.map((choice) => <tr key={choice.label}><td>{choice.label}</td><td>{choice.count}</td><td>{choice.percentage}%</td></tr>)}</tbody></table></div>; }

function ResponsesTable({ data }: { data: ResultsPayload }) {
  return <section className="analytics-card response-table-card"><div className="analytics-head"><div><span className="eyebrow">Detalle</span><h3>Respuestas individuales</h3></div><span className="data-note">{data.rawResponses.length} registros</span></div>{data.rawResponses.length ? <div className="data-table-wrap"><table className="data-table responses-table"><thead><tr><th>Fecha</th>{!data.survey.isAnonymous && <><th>Nombre</th><th>Correo</th></>}{data.questions.map((question) => <th key={question.questionId}>{question.prompt}</th>)}</tr></thead><tbody>{data.rawResponses.slice(0, 50).map((response) => <tr key={response.id}><td>{formatDate(response.submittedAt, true)}</td>{!data.survey.isAnonymous && <><td>{response.respondentName || "—"}</td><td>{response.respondentEmail || "—"}</td></>}{data.questions.map((question) => <td key={question.questionId}>{Array.isArray(response.answers[question.questionId]) ? (response.answers[question.questionId] as string[]).join(", ") : String(response.answers[question.questionId] ?? "—")}</td>)}</tr>)}</tbody></table></div> : <div className="chart-empty">Las respuestas aparecerán aquí en cuanto alguien complete la encuesta.</div>}</section>;
}

function ExportMenu({ data }: { data: ResultsPayload }) {
  const [open, setOpen] = useState(false);
  return <div className="export-menu"><button className="button button-dark" onClick={() => setOpen((value) => !value)} aria-expanded={open}>Exportar <span>⌄</span></button>{open && <div className="export-popover"><button onClick={() => exportCsv(data)}><span>CSV</span><strong>Datos universales</strong></button><button onClick={() => exportExcel(data)}><span>XLS</span><strong>Abrir en Excel</strong></button><button onClick={() => window.print()}><span>PDF</span><strong>Imprimir informe</strong></button></div>}</div>;
}

function spreadsheetSafe(value: unknown) { const text = Array.isArray(value) ? value.join(" | ") : String(value ?? ""); return /^[=+\-@]/.test(text) ? `'${text}` : text; }
function csvCell(value: unknown) { return `"${spreadsheetSafe(value).replaceAll('"', '""')}"`; }
function downloadBlob(name: string, type: string, content: BlobPart) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function exportRows(data: ResultsPayload) { const headers = ["Fecha", ...(data.survey.isAnonymous ? [] : ["Nombre", "Correo"]), ...data.questions.map((question) => question.prompt)]; const rows = data.rawResponses.map((response) => [response.submittedAt, ...(data.survey.isAnonymous ? [] : [response.respondentName ?? "", response.respondentEmail ?? ""]), ...data.questions.map((question) => response.answers[question.questionId] ?? "")]); return { headers, rows }; }
function exportCsv(data: ResultsPayload) { const { headers, rows } = exportRows(data); const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"); downloadBlob(`${data.survey.slug}-respuestas.csv`, "text/csv;charset=utf-8", `\ufeff${csv}`); }
function escapeHtml(value: unknown) { return spreadsheetSafe(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function exportExcel(data: ResultsPayload) { const { headers, rows } = exportRows(data); const table = `<table><thead><tr>${headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`; downloadBlob(`${data.survey.slug}-respuestas.xls`, "application/vnd.ms-excel;charset=utf-8", `\ufeff<html><meta charset="utf-8"><body>${table}</body></html>`); }

function CanvasChart({ data, kind, title }: { data: ChartDatum[]; kind: Exclude<ChartKind, "table">; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const render = () => { const rect = canvas.getBoundingClientRect(); const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.max(600, rect.width * ratio); canvas.height = 340 * ratio; const context = canvas.getContext("2d"); if (!context) return; context.setTransform(ratio, 0, 0, ratio, 0, 0); drawChart(context, data, kind, Math.max(600 / ratio, rect.width), 340, title); }; render(); const observer = new ResizeObserver(render); observer.observe(canvas); return () => observer.disconnect();
  }, [data, kind, title]);
  return <canvas className="chart-canvas" ref={canvasRef} role="img" aria-label={`${title}. Gráfico ${kind}. ${data.map((item) => `${item.label}: ${item.value}`).join(", ")}`} />;
}

function drawChart(context: CanvasRenderingContext2D, data: ChartDatum[], kind: Exclude<ChartKind, "table">, width: number, height: number, title: string) {
  context.clearRect(0, 0, width, height); context.fillStyle = "#fbfcf8"; context.fillRect(0, 0, width, height); context.font = "600 12px Segoe UI, sans-serif"; context.textBaseline = "middle";
  if (!data.length || data.every((item) => item.value === 0)) { context.fillStyle = "#758078"; context.textAlign = "center"; context.fillText("Aún no hay datos para este gráfico", width / 2, height / 2); return; }
  const pad = { top: 30, right: 34, bottom: 62, left: kind === "horizontal" ? 130 : 48 }; const chartW = width - pad.left - pad.right; const chartH = height - pad.top - pad.bottom; const max = Math.max(...data.map((item) => item.value), 1);
  if (kind === "donut") { const total = data.reduce((sum, item) => sum + item.value, 0); const cx = Math.min(width * .36, 230); const cy = height / 2; const radius = 105; let angle = -Math.PI / 2; data.forEach((item, index) => { const slice = item.value / total * Math.PI * 2; context.beginPath(); context.strokeStyle = COLORS[index % COLORS.length]; context.lineWidth = 34; context.arc(cx, cy, radius, angle, angle + slice); context.stroke(); angle += slice; }); context.fillStyle = "#10261f"; context.textAlign = "center"; context.font = "700 28px Segoe UI"; context.fillText(String(total), cx, cy - 5); context.font = "500 11px Segoe UI"; context.fillStyle = "#6e7b73"; context.fillText("respuestas", cx, cy + 20); const startX = Math.max(cx + 160, width * .58); data.slice(0, 8).forEach((item, index) => { const y = 65 + index * 31; context.fillStyle = COLORS[index % COLORS.length]; context.fillRect(startX, y - 5, 10, 10); context.fillStyle = "#23342d"; context.textAlign = "left"; context.font = "600 11px Segoe UI"; context.fillText(`${item.label.slice(0, 22)} · ${item.value}`, startX + 18, y); }); return; }
  if (kind === "radar") { const cx = width / 2; const cy = height / 2; const radius = Math.min(chartH, chartW) * .38; const points = Math.max(data.length, 3); context.strokeStyle = "#dfe6df"; for (let ring = 1; ring <= 4; ring++) { context.beginPath(); for (let i = 0; i < points; i++) { const angle = -Math.PI / 2 + i * Math.PI * 2 / points; const r = radius * ring / 4; const x = cx + Math.cos(angle) * r; const y = cy + Math.sin(angle) * r; i ? context.lineTo(x, y) : context.moveTo(x, y); } context.closePath(); context.stroke(); } context.beginPath(); data.forEach((item, index) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / points; const r = radius * item.value / max; const x = cx + Math.cos(angle) * r; const y = cy + Math.sin(angle) * r; index ? context.lineTo(x, y) : context.moveTo(x, y); }); context.closePath(); context.fillStyle = "rgba(155,215,47,.25)"; context.strokeStyle = "#1f6b52"; context.lineWidth = 2; context.fill(); context.stroke(); data.forEach((item, index) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / points; context.fillStyle = "#23342d"; context.textAlign = Math.cos(angle) > .2 ? "left" : Math.cos(angle) < -.2 ? "right" : "center"; context.fillText(item.label.slice(0, 16), cx + Math.cos(angle) * (radius + 18), cy + Math.sin(angle) * (radius + 18)); }); return; }
  context.strokeStyle = "#e2e8e2"; context.fillStyle = "#758078"; context.lineWidth = 1; context.textAlign = "right"; for (let tick = 0; tick <= 4; tick++) { const value = Math.round(max * tick / 4); const y = pad.top + chartH - chartH * tick / 4; context.beginPath(); context.moveTo(pad.left, y); context.lineTo(width - pad.right, y); context.stroke(); context.fillText(String(value), pad.left - 10, y); }
  if (kind === "horizontal") { const gap = chartH / data.length; data.forEach((item, index) => { const y = pad.top + gap * index + gap * .18; const barH = gap * .64; const barW = chartW * item.value / max; context.fillStyle = COLORS[index % COLORS.length]; roundRect(context, pad.left, y, barW, barH, 7); context.fill(); context.fillStyle = "#263b32"; context.textAlign = "right"; context.fillText(item.label.slice(0, 19), pad.left - 10, y + barH / 2); context.textAlign = "left"; context.fillText(String(item.value), pad.left + barW + 8, y + barH / 2); }); return; }
  const gap = chartW / data.length; if (kind === "bar") { data.forEach((item, index) => { const barW = Math.min(54, gap * .62); const x = pad.left + gap * index + (gap - barW) / 2; const barH = chartH * item.value / max; context.fillStyle = COLORS[index % COLORS.length]; roundRect(context, x, pad.top + chartH - barH, barW, barH, 8); context.fill(); context.fillStyle = "#263b32"; context.textAlign = "center"; context.fillText(String(item.value), x + barW / 2, pad.top + chartH - barH - 12); context.fillStyle = "#66736c"; context.fillText(item.label.slice(0, 12), x + barW / 2, pad.top + chartH + 22); }); return; }
  const points = data.map((item, index) => ({ x: pad.left + gap * index + gap / 2, y: pad.top + chartH - chartH * item.value / max, item })); if (kind === "area") { const gradient = context.createLinearGradient(0, pad.top, 0, pad.top + chartH); gradient.addColorStop(0, "rgba(155,215,47,.42)"); gradient.addColorStop(1, "rgba(155,215,47,.03)"); context.beginPath(); context.moveTo(points[0].x, pad.top + chartH); points.forEach((point) => context.lineTo(point.x, point.y)); context.lineTo(points.at(-1)!.x, pad.top + chartH); context.closePath(); context.fillStyle = gradient; context.fill(); } context.beginPath(); points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)); context.strokeStyle = "#1f6b52"; context.lineWidth = 3; context.lineJoin = "round"; context.stroke(); points.forEach((point) => { context.beginPath(); context.fillStyle = "#c8ff43"; context.strokeStyle = "#1f6b52"; context.lineWidth = 2; context.arc(point.x, point.y, 5, 0, Math.PI * 2); context.fill(); context.stroke(); context.fillStyle = "#66736c"; context.textAlign = "center"; context.fillText(point.item.label.slice(0, 11), point.x, pad.top + chartH + 22); });
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { const r = Math.min(radius, width / 2, height / 2); context.beginPath(); context.moveTo(x + r, y); context.arcTo(x + width, y, x + width, y + height, r); context.arcTo(x + width, y + height, x, y + height, r); context.arcTo(x, y + height, x, y, r); context.arcTo(x, y, x + width, y, r); context.closePath(); }
function downloadChart(title: string, data: ChartDatum[], kind: ChartKind) { if (kind === "table") return; const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 700; const context = canvas.getContext("2d"); if (!context) return; drawChart(context, data, kind, 1200, 700, title); const link = document.createElement("a"); link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-grafico.png`; link.href = canvas.toDataURL("image/png"); link.click(); }
