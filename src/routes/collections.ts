import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

// Helper para obtener fecha/hora Colombia
const getColTime = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  
  // Hack rápido para parsear partes
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  
  const yyyy = get("year");
  const mm = get("month");
  const dd = get("day");
  const hh = parseInt(get("hour") || "0", 10);
  const min = parseInt(get("minute") || "0", 10);

  return {
    dateStr: `${yyyy}-${mm}-${dd}`, // YYYY-MM-DD
    hour: hh,
    minute: min,
  };
};

/**
 * GET /collections/pending
 * Devuelve la lista de conductores para notificar hoy.
 * Regla: Hora > 15:45 (3:45 PM) -> DESHABILITADA TEMPORALMENTE
 */
r.get("/pending", async (req: Request, res: Response) => {
  try {
    const { dateStr, hour, minute } = getColTime();
    const force = req.query.force === "true"; // Backdoor para pruebas

    // 1. Validación de Hora (3:45 PM)
    // --- BLOQUEO SUSPENDIDO PARA PERMITIR GESTIÓN A CUALQUIER HORA ---
    /*
    if (!force) {
      if (hour < 15 || (hour === 15 && minute < 45)) {
        return res.json({
          locked: true,
          message: "El módulo de cobranza se habilita a las 3:45 PM.",
          serverTime: `${hour}:${minute}`
        });
      }
    }
    */

    // 2. Obtener morosos (Reusando la vista vehicle_last_payment)
    // Buscamos solo los que tienen is_overdue = true
    const { data: morosos, error: errMora } = await supabase
      .from("vehicle_last_payment")
      .select("*")
      .eq("is_overdue", true);

    if (errMora) throw new Error(errMora.message);

    // 3. Obtener notificados hoy (Para excluirlos)
    const { data: notificados, error: errNotif } = await supabase
      .from("payment_notifications")
      .select("vehicle_plate")
      .eq("generated_date", dateStr); // Solo hoy

    if (errNotif) throw new Error(errNotif.message);

    // Crear Set de placas ya notificadas para búsqueda rápida O(1)
    const notificadosSet = new Set(notificados?.map(n => n.vehicle_plate) || []);

    // 4. Filtrar y buscar datos adicionales (Teléfono conductor)
    const pendingList = [];

    // Usamos un bucle for-of para poder usar await dentro (consultas secuenciales)
    // Podría optimizarse con Promise.all si la lista crece mucho.
    if (morosos && morosos.length > 0) {
        for (const item of morosos) {
          // Si ya se notificó hoy, saltar
          if (notificadosSet.has(item.plate)) continue;

          // Buscar teléfono real del conductor actual (Prioridad Driver > Vehicle)
          let phone = null;
          let driverId = null;
          let ownerName = item.driver_name; // Default de la vista

          // Buscar en tabla vehicles para sacar el driver_id actual
          const { data: v } = await supabase
            .from("vehicles")
            .select("current_driver_id, owner_whatsapp, company_id")
            .eq("plate", item.plate)
            .single();

          if (v) {
            // Aquí podrías filtrar por company_id si lo recibes en el query

            if (v.current_driver_id) {
              driverId = v.current_driver_id;
              const { data: d } = await supabase
                .from("drivers")
                .select("phone, full_name")
                .eq("id", driverId)
                .single();
              
              if (d) {
                  if (d.phone) phone = d.phone;
                  if (d.full_name) ownerName = d.full_name; // Actualizamos nombre si tenemos el driver real
              }
            }
            
            // Fallback al whatsapp del dueño del vehículo si no hay conductor o no tiene tel
            if (!phone && v.owner_whatsapp) phone = v.owner_whatsapp;
          }

          // Calcular monto real: tarifa base 70,000 + cuotas de préstamos
          let dailyDebt = 70000;
          const { data: advances } = await supabase
            .from("operational_advances")
            .select("daily_installment")
            .eq("plate", item.plate)
            .eq("status", "active");

          if (advances && advances.length > 0) {
            for (const adv of advances) {
              if (adv.daily_installment) {
                dailyDebt += Number(adv.daily_installment);
              }
            }
          }

          const totalDebt = dailyDebt * item.days_since;

          pendingList.push({
            plate: item.plate,
            owner_name: ownerName,
            driver_id: driverId,
            contact_phone: phone,
            days_overdue: item.days_since,
            amount: totalDebt 
          });
        }
    }

    return res.json({
      locked: false, // Siempre desbloqueado
      items: pendingList
    });

  } catch (err: any) {
    console.error("Error en pending:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /collections/send
 * Registra que se dio click en "Enviar" y saca al conductor de la lista pendiente.
 */
r.post("/send", async (req: Request, res: Response) => {
  const { 
    vehicle_plate, 
    driver_id, 
    sent_by_user_id, 
    days_overdue, 
    message_snapshot 
  } = req.body;

  const { dateStr } = getColTime();

  try {
    // Insertar registro
    const { error } = await supabase
      .from("payment_notifications")
      .insert({
        vehicle_plate,
        driver_id,
        sent_by_user_id,
        days_overdue,
        message_snapshot,
        generated_date: dateStr,
        resend_count: 0
      });

    if (error) throw new Error(error.message);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /collections/history
 * Muestra lo enviado hoy (para reenviar o auditar).
 */
r.get("/history", async (req: Request, res: Response) => {
  try {
    // Si envían fecha por query, la usamos. Si no, usamos la de hoy.
    const queryDate = req.query.date as string;
    const { dateStr } = getColTime();
    const targetDate = queryDate || dateStr;

    // Nota: La relacion "vehicle:vehicles!vehicle_plate" asume que tienes FK o relacion configurada en Supabase
    // Si no existe, fallará. Asegúrate de que las FKs existan o ajusta el select.
    const { data, error } = await supabase
      .from("payment_notifications")
      .select(`
        *,
        sender:app_users!sent_by_user_id(full_name),
        vehicle:vehicles!vehicle_plate(owner_name, owner_whatsapp),
        driver:drivers!driver_id(phone)
      `)
      .eq("generated_date", targetDate)
      .order("sent_at", { ascending: false });

    if (error) throw new Error(error.message);

    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /collections/resend/:id
 * Incrementa el contador de reenvío.
 */
r.post("/resend/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { data: current } = await supabase
      .from("payment_notifications")
      .select("resend_count")
      .eq("id", id)
      .single();
    
    if (current) {
      await supabase
        .from("payment_notifications")
        .update({ resend_count: (current.resend_count || 0) + 1 })
        .eq("id", id);
    }
    
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint para traer plantillas de una empresa
r.get("/templates", async (req: Request, res: Response) => {
  const companyId = req.query.companyId as string;
  if (!companyId) return res.status(400).json({ error: "companyId es requerido" });

  const { data, error } = await supabase
    .from("reminder_templates")
    .select("*")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false })
    .order("id", { ascending: true });
  
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
});

// Endpoint para crear plantilla
r.post("/templates", async (req: Request, res: Response) => {
  const { company_id, template_name, message_body, is_default } = req.body;
  
  if (!company_id || !template_name || !message_body) {
    return res.status(400).json({ error: "company_id, template_name y message_body son requeridos" });
  }

  try {
    if (is_default) {
      await supabase.from("reminder_templates").update({ is_default: false }).eq("company_id", company_id);
    }

    const { data, error } = await supabase
      .from("reminder_templates")
      .insert([{ company_id, template_name, message_body, is_default: !!is_default }])
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint para editar plantilla
r.put("/templates/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { template_name, message_body, is_default, company_id } = req.body;

  try {
    if (is_default && company_id) {
       await supabase.from("reminder_templates").update({ is_default: false }).eq("company_id", company_id);
    }

    const updates: any = { template_name, message_body, is_default: !!is_default };
    
    const { data, error } = await supabase
      .from("reminder_templates")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint para eliminar plantilla
r.delete("/templates/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { error } = await supabase.from("reminder_templates").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

export default r;