"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_BITS_PER_SECOND, audioFileExtension, MAX_AUDIO_BYTES, MAX_AUDIO_DURATION_SECONDS, RECORDING_MIME_TYPES } from "../../../lib/agent/audio";

export type VoiceRecorderState = "idle" | "requesting" | "recording" | "transcribing" | "ready" | "error";

type TranscriptionResponse = {
  success?: boolean;
  text?: string;
  error?: string | { message?: string };
};

function supportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return RECORDING_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function microphoneErrorMessage(error: unknown): string {
  if (!(error instanceof DOMException)) return "No se pudo iniciar el micrófono.";
  if (error.name === "NotAllowedError" || error.name === "SecurityError") return "No se concedió permiso para usar el micrófono.";
  if (error.name === "NotFoundError") return "No se encontró un micrófono disponible.";
  if (error.name === "NotReadableError" || error.name === "AbortError") return "El micrófono está ocupado o no pudo iniciarse.";
  return "No se pudo iniciar el micrófono.";
}

function responseError(data: TranscriptionResponse): string {
  if (typeof data.error === "string") return data.error;
  return data.error?.message || "No se pudo transcribir la grabación.";
}

export function formatRecordingDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function useVoiceRecorder({ disabled, onTranscription }: { disabled: boolean; onTranscription: (text: string) => void }) {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (limitRef.current) clearTimeout(limitRef.current);
    timerRef.current = null;
    limitRef.current = null;
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const transcribe = useCallback(async (blob: Blob) => {
    if (!mountedRef.current) return;
    if (blob.size === 0) {
      setState("error");
      setMessage("La grabación quedó vacía. Inténtalo nuevamente.");
      return;
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      setState("error");
      setMessage("La grabación es demasiado grande. Intenta una más corta.");
      return;
    }

    setState("transcribing");
    setMessage("Convirtiendo tu voz en texto…");
    const formData = new FormData();
    formData.append("file", blob, `grabacion.${audioFileExtension(blob.type)}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      const response = await fetch("/api/agent/transcription", { method: "POST", body: formData, signal: controller.signal, cache: "no-store" });
      const data = await response.json().catch(() => ({})) as TranscriptionResponse;
      if (!response.ok || !data.success || typeof data.text !== "string" || !data.text.trim()) throw new Error(responseError(data));
      if (!mountedRef.current) return;
      onTranscription(data.text.trim());
      setState("ready");
      setMessage("Transcripción lista. Revísala antes de enviarla.");
    } catch (error) {
      if (!mountedRef.current) return;
      setState("error");
      setMessage(error instanceof DOMException && error.name === "AbortError" ? "La transcripción tardó demasiado. Inténtalo nuevamente." : error instanceof Error ? error.message : "No se pudo transcribir la grabación.");
    } finally {
      clearTimeout(timeout);
    }
  }, [onTranscription]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    clearTimers();
    setState("transcribing");
    setMessage("Preparando la grabación…");
    recorder.stop();
  }, [clearTimers]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    clearTimers();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else releaseStream();
    if (mountedRef.current) {
      setState("idle");
      setSeconds(0);
      setMessage("Grabación cancelada.");
    }
  }, [clearTimers, releaseStream]);

  const start = useCallback(async () => {
    if (disabled || state === "requesting" || state === "recording" || state === "transcribing") return;
    if (!window.isSecureContext) {
      setState("error");
      setMessage("El micrófono necesita una conexión HTTPS segura.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setState("error");
      setMessage("Este navegador no permite grabar audio.");
      return;
    }
    const mimeType = supportedMimeType();
    if (!mimeType) {
      setState("error");
      setMessage("Este navegador no ofrece un formato de audio compatible.");
      return;
    }

    setState("requesting");
    setMessage("Esperando permiso para usar el micrófono…");
    setSeconds(0);
    cancelledRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        cancelledRef.current = true;
        clearTimers();
        releaseStream();
        if (mountedRef.current) {
          setState("error");
          setMessage("La grabación se interrumpió inesperadamente.");
        }
      };
      recorder.onstop = () => {
        clearTimers();
        releaseStream();
        recorderRef.current = null;
        if (cancelledRef.current || !mountedRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
        chunksRef.current = [];
        void transcribe(blob);
      };

      recorder.start(250);
      const startedAt = Date.now();
      setState("recording");
      setMessage("Grabando. Habla con claridad y detén cuando termines.");
      timerRef.current = setInterval(() => setSeconds(Math.min(MAX_AUDIO_DURATION_SECONDS, Math.floor((Date.now() - startedAt) / 1000))), 250);
      limitRef.current = setTimeout(() => {
        if (recorder.state !== "inactive") recorder.stop();
      }, MAX_AUDIO_DURATION_SECONDS * 1000);
    } catch (error) {
      releaseStream();
      if (!mountedRef.current) return;
      setState("error");
      setMessage(microphoneErrorMessage(error));
    }
  }, [clearTimers, disabled, releaseStream, state, transcribe]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      releaseStream();
    };
  }, [clearTimers, releaseStream]);

  const busy = state === "requesting" || state === "recording" || state === "transcribing";
  return { state, seconds, message, busy, start, stop, cancel };
}
