import { AGENT_TOOLS, executeAgentTool } from "../../../lib/agent/tools";
import { environmentValue } from "../../../lib/env";
import { apiError, assertSameOrigin, requireAdmin } from "../../../lib/http";
import { PulsoError } from "../../../lib/surveys";

type AgentTurn = { role: "user" | "assistant"; content: string };
type AgentRequest = { message?: unknown; messages?: unknown; confirmAction?: unknown };
type FunctionCall = { type: "function_call"; name: string; arguments: string; call_id: string };
type ResponsesApiResult = { id?: unknown; output_text?: unknown; output?: unknown[]; error?: { message?: unknown; code?: unknown; type?: unknown } };

const AGENT_INSTRUCTIONS = [
  "Eres AI Agent, el asistente administrativo de la plataforma Pulso.",
  "Ayuda a administradores a consultar, crear, editar, publicar y analizar sus encuestas en español claro.",
  "Usa herramientas para toda acción real; nunca afirmes haber hecho algo si una herramienta no lo confirmó.",
  "Antes de crear o editar, pregunta solo lo que falte y conserva los datos que ya estén definidos.",
  "Una encuesta nueva se crea como borrador. Si una herramienta devuelve requiresConfirmation, no digas que se publicó: pide confirmación explícita.",
  "Solo analiza datos devueltos por las herramientas y reconoce cuando no hay suficientes respuestas.",
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
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text.trim();

  const text = Array.isArray(response.output)
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
    : "";

  if (!text) throw new PulsoError("El AI Agent no pudo responder en este momento. Inténtalo nuevamente.", 502);
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

async function requestResponse(input: unknown, tools?: unknown): Promise<ResponsesApiResult> {
  const apiKey = environmentValue("OPENAI_API_KEY");
  if (!apiKey) throw new PulsoError("El AI Agent todavía no está configurado.", 503);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: environmentValue("OPENAI_MODEL", "gpt-5"), instructions: AGENT_INSTRUCTIONS, input, store: false, ...(tools ? { tools, parallel_tool_calls: false } : {}) }),
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

    const firstResponse = await requestResponse(normalizeInput(payload), AGENT_TOOLS);
    const functionCalls = getFunctionCalls(firstResponse);
    if (functionCalls.length === 0) return Response.json({ agent: "AI Agent", status: "active", message: responseMessage(firstResponse), responseId: typeof firstResponse.id === "string" ? firstResponse.id : null, actions: [] });
    if (functionCalls.length > 1 || !firstResponse.output) throw new PulsoError("El AI Agent solicitó más de una acción. Inténtalo nuevamente.", 502);

    const toolCall = functionCalls[0];
    const toolResult = await executeAgentTool(toolCall.name, toolCall.arguments, identity.email);
    const finalResponse = await requestResponse([...firstResponse.output, { type: "function_call_output", call_id: toolCall.call_id, output: JSON.stringify(toolResult.output) }]);
    return Response.json({ agent: "AI Agent", status: "active", message: responseMessage(finalResponse), responseId: typeof finalResponse.id === "string" ? finalResponse.id : null, actions: actionList(toolResult.action) });
  } catch (error) {
    return apiError(error);
  }
}
