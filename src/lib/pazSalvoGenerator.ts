// src/lib/pazSalvoGenerator.ts
// =============================================================================
// Generador del documento oficial "PAZ Y SALVO, ACTA DE ENTREGA Y DEVOLUCIÓN
// DE GARANTÍA DE ALQUILER DE VEHÍCULO" (Fuente única: paz-salvo.html).
// Renderiza PDF (Puppeteer) y DOCX (html-to-docx), sube a R2 con clave fija
// por liquidación y registra auditoría.
// =============================================================================

import fs from "fs";
import path from "path";
import { supabase } from "./supabase";
import { fmt, toWords } from "./numberToWords";
import { renderDualDocument } from "./documentRenderer";

const TEMPLATE_PATH = path.resolve(process.cwd(), "src/templates/paz-salvo.html");

export interface PazSalvoParams {
  liquidationId: string;
  ciudad?: string;
  fecha_documento?: string;
  vehiculo_servicio?: string;
  vehiculo_clase?: string;
  vehiculo_marca?: string;
  vehiculo_linea?: string;
  vehiculo_modelo?: string;
  vehiculo_cilindraje?: string;
  vehiculo_combustible?: string;
  vehiculo_carroceria?: string;
  observaciones_revision?: string;
  metodo_devolucion?: "transferencia" | "efectivo";
  fecha_devolucion?: string;
  fecha_inicio_ahorro?: string;
  fecha_fin_ahorro?: string;
  generated_by?: string;
}

export interface PazSalvoResult {
  pdf_url: string;
  docx_url: string;
  pdf_s3_key: string;
  docx_s3_key: string;
}

/** Formatea fecha YYYY-MM-DD a formato formal "DD de Mes del YYYY" */
function formatFormalDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  return `${String(d.getDate()).padStart(2, "0")} de ${meses[d.getMonth()]} del ${d.getFullYear()}`;
}

export async function generatePazSalvo(params: PazSalvoParams): Promise<PazSalvoResult> {
  const { liquidationId } = params;

  // 1. Obtener registro persistido de la liquidación
  const { data: liq, error: liqErr } = await supabase
    .from("liquidations")
    .select("*")
    .eq("id", liquidationId)
    .single();

  if (liqErr || !liq) {
    throw new Error(`Liquidación no encontrada: ${liqErr?.message || liquidationId}`);
  }

  // 2. Obtener datos del conductor
  const { data: driver, error: dErr } = await supabase
    .from("drivers")
    .select("id, full_name, document_number, phone, email, address")
    .eq("id", liq.driver_id)
    .single();

  if (dErr || !driver) {
    throw new Error(`Conductor no encontrado para la liquidación: ${dErr?.message}`);
  }

  // 3. Obtener datos del vehículo si aplica
  let vehicle: any = null;
  if (liq.plate) {
    const { data: vData } = await supabase
      .from("vehicles")
      .select("plate, brand, line, model_year, status")
      .eq("plate", liq.plate)
      .maybeSingle();
    vehicle = vData;
  }

  // 4. Procesar valores financieros desde items_detail guardado
  const itemsDetail = liq.items_detail || {};
  const incomes: Array<{ id: string; concept: string; amount: number }> = itemsDetail.incomes || [];
  const deductions: Array<{ id: string; concept: string; amount: number }> = itemsDetail.deductions || [];

  const depositoItem = incomes.find((i) => i.id === "deposito");
  const ahorroItem = incomes.find((i) => i.id === "ahorro");

  const depositoAmount = depositoItem ? Number(depositoItem.amount) : 300000;
  const totalIncomes = Number(liq.total_incomes) || 0;
  const ahorroAmount = ahorroItem ? Number(ahorroItem.amount) : Math.max(0, totalIncomes - depositoAmount);
  const totalDeductions = Number(liq.total_deductions) || 0;
  const finalBalance = Number(liq.final_balance) || 0;

  // 5. Construir HTML de lista de descuentos
  const filteredDeductions = deductions.filter((d) => Number(d.amount) > 0);
  const descuentosHtml = filteredDeductions.length > 0
    ? filteredDeductions
        .map(
          (d) =>
            `<div class="descuento-item"><span>${d.concept}:</span><span>$${fmt(
              Number(d.amount)
            )}</span></div>`
        )
        .join("\n")
    : '<div class="descuento-item"><span>Sin descuentos aplicados</span><span>$0</span></div>';

  // 6. Preparar fechas
  const todayStr = new Date().toISOString().slice(0, 10);
  const fechaDoc = params.fecha_documento || formatFormalDate(liq.liquidation_date || todayStr);
  const fechaDevolucion = params.fecha_devolucion || formatFormalDate(liq.liquidation_date || todayStr);
  const fechaInicioAhorro = params.fecha_inicio_ahorro || "la fecha de inicio de contrato";
  const fechaFinAhorro = params.fecha_fin_ahorro || formatFormalDate(liq.liquidation_date || todayStr);

  // 7. Preparar checkboxes de medio de devolución
  const isEfectivo = params.metodo_devolucion === "efectivo";
  const checkTransferencia = isEfectivo ? "&nbsp;&nbsp;" : "X";
  const checkEfectivo = isEfectivo ? "X" : "&nbsp;&nbsp;";

  // 8. Reemplazar variables en plantilla
  const templateRaw = fs.readFileSync(TEMPLATE_PATH, "utf8");

  const totalGarantiaLetras = toWords(totalIncomes, "PESOS M/CTE");
  const devolucionLetras = toWords(Math.abs(finalBalance), "pesos colombianos").toLowerCase();

  const observaciones = (params.observaciones_revision || "Vehículo recibido a satisfacción sin novedades mecánicas ni físicas.")
    .trim();

  let html = templateRaw
    .replace(/\{\{ciudad\}\}/g, params.ciudad || "Cali")
    .replace(/\{\{fecha_documento\}\}/g, fechaDoc)
    .replace(/\{\{arrendador_nombre\}\}/g, "ALLATYOU RENTING S.A.S")
    .replace(/\{\{arrendador_nit\}\}/g, "901995593.")
    .replace(/\{\{conductor_nombre\}\}/g, driver.full_name || "")
    .replace(/\{\{conductor_cedula\}\}/g, driver.document_number || "—")
    .replace(/\{\{conductor_telefono\}\}/g, driver.phone || "—")
    .replace(/\{\{conductor_nombre_linea\}\}/g, driver.full_name ? `${driver.full_name}` : "______________________________________________")
    .replace(/\{\{conductor_cedula_linea\}\}/g, driver.document_number ? `${driver.document_number}` : "_____________________________________________")
    .replace(/\{\{conductor_telefono_linea\}\}/g, driver.phone ? `${driver.phone}` : "_____________________________________________")
    .replace(/\{\{vehiculo_placa\}\}/g, liq.plate || vehicle?.plate || "SIN ASIGNAR")
    .replace(/\{\{vehiculo_estado\}\}/g, vehicle?.status?.toUpperCase() || "ACTIVO")
    .replace(/\{\{vehiculo_servicio\}\}/g, params.vehiculo_servicio || "Particular")
    .replace(/\{\{vehiculo_clase\}\}/g, params.vehiculo_clase || "AUTOMÓVIL")
    .replace(/\{\{vehiculo_marca\}\}/g, params.vehiculo_marca || vehicle?.brand || "CHEVROLET")
    .replace(/\{\{vehiculo_linea\}\}/g, params.vehiculo_linea || vehicle?.line || "SPARK")
    .replace(/\{\{vehiculo_modelo\}\}/g, params.vehiculo_modelo || String(vehicle?.model_year || ""))
    .replace(/\{\{vehiculo_cilindraje\}\}/g, params.vehiculo_cilindraje || "995")
    .replace(/\{\{vehiculo_combustible\}\}/g, params.vehiculo_combustible || "GASOLINA")
    .replace(/\{\{vehiculo_carroceria\}\}/g, params.vehiculo_carroceria || "HATCHBACK")
    .replace(/\{\{total_garantia_letras\}\}/g, totalGarantiaLetras)
    .replace(/\{\{total_garantia_num\}\}/g, fmt(totalIncomes))
    .replace(/\{\{deposito_inicial_num\}\}/g, fmt(depositoAmount))
    .replace(/\{\{ahorro_acumulado_num\}\}/g, fmt(ahorroAmount))
    .replace(/\{\{fecha_inicio_ahorro\}\}/g, fechaInicioAhorro)
    .replace(/\{\{fecha_fin_ahorro\}\}/g, fechaFinAhorro)
    .replace(/\{\{observaciones_revision\}\}/g, observaciones)
    .replace(/\{\{monto_devolucion_num\}\}/g, fmt(finalBalance))
    .replace(/\{\{monto_devolucion_letras\}\}/g, devolucionLetras)
    .replace(/\{\{descuentos_lista\}\}/g, descuentosHtml)
    .replace(/\{\{total_descuentos_num\}\}/g, fmt(totalDeductions))
    .replace(/\{\{check_transferencia\}\}/g, checkTransferencia)
    .replace(/\{\{check_efectivo\}\}/g, checkEfectivo)
    .replace(/\{\{fecha_devolucion\}\}/g, fechaDevolucion);

  // 9. Claves fijas en R2 por liquidación (sobrescribibles)
  const pdfKey = `liquidations/paz_salvo_${liquidationId}.pdf`;
  const docxKey = `liquidations/paz_salvo_${liquidationId}.docx`;

  // 10. Renderizar y subir a R2
  const renderResult = await renderDualDocument({
    html,
    pdfKey,
    docxKey,
  });

  // 11. Registrar en audit_log y persistir claves en DB ÚNICAMENTE tras confirmación de subida exitosa
  const auditEntry = {
    action: "GENERATE_PAZ_SALVO",
    timestamp: new Date().toISOString(),
    generated_by: params.generated_by || "Admin",
    pdf_s3_key: pdfKey,
    docx_s3_key: docxKey,
    params: {
      ciudad: params.ciudad,
      metodo_devolucion: params.metodo_devolucion,
      observaciones_revision: params.observaciones_revision,
      fecha_devolucion: params.fecha_devolucion,
    },
  };

  const newAuditLog = [...(liq.audit_log || []), auditEntry];

  // Intento de actualización con columnas dedicadas si existen, manteniendo respaldo en items_detail y audit_log
  try {
    await supabase
      .from("liquidations")
      .update({
        pdf_s3_key: pdfKey,
        docx_s3_key: docxKey,
        audit_log: newAuditLog,
        updated_at: new Date().toISOString(),
      })
      .eq("id", liquidationId);
  } catch (dbErr: any) {
    // Si las columnas nuevas no están aplicadas en remoto, actualizar únicamente audit_log
    console.warn("Nota actualizando columnas directas en liquidations:", dbErr?.message);
    await supabase
      .from("liquidations")
      .update({
        audit_log: newAuditLog,
        updated_at: new Date().toISOString(),
      })
      .eq("id", liquidationId);
  }

  return {
    pdf_url: renderResult.pdfUrl,
    docx_url: renderResult.docxUrl,
    pdf_s3_key: pdfKey,
    docx_s3_key: docxKey,
  };
}
