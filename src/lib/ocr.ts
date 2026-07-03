import { SchemaType } from "@google/generative-ai";
import { executeWithModel, geminiClient, openaiClient, deepseekClient, DailyQuotaExhaustedError } from "./ai-registry";

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface OCRResult {
  reference_number: string | null;
  provider_name: string | null;
  receipt_date: string | null;
  amount: number | null;
  status: "verified" | "suspicious_ocr_failed" | "timeout";
  ocr_provider?: "gemini" | "openai" | "deepseek";
  message?: string;
}

// ── Prompt compartido ─────────────────────────────────────────────────────────
const RECEIPT_PROMPT = `Analiza este comprobante de pago y extrae la información en formato JSON con exactamente estas claves:
reference_number, provider_name, receipt_date, amount.

Instrucciones estrictas:
- reference_number: Número de referencia, aprobación o ID de transacción alfanumérico. Null si no hay.
- provider_name: Nombre del banco o app (Nequi, Bancolombia, Daviplata, etc.). Null si no hay.
- receipt_date: Fecha del pago en formato YYYY-MM-DD. Convierte fechas como "21 de junio de 2026 a las 02:32 p. m." → "2026-06-21". Null si no hay.
- amount: Monto como número entero sin símbolos. "$ 70.000,00" → 70000. Null si no hay.

Responde SOLO con el JSON, sin markdown ni texto adicional.`;

// ── Normalización ─────────────────────────────────────────────────────────────
function normalizeRef(raw: any): string | null {
  return raw ? String(raw).trim().toUpperCase() : null;
}

function buildResult(data: any, provider: "gemini" | "openai" | "deepseek"): OCRResult {
  const rawRef = normalizeRef(data.reference_number);

  if (!rawRef || !data.amount) {
    return {
      reference_number: rawRef,
      provider_name: data.provider_name || null,
      receipt_date: data.receipt_date || null,
      amount: data.amount || null,
      status: "suspicious_ocr_failed",
      ocr_provider: provider,
      message: "No se detectó un número de referencia o monto claro en la imagen.",
    };
  }

  return {
    reference_number: rawRef,
    provider_name: data.provider_name || null,
    receipt_date: data.receipt_date || null,
    amount: Number(data.amount),
    status: "verified",
    ocr_provider: provider,
    message: "Comprobante procesado exitosamente.",
  };
}

// ── Proveedor 1: Gemini ───────────────────────────────────────────────────────
async function parseWithGemini(buffer: Buffer, mimeType: string): Promise<OCRResult> {
  if (!geminiClient) throw new Error("GEMINI_API_KEY no configurado");

  return executeWithModel("gemini-2.0-flash-lite", async () => {
    const model = geminiClient!.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            reference_number: { type: SchemaType.STRING, description: "Número de referencia alfanumérico." },
            provider_name:    { type: SchemaType.STRING, description: "Banco o app de pago." },
            receipt_date:     { type: SchemaType.STRING, description: "Fecha en formato YYYY-MM-DD." },
            amount:           { type: SchemaType.NUMBER, description: "Monto entero sin símbolos. '$ 70.000,00' → 70000." },
          },
          required: ["reference_number", "provider_name", "receipt_date", "amount"],
        },
      },
    });

    const result = await model.generateContent([
      RECEIPT_PROMPT,
      { inlineData: { data: buffer.toString("base64"), mimeType } },
    ]);

    const data = JSON.parse(result.response.text());
    return buildResult(data, "gemini");
  });
}

// ── Proveedor 2: OpenAI GPT-4o-mini ──────────────────────────────────────────
async function parseWithOpenAI(buffer: Buffer, mimeType: string): Promise<OCRResult> {
  if (!openaiClient) throw new Error("OPENAI_API_KEY no configurado");

  return executeWithModel("gpt-4o-mini", async () => {
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const response = await openaiClient!.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: RECEIPT_PROMPT },
            { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const data = JSON.parse(raw);
    return buildResult(data, "openai");
  });
}

// ── Proveedor 3: DeepSeek (fallback final, omitido si devuelve 400 por falta de visión) ──
async function parseWithDeepSeek(buffer: Buffer, mimeType: string): Promise<OCRResult> {
  if (!deepseekClient) throw new Error("DEEPSEEK_API_KEY no configurado");

  return executeWithModel("deepseek-v4-flash", async () => {
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const response = await deepseekClient!.chat.completions.create({
      model: "deepseek-v4-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: RECEIPT_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const data = JSON.parse(raw);
    return buildResult(data, "deepseek");
  });
}

// ── Función pública: parseReceipt (Gemini → OpenAI → DeepSeek) ──────────────
export async function parseReceipt(buffer: Buffer, mimeType: string): Promise<OCRResult> {
  const TIMEOUT_MS = 6000; // Increased to 6s to give rate limiter time to wait

  const timeoutResult: OCRResult = {
    reference_number: null,
    provider_name: null,
    receipt_date: null,
    amount: null,
    status: "timeout",
    message: "Timeout al procesar la imagen con OCR.",
  };

  async function tryProvider(
    name: string,
    fn: () => Promise<OCRResult>
  ): Promise<{ result: OCRResult | null; shouldFallback: boolean }> {
    try {
      const timeoutPromise = new Promise<OCRResult>(resolve =>
        setTimeout(() => resolve(timeoutResult), TIMEOUT_MS)
      );
      const result = await Promise.race([fn(), timeoutPromise]);
      if (result.status === "timeout") {
        console.warn(`⚠️  ${name} timeout, probando siguiente proveedor...`);
        return { result: null, shouldFallback: true };
      }
      console.log(`✅ OCR via ${name}`);
      return { result, shouldFallback: false };
    } catch (err: any) {
      if (err instanceof DailyQuotaExhaustedError) {
        console.warn(`⚠️  ${name}: cuota diaria agotada, probando siguiente proveedor...`);
        return { result: null, shouldFallback: true };
      }

      const status = err?.status || 0;
      const msg: string = err?.message || "";
      const is400 = status === 400; // Visión no soportada (ej. DeepSeek)

      if (is400) {
        console.warn(`⚠️  ${name}: visión no disponible aún (400), probando siguiente proveedor...`);
      } else {
        console.error(`❌ ${name} error:`, msg);
      }
      return { result: null, shouldFallback: true };
    }
  }

  // 1. Gemini
  if (geminiClient) {
    const { result, shouldFallback } = await tryProvider(
      "Gemini",
      () => parseWithGemini(buffer, mimeType)
    );
    if (!shouldFallback && result) return result;
  }

  // 2. OpenAI GPT-4o-mini
  if (openaiClient) {
    const { result, shouldFallback } = await tryProvider(
      "OpenAI GPT-4o-mini",
      () => parseWithOpenAI(buffer, mimeType)
    );
    if (!shouldFallback && result) return result;
  }

  // 3. DeepSeek (activo cuando tenga visión disponible)
  if (deepseekClient) {
    const { result, shouldFallback } = await tryProvider(
      "DeepSeek",
      () => parseWithDeepSeek(buffer, mimeType)
    );
    if (!shouldFallback && result) return result;
  }

  // Sin proveedores disponibles
  return {
    reference_number: null,
    provider_name: null,
    receipt_date: null,
    amount: null,
    status: "suspicious_ocr_failed",
    message: "Ningún proveedor de OCR disponible (Gemini / OpenAI / DeepSeek).",
  };
}
