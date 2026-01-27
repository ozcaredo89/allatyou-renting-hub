import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// Listar usuarios activos
r.get("/", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// Crear usuario
r.post("/", async (req: Request, res: Response) => {
  const { full_name, document_number, phone } = req.body;
  if (!full_name || !document_number) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  const { data, error } = await supabase
    .from("app_users")
    .insert({ full_name, document_number, phone, status: "active" })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
});

export default r;