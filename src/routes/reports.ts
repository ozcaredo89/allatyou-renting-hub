import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const r = Router();

const MAX_LIMIT = 1000;

r.get("/last-payments", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim();

  const rawLimit = parseInt(String(req.query.limit ?? 20), 10);
  const rawOffset = parseInt(String(req.query.offset ?? 0), 10);

  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), MAX_LIMIT);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const overdueOnly = String(req.query.overdue_only || "false") === "true";

  let query = supabase
    .from("vehicle_last_payment")
    .select("*", { count: "exact" })
    .order("is_overdue", { ascending: false })
    .order("owner_name", { ascending: true, nullsFirst: true })
    .range(offset, offset + limit - 1);

  if (q) {
    const safeQ = q.replace(/[%_,]/g, "\\$&"); // opcional: evita comodines accidentales
    query = query.or(`plate.ilike.%${safeQ}%,owner_name.ilike.%${safeQ}%`);
  }

  if (overdueOnly) {
    query = query.eq("is_overdue", true);
  }

  const { data, error, count } = await query;

  if (error) return res.status(500).json({ error: error.message });

  // Hacemos JOIN en código para no alterar la vista SQL subyacente
  let items = data ?? [];
  if (items.length > 0) {
    const plates = items.map(r => r.plate);
    const { data: vData } = await supabase.from("vehicles").select("plate, status").in("plate", plates);
    const statusMap = new Map((vData || []).map(v => [v.plate, v.status]));
    
    items = items.map(r => ({
      ...r,
      status: statusMap.get(r.plate) || 'active'
    }));
  }

  return res.json({
    items,
    total: count ?? 0,
    limit,
    offset,
  });
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

export default r;

