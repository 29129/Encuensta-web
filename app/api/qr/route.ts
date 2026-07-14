import QRCode from "qrcode";
import { PulsoError } from "../../../lib/surveys";
import { apiError } from "../../../lib/http";

export async function GET(request: Request) {
  try {
    const value = new URL(request.url).searchParams.get("data")?.trim() ?? "";
    if (!value || value.length > 2048) throw new PulsoError("Enlace no válido.");
    const svg = await QRCode.toString(value, { type: "svg", margin: 2, width: 360, color: { dark: "#10261f", light: "#ffffff" }, errorCorrectionLevel: "M" });
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}
