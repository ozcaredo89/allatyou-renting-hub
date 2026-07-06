import { supabase } from "../src/lib/supabase";

/**
 * Script manual para aplicar flags de auditoría a payments.
 * Lee receipt_audit_results, detecta grupos duplicados y actualiza
 * payments.flagged_for_review = true + flag_reason correspondiente.
 *
 * NO modifica ningún otro campo de payments (amount, status, etc.)
 * Es idempotente: se puede correr múltiples veces sin efectos secundarios.
 */

async function applyAuditFlags() {
  console.log("🔍 Iniciando aplicación de flags de auditoría...\n");

  const { data: auditRows, error } = await supabase
    .from("receipt_audit_results")
    .select("*")
    .in("ocr_status", ["verified", "suspicious_ocr_failed"])
    .not("ocr_reference_number", "is", null);

  if (error) {
    console.error("Error leyendo receipt_audit_results:", error);
    return;
  }

  console.log(`Registros con referencia OCR encontrados: ${auditRows?.length ?? 0}`);

  let flaggedByRef = 0;
  let flaggedByAmountDate = 0;

  // ---- 1. Duplicados por ocr_reference_number ----
  // Agrupar por referencia
  const refGroups = new Map<string, typeof auditRows>();
  for (const row of auditRows ?? []) {
    if (!row.ocr_reference_number) continue;
    const key = row.ocr_reference_number.trim().toUpperCase();
    if (!refGroups.has(key)) refGroups.set(key, []);
    refGroups.get(key)!.push(row);
  }

  for (const [ref, rows] of refGroups) {
    if (rows.length < 2) continue;

    console.log(`\n⚠️  Referencia duplicada: ${ref} (${rows.length} pagos)`);
    const paymentIds = rows.map(r => r.payment_id);

    for (const paymentId of paymentIds) {
      const { error: updateErr } = await supabase
        .from("payments")
        .update({
          flagged_for_review: true,
          flag_reason: "duplicate_reference"
        })
        .eq("id", paymentId);

      if (updateErr) {
        console.error(`  ❌ Error flagging payment ${paymentId}:`, updateErr.message);
      } else {
        console.log(`  ✅ Flagged payment ID: ${paymentId}`);
        flaggedByRef++;
      }
    }
  }

  // ---- 2. Duplicados por ocr_amount + ocr_receipt_date (misma placa) ----
  // Para esto cruzamos con payments para obtener la placa
  const { data: allAudit } = await supabase
    .from("receipt_audit_results")
    .select("payment_id, ocr_amount, ocr_receipt_date, ocr_status")
    .in("ocr_status", ["verified", "suspicious_ocr_failed"])
    .not("ocr_amount", "is", null)
    .not("ocr_receipt_date", "is", null);

  if (allAudit && allAudit.length > 0) {
    // Traer placa de cada payment
    const paymentIds = allAudit.map(r => r.payment_id);
    const { data: paymentsData } = await supabase
      .from("payments")
      .select("id, plate, amount")
      .in("id", paymentIds);

    const plateMap = new Map(paymentsData?.map(p => [p.id, p.plate]) ?? []);

    // Agrupar por amount + receipt_date + plate
    const amtDateGroups = new Map<string, number[]>();
    for (const row of allAudit) {
      const plate = plateMap.get(row.payment_id);
      if (!plate) continue;
      const key = `${row.ocr_amount}|${row.ocr_receipt_date}|${plate}`;
      if (!amtDateGroups.has(key)) amtDateGroups.set(key, []);
      amtDateGroups.get(key)!.push(row.payment_id);
    }

    for (const [key, ids] of amtDateGroups) {
      if (ids.length < 2) continue;

      console.log(`\n⚠️  Duplicado monto+fecha: ${key} (${ids.length} pagos)`);

      for (const paymentId of ids) {
        const { error: updateErr } = await supabase
          .from("payments")
          .update({
            flagged_for_review: true,
            flag_reason: "duplicate_amount_date"
          })
          .eq("id", paymentId)
          .eq("flagged_for_review", false); // Solo si no tiene ya un flag más grave

        if (!updateErr) {
          console.log(`  ✅ Flagged payment ID: ${paymentId}`);
          flaggedByAmountDate++;
        }
      }
    }
  }

  // ---- 3. Discrepancia de monto OCR vs monto guardado ----
  const { data: mismatchRows } = await supabase
    .from("receipt_audit_results")
    .select("payment_id, ocr_amount, notes")
    .eq("is_duplicate_amount_date", true)
    .not("ocr_amount", "is", null);

  let flaggedByMismatch = 0;
  for (const row of mismatchRows ?? []) {
    const { error: updateErr } = await supabase
      .from("payments")
      .update({
        flagged_for_review: true,
        flag_reason: "amount_mismatch"
      })
      .eq("id", row.payment_id)
      .eq("flagged_for_review", false);

    if (!updateErr) {
      flaggedByMismatch++;
    }
  }

  // ---- Resumen ----
  console.log("\n=========================================");
  console.log("📊 RESUMEN DE FLAGS APLICADOS");
  console.log("=========================================");
  console.log(`Por referencia duplicada:    ${flaggedByRef}`);
  console.log(`Por monto+fecha duplicados:  ${flaggedByAmountDate}`);
  console.log(`Por discrepancia de monto:   ${flaggedByMismatch}`);
  console.log(`TOTAL:                       ${flaggedByRef + flaggedByAmountDate + flaggedByMismatch}`);
  console.log("=========================================");
}

applyAuditFlags().then(() => {
  console.log("\n✅ Proceso completado.");
  process.exit(0);
}).catch(console.error);
