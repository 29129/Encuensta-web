import { audioFileExtension, baseAudioMimeType, MAX_AUDIO_BYTES, UPLOAD_AUDIO_MIME_TYPES } from "../../../../lib/agent/audio";
import { isVoiceFeatureEnabled } from "../../../../lib/agent/voice";
import { environmentValue } from "../../../../lib/env";
import { apiError, assertSameOrigin, requireAdmin } from "../../../../lib/http";
import { PulsoError } from "../../../../lib/surveys";

type OpenAITranscriptionResponse = {
  text?: unknown;
  error?: { message?: unknown; code?: unknown; type?: unknown };
};

type RateLimitEntry = { count: number; resetAt: number };

const TRANSCRIPTION_TIMEOUT_MS = 45_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 10;
const rateLimits = new Map<string, RateLimitEntry>();

function enforceRateLimit(identity: string): void {
  const now = Date.now();
  const current = rateLimits.get(identity);
  if (!current || current.resetAt <= now) {
    rateLimits.set(identity, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }
  if (current.count >= RATE_LIMIT_REQUESTS) throw new PulsoError("Espera un momento antes de enviar otra grabación.", 429);
  current.count += 1;
}

async function transcriptionFile(request: Request): Promise<File> {
  const formData = await request.formData().catch(() => { throw new PulsoError("No se pudo leer la grabación."); });
  const file = formData.get("file");
  if (!(file instanceof File)) throw new PulsoError("No se recibió una grabación válida.");
  if (file.size === 0) throw new PulsoError("La grabación está vacía.");
  if (file.size > MAX_AUDIO_BYTES) throw new PulsoError("La grabación supera el tamaño permitido de 4 MB.", 413);
  if (!UPLOAD_AUDIO_MIME_TYPES.has(baseAudioMimeType(file.type))) throw new PulsoError("El formato de la grabación no es compatible.", 415);
  return file;
}

export async function POST(request: Request) {
  try {
    if (!isVoiceFeatureEnabled()) throw new PulsoError("La entrada por voz está desactivada.", 404);
    assertSameOrigin(request);
    const identity = await requireAdmin(request);
    const file = await transcriptionFile(request);
    enforceRateLimit(identity.email);

    const apiKey = environmentValue("OPENAI_API_KEY");
    if (!apiKey) throw new PulsoError("La transcripción todavía no está configurada.", 503);

    const upstreamBody = new FormData();
    upstreamBody.append("file", file, `grabacion.${audioFileExtension(file.type)}`);
    upstreamBody.append("model", environmentValue("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe"));
    upstreamBody.append("language", "es");
    upstreamBody.append("response_format", "json");
    upstreamBody.append("prompt", "La persona dicta en español una solicitud para administrar encuestas en Pulso. Conserva la puntuación y los nombres propios.");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: upstreamBody,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new PulsoError("La transcripción tardó demasiado. Inténtalo nuevamente.", 504);
      throw new PulsoError("No se pudo conectar con el servicio de transcripción.", 503);
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => null) as OpenAITranscriptionResponse | null;
    if (!response.ok || !data) {
      const upstreamMessage = typeof data?.error?.message === "string" ? data.error.message.replace(/sk-[A-Za-z0-9_-]+/g, "[oculto]").slice(0, 240) : "sin detalles";
      console.error("AI Agent transcription error", { status: response.status, code: data?.error?.code, type: data?.error?.type, message: upstreamMessage });
      if (response.status === 401) throw new PulsoError("OpenAI rechazó la clave configurada para transcribir audio.", 502);
      if (response.status === 404) throw new PulsoError("El modelo de transcripción configurado no está disponible.", 502);
      if (response.status === 429) throw new PulsoError("Se alcanzó temporalmente el límite de transcripciones.", 429);
      if (response.status === 400) throw new PulsoError("OpenAI no pudo procesar esta grabación.", 422);
      throw new PulsoError("El servicio de transcripción no está disponible en este momento.", 502);
    }

    if (typeof data.text !== "string" || !data.text.trim()) throw new PulsoError("No se detectó una frase clara en la grabación.", 422);
    return Response.json({ success: true, text: data.text.trim(), language: "es" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
