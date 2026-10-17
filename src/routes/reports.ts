import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import {
  classifyReceipt,
  suspiciousOnlyFilter,
  buildAmountMismatch,
  buildDuplicatePayments,
  buildMatchContext,
  refineReasonsForEvidence,
  collectDuplicateIds,
  FlagDetails,
  DuplicatePaymentSummary,
} from "../lib/receiptClassification";
import { getActiveLeasingContract, applyLeasingPayment } from "../lib/leasingCascade";
import { checkVehicleInShop, validateMaintenanceDay, MaintenanceValidation, TallerCheck } from "../lib/taller";
import { checkAdvanceInstallment, payDaysWithAdvance, resolveDailyRentRate } from "./payments";
import { listPendingDays, validateDatesToResolve, PendingDaysResult } from "../lib/pendingDays";
import { activeAdvanceForDriver } from "../lib/advanceOwnership";
import { lateFeePaidFromExcess, LATE_FEE_MAX } from "../lib/lateFee";

const r = Router();

const MAX_LIMIT = 1000;

r.get("/last-payments", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim();

  const rawLimit = parseInt(String(req.query.limit ?? 20), 10);
  const rawOffset = parseInt(String(req.query.offset ?? 0), 10);

  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), MAX_LIMIT);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const overdueOnly     = String(req.query.overdue_only     || "false") === "true";
  const suspiciousOnly  = String(req.query.suspicious_only  || "false") === "true";
  const pendingOnly     = String(req.query.pending_only     || "false") === "true";
  const includeInactive = String(req.query.include_inactive ?? "false") === "true";

  // Cota práctica compartida por Paso 1 y Paso 3: un pago más antiguo no sería
  // "el último" si hay alguno más reciente, así que ninguno de los dos pasos
  // pierde ningún caso real usando esta misma ventana.
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const twoYearsAgoStr = twoYearsAgo.toISOString().slice(0, 10);

  // ── Consultas independientes en paralelo (cada viaje a Supabase cuesta ~300-500 ms) ──
  // - Pagos pendientes de toda la flota (pocas filas): conteo global, filtro "solo pendientes"
  //   e indicador de pendientes por placa.
  // - Vehículos: filtro de activos y estado de cada placa.
  // - Auditoría de 2 años: solo si se filtra por sospechosos (es la consulta pesada).
  const [pendingRes, vehiclesRes, suspiciousAuditRes] = await Promise.all([
    supabase.from("payments").select("id, plate, payment_date").eq("status", "pending").order("payment_date", { ascending: true }),
    supabase.from("vehicles").select("plate, status"),
    suspiciousOnly
      ? supabase
          .from("payments")
          .select("plate, receipt_status, flagged_for_review, flag_reason, status")
          .gte("payment_date", twoYearsAgoStr)
          .order("payment_date", { ascending: false })
          .order("created_at",   { ascending: false })
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (pendingRes.error) return res.status(500).json({ error: pendingRes.error.message });
  if (vehiclesRes.error) return res.status(500).json({ error: vehiclesRes.error.message });

  const pendingByPlate = new Map<string, number[]>();
  for (const p of pendingRes.data ?? []) {
    pendingByPlate.set(p.plate, [...(pendingByPlate.get(p.plate) ?? []), p.id]);
  }
  const globalPendingCount = (pendingRes.data ?? []).length;
  const statusMap = new Map((vehiclesRes.data ?? []).map((v: any) => [v.plate, v.status]));

  // ── Paso 1: resolver qué placas son sospechosas o pendientes ANTES de paginar ────────
  // Cuando suspicious_only=true o pending_only=true, la condición debe aplicarse sobre el conjunto
  // COMPLETO antes de recortar con range().
  let suspiciousPlates: Set<string> | null = null;
  // Placas con CUALQUIER pago pendiente (no solo el último): un pendiente viejo
  // no debe desaparecer porque llegó un pago nuevo ya confirmado.
  const pendingPlates: Set<string> | null = pendingOnly ? new Set(pendingByPlate.keys()) : null;

  if (suspiciousOnly) {
    const { data: allAudit, error: auditErr } = suspiciousAuditRes as { data: any[] | null; error: { message: string } | null };
    if (auditErr) return res.status(500).json({ error: auditErr.message });

    // Reducir a "último pago por placa" (primero que aparece en el orden desc)
    const latestByPlate = new Map<string, { receipt_status: string | null; flagged_for_review: boolean | null; flag_reason: string | null; status: string | null }>();
    for (const row of (allAudit ?? [])) {
      if (!latestByPlate.has(row.plate)) {
        latestByPlate.set(row.plate, {
          receipt_status:    row.receipt_status,
          flagged_for_review: row.flagged_for_review,
          flag_reason:       row.flag_reason,
          status:            row.status,
        });
      }
    }

    suspiciousPlates = new Set<string>();
    for (const [plate, audit] of latestByPlate) {
      const cls = classifyReceipt(audit.receipt_status, audit.flagged_for_review, audit.flag_reason);
      if (cls.is_suspicious || cls.is_technical_failure) {
        suspiciousPlates.add(plate);
      }
    }
  }

  // ── Paso 2: consultar vehicle_last_payment con paginación correcta ────────
  let allowedPlates: string[] | null = null;

  if (!includeInactive) {
    allowedPlates = (vehiclesRes.data ?? [])
      .filter((v: any) => v.status !== "sold" && v.status !== "inactive")
      .map((v: any) => v.plate);
  }

  if (suspiciousPlates !== null) {
    if (allowedPlates !== null) {
      const allowedSet = new Set(allowedPlates);
      allowedPlates = [...suspiciousPlates].filter((p) => allowedSet.has(p));
    } else {
      allowedPlates = [...suspiciousPlates];
    }
  }

  if (pendingPlates !== null) {
    if (allowedPlates !== null) {
      const allowedSet = new Set(allowedPlates);
      allowedPlates = [...pendingPlates].filter((p) => allowedSet.has(p));
    } else {
      allowedPlates = [...pendingPlates];
    }
  }

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
  // Filtrar por placas permitidas (activas y/o sospechosas) ANTES del range — el .in() opera a nivel SQL
  // sobre la vista, así el count y la paginación son exactos.
  if (allowedPlates !== null) {
    if (allowedPlates.length === 0) {
      // No hay ninguna placa que cumpla: responder vacío directamente
      return res.json({ items: [], total: 0, limit, offset, pending_approval_count: globalPendingCount ?? 0 });
    }
    query = query.in("plate", allowedPlates);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });

  let items = data ?? [];

  // ── Paso 3: JOIN de enriquecimiento sobre la página resultante ────────────
  if (items.length > 0) {
    const plates = items.map((row: any) => row.plate);
    // Solo interesa el último pago de cada placa: basta traer los pagos de esas fechas
    // (la vista ya trae payment_date), en vez de 2 años de pagos que además se cortaban en 1.000 filas.
    const lastDates = [...new Set(items.map((row: any) => row.payment_date).filter(Boolean))] as string[];

    // Datos de auditoría del último pago, SOLO para las placas de esta página.
    // Replicamos el criterio de la vista: ORDER BY payment_date DESC, created_at DESC,
    // sin filtrar por status (la vista tampoco lo hace). Como la fecha del último pago
    // de cada placa está en lastDates, el primer registro por placa en este orden es
    // siempre su último pago.
    const auditBaseColumns = "plate, receipt_status, flagged_for_review, flag_reason, payment_date, created_at, status";
    let auditPage: any[] | null;
    let auditPageErr: { message: string } | null;
    ({ data: auditPage, error: auditPageErr } = await supabase
      .from("payments")
      .select(`${auditBaseColumns}, flag_details, proof_url, amount, reference_number, id, bank_transaction_id`)
      .in("plate", plates)
      .in("payment_date", lastDates)
      .order("payment_date", { ascending: false })
      .order("created_at",   { ascending: false }));

    // flag_details / bank_transaction_id pueden no existir todavía (migración
    // pendiente de aplicar en Supabase). No dejamos que eso tumbe la
    // clasificación base: reintentamos sin esas columnas para no perder
    // receipt_status/flagged_for_review, que sí existen desde antes.
    if (auditPageErr) {
      console.error("[reports/last-payments] Paso 3 audit query (con flag_details) falló, reintentando sin ella:", auditPageErr.message);
      const retry = await supabase
        .from("payments")
        .select(auditBaseColumns)
        .in("plate", plates)
        .in("payment_date", lastDates)
        .order("payment_date", { ascending: false })
        .order("created_at",   { ascending: false });
      auditPage = retry.data;
      if (retry.error) console.error("[reports/last-payments] Paso 3 audit query (fallback) también falló:", retry.error.message);
    }

    const auditMap = new Map<string, {
      receipt_status: string | null;
      flagged_for_review: boolean | null;
      flag_reason: string | null;
      flag_details: FlagDetails | null;
      created_at: string | null;
      payment_id: number | null;
      bank_transaction_id: number | null;
      payment_status: string | null;
    }>();
    for (const row of (auditPage ?? [])) {
      if (!auditMap.has(row.plate)) {
        auditMap.set(row.plate, {
          receipt_status:      row.receipt_status,
          flagged_for_review:  row.flagged_for_review,
          flag_reason:         row.flag_reason,
          flag_details:        row.flag_details ?? null,
          created_at:          row.created_at ?? null,
          payment_id:          row.id ?? null,
          bank_transaction_id: row.bank_transaction_id ?? null,
          payment_status:      row.status ?? "confirmed",
        });
      }
    }

    // Resolver en paralelo (1 query batch cada uno, sin N+1):
    // - los pagos duplicados referenciados en flag_details de esta página;
    // - el movimiento bancario con el que se concilió cada pago (ver POST /reconcile-bank).
    const duplicateIds = collectDuplicateIds([...auditMap.values()].map((a) => a.flag_details));
    const bankTransactionIds = new Set<number>();
    for (const a of auditMap.values()) if (a.bank_transaction_id) bankTransactionIds.add(a.bank_transaction_id);

    const [dupRes, bankRes] = await Promise.all([
      duplicateIds.size > 0
        ? supabase.from("payments").select("id, plate, payment_date, amount, reference_number, proof_url").in("id", [...duplicateIds])
        : Promise.resolve({ data: [] as any[] }),
      bankTransactionIds.size > 0
        ? supabase.from("transacciones_entrantes").select("id, fecha, descripcion, referencia, monto_entrada, sucursal").in("id", [...bankTransactionIds])
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const duplicateResolver = new Map<number, DuplicatePaymentSummary>();
    for (const row of dupRes.data ?? []) duplicateResolver.set(row.id, row as DuplicatePaymentSummary);
    const bankMatchResolver = new Map<number, {
      id: number;
      fecha: string | null;
      descripcion: string | null;
      referencia: string | null;
      monto_entrada: number | null;
      sucursal: string | null;
    }>();
    for (const row of bankRes.data ?? []) bankMatchResolver.set(row.id, row);

    items = items.map((row: any) => {
      const audit = auditMap.get(row.plate);
      const classification = classifyReceipt(
        audit?.receipt_status    ?? null,
        audit?.flagged_for_review ?? null,
        audit?.flag_reason       ?? null,
      );
      const duplicate_payments = buildDuplicatePayments(audit?.flag_details, duplicateResolver);
      return {
        ...row,
        payment_created_at: audit?.created_at ?? null,
        status: statusMap.get(row.plate) || "active",
        payment_status: audit?.payment_status ?? "confirmed",
        ...classification,
        inconsistency_reasons: refineReasonsForEvidence(
          classification.inconsistency_reasons,
          !!duplicate_payments && duplicate_payments.length > 0,
        ),
        duplicate_payments,
        amount_mismatch: buildAmountMismatch(audit?.flag_details),
        match_context: buildMatchContext(audit?.flag_details),
        payment_id: audit?.payment_id ?? null,
        bank_match: audit?.bank_transaction_id ? bankMatchResolver.get(audit.bank_transaction_id) ?? null : null,
        receipt_status: audit?.receipt_status ?? null,
        flag_details: audit?.flag_details ?? null,
        pending_payment_ids: pendingByPlate.get(row.plate) ?? [],
      };
    });
  }

  return res.json({ items, total: count ?? 0, limit, offset, pending_approval_count: globalPendingCount ?? 0 });
});

// ── POST /reports/reconcile-bank ──────────────────────────────────────────────
// Cruce estricto y persistente entre pagos y movimientos bancarios entrantes:
// misma fecha + mismo monto exacto, 1 a 1. Si para un pago hay 0 candidatos
// (no llego a la cuenta, o llego con otro monto/fecha) o mas de 1 (ambiguo -
// p.ej. dos transferencias identicas el mismo dia) se deja SIN conciliar a
// proposito, nunca se adivina. El resultado queda en payments.bank_transaction_id,
// asi el link de "con que se concilio" es estable entre recargas y no vuelve a
// recalcularse distinto cada vez.
r.post("/reconcile-bank", async (_req: Request, res: Response) => {
  try {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const twoYearsAgoStr = twoYearsAgo.toISOString().slice(0, 10);

    const { data: pendingPayments, error: payErr } = await supabase
      .from("payments")
      .select("id, payment_date, amount")
      .is("bank_transaction_id", null)
      .neq("status", "rejected")
      .neq("receipt_status", "advance_offset")
      .not("payment_date", "is", null)
      .not("amount", "is", null)
      .gte("payment_date", twoYearsAgoStr)
      .order("payment_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (payErr) throw new Error(payErr.message);

    const { data: claimedRows, error: claimedErr } = await supabase
      .from("payments")
      .select("bank_transaction_id")
      .not("bank_transaction_id", "is", null);
    if (claimedErr) throw new Error(claimedErr.message);
    const claimedIds = new Set((claimedRows ?? []).map((r: any) => r.bank_transaction_id as number));

    const { data: bankRows, error: bankErr } = await supabase
      .from("transacciones_entrantes")
      .select("id, fecha, monto_entrada")
      .gte("fecha", twoYearsAgoStr);
    if (bankErr) throw new Error(bankErr.message);

    // Agrupa los movimientos bancarios AUN NO reclamados por "fecha|monto".
    const byKey = new Map<string, number[]>();
    for (const b of bankRows ?? []) {
      if (claimedIds.has(b.id)) continue;
      const key = `${b.fecha}|${b.monto_entrada}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(b.id);
    }

    const updates: { paymentId: number; bankTransactionId: number }[] = [];
    let ambiguous = 0;

    for (const p of pendingPayments ?? []) {
      const key = `${p.payment_date}|${p.amount}`;
      const candidates = byKey.get(key);
      if (!candidates || candidates.length === 0) continue; // no llego a la cuenta
      if (candidates.length > 1) { ambiguous++; continue; } // ambiguo -> no se adivina
      const bankTransactionId = candidates[0] as number;
      updates.push({ paymentId: p.id, bankTransactionId });
      // Se retira del pool para que ningun otro pago de este mismo lote lo reclame.
      byKey.delete(key);
    }

    for (const u of updates) {
      const { error } = await supabase
        .from("payments")
        .update({ bank_transaction_id: u.bankTransactionId })
        .eq("id", u.paymentId);
      if (error) console.error("[reconcile-bank] error actualizando pago", u.paymentId, error.message);
    }

    return res.json({
      checked: (pendingPayments ?? []).length,
      reconciled: updates.length,
      ambiguous,
    });
  } catch (err: any) {
    console.error("[reconcile-bank] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
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

// ── GET /reports/bank-transactions ────────────────────────────────────────────
// Movimientos bancarios entrantes extraidos por bank-sync (script local, ver
// bank-sync/README.md) desde la Sucursal Virtual Negocios, para que el equipo
// contable los cruce contra los comprobantes de pago que le envian.
r.get("/bank-transactions", async (req: Request, res: Response) => {
  const q = String(req.query.q || "").trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();

  const rawLimit = parseInt(String(req.query.limit ?? 200), 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 200, 1), MAX_LIMIT);

  try {
    let query = supabase
      .from("transacciones_entrantes")
      .select("id, fecha, descripcion, referencia, monto_entrada, sucursal, moneda, created_at")
      .order("fecha", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);

    if (from) query = query.gte("fecha", from);
    if (to) query = query.lte("fecha", to);
    if (q) query = query.or(`descripcion.ilike.%${q}%,referencia.ilike.%${q}%,sucursal.ilike.%${q}%`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return res.json({ items: data ?? [] });
  } catch (err: any) {
    console.error("[bank-transactions] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── GET /reports/payments/:id/approval-preview ──────────────────────────────
// Previsualiza la distribución contable de un pago pendiente para el modal de aprobación
// - En leasing: cruce estricto con la cuota de leasing_schedule cuya due_date = payment_date.
//   Si no existe o ya está pagada, can_approve = false y no se inventan valores.
// - En renting: respeta exactamente el split calculado y almacenado al momento del registro
//   (maintenance_amount, delivery_amount, insurance_amount, credit_installment_amount).
r.get("/payments/:id/approval-preview", async (req: Request, res: Response) => {
  const paymentId = parseInt(String(req.params.id || ""), 10);
  if (isNaN(paymentId)) return res.status(400).json({ error: "ID de pago inválido" });

  try {
    const { data: payment, error: pErr } = await supabase
      .from("payments")
      .select("id, plate, payer_name, payment_date, amount, status, receipt_status, proof_url, installment_number, installment_status, installment_shortfall, maintenance_amount, delivery_amount, insurance_amount, credit_installment_amount, receipt_date, receipt_time, late_fee_amount, late_fee_paid")
      .eq("id", paymentId)
      .maybeSingle();

    if (pErr || !payment) {
      return res.status(404).json({ error: "Pago no encontrado" });
    }

    const leasingContract = await getActiveLeasingContract(payment.plate);
    const isLeasing = !!(leasingContract && !leasingContract.start_date_pending_confirmation);

    if (isLeasing) {
      // 🔴 2 & 🟡 4: Búsqueda estricta de la cuota por fecha de pago
      const { data: cuota, error: cErr } = await supabase
        .from("leasing_schedule")
        .select("*")
        .eq("contract_id", leasingContract.id)
        .eq("due_date", payment.payment_date)
        .maybeSingle();

      if (cErr) {
        return res.status(500).json({ error: `Error al consultar cronograma de leasing: ${cErr.message}` });
      }

      if (!cuota) {
        return res.json({
          payment_id: payment.id,
          plate: payment.plate,
          payer_name: payment.payer_name || "Conductor",
          payment_date: payment.payment_date,
          amount: Number(payment.amount),
          status: payment.status,
          receipt_status: payment.receipt_status,
          proof_url: payment.proof_url,
          type: "leasing",
          can_approve: false,
          warning_message: `No existe cuota en el cronograma de leasing para la fecha ${payment.payment_date} (posible domingo o festivo). Concilie la fecha manualmente antes de aprobar.`,
          leasing_contract: {
            id: leasingContract.id,
            installment_no: null,
            due_date: payment.payment_date,
            status: "missing",
          },
          breakdown: {
            maintenance: 0,
            car_capital: 0,
            interest: 0,
            admin_insurance: 0,
            normal_quota: 0,
            advance: 0,
            excess: 0,
          },
          quota_expected: null,
        });
      }

      const mExp = Number(cuota.maintenance_expected || 0);
      const aExp = Number(cuota.admin_expected || 0);
      const iExp = Number(cuota.interest_expected || 0);
      const pExp = Number(cuota.principal_expected || 0);
      const qTotal = mExp + aExp + iExp + pExp;
      const amt = Number(payment.amount || 0);
      const excess = Math.max(0, amt - qTotal);

      if (cuota.status === "paid") {
        return res.json({
          payment_id: payment.id,
          plate: payment.plate,
          payer_name: payment.payer_name || "Conductor",
          payment_date: payment.payment_date,
          amount: amt,
          status: payment.status,
          receipt_status: payment.receipt_status,
          proof_url: payment.proof_url,
          type: "leasing",
          can_approve: false,
          warning_message: `La cuota #${cuota.installment_no} (${cuota.due_date}) ya fue pagada previamente. Verifique si es un pago duplicado o concilie manualmente.`,
          leasing_contract: {
            id: leasingContract.id,
            installment_no: cuota.installment_no,
            due_date: cuota.due_date,
            status: cuota.status,
          },
          breakdown: {
            maintenance: mExp,
            car_capital: pExp,
            interest: iExp,
            admin_insurance: aExp,
            normal_quota: 0,
            advance: 0,
            excess: 0,
          },
          quota_expected: {
            maintenance: mExp,
            admin: aExp,
            interest: iExp,
            principal: pExp,
            total: qTotal,
          },
        });
      }

      const creditStored = Number(payment.credit_installment_amount || 0);
      const activeAdvLeasing = await activeAdvanceForDriver(payment.plate, payment.payment_date, "id, daily_installment, current_installment, installments");

      const leasingExcess = Math.max(0, amt - qTotal - creditStored);

      return res.json({
        payment_id: payment.id,
        plate: payment.plate,
        payer_name: payment.payer_name || "Conductor",
        payment_date: payment.payment_date,
        amount: amt,
        status: payment.status,
        receipt_status: payment.receipt_status,
        proof_url: payment.proof_url,
        type: "leasing",
        can_approve: true,
        warning_message: null,
        leasing_contract: {
          id: leasingContract.id,
          installment_no: cuota.installment_no,
          due_date: cuota.due_date,
          status: cuota.status,
        },
        active_advance: activeAdvLeasing
          ? {
              id: activeAdvLeasing.id,
              daily_installment: Number(activeAdvLeasing.daily_installment || 0),
              installment_no: payment.installment_number ?? null,
            }
          : null,
        breakdown: {
          maintenance: mExp,
          car_capital: pExp,
          interest: iExp,
          admin_insurance: aExp,
          normal_quota: 0,
          advance: creditStored,
          excess: leasingExcess,
        },
        quota_expected: {
          maintenance: mExp,
          admin: aExp,
          interest: iExp,
          principal: pExp,
          total: qTotal,
        },
      });
    }

    // ── Renting Tradicional ──
    // 🟠 3: Usar la distribución guardada en el pago, sin inventar ni recalcular
    const activeAdv = await activeAdvanceForDriver(payment.plate, payment.payment_date, "id, daily_installment, current_installment, installments");

    // Consultar canon de arrendamiento base configurado o fallback al canon estándar del negocio ($70.000)
    const { data: vRow } = await supabase
      .from("vehicles")
      .select("default_amount")
      .eq("plate", payment.plate)
      .maybeSingle();

    const baseRentRate = vRow?.default_amount ? Number(vRow.default_amount) : 70000;

    const mStored = Number(payment.maintenance_amount || 0);
    const dStored = Number(payment.delivery_amount || 0);
    const iStored = Number(payment.insurance_amount || 0);
    const cStored = Number(payment.credit_installment_amount || 0);
    const lfPaid = Number(payment.late_fee_paid || 0);
    const amt = Number(payment.amount || 0);
    const totalStored = mStored + dStored + iStored + cStored;
    const excess = Math.max(0, amt - totalStored);

    const fmt = new Intl.NumberFormat("es-CO");
    let warningMessage: string | null = null;
    const instNo = payment.installment_number ?? null;

    if (!activeAdv) {
      if (instNo != null && amt > baseRentRate) {
        const extra = amt - baseRentRate;
        warningMessage = `El pago indica Cuota #${instNo} y el monto ($${fmt.format(amt)}) supera el canon base ($${fmt.format(baseRentRate)}) por $${fmt.format(extra)}, pero este vehículo NO tiene ningún anticipo activo registrado en el sistema. Todo el valor extra se asignó a Canon y $0 a anticipo. Verifique si falta crear el anticipo operacional antes de aprobar.`;
      } else if (instNo != null) {
        warningMessage = `El pago indica Cuota #${instNo}, pero este vehículo NO tiene ningún anticipo activo registrado en el sistema. El abono al anticipo es $0 y todo fue asignado a Canon. Verifique si falta registrar el anticipo.`;
      } else if (amt > baseRentRate) {
        const extra = amt - baseRentRate;
        warningMessage = `El monto pagado ($${fmt.format(amt)}) supera el canon base de renta ($${fmt.format(baseRentRate)}) por $${fmt.format(extra)}, y el vehículo no tiene anticipo activo. Todo el monto extra quedó asignado a Canon/Entrega.`;
      }
    } else if (payment.installment_status === "pending" && (payment.installment_shortfall ?? 0) > 0) {
      warningMessage = `El monto pagado no alcanzó para cubrir la cuota del anticipo (faltante: $${fmt.format(payment.installment_shortfall)}). La cuota permanece pendiente.`;
    }

    return res.json({
      payment_id: payment.id,
      plate: payment.plate,
      payer_name: payment.payer_name || "Conductor",
      payment_date: payment.payment_date,
      amount: amt,
      status: payment.status,
      receipt_status: payment.receipt_status,
      proof_url: payment.proof_url,
      type: "renting",
      can_approve: true,
      warning_message: warningMessage,
      installment_number: instNo,
      base_rent_rate: baseRentRate,
      active_advance: activeAdv
        ? {
            id: activeAdv.id,
            daily_installment: Number(activeAdv.daily_installment || 0),
            installment_no: payment.installment_number ?? null,
          }
        : null,
      breakdown: {
        maintenance: mStored,
        car_capital: 0,
        interest: 0,
        admin_insurance: iStored,
        // late_fee_paid es parte de delivery_amount: se muestra aparte del canon
        normal_quota: dStored - lfPaid,
        advance: cStored,
        late_fee: lfPaid,
        excess,
      },
      // Recargo por pago tardío (pagos.md §3). amount null = el comprobante no tiene hora/fecha legible.
      late_fee: {
        amount: payment.late_fee_amount == null ? null : Number(payment.late_fee_amount),
        paid: lfPaid,
        pending: Math.max(0, Number(payment.late_fee_amount || 0) - lfPaid),
        receipt_date: payment.receipt_date ?? null,
        receipt_time: payment.receipt_time ? String(payment.receipt_time).slice(0, 5) : null,
      },
      quota_expected: null,
    });
  } catch (err: any) {
    console.error("[approval-preview] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Ajuste de un pago pendiente desde la ventana de aprobación ──────────────
// Canon del día: cuota de leasing de esa fecha (si hay leasing) o vehicles.default_amount / $70.000.
async function resolveCanonForPayment(plate: string, paymentDate: string) {
  const contract = await getActiveLeasingContract(plate);
  if (contract && !contract.start_date_pending_confirmation) {
    const { data: cuota } = await supabase
      .from("leasing_schedule")
      .select("maintenance_expected, admin_expected, interest_expected, principal_expected")
      .eq("contract_id", contract.id)
      .eq("due_date", paymentDate)
      .maybeSingle();
    if (cuota) {
      return Math.round(
        Number(cuota.maintenance_expected) + Number(cuota.admin_expected) +
        Number(cuota.interest_expected) + Number(cuota.principal_expected)
      );
    }
  }
  const { data: v } = await supabase.from("vehicles").select("default_amount").eq("plate", plate).maybeSingle();
  return v?.default_amount ? Number(v.default_amount) : 70000;
}

async function getAdvanceSummary(plate: string, date = "") {
  const adv = await activeAdvanceForDriver(plate, date, "id, daily_installment, installments");
  if (!adv) return null;
  const total = Number(adv.installments || 0);
  const { data: rows } = await supabase
    .from("operational_advance_schedule")
    .select("installment_no, status, installment_amount")
    .eq("advance_id", adv.id)
    .gte("installment_no", 1)
    .lte("installment_no", total)
    .order("installment_no", { ascending: true });
  const list = rows || [];
  return {
    id: adv.id,
    daily_installment: Number(adv.daily_installment || 0),
    installments: total,
    paid_count: list.filter((r: any) => r.status === "paid").length,
    next_pending: list.find((r: any) => r.status !== "paid")?.installment_no ?? null,
    rows: list,
  };
}

// GET /reports/payments/:id/adjust-info — datos para corregir el pago antes de aprobar
r.get("/payments/:id/adjust-info", async (req: Request, res: Response) => {
  const paymentId = parseInt(String(req.params.id || ""), 10);
  if (isNaN(paymentId)) return res.status(400).json({ error: "ID de pago inválido" });

  const { data: payment } = await supabase
    .from("payments")
    .select("id, plate, payment_date, amount, installment_number, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return res.status(404).json({ error: "Pago no encontrado" });

  const [{ data: receipt }, advance, canon] = await Promise.all([
    supabase.from("receipt_uploads").select("amount").eq("linked_payment_id", paymentId).maybeSingle(),
    getAdvanceSummary(payment.plate, payment.payment_date),
    resolveCanonForPayment(payment.plate, payment.payment_date),
  ]);
  const ocr = receipt?.amount != null ? Number(receipt.amount) : null;

  return res.json({
    payment_id: payment.id,
    amount: Number(payment.amount || 0),
    installment_number: payment.installment_number ?? null,
    ocr_amount: ocr && ocr > 0 ? ocr : null,
    canon,
    advance: advance && {
      id: advance.id,
      daily_installment: advance.daily_installment,
      installments: advance.installments,
      paid_count: advance.paid_count,
      next_pending: advance.next_pending,
    },
  });
});

// POST /reports/payments/:id/adjust — corrige monto y/o cuota de anticipo de un pago pendiente
// Body: { amount?: number, installment_number?: number | null, notes?: string }
// Recalcula el reparto con la regla de pagos.md §3 (canon + cuota del cronograma) sin aprobar.
r.post("/payments/:id/adjust", async (req: Request, res: Response) => {
  const paymentId = parseInt(String(req.params.id || ""), 10);
  if (isNaN(paymentId)) return res.status(400).json({ error: "ID de pago inválido" });

  const { data: payment } = await supabase
    .from("payments")
    .select("id, plate, payment_date, amount, installment_number, status, receipt_status, notes, late_fee_amount, flag_details")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) return res.status(404).json({ error: "Pago no encontrado" });
  if (payment.status !== "pending") return res.status(400).json({ error: "Solo se pueden ajustar pagos pendientes." });

  const body = req.body || {};
  const amount = body.amount != null ? Math.round(Number(body.amount)) : Number(payment.amount || 0);
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: "El monto no es válido." });

  const instNo: number | null =
    "installment_number" in body
      ? (body.installment_number == null || body.installment_number === "" ? null : Number(body.installment_number))
      : (payment.installment_number ?? null);
  if (instNo != null && !(Number.isInteger(instNo) && instNo > 0)) {
    return res.status(400).json({ error: "La cuota debe ser un número entero mayor que 0." });
  }
  const userNote = String(body.notes || "").trim();

  // Validar que la cuota exista en el anticipo y no esté pagada
  let expectedCredit = 0;
  if (instNo != null) {
    const issue = await checkAdvanceInstallment(payment.plate, instNo, payment.payment_date);
    if (issue) {
      const sug = issue.suggested_installment != null ? ` Usa la cuota ${issue.suggested_installment}.` : "";
      const msg =
        issue.reason === "NO_ACTIVE_ADVANCE" ? `${payment.plate} no tiene anticipo activo; deja la cuota vacía.`
        : issue.reason === "ALREADY_PAID" ? `La cuota ${instNo} ya está pagada.${sug}`
        : `La cuota ${instNo} no existe en el anticipo.${sug}`;
      return res.status(400).json({ error: msg, suggested_installment: issue.suggested_installment });
    }
    const advance = await getAdvanceSummary(payment.plate, payment.payment_date);
    const row = advance?.rows.find((x: any) => x.installment_no === instNo);
    expectedCredit = Number(row?.installment_amount || advance?.daily_installment || 0);
  }

  const canon = await resolveCanonForPayment(payment.plate, payment.payment_date);
  if (amount < canon && !userNote) {
    return res.status(400).json({
      error: `El monto ($${amount}) es menor que el canon ($${canon}). Escribe una nota que explique el motivo.`,
    });
  }

  // Reparto: la cuota solo se abona si el monto cubre canon + cuota (pagos.md §3)
  const coversCredit = instNo != null && amount >= canon + expectedCredit;
  const credit = coversCredit ? expectedCredit : 0;
  const rem = amount - credit;
  const insurance = rem >= 5000 ? 5000 : 0;
  const maintenance = rem > insurance ? Math.min(6000, rem - insurance) : 0;
  const delivery = Math.max(0, rem - insurance - maintenance);
  // Parte de delivery que abona el recargo por pago tardío: excedente sobre canon + cuota (pagos.md §3)
  const lateFeePaid = lateFeePaidFromExcess({
    lateFee: payment.late_fee_amount == null ? null : Number(payment.late_fee_amount),
    amount,
    canon,
    credit,
    delivery,
  });

  // Comparación con el comprobante enlazado a ESTE pago (un pago = un día; no se reparte).
  const { data: rec } = await supabase.from("receipt_uploads").select("amount").eq("linked_payment_id", paymentId).maybeSingle();
  const receiptAmount: number | null = rec?.amount != null ? Number(rec.amount) : null;
  const matchesReceipt = receiptAmount != null && receiptAmount > 0 && receiptAmount === amount;

  const changes: string[] = [];
  if (amount !== Number(payment.amount)) changes.push(`monto $${Number(payment.amount)} → $${amount}`);
  if (instNo !== (payment.installment_number ?? null)) changes.push(`cuota ${payment.installment_number ?? "—"} → ${instNo ?? "—"}`);
  const adjustNote = `Ajuste en aprobación (${new Date().toISOString().slice(0, 10)}): ${changes.join(", ") || "sin cambios"}${userNote ? `. ${userNote}` : ""}.`;

  const update: Record<string, any> = {
    amount,
    installment_number: instNo,
    credit_installment_amount: credit,
    insurance_amount: insurance,
    maintenance_amount: maintenance,
    delivery_amount: delivery,
    late_fee_paid: lateFeePaid,
    installment_status: instNo == null ? null : coversCredit ? "paid" : "pending",
    installment_shortfall: instNo == null ? null : coversCredit ? 0 : canon + expectedCredit - amount,
    notes: [payment.notes, adjustNote].filter(Boolean).join(" "),
    updated_at: new Date().toISOString(),
  };
  if (matchesReceipt && payment.receipt_status === "suspicious_amount_mismatch") {
    update.receipt_status = "verified";
    update.flagged_for_review = false;
  }
  // La comparación guardada (flag_details) se actualiza con el monto nuevo: si coincide con el
  // comprobante se borra (antes quedaba vieja y el aviso seguía); si no, queda la diferencia actual.
  if (receiptAmount != null && receiptAmount > 0 && (payment.flag_details?.ocr_amount != null || !matchesReceipt)) {
    const { db_amount: _db, ocr_amount: _ocr, difference: _diff, ...rest } = (payment.flag_details ?? {}) as Record<string, any>;
    update.flag_details = matchesReceipt
      ? (Object.keys(rest).length ? rest : null)
      : { ...rest, db_amount: amount, ocr_amount: receiptAmount, difference: amount - receiptAmount };
  }

  const { error } = await supabase.from("payments").update(update).eq("id", paymentId).eq("status", "pending");
  if (error) return res.status(500).json({ error: `Error ajustando el pago: ${error.message}` });

  return res.json({
    success: true,
    message: coversCredit || instNo == null
      ? "Pago ajustado. Revisa el reparto y apruébalo."
      : `Pago ajustado, pero el monto no alcanza para canon + cuota ($${canon + expectedCredit}): la cuota quedará pendiente.`,
    notes: update.notes,
  });
});

// ── Día en mantenimiento: validación contra TallerPro ───────────────────────
// Consulta el taller y valida el payment_date contra las estadías (entrada → salida).
// Si TallerPro no responde, taller.available = false y no hay validación (best-effort).
async function buildMaintenanceCheck(payment: { id?: number; plate: string; payment_date: string }, taller?: TallerCheck) {
  taller = taller ?? (await checkVehicleInShop(payment.plate));
  if (!taller.available) return { taller, validation: null as MaintenanceValidation | null };

  let q = supabase
    .from("payments")
    .select("id, amount, status")
    .eq("plate", payment.plate)
    .eq("payment_date", payment.payment_date)
    .neq("status", "rejected");
  if (payment.id != null) q = q.neq("id", payment.id);
  const { data: sameDay } = await q;

  const validation = validateMaintenanceDay(payment.payment_date, taller, (sameDay || []) as any[]);
  return { taller, validation };
}

/** Nota de un día en mantenimiento: la estadía del taller que lo cubre, o el motivo si está fuera del taller. */
function maintenanceNote(validation: MaintenanceValidation | null, userNote: string): string {
  const s = validation?.covering_stay;
  if (s) {
    return `Día en mantenimiento (taller): ingreso ${s.id} · entrada ${s.entrada} · salida ${s.salida ?? "sigue en taller"}` +
      (s.salida_fuente === "estimada" ? " (estimada)" : "") +
      (s.motivo_visita ? ` · ${s.motivo_visita.trim()}` : "") +
      (userNote ? ` — ${userNote}` : "");
  }
  if (validation) {
    return `Día en mantenimiento FUERA del taller: ${userNote} [${validation.warnings.map((w) => w.code).join(", ")}]`;
  }
  return `Día en mantenimiento${userNote ? `: ${userNote}` : ""}`;
}

// ── GET /reports/payments/:id/maintenance-check ─────────────────────────────
r.get("/payments/:id/maintenance-check", async (req: Request, res: Response) => {
  const paymentId = parseInt(String(req.params.id || ""), 10);
  if (isNaN(paymentId)) return res.status(400).json({ error: "ID de pago inválido" });

  const { data: payment, error } = await supabase
    .from("payments")
    .select("id, plate, payment_date, status")
    .eq("id", paymentId)
    .maybeSingle();
  if (error || !payment) return res.status(404).json({ error: "Pago no encontrado" });

  const { taller, validation } = await buildMaintenanceCheck(payment);
  return res.json({ payment_id: payment.id, plate: payment.plate, payment_date: payment.payment_date, taller, validation });
});

// ── POST /reports/payments/:id/mark-maintenance ─────────────────────────────
// Marca un pago pendiente como "día en mantenimiento": monto $0, sin reparto, confirmado.
// - Día dentro de una estadía del taller → sin warnings; la nota se arma con la estadía.
// - Día fuera de rango / muy lejano / ya usado → warnings y nota obligatoria (mín. 10 caracteres).
// - TallerPro no responde → sigue sin validar, nota opcional.
// Body: { notes?: string }
r.post("/payments/:id/mark-maintenance", async (req: Request, res: Response) => {
  const paymentId = parseInt(String(req.params.id || ""), 10);
  if (isNaN(paymentId)) return res.status(400).json({ error: "ID de pago inválido" });
  const userNote = String(req.body?.notes || "").trim();

  const { data: payment, error: pErr } = await supabase
    .from("payments")
    .select("id, plate, payment_date, amount, status, credit_installment_amount")
    .eq("id", paymentId)
    .maybeSingle();
  if (pErr || !payment) return res.status(404).json({ error: "Pago no encontrado" });
  if (payment.status !== "pending") {
    return res.status(400).json({ error: "Solo se pueden marcar en mantenimiento pagos pendientes." });
  }
  if (Number(payment.credit_installment_amount || 0) > 0) {
    return res.status(400).json({
      error: "El pago tiene abono a una cuota de anticipo. Corrija la cuota antes de marcarlo como mantenimiento.",
    });
  }

  const { taller, validation } = await buildMaintenanceCheck(payment);
  const warnings = validation?.warnings ?? [];

  if (warnings.length && userNote.length < 10) {
    return res.status(422).json({
      error: "El día no concuerda con el taller. Escriba qué tipo de mantenimiento es y por qué no se hace en el taller.",
      requires_note: true,
      taller,
      validation,
    });
  }

  let notes = maintenanceNote(validation, userNote);
  notes += ` (monto original registrado: $${Number(payment.amount || 0)})`;

  const { error: upErr } = await supabase
    .from("payments")
    .update({
      amount: 0,
      insurance_amount: 0,
      maintenance_amount: 0,
      delivery_amount: 0,
      credit_installment_amount: 0,
      late_fee_amount: 0,
      late_fee_paid: 0,
      installment_number: null,
      installment_status: null,
      installment_shortfall: null,
      receipt_status: "maintenance_day",
      flagged_for_review: false,
      status: "confirmed",
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId)
    .eq("status", "pending");
  if (upErr) return res.status(500).json({ error: `Error marcando mantenimiento: ${upErr.message}` });

  return res.json({ success: true, message: "Pago marcado como día en mantenimiento.", notes });
});

// ── POST /reports/payments/:id/approve ──────────────────────────────────────
// Aprueba un pago en estado 'pending'.
// - Si es leasing: aplica la cascada estricta (applyLeasingPayment). Si falla, NO confirma el pago
//   y retorna 422 con el error. Si triunfa, actualiza status = 'confirmed'.
// - Si es renting: respeta el split guardado, marca status = 'confirmed' y si el pago
//   incluía installment_number, asegura que el cronograma del anticipo quede en 'paid'.
r.post("/payments/:id/approve", async (req: Request, res: Response) => {
  const paymentId = parseInt(String(req.params.id || ""), 10);
  if (isNaN(paymentId)) return res.status(400).json({ error: "ID de pago inválido" });

  try {
    const { data: payment, error: pErr } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (pErr || !payment) {
      return res.status(404).json({ error: "Pago no encontrado" });
    }

    if (payment.status === "confirmed") {
      return res.status(400).json({ error: "Este pago ya fue confirmado previamente" });
    }

    const leasingContract = await getActiveLeasingContract(payment.plate);
    const isLeasing = !!(leasingContract && !leasingContract.start_date_pending_confirmation);

    if (isLeasing) {
      // 🔴 2 & 🟡 4: Cascada estricta. Deducir la cuota de anticipo para enviar el canon limpio
      const creditAmt = Number(payment.credit_installment_amount || 0);
      const leasingAmt = Math.max(0, Number(payment.amount) - creditAmt);

      const cascadeResult = await applyLeasingPayment(payment.id, leasingAmt, leasingContract.id);
      if (!cascadeResult.ok) {
        return res.status(422).json({
          error: `No se pudo aplicar la cuota de leasing: ${cascadeResult.error}`,
        });
      }

      const { error: upErr } = await supabase
        .from("payments")
        .update({
          status: "confirmed",
          flagged_for_review: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      if (upErr) {
        return res.status(500).json({ error: `Error actualizando estado del pago: ${upErr.message}` });
      }

      // Si el pago de leasing incluía cuota de anticipo y crédito, marcarla pagada
      if (payment.installment_number != null && creditAmt > 0) {
        const activeAdv = await activeAdvanceForDriver(payment.plate, payment.payment_date, "id");

        if (activeAdv) {
          await supabase
            .from("operational_advance_schedule")
            .update({
              status: "paid",
              paid_date: payment.payment_date,
            })
            .eq("advance_id", activeAdv.id)
            .eq("installment_no", payment.installment_number);

          // Sincronizar cuota actual y estado del anticipo
          const { count: paidCount } = await supabase
            .from("operational_advance_schedule")
            .select("id", { count: "exact", head: true })
            .eq("advance_id", activeAdv.id)
            .eq("status", "paid");

          const newCurrent = paidCount ?? payment.installment_number;
          const { data: fullAdv } = await supabase
            .from("operational_advances")
            .select("installments")
            .eq("id", activeAdv.id)
            .single();

          const isComplete = fullAdv && newCurrent >= (fullAdv.installments ?? 0);

          await supabase
            .from("operational_advances")
            .update({
              current_installment: newCurrent,
              status: isComplete ? "closed" : "active",
              updated_at: new Date().toISOString(),
            })
            .eq("id", activeAdv.id);
        }
      }

      return res.json({
        success: true,
        message: "Pago de leasing aprobado y cuota amortizada exitosamente.",
        cascade: cascadeResult,
      });
    } else {
      // Renting Tradicional:
      // 🟠 3: Respetamos la distribución ya almacenada
      const { error: upErr } = await supabase
        .from("payments")
        .update({
          status: "confirmed",
          flagged_for_review: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      if (upErr) {
        return res.status(500).json({ error: `Error actualizando estado del pago: ${upErr.message}` });
      }

      // Si tenía cuota de anticipo asociada y crédito, marcarla pagada
      if (payment.installment_number != null && Number(payment.credit_installment_amount) > 0) {
        const activeAdv = await activeAdvanceForDriver(payment.plate, payment.payment_date, "id");

        if (activeAdv) {
          await supabase
            .from("operational_advance_schedule")
            .update({
              status: "paid",
              paid_date: payment.payment_date,
            })
            .eq("advance_id", activeAdv.id)
            .eq("installment_no", payment.installment_number);

          // Sincronizar cuota actual y estado del anticipo
          const { count: paidCount } = await supabase
            .from("operational_advance_schedule")
            .select("id", { count: "exact", head: true })
            .eq("advance_id", activeAdv.id)
            .eq("status", "paid");

          const newCurrent = paidCount ?? payment.installment_number;
          const { data: fullAdv } = await supabase
            .from("operational_advances")
            .select("installments")
            .eq("id", activeAdv.id)
            .single();

          const isComplete = fullAdv && newCurrent >= (fullAdv.installments ?? 0);

          await supabase
            .from("operational_advances")
            .update({
              current_installment: newCurrent,
              status: isComplete ? "closed" : "active",
              updated_at: new Date().toISOString(),
            })
            .eq("id", activeAdv.id);
        }
      }

      return res.json({
        success: true,
        message: "Pago de renting aprobado exitosamente.",
      });
    }
  } catch (err: any) {
    console.error("[approve payment] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ══ Resolver días en mora (pagos.md §6) ═════════════════════════════════════
const PLATE_RE = /^[A-Z]{3}\d{3}$/;
const RESOLVE_REASONS = ["maintenance", "no_driver", "liquidation", "advance"] as const;
type ResolveReason = (typeof RESOLVE_REASONS)[number];

const parseDates = (v: unknown): string[] =>
  [...new Set((Array.isArray(v) ? v : String(v || "").split(",")).map((d) => String(d).trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();

// ── GET /reports/plates/:plate/pending-days ─────────────────────────────────
// Días desde el último pago hasta hoy, con el conductor de cada día y si cuentan como mora.
// Incluye la tarifa diaria y el anticipo activo para el motivo "pago con anticipo".
r.get("/plates/:plate/pending-days", async (req: Request, res: Response) => {
  const plate = String(req.params.plate || "").toUpperCase().trim();
  if (!PLATE_RE.test(plate)) return res.status(400).json({ error: "Placa inválida (formato ABC123)" });

  try {
    const [pending, rate, { data: advance }] = await Promise.all([
      listPendingDays(plate),
      resolveDailyRentRate(plate),
      supabase
        .from("operational_advances")
        .select("id, person_name, driver_id, amount, daily_installment, status")
        .eq("plate", plate)
        .eq("status", "active")
        .maybeSingle(),
    ]);
    return res.json({
      ...pending,
      days_in_mora: pending.days.filter((d) => d.counts_as_mora).length,
      daily_rate: rate.dailyRate,
      is_leasing: rate.isLeasing,
      active_advance: advance ?? null,
    });
  } catch (e: any) {
    return res.status(500).json({ error: `Error listando días pendientes: ${e.message}` });
  }
});

// ── GET /reports/plates/:plate/pending-days/maintenance-check?dates=a,b ─────
// Valida cada día contra TallerPro (§5.1). Si TallerPro no responde, taller.available = false.
r.get("/plates/:plate/pending-days/maintenance-check", async (req: Request, res: Response) => {
  const plate = String(req.params.plate || "").toUpperCase().trim();
  if (!PLATE_RE.test(plate)) return res.status(400).json({ error: "Placa inválida (formato ABC123)" });
  const dates = parseDates(req.query.dates);
  if (!dates.length) return res.status(400).json({ error: "Indique las fechas (dates=YYYY-MM-DD,...)" });

  const taller = await checkVehicleInShop(plate);
  const days = await Promise.all(
    dates.map(async (date) => ({ date, validation: (await buildMaintenanceCheck({ plate, payment_date: date }, taller)).validation }))
  );
  return res.json({ plate, taller, days, has_warnings: days.some((d) => (d.validation?.warnings.length ?? 0) > 0) });
});

// ── POST /reports/plates/:plate/resolve-days ────────────────────────────────
// Body: { dates: string[], reason: "maintenance" | "no_driver" | "liquidation" | "advance", notes?, advance_id? }
// - maintenance: un pago confirmado de $0 por día (receipt_status = 'maintenance_day'), validado contra TallerPro.
//   Con warnings la nota es obligatoria (mín. 10 caracteres), igual que /payments/:id/mark-maintenance.
// - no_driver: si el día no tiene conductor ya está fuera de la mora; si tiene, 409 pidiendo quitar la asignación.
// - liquidation: un marcador de $0 por día (receipt_status = 'liquidation_debt') con la deuda del conductor
//   (canon + recargo máximo) que se descuenta en su liquidación (src/routes/liquidations.ts).
// - advance: pagos con anticipo de esas fechas (payDaysWithAdvance, mismo flujo de /payments/pay-with-advance).
// Los días se resuelven en orden desde el más antiguo (validateDatesToResolve).
r.post("/plates/:plate/resolve-days", async (req: Request, res: Response) => {
  const plate = String(req.params.plate || "").toUpperCase().trim();
  if (!PLATE_RE.test(plate)) return res.status(400).json({ error: "Placa inválida (formato ABC123)" });
  const reason = String(req.body?.reason || "") as ResolveReason;
  if (!RESOLVE_REASONS.includes(reason)) return res.status(400).json({ error: "Motivo inválido" });
  const dates = parseDates(req.body?.dates);
  if (!dates.length) return res.status(400).json({ error: "Seleccione al menos un día." });
  const userNote = String(req.body?.notes || "").trim();

  let pending: PendingDaysResult;
  try {
    pending = await listPendingDays(plate);
  } catch (e: any) {
    return res.status(500).json({ error: `Error listando días pendientes: ${e.message}` });
  }

  // Sin conductor: no se registra nada; solo se verifica que el día no tenga conductor asignado
  if (reason === "no_driver") {
    const byDate = new Map(pending.days.map((d) => [d.date, d]));
    const unknown = dates.filter((d) => !byDate.has(d));
    if (unknown.length) return res.status(400).json({ error: `Días fuera del rango pendiente: ${unknown.join(", ")}` });
    const assigned = dates.map((d) => byDate.get(d)!).filter((d) => d.drivers.length > 0);
    if (assigned.length) {
      return res.status(409).json({
        code: "DRIVER_ASSIGNED",
        error:
          "Estos días tienen conductor asignado. Quite primero la asignación del conductor (historial de asignaciones del vehículo) y el día quedará sin conductor.",
        days: assigned.map((d) => ({ date: d.date, drivers: d.drivers })),
      });
    }
    return res.json({ success: true, message: "Los días no tienen conductor asignado: ya no cuentan como mora.", dates });
  }

  const orderError = validateDatesToResolve(pending, dates);
  if (orderError) return res.status(400).json({ error: orderError });

  // Descuento en liquidación: el día lo debe el conductor que tenía el carro (canon + recargo máximo).
  // Fila marcador de $0 que liquidations.ts suma como deuda del conductor mientras liquidation_id sea NULL.
  if (reason === "liquidation") {
    const { dailyRate, isLeasing } = await resolveDailyRentRate(plate);
    const lateFee = isLeasing ? 0 : LATE_FEE_MAX; // el recargo no aplica en leasing (§3)
    const dayInfo = new Map(pending.days.map((d) => [d.date, d]));
    const rows = dates.map((date) => {
      const resp = dayInfo.get(date)!.responsible!;
      return {
        payer_name: resp.driver_name || `Conductor #${resp.driver_id}`,
        plate,
        driver_id: resp.driver_id,
        payment_date: date,
        amount: 0,
        status: "confirmed",
        insurance_amount: 0,
        maintenance_amount: 0,
        delivery_amount: 0,
        credit_installment_amount: 0,
        late_fee_amount: 0,
        late_fee_paid: 0,
        installment_number: null,
        receipt_status: "liquidation_debt",
        reference_number: `LIQ-${plate}-${date}`,
        receipt_date: date,
        liquidation_debt_amount: dailyRate + lateFee,
        flag_details: { payment_type: "liquidation_debt", canon: dailyRate, late_fee: lateFee },
        notes:
          `Descuento en liquidación de ${resp.driver_name || `#${resp.driver_id}`}: canon $${dailyRate}` +
          (lateFee ? ` + recargo $${lateFee}` : "") +
          (userNote ? ` — ${userNote}` : ""),
      };
    });
    const { data: inserted, error: insErr } = await supabase.from("payments").insert(rows).select("id, payment_date, driver_id, liquidation_debt_amount");
    if (insErr) return res.status(500).json({ error: `Error registrando el descuento en liquidación: ${insErr.message}` });
    const total = rows.reduce((s, r) => s + r.liquidation_debt_amount, 0);
    return res.status(201).json({
      success: true,
      message: `${rows.length} día(s) quedan como deuda en la liquidación del conductor ($${total.toLocaleString("es-CO")}).`,
      payments: inserted ?? [],
    });
  }

  if (reason === "advance") {
    const out = await payDaysWithAdvance({ plate, advance_id: req.body?.advance_id, dates, notes: userNote || undefined });
    return res.status(out.status).json(out.body);
  }

  // Mantenimiento
  const taller = await checkVehicleInShop(plate);
  const checks = await Promise.all(dates.map(async (date) => ({ date, ...(await buildMaintenanceCheck({ plate, payment_date: date }, taller)) })));
  const withWarnings = checks.filter((c) => (c.validation?.warnings.length ?? 0) > 0);
  if (withWarnings.length && userNote.length < 10) {
    return res.status(422).json({
      error: "Hay días que no concuerdan con el taller. Escriba qué tipo de mantenimiento es y por qué no se hace en el taller.",
      requires_note: true,
      taller,
      days: checks.map((c) => ({ date: c.date, validation: c.validation })),
    });
  }

  const { dailyRate } = await resolveDailyRentRate(plate);
  const dayInfo = new Map(pending.days.map((d) => [d.date, d]));
  const rows = checks.map((c) => {
    const resp = dayInfo.get(c.date)?.responsible ?? null;
    return {
      payer_name: resp?.driver_name || "Mantenimiento",
      plate,
      driver_id: resp?.driver_id ?? null,
      payment_date: c.date,
      amount: 0,
      status: "confirmed",
      insurance_amount: 0,
      maintenance_amount: 0,
      delivery_amount: 0,
      credit_installment_amount: 0,
      late_fee_amount: 0,
      late_fee_paid: 0,
      installment_number: null,
      receipt_status: "maintenance_day",
      reference_number: `MANT-${plate}-${c.date}`,
      receipt_date: c.date,
      notes: `${maintenanceNote(c.validation, userNote)} (resuelto desde "Resolver días"; canon del día: $${dailyRate})`,
    };
  });

  const { data: inserted, error: insErr } = await supabase.from("payments").insert(rows).select("id, payment_date");
  if (insErr) return res.status(500).json({ error: `Error registrando días en mantenimiento: ${insErr.message}` });

  return res.status(201).json({
    success: true,
    message: `${rows.length} día(s) registrados en mantenimiento.`,
    payments: inserted ?? [],
  });
});

export default r;


