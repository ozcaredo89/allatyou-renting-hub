import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import dotenv from "dotenv";
import { aiRateLimiter } from "./ai-rate-limiter";

dotenv.config();

export type ProviderId = "gemini" | "openai" | "deepseek";

export interface AIModelConfig {
  id: string; // Nombre literal del modelo (ej. "gemini-2.0-flash-lite")
  provider: ProviderId;
  rpmLimit: number; // 0 para sin límite, de lo contrario RPM en el tier actual
  capabilities: {
    vision: boolean;
  };
}

export const MODELS: Record<string, AIModelConfig> = {
  // Free tier Gemini (vision)
  "gemini-2.0-flash-lite": { id: "gemini-2.0-flash-lite", provider: "gemini", rpmLimit: 30, capabilities: { vision: true } },
  "gemini-2.5-flash": { id: "gemini-2.5-flash", provider: "gemini", rpmLimit: 5, capabilities: { vision: true } },
  
  // Pago OpenAI (vision) - límite alto
  "gpt-4o-mini": { id: "gpt-4o-mini", provider: "openai", rpmLimit: 500, capabilities: { vision: true } },
  
  // DeepSeek (sin vision por ahora)
  "deepseek-v4-flash": { id: "deepseek-v4-flash", provider: "deepseek", rpmLimit: 60, capabilities: { vision: false } },
};

// Singleton clients compartidos
export const geminiClient = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
export const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
export const deepseekClient = process.env.DEEPSEEK_API_KEY ? new OpenAI({ baseURL: "https://api.deepseek.com", apiKey: process.env.DEEPSEEK_API_KEY }) : null;

export class DailyQuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyQuotaExhaustedError";
  }
}

/**
 * Ejecuta una tarea contra un modelo de IA, aplicando rate limits
 * y reintentos (backoff) automáticos.
 */
export async function executeWithModel<T>(
  modelName: string,
  task: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  const modelConfig = MODELS[modelName];
  if (!modelConfig) throw new Error(`Model ${modelName} not configured`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Adquirir permiso de velocidad (RPM)
      await aiRateLimiter.acquire(modelName, modelConfig.rpmLimit);
      
      // 2. Ejecutar la tarea real
      return await task();
    } catch (err: any) {
      const msg = err?.message || "";
      const isDaily = msg.includes("PerDay") || 
                      (msg.includes("quota") && msg.includes("limit: 0")) || 
                      (msg.includes("429") && msg.includes("exceeded your current quota")) ||
                      msg.includes("DAILY_QUOTA_EXHAUSTED");

      // Si es cuota diaria, reportamos y abortamos los reintentos
      if (isDaily) {
        aiRateLimiter.reportDailyExhausted(modelName);
        throw new DailyQuotaExhaustedError(`Cuota diaria agotada para el modelo ${modelName}`);
      }

      const status = err?.status || 0;
      const is429 = status === 429 || msg.includes("429") || msg.includes("RateLimit");
      
      // Si es 429 por velocidad que se saltó el limiter, esperamos según el header si existe
      if (is429 && attempt < maxRetries) {
        let waitMs = 15000;
        const delayMatch = msg.match(/(\d+(?:\.\d+)?)s/);
        if (delayMatch) {
          waitMs = Math.ceil(parseFloat(delayMatch[1]!) * 1000) + 2000;
        }
        console.warn(`⚠️ Rate limit excedido en ${modelName} (intento ${attempt}). Esperando ${Math.round(waitMs/1000)}s...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      
      // Para cualquier otro error (incluyendo 400 visión no soportada), lanzar y dejar que el fallback decida
      throw err;
    }
  }
  
  throw new Error(`Fallo tras ${maxRetries} intentos en ${modelName}`);
}
