import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// POST /marketing/quiz-lead
r.post("/quiz-lead", async (req: Request, res: Response) => {
  const { full_name, phone, answers } = req.body;

  if (!full_name || !phone) {
    return res.status(400).json({ error: "Nombre y teléfono obligatorios" });
  }

  try {
    const { error } = await supabase
      .from("marketing_leads")
      .insert({
        full_name,
        phone,
        answers // Guardamos el objeto { q1: true, q2: true, ... }
      });

    if (error) throw new Error(error.message);

    return res.json({ success: true });
  } catch (err: any) {
    console.error("Error guardando lead:", err.message);
    return res.status(500).json({ error: "Error interno guardando contacto" });
  }
});

export default r;