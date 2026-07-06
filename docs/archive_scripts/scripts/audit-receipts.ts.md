import { supabase } from "../src/lib/supabase";
import { parseReceipt } from "../src/lib/ocr";

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Implementación simple de concurrencia en caso de fallos con p-limit
const pLimitSimple = (concurrency: number) => {
  const queue: any[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const task = queue.shift();
      task();
    }
  };

  return (fn: () => Promise<any>) => new Promise((resolve, reject) => {
    const run = async () => {
      activeCount++;
      try {
        const res = await fn();
        resolve(res);
      } catch (err) {
        reject(err);
      } finally {
        next();
      }
    };

    if (activeCount < concurrency) {
      run();
    } else {
      queue.push(run);
    }
  });
};

const limit = pLimitSimple(1); // Free tier: max 5 req/min → concurrencia 1 + delay 13s

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = res.headers.get('content-type') || 'image/jpeg';
    return { buffer, mimeType };
  } catch (error) {
    console.error(`Error fetching URL ${url}:`, error);
    return null;
  }
}

async function runAudit() {
  console.log("🚀 Iniciando auditoría de comprobantes...");

  // 1. Obtener pagos (limitado a placa HMO959 y conductor Brandon%)
  const { data: payments, error: payErr } = await supabase
    .from("payments")
    .select("id, amount, proof_url, payment_date, drivers!inner(full_name)")
    .eq("plate", "HMO959")
    .ilike("drivers.full_name", "Brandon%")
    .is("reference_number", null)
    .eq("status", "confirmed")
    .order("payment_date", { ascending: true });

  if (payErr || !payments) {
    console.error("Error fetching payments:", payErr);
    return;
  }

  console.log(`Encontrados ${payments.length} pagos para procesar.`);

  // 2. Obtener los que ya procesamos
  const { data: alreadyProcessed, error: auditErr } = await supabase
    .from("receipt_audit_results")
    .select("payment_id");

  if (auditErr) {
    console.error("Error fetching audit table:", auditErr);
    return;
  }

  const processedIds = new Set(alreadyProcessed?.map(p => p.payment_id) || []);
  const toProcess = payments.filter(p => !processedIds.has(p.id));

  console.log(`Quedan ${toProcess.length} pagos por procesar luego de omitir los ya auditados.`);

  // 3. Procesar en paralelo (máximo 5)
  let count = 0;
  const promises = toProcess.map(payment => limit(async () => {
    count++;
    console.log(`[${count}/${toProcess.length}] Procesando pago ID: ${payment.id}...`);
    
    if (!payment.proof_url) {
      await supabase.from("receipt_audit_results").insert([{
        payment_id: payment.id,
        ocr_status: "no_url",
        notes: "El pago no tiene URL de imagen"
      }]);
      return;
    }

    const imgData = await fetchImageBuffer(payment.proof_url);
    
    if (!imgData) {
      await supabase.from("receipt_audit_results").insert([{
        payment_id: payment.id,
        ocr_status: "fetch_failed",
        notes: "Error descargando imagen"
      }]);
      return;
    }

    const ocrResult = await parseReceipt(imgData.buffer, imgData.mimeType);

    if (ocrResult.status === "suspicious_ocr_failed" && ocrResult.message?.includes("Ningún proveedor")) {
      console.error("\n🛑 Ningún proveedor de OCR disponible (probablemente todos sin cuota). Deteniéndose limpiamente.");
      process.exit(0);
    }

    // Extraer y normalizar
    const ocr_ref = ocrResult.reference_number ? String(ocrResult.reference_number).trim().toUpperCase() : null;
    const isAmountMismatch = (ocrResult.amount !== null && Number(ocrResult.amount) !== Number(payment.amount));

    let notes = isAmountMismatch ? `Discrepancia de monto: DB=${payment.amount} vs OCR=${ocrResult.amount}` : "";
    if (ocrResult.ocr_provider) notes += (notes ? " | " : "") + `via ${ocrResult.ocr_provider}`;

    await supabase.from("receipt_audit_results").insert([{
      payment_id: payment.id,
      ocr_reference_number: ocr_ref,
      ocr_provider_name: ocrResult.provider_name,
      ocr_receipt_date: ocrResult.receipt_date,
      ocr_amount: ocrResult.amount,
      ocr_status: ocrResult.status,
      is_duplicate_amount_date: isAmountMismatch,
      notes: notes
    }]);
  }));

  await Promise.all(promises);

  console.log("✅ Extracción OCR terminada. Iniciando verificación cruzada de duplicados...");

  // 4. Verificación cruzada
  const { data: allAudited } = await supabase
    .from("receipt_audit_results")
    .select("*");

  let dupCount = 0;

  if (allAudited) {
    for (const row of allAudited) {
      if (!row.ocr_reference_number) continue;

      let isDup = false;
      let dupPaymentId = null;

      // Buscar si existe en payments productivo
      const { data: dbMatches } = await supabase
        .from("payments")
        .select("id")
        .eq("reference_number", row.ocr_reference_number)
        .limit(1);

      if (dbMatches && dbMatches.length > 0 && dbMatches[0]) {
        isDup = true;
        dupPaymentId = dbMatches[0].id;
      } else {
        // Buscar si existe en la misma auditoría (con un payment_id diferente al mío)
        const peerMatch = allAudited.find(a => 
          a.ocr_reference_number === row.ocr_reference_number && 
          a.payment_id !== row.payment_id
        );
        if (peerMatch) {
          isDup = true;
          dupPaymentId = peerMatch.payment_id;
        }
      }

      if (isDup) {
        dupCount++;
        await supabase
          .from("receipt_audit_results")
          .update({
            is_duplicate_reference: true,
            duplicate_of_payment_id: dupPaymentId,
            notes: (row.notes ? row.notes + " | " : "") + "Duplicado de referencia detectado."
          })
          .eq("id", row.id);
      }
    }
  }

  // 5. Resumen Final
  const { data: finalStats } = await supabase.from("receipt_audit_results").select("*");
  const total = finalStats?.length || 0;
  const verified = finalStats?.filter(r => r.ocr_status === "verified").length || 0;
  const suspicious = finalStats?.filter(r => ["suspicious_ocr_failed", "timeout", "fetch_failed"].includes(r.ocr_status || "")).length || 0;
  const mismatches = finalStats?.filter(r => r.is_duplicate_amount_date === true).length || 0;

  console.log("=========================================");
  console.log("📊 RESULTADOS DE AUDITORÍA");
  console.log("=========================================");
  console.log(`Total procesados:       ${total}`);
  console.log(`Exitosos (verified):    ${verified}`);
  console.log(`Fallos (OCR o Red):     ${suspicious}`);
  console.log(`Duplicados Encontrados: ${dupCount}`);
  console.log(`Discrepancia de Montos: ${mismatches}`);
  console.log("=========================================");
}

runAudit().then(() => {
  console.log("Proceso finalizado.");
  process.exit(0);
}).catch(console.error);
