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
 * Regla: Hora > 15:45 (3:45 PM)
 */
r.get("/pending", async (req: Request, res: Response) => {
  try {
    const { dateStr, hour, minute } = getColTime();
    const force = req.query.force === "true"; // Backdoor para pruebas

    // 1. Validación de Hora (3:45 PM)
    // Si es antes de las 15:45 y no se fuerza, bloqueamos.
    if (!force) {
      if (hour < 15 || (hour === 15 && minute < 45)) {
        return res.json({
          locked: true,
          message: "El módulo de cobranza se habilita a las 3:45 PM.",
          serverTime: `${hour}:${minute}`
        });
      }
    }

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
    // La vista vehicle_last_payment a veces no tiene el teléfono actualizado del driver,
    // así que hacemos un join manual o confiamos en la vista si la actualizamos.
    // Para asegurar, vamos a cruzar con la tabla drivers para tener el phone fresco.
    
    const pendingList = [];

    for (const item of (morosos || [])) {
      // Si ya se notificó hoy, saltar
      if (notificadosSet.has(item.plate)) continue;

      // Buscar teléfono real del conductor actual (Prioridad Driver > Vehicle)
      // Nota: Esto podría optimizarse con un join SQL, pero por ahora loop está bien para <100 items.
      let phone = null;
      let driverId = null;

      // Buscar en tabla vehicles para sacar el driver_id actual
      const { data: v } = await supabase
        .from("vehicles")
        .select("current_driver_id, owner_whatsapp, company_id")
        .eq("plate", item.plate)
        .single();

      if (v) {
        // Filtrar por empresa (Punto 3: Por ahora AllAtYou = 1, o lo que venga)
        // Si quieres filtrar por query param ?company_id=1, agrégalo aquí.
        
        if (v.current_driver_id) {
          driverId = v.current_driver_id;
          const { data: d } = await supabase
            .from("drivers")
            .select("phone")
            .eq("id", driverId)
            .single();
          if (d && d.phone) phone = d.phone;
        }
        
        // Fallback al del vehículo
        if (!phone && v.owner_whatsapp) phone = v.owner_whatsapp;
      }

      pendingList.push({
        ...item,
        driver_id: driverId,
        contact_phone: phone,
        days_overdue: item.days_since // Dato crítico para el mensaje
      });
    }

    return res.json({
      locked: false,
      items: pendingList
    });

  } catch (err: any) {
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
        // status: "sent", // Por ahora asumimos que se envió si se hizo click
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
    const { dateStr } = getColTime();

    const { data, error } = await supabase
      .from("payment_notifications")
      .select(`
        *,
        sender:app_users!sent_by_user_id(full_name),
        vehicle:vehicles!vehicle_plate(owner_name, owner_whatsapp),
        driver:drivers!driver_id(phone)
      `)
      .eq("generated_date", dateStr)
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
    // RPC o raw update incrementando
    // Como es simple, hacemos fetch + update o usamos una funcion RPC si existiera.
    // Haremos fetch + update simple por ahora.
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

// Endpoint para traer plantillas
r.get("/templates", async (req: Request, res: Response) => {
  const { data, error } = await supabase
    .from("reminder_templates")
    .select("*")
    .eq("is_default", true)
    .single(); // Por ahora solo manejamos una default
  
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

export default r;