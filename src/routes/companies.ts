import { Router, Request, Response } from "express";
import crypto from "crypto";
import { supabase } from "../lib/supabase";
import { sendEmail } from "../lib/email";
import { sendWhatsApp } from "../lib/whatsapp";

const r = Router();

// Generar un código aleatorio de 6 dígitos de forma segura
const generateCode = () => crypto.randomInt(100000, 1000000).toString();

/**
 * GET /companies
 * Lista las empresas disponibles con sus datos fiscales para cuentas de cobro.
 */
r.get("/", async (req: Request, res: Response) => {
  // --- CAMBIO AQUÍ: Agregamos nit, address, phone al select ---
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, nit, address, phone") 
    .order("name");

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

/**
 * POST /companies/auth/request
 * Genera un código, lo guarda y lo envía al dueño de la empresa.
 */
r.post("/auth/request", async (req: Request, res: Response) => {
  const { companyId } = req.body;

  try {
    // 1. Buscar datos de contacto de la empresa
    const { data: company, error: cErr } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (cErr || !company) return res.status(404).json({ error: "Empresa no encontrada" });

    // 2. Generar código y expiración (10 minutos para usarlo)
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // 3. Guardar en BD
    const { error: insErr } = await supabase
      .from("verification_codes")
      .insert({ company_id: companyId, code, expires_at: expiresAt });

    if (insErr) throw new Error(insErr.message);

    // 4. Enviar por ambos canales (Fuego y olvido para no bloquear response)
    const message = `🔐 Tu código de seguridad para ${company.name} es: *${code}*. Válido por 10 minutos.`;
    
    // Enviar WhatsApp
    sendWhatsApp({ to: company.auth_phone, body: message }).catch(e => console.error("WA Error:", e));
    
    // Enviar Email
    sendEmail({
      to: company.auth_email,
      subject: `Código de Seguridad - ${company.name}`,
      text: `Hola,\n\nTu código de acceso es: ${code}\n\nSi no solicitaste esto, ignora este mensaje.`
    }).catch(e => console.error("Email Error:", e));

    return res.json({ success: true, message: "Código enviado" });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /companies/auth/verify
 * Valida el código ingresado.
 */
r.post("/auth/verify", async (req: Request, res: Response) => {
  const { companyId, code } = req.body;

  try {
    // Buscar código válido, no usado y no expirado
    const { data, error } = await supabase
      .from("verification_codes")
      .select("*")
      .eq("company_id", companyId)
      .eq("code", code)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString()) // Que no haya expirado
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.status(401).json({ error: "Código inválido o expirado" });
    }

    // Marcar como usado (para que no se pueda reusar)
    await supabase
      .from("verification_codes")
      .update({ used: true })
      .eq("id", data.id);

    // Retornar éxito (El frontend manejará la sesión de 30 mins)
    return res.json({ success: true });

  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default r;