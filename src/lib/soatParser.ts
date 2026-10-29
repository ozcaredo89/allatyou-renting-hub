import { SchemaType } from "@google/generative-ai";
import { executeWithModel, geminiClient } from "./ai-registry";
import { normalizeOcrDate } from "./ocr";

export interface SoatParseResult {
  plate: string | null;
  start_date: string | null;
  expires_at: string | null;
  insurance_company: string | null;
  policy_number: string | null;
  error?: string;
}

const SOAT_PROMPT = `Analiza este documento oficial del Seguro Obligatorio de Accidentes de Tránsito (SOAT) de Colombia (en formato PDF o imagen) y extrae con máxima precisión la siguiente información en formato JSON:
- plate: Placa del vehículo (ejemplo: ABC123). Formato colombiano estándar de 3 letras y 3 números. O null si no se lee.
- start_date: Fecha de inicio de vigencia de la póliza en formato YYYY-MM-DD (ej: "2026-11-21"). O null si no aparece.
- expires_at: Fecha de fin de vigencia o vencimiento de la póliza en formato YYYY-MM-DD (ej: "2027-11-20"). Es la fecha hasta la cual el SOAT está activo. O null si no se lee.
- insurance_company: Nombre de la aseguradora (ej: "Seguros del Estado", "Seguros Bolívar", "Seguros Mundial", "La Previsora", "AXA Colpatria", "SURA"). O null.
- policy_number: Número del certificado o póliza del SOAT. O null si no se lee.

Responde ÚNICAMENTE con el objeto JSON estructurado según el esquema solicitado.`;

export async function parseSoatDocument(buffer: Buffer, mimeType: string): Promise<SoatParseResult> {
  if (!geminiClient) {
    return {
      plate: null,
      start_date: null,
      expires_at: null,
      insurance_company: null,
      policy_number: null,
      error: "Servicio de IA no configurado (GEMINI_API_KEY no encontrada).",
    };
  }

  try {
    return await executeWithModel("gemini-2.5-flash", async () => {
      const model = geminiClient!.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              plate: { type: SchemaType.STRING, description: "Placa del vehículo colombiano (ej: ABC123)", nullable: true },
              start_date: { type: SchemaType.STRING, description: "Fecha de inicio de vigencia YYYY-MM-DD", nullable: true },
              expires_at: { type: SchemaType.STRING, description: "Fecha de fin de vigencia o vencimiento YYYY-MM-DD", nullable: true },
              insurance_company: { type: SchemaType.STRING, description: "Aseguradora emisora", nullable: true },
              policy_number: { type: SchemaType.STRING, description: "Número de póliza o certificado", nullable: true },
            },
            required: ["expires_at"],
          },
        },
      });

      const result = await model.generateContent([
        SOAT_PROMPT,
        {
          inlineData: {
            data: buffer.toString("base64"),
            mimeType,
          },
        },
      ]);

      const text = result.response.text();
      const raw = JSON.parse(text || "{}");

      const cleanPlate = raw.plate ? String(raw.plate).toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
      const normalizedExpires = normalizeOcrDate(raw.expires_at);
      const normalizedStart = normalizeOcrDate(raw.start_date);

      return {
        plate: cleanPlate && /^[A-Z]{3}\d{3}$/.test(cleanPlate) ? cleanPlate : null,
        start_date: normalizedStart,
        expires_at: normalizedExpires,
        insurance_company: raw.insurance_company ? String(raw.insurance_company).trim() : null,
        policy_number: raw.policy_number ? String(raw.policy_number).trim() : null,
      };
    });
  } catch (err: any) {
    console.warn("⚠️ [SOAT Parser] Error analizando documento:", err?.message || err);
    return {
      plate: null,
      start_date: null,
      expires_at: null,
      insurance_company: null,
      policy_number: null,
      error: err?.message || "No se pudo interpretar el archivo automáticamente.",
    };
  }
}
