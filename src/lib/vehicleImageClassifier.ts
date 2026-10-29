import { SchemaType } from "@google/generative-ai";
import { executeWithModel, geminiClient, openaiClient } from "./ai-registry";

export type VehiclePhotoKind = "exterior" | "interior" | "detail" | "general" | "other";

export interface ClassifiedPhoto {
  url: string;
  kind: VehiclePhotoKind;
  sub_tag: string; // "frente", "lateral", "trasera", "tres_cuartos", "tablero", "silleteria", "motor", "sin_clasificar", "otro"
  label: string; // Ej: "Exterior Frente", "Tablero y Mandos"
  is_vehicle: boolean;
  is_cover_worthy: boolean;
}

const CLASSIFICATION_PROMPT = `
Eres un perito experto en catalogación de vehículos. Analiza la imagen y clasifícala:
1. is_vehicle: true si la imagen muestra un vehículo real (exterior, cabina, tablero, silletería, motor, etc.) o parte de él. False si es una persona, selfie, paisaje sin auto, comprobante o contenido ajeno.
2. kind: "exterior" si muestra la carrocería externa, "interior" si muestra el habitáculo/cabina/tablero/sillas, "detail" si es un detalle como motor/rines/llantas, u "other" si no corresponde a un vehículo.
3. sub_tag: elige exactamente uno de: "tres_cuartos", "frente", "lateral", "trasera", "tablero", "silleteria", "motor", "otro".
4. is_cover_worthy: true si es una foto exterior nítida donde se aprecie el carro completo o tres cuartos, ideal como foto de portada de catálogo.
5. label: título descriptivo muy corto en español (2 a 4 palabras), ej: "Exterior Tres Cuartos", "Tablero y Mandos", "Lateral Completo", "Silletería Delantera".
`;

/**
 * Descarga una imagen desde URL a Buffer con timeout de seguridad
 */
async function fetchImageBuffer(url: string, timeoutMs = 7000): Promise<{ buffer: Buffer; mimeType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return {
      buffer: Buffer.from(arrayBuf),
      mimeType: contentType.split(";")[0]?.trim() || "image/jpeg",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Clasifica una foto usando Gemini 2.5 Flash (o GPT-4o-mini como fallback)
 */
export async function classifyVehiclePhoto(url: string): Promise<ClassifiedPhoto> {
  const fallback: ClassifiedPhoto = {
    url,
    kind: "general",
    sub_tag: "sin_clasificar",
    label: "Foto de Vehículo",
    is_vehicle: true,
    is_cover_worthy: false,
  };

  try {
    const { buffer, mimeType } = await fetchImageBuffer(url);

    // 1. Intentar con Gemini
    if (geminiClient) {
      try {
        return await executeWithModel("gemini-2.5-flash", async () => {
          const model = geminiClient!.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                  is_vehicle: { type: SchemaType.BOOLEAN },
                  kind: { type: SchemaType.STRING },
                  sub_tag: { type: SchemaType.STRING },
                  is_cover_worthy: { type: SchemaType.BOOLEAN },
                  label: { type: SchemaType.STRING },
                },
                required: ["is_vehicle", "kind", "sub_tag", "is_cover_worthy", "label"],
              },
            },
          });

          const result = await model.generateContent([
            CLASSIFICATION_PROMPT,
            { inlineData: { data: buffer.toString("base64"), mimeType } },
          ]);

          const data = JSON.parse(result.response.text());
          const validKinds = ["exterior", "interior", "detail", "other"];
          const kind = validKinds.includes(data.kind) ? data.kind : "exterior";

          return {
            url,
            kind,
            sub_tag: String(data.sub_tag || "otro"),
            label: String(data.label || "Foto de Vehículo"),
            is_vehicle: !!data.is_vehicle,
            is_cover_worthy: !!data.is_cover_worthy,
          };
        });
      } catch (geminiErr) {
        console.warn("⚠️ Gemini classification error:", geminiErr);
      }
    }

    // 2. Fallback con OpenAI GPT-4o-mini
    if (openaiClient) {
      try {
        return await executeWithModel("gpt-4o-mini", async () => {
          const base64 = buffer.toString("base64");
          const dataUrl = `data:${mimeType};base64,${base64}`;

          const response = await openaiClient!.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: CLASSIFICATION_PROMPT },
                  { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
                ],
              },
            ],
            response_format: { type: "json_object" },
            max_tokens: 200,
          });

          const raw = response.choices[0]?.message?.content || "{}";
          const data = JSON.parse(raw);
          const validKinds = ["exterior", "interior", "detail", "other"];
          const kind = validKinds.includes(data.kind) ? data.kind : "exterior";

          return {
            url,
            kind,
            sub_tag: String(data.sub_tag || "otro"),
            label: String(data.label || "Foto de Vehículo"),
            is_vehicle: data.is_vehicle ?? true,
            is_cover_worthy: data.is_cover_worthy ?? false,
          };
        });
      } catch (openAiErr) {
        console.warn("⚠️ OpenAI classification fallback error:", openAiErr);
      }
    }
  } catch (err) {
    console.warn("⚠️ Could not download or classify image:", url, err);
  }

  return fallback;
}

/**
 * Clasifica un lote de fotos en paralelo y retorna el arreglo etiquetado
 */
export async function classifyVehiclePhotos(
  photos: Array<{ url: string; kind?: string }>
): Promise<ClassifiedPhoto[]> {
  if (!photos || photos.length === 0) return [];

  const results = await Promise.allSettled(
    photos.map(p => classifyVehiclePhoto(p.url))
  );

  return results.map((res, i) => {
    if (res.status === "fulfilled") {
      return res.value;
    }
    const original = photos[i];
    return {
      url: original ? original.url : "",
      kind: "general" as const,
      sub_tag: "sin_clasificar",
      label: "Foto de Vehículo",
      is_vehicle: true,
      is_cover_worthy: i === 0,
    };
  });
}
