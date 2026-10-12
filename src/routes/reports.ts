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
  const includeInactive = String(req.query.include_inactive ?? "true") !== "false";

  // Cota práctica compartida por Paso 1 y Paso 3: un pago más antiguo no sería
  // "el último" si hay alguno más reciente, así que ninguno de los dos pasos
  // pierde ningún caso real usando esta misma ventana.
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  const twoYearsAgoStr = twoYearsAgo.toISOString().slice(0, 10);

  // ── Total de pagos pendientes en toda la flota para banner de advertencia ──
  const { count: globalPendingCount } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  // ── Paso 1: resolver qué placas son sospechosas o pendientes ANTES de paginar ────────
  // Cuando suspicious_only=true o pending_only=true, la condición debe aplicarse sobre el conjunto
  // COMPLETO antes de recortar con range().
  let suspiciousPlates: Set<string> | null = null;
  let pendingPlates: Set<string> | null = null;

  if (suspiciousOnly || pendingOnly) {
    // Traemos las columnas necesarias para clasificar y saber el status del último pago
    const { data: allAudit, error: auditErr } = await supabase
      .from("payments")
      .select("plate, receipt_status, flagged_for_review, flag_reason, status")
      .gte("payment_date", twoYearsAgoStr)
      .order("payment_date", { ascending: false })
      .order("created_at",   { ascending: false });

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

    if (suspiciousOnly) {
      suspiciousPlates = new Set<string>();
      for (const [plate, audit] of latestByPlate) {
        const cls = classifyReceipt(audit.receipt_status, audit.flagged_for_review, audit.flag_reason);
        if (cls.is_suspicious || cls.is_technical_failure) {
          suspiciousPlates.add(plate);
        }
      }
    }

    if (pendingOnly) {
      pendingPlates = new Set<string>();
      for (const [plate, audit] of latestByPlate) {
        if (audit.status === "pending") {
          pendingPlates.add(plate);
        }
      }
    }
  }

  // ── Paso 2: consultar vehicle_last_payment con paginación correcta ────────
  let allowedPlates: string[] | null = null;

  if (!includeInactive) {
    const { data: vRows, error: vErr } = await supabase
      .from("vehicles")
      .select("plate, status");

    if (vErr) return res.status(500).json({ error: vErr.message });

    allowedPlates = (vRows ?? [])
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

    // Estado del vehículo
    const { data: vData } = await supabase
      .from("vehicles")
      .select("plate, status")
      .in("plate", plates);
    const statusMap = new Map((vData || []).map((v: any) => [v.plate, v.status]));

    // Datos de auditoría del último pago, SOLO para las placas de esta página.
    // Replicamos el criterio de la vista: ORDER BY payment_date DESC, created_at DESC,
    // sin filtrar por status (la vista tampoco lo hace). Usamos la misma ventana de
    // 2 años que el Paso 1 (en vez de un límite fijo de filas): un límite como
    // "N filas por placa" aplicado sobre el resultado GLOBAL puede dejar fuera el
    // pago más reciente de una placa si las demás placas de la página acumulan más
    // filas recientes — eso desalinea esta reclasificación con la del Paso 1 y hace
    // que el badge nunca aparezca aunque suspicious_only sí haya incluido la placa.
    const auditBaseColumns = "plate, receipt_status, flagged_for_review, flag_reason, payment_date, created_at, status";
    let auditPage: any[] | null;
    let auditPageErr: { message: string } | null;
    ({ data: auditPage, error: auditPageErr } = await supabase
      .from("payments")
      .select(`${auditBaseColumns}, flag_details, proof_url, amount, reference_number, id, bank_transaction_id`)
      .in("plate", plates)
      .gte("payment_date", twoYearsAgoStr)
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
        .gte("payment_date", twoYearsAgoStr)
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

    // Resolver en 1 query batch los pagos duplicados referenciados en flag_details
    // de esta página, para evitar N+1 queries.
    const duplicateIds = collectDuplicateIds([...auditMap.values()].map((a) => a.flag_details));
    const duplicateResolver = new Map<number, DuplicatePaymentSummary>();
    if (duplicateIds.size > 0) {
      const { data: dupRows } = await supabase
        .from("payments")
        .select("id, plate, payment_date, amount, reference_number, proof_url")
        .in("id", [...duplicateIds]);
      for (const row of dupRows ?? []) duplicateResolver.set(row.id, row as DuplicatePaymentSummary);
    }

    // Resolver en 1 query batch el movimiento bancario exacto con el que se
    // concilio cada pago de esta pagina (ver POST /reconcile-bank).
    const bankTransactionIds = new Set<number>();
    for (const a of auditMap.values()) if (a.bank_transaction_id) bankTransactionIds.add(a.bank_transaction_id);
    const bankMatchResolver = new Map<number, {
      id: number;
      fecha: string | null;
      descripcion: string | null;
      referencia: string | null;
      monto_entrada: number | null;
      sucursal: string | null;
    }>();
    if (bankTransactionIds.size > 0) {
      const { data: bankRows } = await supabase
        .from("transacciones_entrantes")
        .select("id, fecha, descripcion, referencia, monto_entrada, sucursal")
        .in("id", [...bankTransactionIds]);
      for (const row of bankRows ?? []) bankMatchResolver.set(row.id, row);
    }

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
      .select("id, plate, payer_name, payment_date, amount, status, receipt_status, proof_url, installment_number, maintenance_amount, delivery_amount, insurance_amount, credit_installment_amount")
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
      const { data: activeAdvLeasing } = await supabase
        .from("operational_advances")
        .select("id, daily_installment, current_installment, installments")
        .eq("plate", payment.plate)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

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
    const { data: activeAdv } = await supabase
      .from("operational_advances")
      .select("id, daily_installment, current_installment, installments")
      .eq("plate", payment.plate)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const mStored = Number(payment.maintenance_amount || 0);
    const dStored = Number(payment.delivery_amount || 0);
    const iStored = Number(payment.insurance_amount || 0);
    const cStored = Number(payment.credit_installment_amount || 0);
    const amt = Number(payment.amount || 0);
    const totalStored = mStored + dStored + iStored + cStored;
    const excess = Math.max(0, amt - totalStored);

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
      warning_message: null,
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
        normal_quota: dStored,
        advance: cStored,
        excess,
      },
      quota_expected: null,
    });
  } catch (err: any) {
    console.error("[approval-preview] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
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
        const { data: activeAdv } = await supabase
          .from("operational_advances")
          .select("id")
          .eq("plate", payment.plate)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

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
        const { data: activeAdv } = await supabase
          .from("operational_advances")
          .select("id")
          .eq("plate", payment.plate)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

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

export default r;


