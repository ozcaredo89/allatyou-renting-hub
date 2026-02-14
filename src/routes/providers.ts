import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

/**
 * GET /providers
 * Lista todos los proveedores para el select del generador de cuentas.
 */
r.get("/", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("providers")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /providers
 * Crea un nuevo proveedor en el directorio.
 */
r.post("/", async (req: Request, res: Response) => {
  const body = req.body;
  
  try {
    // Validaciones mínimas
    if (!body.name || !body.nit_cc) {
      return res.status(400).json({ error: "Nombre y NIT/CC son obligatorios." });
    }

    const { data, error } = await supabase
      .from("providers")
      .insert({
        name: body.name.toUpperCase(),
        nit_cc: body.nit_cc,
        contact_phone: body.contact_phone || null,
        bank_name: body.bank_name || null,
        account_type: body.account_type || null,
        account_number: body.account_number || null,
        rut_url: body.rut_url || null
      })
      .select()
      .single();

    if (error) {
       // Manejo de duplicados si configuras unique constraint luego
       if (error.code === '23505') return res.status(409).json({ error: "Ya existe un proveedor con este NIT." });
       throw new Error(error.message);
    }

    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /providers/:id
 * Actualiza datos de un proveedor (ej: cambió de cuenta bancaria).
 */
r.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body;

  try {
    const { data, error } = await supabase
      .from("providers")
      .update({
        name: body.name?.toUpperCase(),
        nit_cc: body.nit_cc,
        contact_phone: body.contact_phone,
        bank_name: body.bank_name,
        account_type: body.account_type,
        account_number: body.account_number,
        rut_url: body.rut_url
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default r;