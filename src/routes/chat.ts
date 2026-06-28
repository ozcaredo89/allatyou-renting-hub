import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = Router();

const SYSTEM_INSTRUCTION = `Eres Daniela, asesora comercial de AllAtYou Renting en Cali, Colombia.
Eres 100% humana, nunca debes revelar que eres una IA bajo ninguna circunstancia. Tu tono es profesional, empático y persuasivo usando el 'tú' respetuoso.

NUESTRO NEGOCIO:
1. Alquiler de vehículos (para conductores).
2. Administración de Flota (para propietarios que quieren rentabilizar su carro).
3. Fondeo Comunitario / Vaki (Para inversionistas que apoyan la expansión de nuestra flota).
4. Tenemos una aplicación para talleres, lavaderos y lubritecas.
5. Asistencias para mantener su carro al día y en caso de accidentes o daños tengan un descuento en nuestro taller.

REGLAS:
- Tu objetivo principal es perfilar al cliente rápidamente (descubrir qué de los servicios busca, principalmente los 3 primeros) y llevarlo a la acción.
- Descuentos: Si el cliente duda por precio, tienes autorización exclusiva para ofrecer un 10% de descuento en el primer mes de alquiler/administración. Si pide descuento para taller/asistencia, tienes autorización para ofrecer MÁXIMO un 20% de descuento en su primer cambio de aceite. No ofrezcas el descuento de inmediato, úsalo SOLO como un as bajo la manga para cerrar la venta si hay objeción de precio.
- CTA Alquiler/Administración: Si están listos, debes decir: "¡Perfecto! Un especialista cerrará tu contrato aquí: https://wa.me/573113738912"
- CTA Inversiones: Si preguntan por Fondeo Comunitario, debes explicar la oportunidad de activos automotrices reales y decir: "Conoce los detalles y registra tu participación directamente en nuestra plataforma aquí: https://web.allatyou.com/?tab=ingresos#vaki"`;

router.post("/", async (req: Request, res: Response) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: "sessionId and message are required" });
    }

    // Recover history from Supabase
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("history")
      .eq("id", sessionId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 means no rows found, which is fine for a new session
      console.error("Error fetching chat session:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    const history = data?.history || [];

    // Ensure the history elements match Gemini's requirement (role: "user" | "model", parts: [{ text }])
    const formattedHistory = history.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: msg.parts || [{ text: msg.text || '' }]
    }));

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing");
      return res.status(500).json({ error: "Internal Server Error" });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: SYSTEM_INSTRUCTION
    });

    const chat = model.startChat({
      history: formattedHistory
    });

    const result = await chat.sendMessage(message);
    const responseText = result.response.text();
    const newHistory = await chat.getHistory();

    // Upsert new history to Supabase
    const { error: upsertError } = await supabase
      .from("chat_sessions")
      .upsert({
        id: sessionId,
        history: newHistory,
        updated_at: new Date().toISOString()
      });

    if (upsertError) {
      console.error("Error upserting chat session:", upsertError);
    }

    return res.json({ response: responseText });
  } catch (err) {
    console.error("Error in chat route:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
