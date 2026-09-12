import { createHash } from "crypto";
import { SchemaType } from "@google/generative-ai";
import { executeWithModel, geminiClient, openaiClient, deepseekClient, DailyQuotaExhaustedError } from "./ai-registry";
import { NO_DRIVER_IMAGE_HASHES } from "./knownReceiptTemplates";

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface OCRResult {
  reference_number: string | null;
  provider_name: string | null;
  receipt_date: string | null;
  amount: number | null;
  // "no_driver_image" agregado para detectar plantilla "VEHÍCULO SIN CONDUCTOR"
  status: "verified" | "suspicious_ocr_failed" | "timeout" | "no_driver_image";
  ocr_provider?: "gemini" | "openai" | "deepseek" | "hash";
  message?: string;
}

// ── Detección por hash (Capa 1, costo cero) ───────────────────────────────────
function isKnownNoDriverImageByHash(buffer: Buffer): boolean {
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  return NO_DRIVER_IMAGE_HASHES.includes(sha256);
}

// ── Prompt compartido ─────────────────────────────────────────────────────────
const RECEIPT_PROMPT = `Analiza este comprobante de pago colombiano (Nequi, Bancolombia, Daviplata, etc.) y extrae la información en formato JSON con exactamente estas claves:
reference_number, provider_name, receipt_date, amount, is_no_driver.

Instrucciones estrictas:
- reference_number: SOLO el número que identifica la TRANSACCIÓN — el campo etiquetado como "Referencia", "Número de aprobación", "Número de operación" o "Comprobante No.". Este número es DIFERENTE en cada comprobante, incluso entre pagos al mismo destinatario.
  ⚠️ NUNCA uses el "Número de cuenta" / "Cuenta destino", el número de celular ni el número de documento del destinatario como reference_number: esos valores son FIJOS (se repiten en todos los comprobantes hacia el mismo destinatario) y confundirlos con la referencia causa falsos positivos de "pago duplicado". Si el comprobante no muestra un campo de referencia/aprobación claramente distinto de la cuenta destino, responde null.
- provider_name: Nombre del banco o app (Nequi, Bancolombia, Daviplata, etc.). Null si no hay.
- receipt_date: Fecha del pago en formato YYYY-MM-DD. Convierte fechas como "21 de junio de 2026 a las 02:32 p. m." → "2026-06-21". Null si no hay.
- amount: Monto como número entero sin símbolos. "$ 70.000,00" → 70000. Null si no hay.
- is_no_driver: true si la imagen contiene el texto "VEHÍCULO SIN CONDUCTOR" o indica que el vehículo no tiene conductor asignado. false en cualquier otro caso (comprobante normal).

Responde SOLO con el JSON, sin markdown ni texto adicional.`;

// ── Normalización ─────────────────────────────────────────────────────────────
function normalizeRef(raw: any): string | null {
  return raw ? String(raw).trim().toUpperCase() : null;
}

function buildResult(data: any, provider: "gemini" | "openai" | "deepseek"): OCRResult {
  // Si la IA detectó que es imagen de "VEHÍCULO SIN CONDUCTOR", retornamos inmediatamente
  if (data.is_no_driver === true) {
    return {
      reference_number: null,
      provider_name: null,
      receipt_date: null,
      amount: null,
      status: "no_driver_image",
      ocr_provider: provider,
      message: "La imagen indica que el vehículo no tiene conductor asignado.",
    };
  }

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
            is_no_driver:     { type: SchemaType.BOOLEAN, description: "true si la imagen dice VEHÍCULO SIN CONDUCTOR o indica que el vehículo no tiene conductor." },
          },
          required: ["reference_number", "provider_name", "receipt_date", "amount", "is_no_driver"],
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

// ── Función pública: parseReceipt (Hash → Gemini → OpenAI → DeepSeek) ────────
export async function parseReceipt(buffer: Buffer, mimeType: string): Promise<OCRResult> {
  // Capa 1: detección por hash (instantánea, sin costo de IA)
  if (isKnownNoDriverImageByHash(buffer)) {
    console.log("⚡ Hash match: imagen de VEHÍCULO SIN CONDUCTOR detectada sin IA.");
    return {
      reference_number: null,
      provider_name: null,
      receipt_date: null,
      amount: null,
      status: "no_driver_image",
      ocr_provider: "hash",
      message: "La imagen indica que el vehículo no tiene conductor asignado.",
    };
  }

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

  // 2. Gemini
  if (geminiClient) {
    const { result, shouldFallback } = await tryProvider(
      "Gemini",
      () => parseWithGemini(buffer, mimeType)
    );
    if (!shouldFallback && result) return result;
  }

  // 3. OpenAI GPT-4o-mini
  if (openaiClient) {
    const { result, shouldFallback } = await tryProvider(
      "OpenAI GPT-4o-mini",
      () => parseWithOpenAI(buffer, mimeType)
    );
    if (!shouldFallback && result) return result;
  }

  // 4. DeepSeek (activo cuando tenga visión disponible)
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
