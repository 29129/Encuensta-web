export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_AUDIO_DURATION_SECONDS = 60;
export const AUDIO_BITS_PER_SECOND = 64_000;

export const RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

export const UPLOAD_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "video/webm",
  "audio/mp4",
  "video/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/m4a",
  "audio/x-m4a",
]);

export function baseAudioMimeType(value: string): string {
  return value.split(";", 1)[0].trim().toLowerCase();
}

export function audioFileExtension(mimeType: string): "m4a" | "mp3" | "mp4" | "wav" | "webm" {
  const mime = baseAudioMimeType(mimeType);
  if (mime.includes("webm")) return "webm";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("m4a")) return "m4a";
  return "mp4";
}
