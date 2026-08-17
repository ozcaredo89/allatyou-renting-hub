import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { classifyReceipt, suspiciousOnlyFilter } from "../lib/receiptClassification";

const r = Router();

const MAX_LIMIT = 1000;

r.get("/last-payments", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim();

  const rawLimit = parseInt(String(req.query.limit ?? 20), 10);
  const rawOffset = parseInt(String(req.query.offset ?? 0), 10);

  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), MAX_LIMIT);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const overdueOnly    = String(req.query.overdue_only    || "false") === "true";
  const suspiciousOnly = String(req.query.suspicious_only || "false") === "true";

  // ── Paso 1: resolver qué placas son sospechosas ANTES de paginar ────────
  // Cuando suspicious_only=true, la condición debe aplicarse sobre el conjunto
  // COMPLETO antes de recortar con range(). Se consulta payments directamente
  // (que sí expone receipt_status / flagged_for_review) para obtener la lista
  // de placas cuyo ÚLTIMO pago es sospechoso, replicando exactamente el criterio
  // de la vista: ORDER BY payment_date DESC, created_at DESC (sin filtro de status).
  let suspiciousPlates: Set<string> | null = null;

  if (suspiciousOnly) {
    // Traemos solo las columnas necesarias para clasificar, sin limit por placa
    // (Supabase JS no soporta DISTINCT ON; usamos el mismo truco de "primero visto").
    // Para evitar traer todo el historial, pedimos solo pagos de los últimos 2 años
    // como cota práctica — un pago más antiguo no sería "el último" si hay alguno
    // más reciente, así que el filtro no pierde ningún caso real.
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const twoYearsAgoStr = twoYearsAgo.toISOString().slice(0, 10);

    const { data: allAudit, error: auditErr } = await supabase
      .from("payments")
      .select("plate, receipt_status, flagged_for_review, flag_reason")
      .gte("payment_date", twoYearsAgoStr)
      .order("payment_date", { ascending: false })
      .order("created_at",   { ascending: false });

    if (auditErr) return res.status(500).json({ error: auditErr.message });

    // Reducir a "último pago por placa" (primero que aparece en el orden desc)
    const latestByPlate = new Map<string, { receipt_status: string | null; flagged_for_review: boolean | null; flag_reason: string | null }>();
    for (const row of (allAudit ?? [])) {
      if (!latestByPlate.has(row.plate)) {
        latestByPlate.set(row.plate, {
          receipt_status:    row.receipt_status,
          flagged_for_review: row.flagged_for_review,
          flag_reason:       row.flag_reason,
        });
      }
    }

    // Clasificar y quedarnos solo con las placas sospechosas
    suspiciousPlates = new Set<string>();
    for (const [plate, audit] of latestByPlate) {
      const cls = classifyReceipt(audit.receipt_status, audit.flagged_for_review, audit.flag_reason);
      if (cls.is_suspicious || cls.is_technical_failure) {
        suspiciousPlates.add(plate);
      }
    }
  }

  // ── Paso 2: consultar vehicle_last_payment con paginación correcta ────────
  let query = supabase
    .from("vehicle_last_payment")
    .select("*", { count: "exact" })
    .order("is_overdue", { ascending: false })
    .order("owner_name", { ascending: true, nullsFirst: true })
    .range(offset, offset + limit - 1);

  if (q) {
    const safeQ = q.replace(/[%_,]/g, "\\$&");
    query = query.or(`plate.ilike.%${safeQ}%,owner_name.ilike.%${safeQ}%`);
  }
  if (overdueOnly) {
    query = query.eq("is_overdue", true);
  }
  // Filtrar por placas sospechosas ANTES del range — el .in() opera a nivel SQL
  // sobre la vista, así el count y la paginación son correctos.
  if (suspiciousPlates !== null) {
    if (suspiciousPlates.size === 0) {
      // No hay ninguna placa sospechosa: responder vacío directamente
      return res.json({ items: [], total: 0, limit, offset });
    }
    query = query.in("plate", [...suspiciousPlates]);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  let items = data ?? [];

  // ── Paso 3: JOIN de enriquecimiento sobre la página resultante ────────────
  if (items.length > 0) {
    const plates = items.map((row: any) => row.plate);

    // Estado del vehículo
    const { data: vData } = await supabase
      .from("vehicles")
      .select("plate, status")
      .in("plate", plates);
    const statusMap = new Map((vData || []).map((v: any) => [v.plate, v.status]));

    // Datos de auditoría del último pago, SOLO para las placas de esta página.
    // Replicamos el criterio de la vista: ORDER BY payment_date DESC, created_at DESC,
    // sin filtrar por status (la vista tampoco lo hace). Pedimos máximo 5 filas por
    // placa para acotar el tráfico; el primero por placa es el "último pago".
    const { data: auditPage } = await supabase
      .from("payments")
      .select("plate, receipt_status, flagged_for_review, flag_reason, payment_date, created_at")
      .in("plate", plates)
      .order("payment_date", { ascending: false })
      .order("created_at",   { ascending: false })
      .limit(plates.length * 5); // cota práctica: máximo 5 pagos por placa

    const auditMap = new Map<string, { receipt_status: string | null; flagged_for_review: boolean | null; flag_reason: string | null }>();
    for (const row of (auditPage ?? [])) {
      if (!auditMap.has(row.plate)) {
        auditMap.set(row.plate, {
          receipt_status:    row.receipt_status,
          flagged_for_review: row.flagged_for_review,
          flag_reason:       row.flag_reason,
        });
      }
    }

    items = items.map((row: any) => {
      const audit = auditMap.get(row.plate);
      const classification = classifyReceipt(
        audit?.receipt_status    ?? null,
        audit?.flagged_for_review ?? null,
        audit?.flag_reason       ?? null,
      );
      return {
        ...row,
        status: statusMap.get(row.plate) || "active",
        ...classification,
      };
    });
  }

  return res.json({ items, total: count ?? 0, limit, offset });
});

// ── GET /reports/global-oil ────────────────────────────────────────────────
// Aggregates oil change data entirely in Node.js using the Supabase JS client.
// No SQL migration required — works out of the box with the existing schema.
//
// A physical oil change visit = multiple expense rows sharing the same
// (plate, date, category='Cambio de aceite'). We collapse those into a single
// "session" by grouping on (plate + date) before counting, which prevents the
// double-count bug where "Aceite" + "Filtro" would appear as 2 oil changes.
r.get("/global-oil", async (_req: Request, res: Response) => {
  try {
    // ── 1. Build the 12-month analysis window ─────────────────────────────
    // Anchor to the 1st of the month 11 months ago so we always get exactly
    // 12 calendar-month buckets including the current month-to-date.
    const windowStart = new Date();
    windowStart.setDate(1);
    windowStart.setHours(0, 0, 0, 0);
    windowStart.setMonth(windowStart.getMonth() - 11);
    const windowStartStr = windowStart.toISOString().slice(0, 10); // "YYYY-MM-DD"

    // ── 2. Fetch raw oil-change expenses with their vehicle associations ───
    const { data: rows, error } = await supabase
      .from("expenses")
      .select("date, item, expense_vehicles(plate, share_amount)")
      .eq("category", "Cambio de aceite")
      .gte("date", windowStartStr)
      .order("date", { ascending: false });

    if (error) throw new Error(error.message);

    // ── 3. Collapse rows into sessions (one session = one plate + one date) ─
    // Key format: "PLATE__YYYY-MM-DD"
    const sessionMap = new Map<string, {
      plate: string;
      date: string;
      items: { item: string; amount: number }[];
      session_total: number;
    }>();

    for (const expense of (rows ?? [])) {
      const vehicles = (expense.expense_vehicles as any[]) ?? [];
      for (const ev of vehicles) {
        if (!ev.plate) continue;
        const key = `${ev.plate}__${expense.date}`;
        if (!sessionMap.has(key)) {
          sessionMap.set(key, { plate: ev.plate, date: expense.date, items: [], session_total: 0 });
        }
        const session = sessionMap.get(key)!;
        session.items.push({ item: expense.item, amount: Number(ev.share_amount ?? 0) });
        session.session_total = Number((session.session_total + Number(ev.share_amount ?? 0)).toFixed(2));
      }
    }

    const allSessions = Array.from(sessionMap.values());

    // Helper: switch guarantees the return type is always `string` —
    // avoids the string | undefined that any array/object index access produces
    // under strict TypeScript, regardless of how the lookup type is declared.
    function getMonthAbbrev(m: number): string {
      switch (m) {
        case  0: return "Jan"; case  1: return "Feb"; case  2: return "Mar";
        case  3: return "Apr"; case  4: return "May"; case  5: return "Jun";
        case  6: return "Jul"; case  7: return "Aug"; case  8: return "Sep";
        case  9: return "Oct"; case 10: return "Nov"; case 11: return "Dec";
        default: return "Jan";
      }
    }

    const monthMap = new Map<string, {
      month_label: string;
      year: number;
      sessions: typeof allSessions;
    }>();

    for (let i = 0; i < 12; i++) {
      const d = new Date(windowStart);
      d.setMonth(d.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, {
        month_label: getMonthAbbrev(d.getMonth()),
        year: d.getFullYear(),
        sessions: [],
      });
    }


    // ── 5. Assign each session to its month bucket ─────────────────────────
    for (const session of allSessions) {
      const monthKey = session.date.slice(0, 7); // "YYYY-MM"
      if (monthMap.has(monthKey)) {
        monthMap.get(monthKey)!.sessions.push(session);
      }
    }

    // ── 6. Build the final monthly_data array ─────────────────────────────
    const monthly_data = Array.from(monthMap.entries()).map(([month, bucket]) => ({
      month,
      month_label: bucket.month_label,
      year: bucket.year,
      count: bucket.sessions.length,
      // Sort sessions: newest date first, then alphabetical by plate
      sessions: bucket.sessions.sort((a, b) =>
        b.date.localeCompare(a.date) || a.plate.localeCompare(b.plate)
      ),
    }));

    return res.json({
      total_changes: allSessions.length,
      monthly_data,
      generated_at: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error("[global-oil] aggregation error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /reports/global-mileage ───────────────────────────────────────────────
// Delegates all aggregation to the get_global_mileage_stats PostgreSQL RPC.
// The RPC computes per-vehicle utilization across four temporal windows
// (daily, weekly, monthly, yearly) and the true current odometer value
// (latest manual reading + cumulative GPS km recorded after it).
r.get("/global-mileage", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.rpc("get_global_mileage_stats");

    if (error) throw new Error(error.message);

    return res.json({
      vehicles: data ?? [],
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[global-mileage] aggregation error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default r;


