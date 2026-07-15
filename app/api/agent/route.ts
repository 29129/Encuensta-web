import { AGENT_TOOLS, executeAgentTool } from "../../../lib/agent/tools";
import { environmentValue } from "../../../lib/env";
import { apiError, assertSameOrigin, requireAdmin } from "../../../lib/http";
import { PulsoError } from "../../../lib/surveys";

type AgentTurn = { role: "user" | "assistant"; content: string };
type AgentRequest = { message?: unknown; messages?: unknown; confirmAction?: unknown };
type FunctionCall = { type: "function_call"; name: string; arguments: string; call_id: string };
type ResponsesApiResult = { id?: unknown; output_text?: unknown; output?: unknown[]; error?: { message?: unknown; code?: unknown; type?: unknown } };
type AgentAction = { type?: unknown; title?: unknown };

const MAX_TOOL_STEPS = 6;

const AGENT_INSTRUCTIONS = [
  "Eres AI Agent, el asistente administrativo de la plataforma Pulso.",
  "Ayuda a administradores a consultar, crear, editar, publicar y analizar sus encuestas en español claro.",
  "Usa herramientas para toda acción real; nunca afirmes haber hecho algo si una herramienta no lo confirmó.",
  "Antes de crear o editar, pregunta solo lo que falte y conserva los datos que ya estén definidos.",
  "Una encuesta nueva se crea como borrador. Si una herramienta devuelve requiresConfirmation, no digas que se publicó: pide confirmación explícita.",
  "Solo analiza datos devueltos por las herramientas y reconoce cuando no hay suficientes respuestas.",
  "Usa únicamente las herramientas disponibles. Nunca escribas llamadas, JSON, comandos ni sintaxis interna de herramientas en la respuesta para el usuario.",
].join(" ");

function validateMessage(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new PulsoError("El mensaje del AI Agent debe ser texto.");
  if (value.length > 4_000) throw new PulsoError("El mensaje del AI Agent no puede superar los 4000 caracteres.");
  return value.trim();
}

function normalizeInput(payload: AgentRequest): string | AgentTurn[] {
  if (Array.isArray(payload.messages)) {
    if (payload.messages.length > 20 || payload.messages.length === 0) throw new PulsoError("La conversación no es válida.");
    const messages = payload.messages.map((item) => {
      if (!item || typeof item !== "object") throw new PulsoError("La conversación no es válida.");
      const turn = item as { role?: unknown; content?: unknown };
      if (turn.role !== "user" && turn.role !== "assistant") throw new PulsoError("La conversación no es válida.");
      return { role: turn.role, content: validateMessage(turn.content) } as AgentTurn;
    });
    if (!messages.some((item) => item.role === "user")) throw new PulsoError("La conversación necesita un mensaje del usuario.");
    return messages;
  }
  return validateMessage(payload.message);
}

function getFunctionCalls(response: ResponsesApiResult): FunctionCall[] {
  if (!Array.isArray(response.output)) return [];
  return response.output.filter((item): item is FunctionCall => Boolean(
    item && typeof item === "object" && (item as { type?: unknown }).type === "function_call"
      && typeof (item as { name?: unknown }).name === "string" && typeof (item as { arguments?: unknown }).arguments === "string"
      && typeof (item as { call_id?: unknown }).call_id === "string",
  ));
}

function responseMessage(response: ResponsesApiResult): string {
  const outputText = typeof response.output_text === "string" ? response.output_text.trim() : "";
  const text = outputText || (Array.isArray(response.output)
    ? response.output.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];
      return content.flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const outputPart = part as { type?: unknown; text?: unknown };
        return outputPart.type === "output_text" && typeof outputPart.text === "string" ? [outputPart.text] : [];
      });
    }).join("\n").trim()
    : "");

  if (!text) throw new PulsoError("El AI Agent no pudo responder en este momento. Inténtalo nuevamente.", 502);
  if (/(?:^|\n)\s*to=(?:functions|[a-z_]+)\./im.test(text)) throw new PulsoError("El AI Agent intentó mostrar una operación interna. Inténtalo nuevamente.", 502);
  return text;
}

function actionList(action: unknown): unknown[] {
  return action && typeof action === "object" ? [action] : [];
}

function confirmedSurveyId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const action = value as { type?: unknown; surveyId?: unknown };
  if (action.type !== "publishSurvey") return null;
  return typeof action.surveyId === "string" && action.surveyId.trim() ? action.surveyId.trim() : null;
}

function isPublishConfirmation(action: unknown): action is AgentAction & { type: "publish_confirmation_required" } {
  return Boolean(action && typeof action === "object" && (action as AgentAction).type === "publish_confirmation_required");
}

function publishConfirmationMessage(action: AgentAction): string {
  const title = typeof action.title === "string" && action.title.trim() ? ` “${action.title.trim()}”` : "";
  return `La encuesta${title} está lista para publicarse. Confirma la publicación para hacerla visible mediante su enlace.`;
}

function toolLoopInput(input: string | AgentTurn[]): unknown[] {
  return typeof input === "string" ? [{ role: "user", content: input }] : [...input];
}

async function requestResponse(input: unknown): Promise<ResponsesApiResult> {
  const apiKey = environmentValue("OPENAI_API_KEY");
  if (!apiKey) throw new PulsoError("El AI Agent todavía no está configurado.", 503);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: environmentValue("OPENAI_MODEL", "gpt-5"), instructions: AGENT_INSTRUCTIONS, input, tools: AGENT_TOOLS, parallel_tool_calls: false, store: false }),
    });
  } catch {
    throw new PulsoError("No se pudo conectar con el AI Agent. Inténtalo nuevamente.", 503);
  }
  const data = await response.json().catch(() => null) as ResponsesApiResult | null;
  if (!response.ok || !data) {
    const upstreamMessage = typeof data?.error?.message === "string" ? data.error.message.replace(/sk-[A-Za-z0-9_-]+/g, "[oculto]").slice(0, 240) : "sin detalles";
    console.error("AI Agent OpenAI response error", { status: response.status, code: data?.error?.code, type: data?.error?.type, message: upstreamMessage, keyPrefix: apiKey.slice(0, 8), keySuffix: apiKey.slice(-4), keyLength: apiKey.length });
    if (response.status === 401) throw new PulsoError("Vercel está usando una OPENAI_API_KEY inválida o no actualizada.", 502);
    if (response.status === 404) throw new PulsoError(`El modelo configurado no está disponible en OpenAI: ${process.env.OPENAI_MODEL || "(vacío)"}.`, 502);
    if (response.status === 429) throw new PulsoError("OpenAI rechazó la solicitud por límite de uso o saldo insuficiente.", 429);
    if (response.status === 400) throw new PulsoError(`OpenAI rechazó la configuración del AI Agent: ${upstreamMessage}`, 502);
    throw new PulsoError("OpenAI no está disponible en este momento. Inténtalo nuevamente.", 502);
  }
  return data;
}

async function runToolLoop(initialInput: string | AgentTurn[], ownerId: string) {
  const input = toolLoopInput(initialInput);
  let latestAction: unknown = null;

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    const response = await requestResponse(input);
    const functionCalls = getFunctionCalls(response);
    if (functionCalls.length === 0) return { response, action: latestAction, confirmation: null };
    if (functionCalls.length > 1 || !response.output) throw new PulsoError("El AI Agent solicitó más de una acción simultánea. Inténtalo nuevamente.", 502);

    const toolCall = functionCalls[0];
    input.push(...response.output);
    const toolResult = await executeAgentTool(toolCall.name, toolCall.arguments, ownerId);
    if (toolResult.action) latestAction = toolResult.action;
    input.push({ type: "function_call_output", call_id: toolCall.call_id, output: JSON.stringify(toolResult.output) });

    if (isPublishConfirmation(toolResult.action)) {
      return { response: null, action: toolResult.action, confirmation: publishConfirmationMessage(toolResult.action) };
    }
  }

  throw new PulsoError("El AI Agent necesitó demasiados pasos para completar la solicitud. Inténtalo con una instrucción más concreta.", 502);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const identity = await requireAdmin(request);
    const payload = await request.json().catch(() => { throw new PulsoError("Envía un objeto JSON válido."); }) as AgentRequest;
    const confirmedId = confirmedSurveyId(payload.confirmAction);

    if (confirmedId) {
      const result = await executeAgentTool("publishSurvey", JSON.stringify({ surveyId: confirmedId }), identity.email, true);
      const action = result.action as { title?: string } | null;
      return Response.json({ agent: "AI Agent", status: "active", message: `La encuesta${action?.title ? ` “${action.title}”` : ""} fue publicada correctamente.`, responseId: null, actions: actionList(result.action) });
    }

    const result = await runToolLoop(normalizeInput(payload), identity.email);
    if (result.confirmation || !result.response) return Response.json({ agent: "AI Agent", status: "active", message: result.confirmation || "Confirma la publicación de la encuesta.", responseId: null, actions: actionList(result.action) });
    return Response.json({ agent: "AI Agent", status: "active", message: responseMessage(result.response), responseId: typeof result.response.id === "string" ? result.response.id : null, actions: actionList(result.action) });
  } catch (error) {
    return apiError(error);
  }
}
