import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { supabase } from "../lib/supabase";

const r = Router();

// ---------------------------------------------------------------------------
// GET /pledges
// Retorna la suma total de montos comprometidos y el conteo de registros.
// Usado por el frontend para alimentar la barra de progreso de la Vaki.
// ---------------------------------------------------------------------------
r.get("/", async (_req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("investment_pledges")
    .select("amount");

  if (error) return res.status(500).json({ error: error.message });

  const total = (data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const count = (data ?? []).length;

  res.json({ total, count });
});

// ---------------------------------------------------------------------------
// POST /pledges
// Registra una nueva expresión de interés de inversión.
// Valida campos obligatorios y el checkbox de aceptación de términos.
// ---------------------------------------------------------------------------
const pledgeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: "Demasiados intentos. Intenta de nuevo más tarde." },
  skip: (req) => req.method === "OPTIONS"
});

r.post("/", pledgeLimiter, async (req: Request, res: Response) => {
  const { name, document_id, phone, email, nequi_account, amount, accepted_terms } =
    req.body || {};

  // --- Validaciones básicas ---
  if (!name || typeof name !== "string" || name.trim().length < 3) {
    return res.status(400).json({ error: "Nombre completo es requerido (mínimo 3 caracteres)." });
  }
  if (!document_id || typeof document_id !== "string" || document_id.trim().length < 5) {
    return res.status(400).json({ error: "Número de cédula es requerido." });
  }
  if (!phone || typeof phone !== "string" || phone.trim().length < 7) {
    return res.status(400).json({ error: "Celular es requerido." });
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Correo electrónico inválido." });
  }
  if (!nequi_account || typeof nequi_account !== "string" || nequi_account.trim().length < 7) {
    return res.status(400).json({ error: "Número de cuenta Nequi es requerido." });
  }
  const parsedAmount = Number(amount);
  if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Monto inválido. Debe ser un número positivo." });
  }
  if (!accepted_terms) {
    return res.status(400).json({ error: "Debes aceptar los términos y la política de datos." });
  }

  // --- Inserción ---
  const { data, error } = await supabase
    .from("investment_pledges")
    .insert([{
      name:           name.trim(),
      document_id:    document_id.trim(),
      phone:          phone.trim(),
      email:          email.trim().toLowerCase(),
      nequi_account:  nequi_account.trim(),
      amount:         parsedAmount,
      accepted_terms: true,
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  res.status(201).json(data);
});

export default r;
