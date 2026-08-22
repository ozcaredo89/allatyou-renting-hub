/**
 * scripts/backfill-flag-details.ts
 *
 * Reconstruye payments.flag_details para pagos anómalos históricos (creados
 * antes de que el flujo en tiempo real de POST /payments empezara a capturarlo).
 *
 * Algoritmo (ver docs de la migración de "visibilidad de inconsistencias"):
 *
 * Pasada 1 — Mapa de referencias (universo amplio):
 *   Se resuelve una "referencia efectiva" por payment_id combinando 3 fuentes,
 *   en orden de prioridad:
 *     1. payments.reference_number            (incluye el pago limpio/original)
 *     2. receipt_uploads.reference_number      (vía linked_payment_id)
 *     3. receipt_audit_results.ocr_reference_number (vía payment_id)
 *   Se agrupan los payment_id por (referencia normalizada, placa) — NO solo por
 *   referencia. Un valor de "referencia" que aparece en dos placas distintas casi
 *   nunca es un pago duplicado real (nadie duplica el comprobante de OTRO carro);
 *   con más probabilidad es un dato genérico mal leído por el OCR (ej.: el número
 *   de cuenta destino, que es el MISMO en todos los comprobantes porque todos los
 *   conductores le pagan a la misma cuenta). Confirmado en producción: la OCR
 *   confundió "Número de cuenta" con "Referencia" en varios comprobantes Nequi,
 *   agrupando pagos de 4 placas distintas como si fueran duplicados entre sí.
 *   Acotar el cluster a la misma placa evita ese falso positivo cruzado.
 *
 * Pasada 2 — Escritura de flag_details (universo acotado a anómalos):
 *   Para cada cluster (ref, placa) con 2+ ids, solo se actualiza flag_details en
 *   los pagos que ya son anómalos (flagged_for_review=true o
 *   receipt_status='suspicious_duplicate'). El pago limpio (si existe en el
 *   cluster) recibe flag_details como ancla de trazabilidad, pero no genera
 *   badge en la UI porque classifyReceipt() solo evalúa
 *   receipt_status/flagged_for_review, no flag_details.
 *
 * Adicionalmente, para cada pago anómalo actualizado se intenta enriquecer con
 * un amount_mismatch si hay un monto OCR resoluble (receipt_uploads.amount o
 * receipt_audit_results.ocr_amount) que difiera del amount guardado — salvo que
 * la proporción entre ambos sea un múltiplo "redondo" de 10 (10x/100x/1000x),
 * en cuyo caso se descarta por ser casi con certeza un error de lectura de
 * decimales/separador de miles del OCR (ej.: $91.000 leído como $9.100.000) y
 * no una discrepancia real de monto.
 *
 * Pasada 3 — Reconstrucción por (placa, receipt_date, monto):
 *   El flujo en tiempo real (POST /payments) también marca duplicado cuando
 *   NO hay referencia pero sí coinciden placa + receipt_date + monto exactos
 *   (ver dupAmt en payments.ts). Esta pasada replica exactamente ese criterio
 *   para los pagos que la Pasada 1/2 no pudo resolver por referencia. Es una
 *   igualdad EXACTA de fecha (no "cercana") — importante porque este negocio
 *   cobra una cuota diaria fija, así que el mismo monto se repite a diario por
 *   semanas; solo la coincidencia exacta de fecha+monto es una señal real, un
 *   monto igual en días distintos NO lo es. Un pago ya resuelto por referencia
 *   (mayor confianza) no se reprocesa aquí.
 *
 * Pasada 4 — Reclasificación de huérfanos con monto mal etiquetado:
 *   Un huérfano con receipt_status='suspicious_duplicate' pero SIN ningún
 *   duplicado real resoluble (ni por referencia ni por placa+fecha+monto) casi
 *   siempre no era un duplicado en absoluto — el flujo en tiempo real viejo
 *   usaba 'suspicious_duplicate' como estado genérico para CUALQUIER
 *   advertencia, incluyendo una simple discrepancia de monto OCR sin ningún
 *   otro pago involucrado (caso confirmado en producción: pago #4848,
 *   ISS909, marcado "duplicado" cuando el problema real era que el OCR leyó
 *   $50.000 y el sistema tenía $70.000 — no había ningún otro comprobante).
 *   Si el huérfano tiene un monto OCR resoluble y distinto (y la proporción
 *   no es un error implausible de OCR), se reclasifica a
 *   receipt_status='suspicious_amount_mismatch' con flag_details conteniendo
 *   solo db_amount/ocr_amount/difference — sin duplicate_payment_ids, porque
 *   no lo hay. Esto hace que la UI muestre la etiqueta correcta ("Monto no
 *   coincide con el comprobante") en vez de "Comprobante duplicado".
 *
 * Pagos anómalos sin ningún match resoluble y sin monto OCR reconstruible
 * quedan como huérfanos genuinos: se registran en backfill_orphans_log.json
 * y mantienen flag_details: null. La UI degrada limpiamente a texto plano
 * para esos casos.
 *
 * El script es idempotente y auto-correctivo: en cada corrida recalcula desde
 * cero qué pagos anómalos califican, y explícitamente limpia (flag_details =
 * null) cualquier pago anómalo que haya quedado con datos de una corrida
 * anterior pero que ya no califica bajo las reglas vigentes.
 *
 * Uso:
 *   npx ts-node scripts/backfill-flag-details.ts             # aplica los cambios
 *   npx ts-node scripts/backfill-flag-details.ts --dry-run   # solo reporta, no escribe
 */
import path from "path";
import fs from "fs";
import pLimit from "p-limit";
import { supabase } from "../src/lib/supabase";
import type { FlagDetails } from "../src/lib/receiptClassification";

const DRY_RUN = process.argv.includes("--dry-run");
const ORPHANS_LOG_PATH = path.resolve(__dirname, "..", "backfill_orphans_log.json");

interface PaymentRow {
  id: number;
  plate: string;
  payment_date: string | null;
  receipt_date: string | null;
  amount: number | null;
  proof_url: string | null;
  reference_number: string | null;
  flagged_for_review: boolean | null;
  receipt_status: string | null;
  flag_details: FlagDetails | null;
}

const PAYMENT_COLUMNS =
  "id, plate, payment_date, receipt_date, amount, proof_url, reference_number, flagged_for_review, receipt_status, flag_details";

function isAnomalous(p: PaymentRow): boolean {
  return p.flagged_for_review === true || p.receipt_status === "suspicious_duplicate";
}

function normalizeRef(ref: string): string {
  return ref.trim().toUpperCase();
}

/**
 * true si la proporción entre dos montos es un múltiplo redondo de 10
 * (10x, 100x, 1000x) — el patrón característico de un error de OCR al leer
 * separadores de miles/decimales, no una discrepancia de monto real.
 */
function isImplausibleAmountRatio(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const ratio = hi / lo;
  return [10, 100, 1000].some((k) => Math.abs(ratio - k) < 1e-6);
}

async function main() {
  console.log(`\n=== Backfill flag_details (${DRY_RUN ? "DRY RUN" : "APLICANDO CAMBIOS"}) ===\n`);

  // ---------------------------------------------------------------------
  // Pasada 1: construir el mapa de referencias (universo amplio)
  // ---------------------------------------------------------------------

  const { data: paymentsRef, error: e1 } = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .not("reference_number", "is", null);
  if (e1) throw new Error(`Fuente 1 (payments.reference_number) falló: ${e1.message}`);

  const { data: uploadsRef, error: e2 } = await supabase
    .from("receipt_uploads")
    .select("linked_payment_id, reference_number, amount")
    .not("linked_payment_id", "is", null)
    .not("reference_number", "is", null);
  if (e2) throw new Error(`Fuente 2 (receipt_uploads) falló: ${e2.message}`);

  const { data: auditRef, error: e3 } = await supabase
    .from("receipt_audit_results")
    .select("payment_id, ocr_reference_number, ocr_amount")
    .not("ocr_reference_number", "is", null);
  if (e3) throw new Error(`Fuente 3 (receipt_audit_results) falló: ${e3.message}`);

  // Universo de pagos anómalos a reparar (el target real del script).
  const { data: anomalousPayments, error: e4 } = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .or("flagged_for_review.eq.true,receipt_status.eq.suspicious_duplicate");
  if (e4) throw new Error(`Fuente de pagos anómalos falló: ${e4.message}`);

  // Mapa unificado id -> fila completa (para poder construir DuplicatePaymentSummary).
  const paymentsById = new Map<number, PaymentRow>();
  for (const p of (paymentsRef ?? []) as PaymentRow[]) paymentsById.set(p.id, p);
  for (const p of (anomalousPayments ?? []) as PaymentRow[]) {
    if (!paymentsById.has(p.id)) paymentsById.set(p.id, p);
  }

  // Referencia efectiva por payment_id, por prioridad de fuente.
  const effectiveRef = new Map<number, string>();
  for (const p of (paymentsRef ?? []) as PaymentRow[]) {
    if (p.reference_number) effectiveRef.set(p.id, normalizeRef(p.reference_number));
  }
  for (const u of uploadsRef ?? []) {
    const pid = u.linked_payment_id as number | null;
    if (pid != null && !effectiveRef.has(pid) && u.reference_number) {
      effectiveRef.set(pid, normalizeRef(String(u.reference_number)));
    }
  }
  for (const a of auditRef ?? []) {
    const pid = a.payment_id as number | null;
    if (pid != null && !effectiveRef.has(pid) && a.ocr_reference_number) {
      effectiveRef.set(pid, normalizeRef(String(a.ocr_reference_number)));
    }
  }

  // Monto OCR resoluble por payment_id (para el enriquecimiento amount_mismatch).
  const ocrAmountById = new Map<number, number>();
  for (const u of uploadsRef ?? []) {
    const pid = u.linked_payment_id as number | null;
    if (pid != null && u.amount != null && !ocrAmountById.has(pid)) {
      ocrAmountById.set(pid, u.amount as number);
    }
  }
  for (const a of auditRef ?? []) {
    const pid = a.payment_id as number | null;
    if (pid != null && a.ocr_amount != null && !ocrAmountById.has(pid)) {
      ocrAmountById.set(pid, a.ocr_amount as number);
    }
  }

  // Agrupar por referencia normalizada (todavía sin partir por placa: para eso
  // hace falta la fila completa de cada payment_id, y algunos solo se resuelven
  // más abajo vía la "red de seguridad" de filas faltantes).
  const rawRefGroups = new Map<string, number[]>();
  for (const [paymentId, ref] of effectiveRef) {
    if (!rawRefGroups.has(ref)) rawRefGroups.set(ref, []);
    rawRefGroups.get(ref)!.push(paymentId);
  }

  // Completar filas faltantes para cualquier id que aparezca en un cluster
  // reconstruible pero que no haya llegado por Fuente 1 ni por anomalousPayments
  // (caso borde: pago limpio sin flagged_for_review pero con reference_number
  // ya cubierto por Fuente 1; este fetch es una red de seguridad).
  const clusterCandidateIds = new Set<number>();
  for (const ids of rawRefGroups.values()) {
    if (ids.length >= 2) for (const id of ids) clusterCandidateIds.add(id);
  }
  const missingIds = [...clusterCandidateIds].filter((id) => !paymentsById.has(id));
  if (missingIds.length > 0) {
    const { data: extra, error: e5 } = await supabase
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .in("id", missingIds);
    if (e5) throw new Error(`Resolución de filas faltantes falló: ${e5.message}`);
    for (const p of (extra ?? []) as PaymentRow[]) paymentsById.set(p.id, p);
  }

  // Una referencia de transacción real es única por definición: si el mismo
  // valor aparece más de un par de veces en todo el sistema, no es una
  // referencia — es un campo genérico mal leído por el OCR (ej. el número de
  // cuenta destino, idéntico en todo comprobante hacia la misma empresa).
  // Una resubida accidental del MISMO comprobante produce como mucho 2
  // ocurrencias; toleramos hasta 3 para casos borde (reintentos, etc.) y
  // descartamos por completo cualquier valor más frecuente que eso — incluso
  // dentro de la misma placa, como el caso confirmado de "265000007983".
  const MAX_PLAUSIBLE_REFERENCE_OCCURRENCES = 3;
  let genericValueGroupsDiscarded = 0;
  let refEqualsPlateDiscarded = 0;

  // Ahora que paymentsById está completo, partimos cada grupo de referencia por
  // placa — ver la nota al inicio del archivo sobre por qué un mismo valor de
  // "referencia" repetido en placas distintas no se trata como duplicado real.
  const refGroups = new Map<string, number[]>();
  for (const [ref, ids] of rawRefGroups) {
    if (ids.length < 2) continue;
    if (ids.length > MAX_PLAUSIBLE_REFERENCE_OCCURRENCES) {
      genericValueGroupsDiscarded++;
      continue; // valor demasiado frecuente para ser una referencia real; se descarta entero
    }
    const byPlate = new Map<string, number[]>();
    for (const id of ids) {
      const plate = paymentsById.get(id)?.plate;
      if (!plate) continue; // fila irresoluble incluso tras la red de seguridad
      // La "referencia" nunca debería ser literalmente la placa del vehículo —
      // si lo es, es un artefacto de datos, no una referencia bancaria real.
      if (ref === plate.toUpperCase()) {
        refEqualsPlateDiscarded++;
        continue;
      }
      if (!byPlate.has(plate)) byPlate.set(plate, []);
      byPlate.get(plate)!.push(id);
    }
    for (const [plate, plateIds] of byPlate) {
      if (plateIds.length < 2) continue;
      refGroups.set(`${ref}::${plate}`, plateIds);
    }
  }

  let implausibleAmountRatioSkipped = 0;
  let crossPlateGroupsDiscarded = 0;
  for (const [ref, ids] of rawRefGroups) {
    if (ids.length < 2 || ids.length > MAX_PLAUSIBLE_REFERENCE_OCCURRENCES) continue;
    const distinctPlates = new Set(ids.map((id) => paymentsById.get(id)?.plate).filter(Boolean));
    if (distinctPlates.size > 1) crossPlateGroupsDiscarded++;
  }

  // ---------------------------------------------------------------------
  // Pasada 2: escritura de flag_details (universo acotado a anómalos)
  // ---------------------------------------------------------------------

  let reconstructedWithAnchor = 0;
  let reconstructedAnomalousOnly = 0;
  let reconstructedWithMismatch = 0;
  const clusteredAnomalousIds = new Set<number>();
  const updates: { id: number; flag_details: FlagDetails | null; receipt_status?: string }[] = [];

  for (const [refPlateKey, ids] of refGroups) {
    const ref = refPlateKey.slice(0, refPlateKey.lastIndexOf("::"));
    if (ids.length < 2) continue;

    const rows = ids.map((id) => paymentsById.get(id)).filter((r): r is PaymentRow => !!r);
    if (rows.length < 2) continue; // no se pudieron resolver suficientes filas reales

    const anomalousRows = rows.filter(isAnomalous);
    const cleanRows = rows.filter((r) => !isAnomalous(r));
    if (anomalousRows.length === 0) continue; // cluster sin nada que reparar

    if (cleanRows.length > 0) reconstructedWithAnchor++;
    else reconstructedAnomalousOnly++;

    for (const row of anomalousRows) {
      clusteredAnomalousIds.add(row.id);

      const flagDetails: FlagDetails = {
        duplicate_payment_ids: ids.filter((id) => id !== row.id),
        match_type: "reference",
        matched_reference: ref,
      };

      const ocrAmount = ocrAmountById.get(row.id);
      if (ocrAmount != null && row.amount != null && ocrAmount !== row.amount) {
        if (isImplausibleAmountRatio(row.amount, ocrAmount)) {
          implausibleAmountRatioSkipped++;
        } else {
          flagDetails.db_amount = row.amount;
          flagDetails.ocr_amount = ocrAmount;
          flagDetails.difference = row.amount - ocrAmount;
          reconstructedWithMismatch++;
        }
      }

      updates.push({ id: row.id, flag_details: flagDetails });
    }

    // Ancla de trazabilidad en el/los pago(s) limpio(s): no genera badge porque
    // classifyReceipt() no mira flag_details.
    for (const row of cleanRows) {
      updates.push({
        id: row.id,
        flag_details: {
          duplicate_payment_ids: ids.filter((id) => id !== row.id),
          match_type: "reference",
          matched_reference: ref,
        },
      });
    }
  }

  // ---------------------------------------------------------------------
  // Pasada 3: reconstrucción por (placa, receipt_date, monto) exactos —
  // replica el criterio "dupAmt" del flujo en tiempo real, solo para pagos
  // que la referencia no logró resolver.
  // ---------------------------------------------------------------------

  const { data: dateAmountRows, error: e6 } = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .not("receipt_date", "is", null);
  if (e6) throw new Error(`Fuente placa+fecha+monto falló: ${e6.message}`);

  for (const p of (dateAmountRows ?? []) as PaymentRow[]) {
    if (!paymentsById.has(p.id)) paymentsById.set(p.id, p);
  }

  const amountDateGroups = new Map<string, number[]>();
  for (const p of (dateAmountRows ?? []) as PaymentRow[]) {
    if (p.amount == null || !p.receipt_date) continue;
    const key = `${p.plate}::${p.receipt_date}::${p.amount}`;
    if (!amountDateGroups.has(key)) amountDateGroups.set(key, []);
    amountDateGroups.get(key)!.push(p.id);
  }

  let amountDateReconstructedWithAnchor = 0;
  let amountDateReconstructedAnomalousOnly = 0;
  let amountDateGenericGroupsDiscarded = 0;

  for (const ids of amountDateGroups.values()) {
    if (ids.length < 2) continue;
    if (ids.length > MAX_PLAUSIBLE_REFERENCE_OCCURRENCES) {
      // Mismo negocio, misma placa, misma fecha Y mismo monto más de un par de
      // veces es más probable un bug sistemático (ej. OCR sin poder leer la
      // fecha y usando un valor por defecto) que una coincidencia real.
      amountDateGenericGroupsDiscarded++;
      continue;
    }

    const rows = ids.map((id) => paymentsById.get(id)).filter((r): r is PaymentRow => !!r);
    if (rows.length < 2) continue;

    // No reprocesar pagos ya resueltos con mayor confianza por referencia (Pasada 1/2).
    const anomalousRows = rows.filter((r) => isAnomalous(r) && !clusteredAnomalousIds.has(r.id));
    if (anomalousRows.length === 0) continue;

    const cleanRows = rows.filter((r) => !isAnomalous(r));
    if (cleanRows.length > 0) amountDateReconstructedWithAnchor++;
    else amountDateReconstructedAnomalousOnly++;

    for (const row of anomalousRows) {
      clusteredAnomalousIds.add(row.id);
      updates.push({
        id: row.id,
        flag_details: {
          duplicate_payment_ids: ids.filter((id) => id !== row.id),
          match_type: "amount_date",
        },
      });
    }

    for (const row of cleanRows) {
      updates.push({
        id: row.id,
        flag_details: {
          duplicate_payment_ids: ids.filter((id) => id !== row.id),
          match_type: "amount_date",
        },
      });
    }
  }

  // Huérfanos: pagos anómalos que no cayeron en ningún cluster reconstruible.
  const orphanPayments = ((anomalousPayments ?? []) as PaymentRow[]).filter(
    (p) => !clusteredAnomalousIds.has(p.id),
  );

  // ---------------------------------------------------------------------
  // Pasada 4: reclasificar huérfanos mal etiquetados como "duplicado" cuando
  // en realidad el único problema es que el monto OCR no coincide — no hay
  // ningún otro pago de por medio, así que "duplicado" es engañoso.
  // ---------------------------------------------------------------------

  let reclassifiedAsAmountMismatch = 0;
  const reclassifiedIds = new Set<number>();
  for (const p of orphanPayments) {
    if (p.receipt_status !== "suspicious_duplicate") continue; // no tocar ocr_failed/timeout
    const ocrAmount = ocrAmountById.get(p.id);
    if (ocrAmount == null || p.amount == null || ocrAmount === p.amount) continue;
    if (isImplausibleAmountRatio(p.amount, ocrAmount)) continue;

    reclassifiedIds.add(p.id);
    reclassifiedAsAmountMismatch++;
    updates.push({
      id: p.id,
      receipt_status: "suspicious_amount_mismatch",
      flag_details: { db_amount: p.amount, ocr_amount: ocrAmount, difference: p.amount - ocrAmount },
    });
  }

  const trueOrphanPayments = orphanPayments.filter((p) => !reclassifiedIds.has(p.id));
  const orphans = trueOrphanPayments.map((p) => {
    const ref = effectiveRef.get(p.id);
    let reason: string;
    if (!ref) {
      reason =
        "Sin referencia resoluble en payments, receipt_uploads ni receipt_audit_results, y sin otro pago de la misma placa con receipt_date y monto exactamente iguales.";
    } else {
      const rawGroup = rawRefGroups.get(ref) ?? [];
      const samePlateCount = rawGroup.filter((id) => paymentsById.get(id)?.plate === p.plate).length;
      if (ref === p.plate.toUpperCase()) {
        reason = `La "referencia" resuelta es literalmente igual a la placa (${ref}) — es un artefacto de datos, no una referencia bancaria real.`;
      } else if (rawGroup.length > MAX_PLAUSIBLE_REFERENCE_OCCURRENCES) {
        reason = `Referencia "${ref}" aparece ${rawGroup.length} veces en todo el sistema — demasiado frecuente para ser una referencia de transacción real (probable campo genérico mal leído por OCR, ej. número de cuenta destino) — descartada por completo.`;
      } else if (rawGroup.length >= 2 && samePlateCount < 2) {
        reason = `Referencia "${ref}" compartida con otra(s) placa(s) pero ninguna coincide con la placa de este pago (probable dato genérico mal leído por OCR) — descartado como duplicado.`;
      } else {
        reason = "Referencia resuelta pero sin ningún otro pago de la misma placa con la misma referencia (cluster de tamaño 1).";
      }
    }
    return { id: p.id, plate: p.plate, payment_date: p.payment_date, receipt_status: p.receipt_status, reason };
  });

  // Auto-corrección: cualquier huérfano genuino que haya quedado con
  // flag_details de una corrida anterior (bajo reglas viejas) se limpia
  // explícitamente a null, para no dejar datos incorrectos residuales.
  let staleCleared = 0;
  for (const p of trueOrphanPayments) {
    if (p.flag_details != null) {
      updates.push({ id: p.id, flag_details: null });
      staleCleared++;
    }
  }

  const totalAnomalousUpdated = new Set(
    updates.filter((u) => clusteredAnomalousIds.has(u.id)).map((u) => u.id),
  ).size;

  // ---------------------------------------------------------------------
  // Reporte
  // ---------------------------------------------------------------------

  console.log(`Total pagos anómalos a actualizar: ${totalAnomalousUpdated}`);
  console.log(`--- Pasada 1/2 (por referencia) ---`);
  console.log(`Clusters reconstruibles (con ancla en pago limpio): ${reconstructedWithAnchor}`);
  console.log(`Clusters reconstruibles (solo entre anómalos): ${reconstructedAnomalousOnly}`);
  console.log(`Reconstruidos con amount_mismatch: ${reconstructedWithMismatch}`);
  console.log(`Descartados por proporción de monto implausible (10x/100x/1000x, error de OCR): ${implausibleAmountRatioSkipped}`);
  console.log(`Grupos de referencia descartados por valor genérico (aparece > ${MAX_PLAUSIBLE_REFERENCE_OCCURRENCES} veces en el sistema): ${genericValueGroupsDiscarded}`);
  console.log(`Grupos de referencia descartados por abarcar más de una placa: ${crossPlateGroupsDiscarded}`);
  console.log(`Descartados por ser la "referencia" literalmente igual a la placa: ${refEqualsPlateDiscarded}`);
  console.log(`--- Pasada 3 (por placa+receipt_date+monto exactos, solo lo no resuelto arriba) ---`);
  console.log(`Clusters reconstruibles (con ancla en pago limpio): ${amountDateReconstructedWithAnchor}`);
  console.log(`Clusters reconstruibles (solo entre anómalos): ${amountDateReconstructedAnomalousOnly}`);
  console.log(`Grupos descartados por valor genérico (aparece > ${MAX_PLAUSIBLE_REFERENCE_OCCURRENCES} veces para la misma placa+fecha+monto): ${amountDateGenericGroupsDiscarded}`);
  console.log(`--- Pasada 4 (reclasificación: "duplicado" mal etiquetado sin ningún otro pago involucrado) ---`);
  console.log(`Reclasificados a suspicious_amount_mismatch: ${reclassifiedAsAmountMismatch}`);
  console.log(`Huérfanos genuinos (sin duplicado ni monto OCR resoluble): ${orphans.length}`);
  console.log(`  de los cuales, con flag_details residual de una corrida anterior (ahora limpiado a null): ${staleCleared}`);
  console.log(`Filas a escribir en total (incluye anclas en pagos limpios y limpiezas): ${updates.length}`);

  fs.writeFileSync(ORPHANS_LOG_PATH, JSON.stringify({ generated_at: new Date().toISOString(), orphans }, null, 2));
  console.log(`\nLog de huérfanos escrito en: ${ORPHANS_LOG_PATH}`);

  if (DRY_RUN) {
    console.log("\n--- Clusters por REFERENCIA que pasarían todos los filtros ---");
    for (const [refPlateKey, ids] of refGroups) {
      if (ids.length < 2) continue;
      const rows = ids.map((id) => paymentsById.get(id)).filter((r): r is PaymentRow => !!r);
      if (rows.filter(isAnomalous).length === 0) continue;
      console.log(
        refPlateKey,
        "->",
        rows
          .map((r) => {
            const ocr = ocrAmountById.get(r.id);
            const ocrNote = ocr != null && ocr !== r.amount ? ` [ocr_amount=${ocr}]` : "";
            return `#${r.id} ${r.payment_date} $${r.amount}${ocrNote} ${isAnomalous(r) ? "(anómalo)" : "(limpio)"}`;
          })
          .join(" | "),
      );
    }

    console.log("\n--- Clusters por PLACA+RECEIPT_DATE+MONTO que pasarían todos los filtros ---");
    for (const [key, ids] of amountDateGroups) {
      if (ids.length < 2 || ids.length > MAX_PLAUSIBLE_REFERENCE_OCCURRENCES) continue;
      const rows = ids.map((id) => paymentsById.get(id)).filter((r): r is PaymentRow => !!r);
      if (rows.filter((r) => isAnomalous(r) && ids.includes(r.id)).length === 0) continue;
      console.log(
        key,
        "->",
        rows
          .map((r) => `#${r.id} pago=${r.payment_date} ref=${r.reference_number ?? "—"} ${isAnomalous(r) ? "(anómalo)" : "(limpio)"}`)
          .join(" | "),
      );
    }

    console.log("\n--- Pasada 4: reclasificaciones a suspicious_amount_mismatch (revisar antes de aplicar) ---");
    for (const u of updates) {
      if (u.receipt_status !== "suspicious_amount_mismatch") continue;
      const p = paymentsById.get(u.id);
      console.log(
        `#${u.id} ${p?.plate} ${p?.payment_date} -> db_amount=${u.flag_details?.db_amount} ocr_amount=${u.flag_details?.ocr_amount} (era: suspicious_duplicate)`,
      );
    }

    console.log("\nDRY RUN: no se escribió ningún flag_details en la base de datos.\n");
    return;
  }

  // ---------------------------------------------------------------------
  // Escritura (con concurrencia acotada)
  // ---------------------------------------------------------------------

  const limit = pLimit(5);
  let ok = 0;
  let failed = 0;

  await Promise.all(
    updates.map((u) =>
      limit(async () => {
        const patch: { flag_details: FlagDetails | null; receipt_status?: string } = {
          flag_details: u.flag_details,
        };
        if (u.receipt_status) patch.receipt_status = u.receipt_status;
        const { error } = await supabase
          .from("payments")
          .update(patch)
          .eq("id", u.id);
        if (error) {
          failed++;
          console.error(`  ✗ payment ${u.id}: ${error.message}`);
        } else {
          ok++;
        }
      }),
    ),
  );

  console.log(`\nEscritura completa: ${ok} OK, ${failed} fallidos.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill falló:", err);
    process.exit(1);
  });
