"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AnswerInput, Survey, SurveyQuestion } from "../../lib/types";

type AnswerValue = string | string[] | number;

export default function PublicSurvey({ slug }: { slug: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null); const [availability, setAvailability] = useState<"available" | "closed" | "scheduled">("available"); const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState(""); const [current, setCurrent] = useState(-1); const [answers, setAnswers] = useState<Record<string, AnswerValue>>({}); const [respondentName, setRespondentName] = useState(""); const [respondentEmail, setRespondentEmail] = useState("");
  const [fieldError, setFieldError] = useState(""); const [submitting, setSubmitting] = useState(false); const [complete, setComplete] = useState(false); const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/public/surveys/${encodeURIComponent(slug)}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No encontramos esta encuesta."); setSurvey(data.survey); setAvailability(data.availability);
      try { const draft = JSON.parse(localStorage.getItem(`pulso_draft_${slug}`) || "null"); if (draft) { setAnswers(draft.answers ?? {}); setRespondentName(draft.respondentName ?? ""); setRespondentEmail(draft.respondentEmail ?? ""); } } catch { /* ignore invalid local draft */ }
    }).catch((error) => setFatalError(error.message)).finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!survey || complete) return;
    localStorage.setItem(`pulso_draft_${slug}`, JSON.stringify({ answers, respondentName, respondentEmail }));
  }, [answers, respondentName, respondentEmail, survey, slug, complete]);

  useEffect(() => { if (fieldError) errorRef.current?.focus(); }, [fieldError]);
  const question = current >= 0 ? survey?.questions[current] : null; const progress = survey && current >= 0 ? ((current + 1) / survey.questions.length) * 100 : 0;
  const duration = useMemo(() => Math.max(1, Math.ceil((survey?.questions.length ?? 1) / 4)), [survey]);

  function isEmpty(value: AnswerValue | undefined) { return value === undefined || value === "" || (Array.isArray(value) && value.length === 0); }
  function validateIdentity() {
    if (!survey || survey.isAnonymous) return true;
    if (survey.collectName && !respondentName.trim()) { setFieldError("Escribe tu nombre para comenzar."); return false; }
    if (survey.collectEmail && !/^\S+@\S+\.\S+$/.test(respondentEmail.trim())) { setFieldError("Escribe un correo electrónico válido."); return false; }
    return true;
  }
  function validateQuestion() {
    if (!question?.required || !isEmpty(answers[question.id])) return true;
    setFieldError("Esta pregunta es obligatoria. Selecciona o escribe una respuesta para continuar."); return false;
  }
  function start() { setFieldError(""); if (!validateIdentity()) return; setCurrent(0); }
  function next() { setFieldError(""); if (!validateQuestion()) return; if (survey && current < survey.questions.length - 1) setCurrent((value) => value + 1); else void submit(); }
  function back() { setFieldError(""); setCurrent((value) => Math.max(-1, value - 1)); }
  function setAnswer(value: AnswerValue) { if (!question) return; setAnswers((currentAnswers) => ({ ...currentAnswers, [question.id]: value })); setFieldError(""); }
  async function submit() {
    if (!survey || submitting) return; setSubmitting(true); setFieldError("");
    try {
      let token = localStorage.getItem(`pulso_token_${slug}`); if (!token) { token = crypto.randomUUID(); localStorage.setItem(`pulso_token_${slug}`, token); }
      const answerList: AnswerInput[] = survey.questions.filter((item) => !isEmpty(answers[item.id])).map((item) => ({ questionId: item.id, value: answers[item.id] }));
      const response = await fetch(`/api/public/surveys/${encodeURIComponent(slug)}/responses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ respondentName, respondentEmail, respondentToken: token, answers: answerList }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "No pudimos enviar tu respuesta."); localStorage.removeItem(`pulso_draft_${slug}`); setComplete(true);
    } catch (error) { setFieldError(error instanceof Error ? error.message : "No pudimos enviar tu respuesta. Inténtalo nuevamente."); } finally { setSubmitting(false); }
  }

  if (loading) return <PublicFrame><div className="public-loading"><span className="brand-mark brand-mark-large">P</span><i /><p>Cargando encuesta…</p></div></PublicFrame>;
  if (fatalError || !survey) return <PublicFrame><StatusScreen mark="?" title="No encontramos esta encuesta" text={fatalError || "Revisa el enlace o solicita uno nuevo a la persona administradora."} /></PublicFrame>;
  if (availability === "closed") return <PublicFrame><StatusScreen mark="✓" title="Esta encuesta ya cerró" text="Gracias por tu interés. El período para enviar respuestas ha finalizado." /></PublicFrame>;
  if (availability === "scheduled") return <PublicFrame><StatusScreen mark="◷" title="La encuesta todavía no está disponible" text={survey.startAt ? `Podrás responder a partir del ${new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeStyle: "short" }).format(new Date(survey.startAt))}.` : "Vuelve a intentarlo más adelante."} /></PublicFrame>;
  if (complete) return <PublicFrame><div className="complete-card"><div className="complete-mark">✓</div><span className="eyebrow">Respuesta registrada</span><h1>¡Gracias por compartir tu opinión!</h1><p>Tu respuesta fue enviada correctamente y ayudará a tomar mejores decisiones.</p><div className="complete-receipt"><span>Encuesta</span><strong>{survey.title}</strong><small>{new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeStyle: "short" }).format(new Date())}</small></div><Link className="text-link" href="/">Conocer Pulso ↗</Link></div></PublicFrame>;

  return <PublicFrame>
    {current === -1 ? <section className="survey-welcome"><div className="welcome-accent" /><span className="public-kicker">Invitación a participar</span><h1>{survey.title}</h1><p>{survey.description || "Tu opinión es importante. Completa esta breve encuesta para ayudarnos a mejorar."}</p><div className="survey-meta"><span><i>◷</i>{duration} min aprox.</span><span><i>▣</i>{survey.questions.length} preguntas</span><span><i>⌾</i>{survey.isAnonymous ? "Respuesta anónima" : "Respuesta identificada"}</span></div>{!survey.isAnonymous && (survey.collectName || survey.collectEmail) && <div className="identity-fields">{survey.collectName && <label>Tu nombre <span>Obligatorio</span><input value={respondentName} onChange={(event) => setRespondentName(event.target.value)} autoComplete="name" placeholder="Escribe tu nombre" /></label>}{survey.collectEmail && <label>Tu correo <span>Obligatorio</span><input type="email" value={respondentEmail} onChange={(event) => setRespondentEmail(event.target.value)} autoComplete="email" placeholder="nombre@correo.com" /></label>}</div>}{fieldError && <div className="public-error" role="alert" tabIndex={-1} ref={errorRef}>{fieldError}</div>}<button className="button button-primary public-start" onClick={start}>Comenzar <span>→</span></button><small className="privacy-note">Tus respuestas se utilizarán únicamente para los fines indicados en esta encuesta.</small></section> : question && <section className="survey-question-screen"><div className="public-progress" aria-label={`Pregunta ${current + 1} de ${survey.questions.length}`}><div><span>Pregunta {current + 1} de {survey.questions.length}</span><strong>{Math.round(progress)}%</strong></div><i><b style={{ width: `${progress}%` }} /></i></div><article className="public-question"><span className="question-type-label">{questionTypeLabel(question)}</span><h1>{question.prompt}{question.required && <sup>*</sup>}</h1>{question.required && <small className="required-copy">Respuesta obligatoria</small>}<QuestionControl question={question} value={answers[question.id]} onChange={setAnswer} />{fieldError && <div className="public-error" role="alert" tabIndex={-1} ref={errorRef}>{fieldError}</div>}</article><div className="public-nav"><button className="button button-soft" onClick={back}>← Anterior</button><button className="button button-primary" onClick={next} disabled={submitting}>{submitting ? "Enviando…" : current === survey.questions.length - 1 ? "Enviar respuesta" : "Siguiente →"}</button></div><p className="keyboard-hint">Tus respuestas se guardan en este dispositivo mientras completas la encuesta.</p></section>}
  </PublicFrame>;
}

function PublicFrame({ children }: { children: React.ReactNode }) {
  return <main className="public-page"><header className="public-header"><Link className="brand" href="/"><span className="brand-mark">P</span><span>Pulso</span></Link><span className="secure-note">Conexión segura <i>●</i></span></header><div className="public-content">{children}</div><footer className="public-footer"><span>Creado con <strong>Pulso</strong></span><span>Encuestas claras. Decisiones mejores.</span></footer></main>;
}

function StatusScreen({ mark, title, text }: { mark: string; title: string; text: string }) {
  return <section className="status-screen"><span className="status-mark">{mark}</span><h1>{title}</h1><p>{text}</p><Link className="button button-dark" href="/">Ir al inicio</Link></section>;
}

function questionTypeLabel(question: SurveyQuestion) {
  const labels: Record<QuestionType, string> = { short_text: "Respuesta corta", long_text: "Respuesta abierta", single_choice: "Elige una opción", multiple_choice: "Puedes elegir varias", dropdown: "Selecciona de la lista", scale: "Escala numérica", rating: "Valoración", yes_no: "Selecciona una respuesta" };
  return labels[question.type];
}

type QuestionType = SurveyQuestion["type"];

function QuestionControl({ question, value, onChange }: { question: SurveyQuestion; value: AnswerValue | undefined; onChange: (value: AnswerValue) => void }) {
  if (question.type === "short_text") return <input className="public-text-input" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} placeholder="Escribe tu respuesta" autoFocus />;
  if (question.type === "long_text") return <label className="public-textarea"><textarea value={String(value ?? "")} onChange={(event) => onChange(event.target.value.slice(0, 1500))} placeholder="Escribe tu respuesta con tus propias palabras…" rows={7} autoFocus /><span>{String(value ?? "").length} / 1500</span></label>;
  if (question.type === "dropdown") return <select className="public-select" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} autoFocus><option value="">Selecciona una opción</option>{question.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (question.type === "single_choice") return <div className="public-option-list">{question.options.map((option, index) => <label className={value === option ? "selected" : ""} key={option}><input type="radio" name={question.id} checked={value === option} onChange={() => onChange(option)} /><span className="option-key">{String.fromCharCode(65 + index)}</span><span>{option}</span><i>✓</i></label>)}</div>;
  if (question.type === "multiple_choice") { const selected = Array.isArray(value) ? value : []; return <div className="public-option-list multi">{question.options.map((option, index) => <label className={selected.includes(option) ? "selected" : ""} key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} /><span className="option-key">{String.fromCharCode(65 + index)}</span><span>{option}</span><i>✓</i></label>)}</div>; }
  if (question.type === "yes_no") return <div className="public-binary"><button className={value === "Sí" ? "selected" : ""} onClick={() => onChange("Sí")}><span>✓</span><strong>Sí</strong></button><button className={value === "No" ? "selected" : ""} onClick={() => onChange("No")}><span>×</span><strong>No</strong></button></div>;
  if (question.type === "rating") { const numeric = Number(value ?? 0); return <div className="public-rating" role="radiogroup" aria-label="Valoración por estrellas">{Array.from({ length: question.config.max ?? 5 }, (_, index) => index + 1).map((rating) => <button key={rating} role="radio" aria-checked={numeric === rating} className={rating <= numeric ? "selected" : ""} onClick={() => onChange(rating)} aria-label={`${rating} de ${question.config.max ?? 5} estrellas`}>★</button>)}<span>{numeric ? `${numeric} de ${question.config.max ?? 5}` : "Selecciona una valoración"}</span></div>; }
  const min = question.config.min ?? 1; const max = question.config.max ?? 10; return <div className="public-scale"><div className="scale-buttons">{Array.from({ length: max - min + 1 }, (_, index) => min + index).map((number) => <button key={number} className={Number(value) === number ? "selected" : ""} onClick={() => onChange(number)}>{number}</button>)}</div><div className="scale-labels"><span>{question.config.minLabel || "Mínimo"}</span><span>{question.config.maxLabel || "Máximo"}</span></div></div>;
}
