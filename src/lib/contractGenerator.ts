// src/lib/contractGenerator.ts
// =============================================================================
// Servicio de generación de contratos de leasing:
//   - Plantilla HTML única → PDF (Puppeteer) + DOCX (html-to-docx)
//   - Consecutivos atómicos vía secuencias Postgres
//   - Validación de tasas vs IBC vigente
//   - Subida a R2 (Cloudflare) con presigned URLs TTL 30 min
//   - Registro en leasing_contract_versions sin duplicar PII
// =============================================================================

import fs from "fs";
import path from "path";
import crypto from "crypto";
import puppeteer from "puppeteer";
// @ts-ignore — html-to-docx no tiene tipos TS publicados
import HTMLtoDOCX from "html-to-docx";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabase } from "./supabase";
import dotenv from "dotenv";

dotenv.config();

// ── R2 / S3 client (instancia propia para contratos con presigned URLs) ───────────
// Se usa un S3Client separado del de r2.ts para garantizar compatibilidad
// con @aws-sdk/s3-request-presigner (mismo ver. de @aws-sdk/client-s3)
const r2Contract = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT || "",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME || "";
// TTL de las presigned URLs de contratos (datos sensibles — 30 minutos)
const SIGNED_URL_TTL_SECONDS = 30 * 60;

// La plantilla vive en src/templates/ (fuente de verdad). Se usa process.cwd()
// para resolver desde la raíz del proyecto, funcionando tanto en dev (ts-node,
// donde __dirname = src/lib) como en producción (node dist/, donde __dirname =
// dist/lib pero el HTML NO se copia al dist por tsc).
const TEMPLATE_PATH = path.resolve(process.cwd(), "src/templates/contrato.html");

// =============================================================================
// Tipos
// =============================================================================
export interface ContractData {
  // Identificadores
  contract_id: number;
  driver_id: number | null;

  // Comprador (desde tabla drivers)
  comprador_nombre: string;
  comprador_cedula: string;
  comprador_ciudad: string;
  comprador_email: string;
  comprador_telefono: string;

  // Vehículo
  vehiculo_placa: string;
  vehiculo_marca: string;
  vehiculo_linea: string;
  vehiculo_modelo: string;
  vehiculo_cilindraje: string;
  vehiculo_combustible: string;
  vehiculo_color: string;
  vehiculo_carroceria: string;

  // Financieros
  purchase_price: number;       // precio total
  down_payment: number;         // cuota inicial
  financed_capital: number;     // capital financiado
  monthly_rate_pct: number;     // tasa mensual %
  daily_maintenance: number;    // cuota diaria mant
  daily_admin: number;          // cuota diaria admin
  start_date: string;           // YYYY-MM-DD

  // Operación
  taller_autorizado: string;
  geocerca_descripcion: string;
  limite_velocidad_kmh: string;

  // Garantías
  valor_garantia: number;
  valor_clausula_penal: number;

  // Firma
  medio_pago?: string;
  generated_by?: string;
}

export interface GenerationResult {
  numero_contrato: string;
  numero_pagare: string;
  pdf_url: string;        // presigned URL, 30 min TTL
  docx_url: string;       // presigned URL, 30 min TTL
  template_version: string;
  version_id: number;
}

// =============================================================================
// Helpers
// =============================================================================

/** Formatea un número como pesos colombianos: 1234567 → "1.234.567" */
function fmt(n: number): string {
  return Math.round(n).toLocaleString("es-CO");
}

/** Convierte número a letras (simplificado — suficiente para contratos) */
function toWords(n: number): string {
  const units = ["","UN","DOS","TRES","CUATRO","CINCO","SEIS","SIETE","OCHO","NUEVE",
    "DIEZ","ONCE","DOCE","TRECE","CATORCE","QUINCE","DIECISÉIS","DIECISIETE",
    "DIECIOCHO","DIECINUEVE"];
  const tens = ["","","VEINTE","TREINTA","CUARENTA","CINCUENTA","SESENTA","SETENTA",
    "OCHENTA","NOVENTA"];
  const hundreds = ["","CIENTO","DOSCIENTOS","TRESCIENTOS","CUATROCIENTOS","QUINIENTOS",
    "SEISCIENTOS","SETECIENTOS","OCHOCIENTOS","NOVECIENTOS"];

  if (n === 0) return "CERO";
  if (n === 100) return "CIEN";
  if (n < 0) return "MENOS " + toWords(-n);

  let result = "";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const rest = n % 1_000;

  if (millions > 0) {
    result += millions === 1 ? "UN MILLÓN " : toWords(millions) + " MILLONES ";
  }
  if (thousands > 0) {
    result += thousands === 1 ? "MIL " : toWords(thousands) + " MIL ";
  }
  if (rest > 0) {
    const h = Math.floor(rest / 100);
    const t = Math.floor((rest % 100) / 10);
    const u = rest % 10;
    if (h > 0) result += hundreds[h] + " ";
    if (t >= 2) {
      result += tens[t];
      if (u > 0) result += " Y " + units[u];
      result += " ";
    } else if (t === 1) {
      result += units[10 + u] + " ";
    } else if (u > 0) {
      result += units[u] + " ";
    }
  }
  return result.trim() + " PESOS M/CTE";
}

/**
 * Calcula la tabla de amortización francesa completa.
 * GARANTÍA: el último row ajusta el capital al saldo exacto,
 * de modo que el saldo final sea EXACTAMENTE $0 (sin residuos por redondeo).
 */
function calcAmortizacion(
  capital: number,
  monthlyRatePct: number,
  dailyMaint: number,
  dailyAdmin: number,
  startDate: string,
  dailyCapitalInterest: number // cuota fija de capital+interés del simulador
): Array<{
  no: number;
  fecha: string;
  mant: number;
  admin: number;
  interes: number;
  capital_abono: number;
  total: number;
  saldo: number;
}> {
  const dailyRate = (monthlyRatePct * 12) / 365 / 100;
  let balance = Math.round(capital);
  const rows = [];
  let installmentNo = 0;
  let current = new Date(startDate + "T00:00:00Z");
  const MAX_DAYS = 365 * 10;
  let dayCount = 0;

  while (balance > 0 && dayCount < MAX_DAYS) {
    const dailyInterest = Math.round(balance * dailyRate);
    const principalPayment = Math.max(0, dailyCapitalInterest - dailyInterest);
    installmentNo++;
    dayCount++;

    const isLastRow = (balance - principalPayment) <= 1;
    const actualPrincipal = isLastRow ? balance : Math.min(balance, principalPayment);
    const newBalance = isLastRow ? 0 : Math.max(0, balance - principalPayment);
    const total = dailyMaint + dailyAdmin + dailyInterest + actualPrincipal;

    rows.push({
      no: installmentNo,
      fecha: current.toISOString().slice(0, 10),
      mant: dailyMaint,
      admin: dailyAdmin,
      interes: dailyInterest,
      capital_abono: actualPrincipal,
      total,
      saldo: newBalance,
    });

    balance = newBalance;
    current.setUTCDate(current.getUTCDate() + 1);
    if (balance === 0) break;
  }
  return rows;
}

/** Genera los <tr> HTML de la tabla de amortización */
function buildAmortizacionRows(rows: ReturnType<typeof calcAmortizacion>): string {
  return rows.map(r => `
    <tr>
      <td>${r.no}</td>
      <td>${r.fecha}</td>
      <td>${fmt(r.mant)}</td>
      <td>${fmt(r.admin)}</td>
      <td>${fmt(r.interes)}</td>
      <td>${fmt(r.capital_abono)}</td>
      <td>${fmt(r.total)}</td>
      <td>${fmt(r.saldo)}</td>
    </tr>`).join("");
}

// =============================================================================
// Validar tasas contra IBC vigente
// =============================================================================
export async function validateRatesVsIBC(
  monthlyRatePct: number,
  moraPct: number
): Promise<{ ok: boolean; error?: string }> {
  // Obtener el IBC más reciente de config_financials
  const { data, error } = await supabase
    .from("config_financials")
    .select("ibc_monthly_pct, valid_from")
    .lte("valid_from", new Date().toISOString().slice(0, 10))
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "No se encontró el Interés Bancario Corriente (IBC) en config_financials. Configure el IBC antes de generar contratos." };
  }

  const ibc = Number(data.ibc_monthly_pct);
  const tope = ibc * 1.5;

  if (monthlyRatePct > tope) {
    return {
      ok: false,
      error: `La tasa remuneratoria (${monthlyRatePct}% M.V.) excede 1.5× el IBC vigente (${ibc}% → tope ${tope.toFixed(4)}% M.V.).`,
    };
  }
  if (moraPct > tope) {
    return {
      ok: false,
      error: `La tasa de mora (${moraPct}% M.V.) excede 1.5× el IBC vigente (${ibc}% → tope ${tope.toFixed(4)}% M.V.).`,
    };
  }
  return { ok: true };
}

// =============================================================================
// Obtener consecutivos atómicos desde Postgres
// =============================================================================
async function nextContractNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc("next_contract_number");
  if (error || !data) throw new Error(`Error obteniendo número de contrato: ${error?.message}`);
  return `AY-${year}-${String(data).padStart(4, "0")}`;
}

async function nextPagareNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc("next_pagare_number");
  if (error || !data) throw new Error(`Error obteniendo número de pagaré: ${error?.message}`);
  return `PAG-${year}-${String(data).padStart(4, "0")}`;
}

// =============================================================================
// Subir buffer a R2 y devolver presigned URL (TTL: 30 min)
// =============================================================================
async function uploadAndSign(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await r2Contract.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  const url = await getSignedUrl(
    r2Contract as any,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn: SIGNED_URL_TTL_SECONDS }
  );
  return url;
}

// =============================================================================
// FUNCIÓN PRINCIPAL: generateContract
// =============================================================================
export async function generateContract(
  data: ContractData,
  dailyCapitalInterest: number,  // cuota fija capital+interés del simulador
  moraPct: number                // tasa de mora mensual
): Promise<GenerationResult> {

  // ── 1. Validar tasas vs IBC ──────────────────────────────────────────────
  const rateCheck = await validateRatesVsIBC(data.monthly_rate_pct, moraPct);
  if (!rateCheck.ok) throw new Error(rateCheck.error);

  // ── 2. Leer plantilla HTML ───────────────────────────────────────────────
  const templateRaw = fs.readFileSync(TEMPLATE_PATH, "utf8");
  const templateHash = crypto.createHash("sha256").update(templateRaw).digest("hex");
  const templateVersionShort = templateHash.slice(0, 8);

  // ── 3. Obtener consecutivos atómicos ────────────────────────────────────
  const [numero_contrato, numero_pagare] = await Promise.all([
    nextContractNumber(),
    nextPagareNumber(),
  ]);

  // ── 4. Calcular amortización completa (última cuota cierra a $0) ─────────
  const amortRows = calcAmortizacion(
    data.financed_capital,
    data.monthly_rate_pct,
    data.daily_maintenance,
    data.daily_admin,
    data.start_date,
    dailyCapitalInterest
  );
  const amortizacionRows = buildAmortizacionRows(amortRows);

  // ── 5. Datos de firma ────────────────────────────────────────────────────
  const today = new Date();
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

  // ── 6. Rellenar plantilla ────────────────────────────────────────────────
  const cuota_diaria_total = data.daily_maintenance + data.daily_admin + dailyCapitalInterest;

  let html = templateRaw
    .replace(/\{\{numero_contrato\}\}/g, numero_contrato)
    .replace(/\{\{numero_pagare\}\}/g, numero_pagare)
    .replace(/\{\{fecha_generacion\}\}/g, today.toLocaleDateString("es-CO"))
    .replace(/\{\{comprador_nombre\}\}/g, data.comprador_nombre)
    .replace(/\{\{comprador_cedula\}\}/g, data.comprador_cedula)
    .replace(/\{\{comprador_ciudad\}\}/g, data.comprador_ciudad)
    .replace(/\{\{comprador_email\}\}/g, data.comprador_email)
    .replace(/\{\{comprador_telefono\}\}/g, data.comprador_telefono)
    .replace(/\{\{vehiculo_placa\}\}/g, data.vehiculo_placa)
    .replace(/\{\{vehiculo_marca\}\}/g, data.vehiculo_marca)
    .replace(/\{\{vehiculo_linea\}\}/g, data.vehiculo_linea)
    .replace(/\{\{vehiculo_modelo\}\}/g, data.vehiculo_modelo)
    .replace(/\{\{vehiculo_cilindraje\}\}/g, data.vehiculo_cilindraje)
    .replace(/\{\{vehiculo_combustible\}\}/g, data.vehiculo_combustible || "GASOLINA")
    .replace(/\{\{vehiculo_color\}\}/g, data.vehiculo_color)
    .replace(/\{\{vehiculo_carroceria\}\}/g, data.vehiculo_carroceria)
    .replace(/\{\{precio_total\}\}/g, fmt(data.purchase_price))
    .replace(/\{\{precio_total_letras\}\}/g, toWords(data.purchase_price))
    .replace(/\{\{cuota_inicial\}\}/g, fmt(data.down_payment))
    .replace(/\{\{capital_financiado\}\}/g, fmt(data.financed_capital))
    .replace(/\{\{cuota_capital_interes\}\}/g, fmt(dailyCapitalInterest))
    .replace(/\{\{cuota_ahorro\}\}/g, fmt(data.valor_garantia / amortRows.length || 5000))
    .replace(/\{\{cuota_administracion\}\}/g, fmt(data.daily_admin))
    .replace(/\{\{cuota_diaria_total\}\}/g, fmt(cuota_diaria_total))
    .replace(/\{\{fecha_inicio\}\}/g, data.start_date)
    .replace(/\{\{total_cuotas\}\}/g, String(amortRows.length))
    .replace(/\{\{medio_pago\}\}/g, data.medio_pago || "transferencia electrónica o consignación en la cuenta designada por EL VENDEDOR")
    .replace(/\{\{tasa_remuneratoria\}\}/g, String(data.monthly_rate_pct))
    .replace(/\{\{tasa_mora\}\}/g, String(moraPct))
    .replace(/\{\{ibc_vigente\}\}/g, "— ver config_financials —")
    .replace(/\{\{taller_autorizado\}\}/g, data.taller_autorizado)
    .replace(/\{\{geocerca_descripcion\}\}/g, data.geocerca_descripcion)
    .replace(/\{\{limite_velocidad_kmh\}\}/g, data.limite_velocidad_kmh)
    .replace(/\{\{valor_garantia\}\}/g, fmt(data.valor_garantia))
    .replace(/\{\{valor_clausula_penal\}\}/g, fmt(data.valor_clausula_penal))
    .replace(/\{\{amortizacion_rows\}\}/g, amortizacionRows)
    .replace(/\{\{dia_firma\}\}/g, String(today.getUTCDate()))
    .replace(/\{\{mes_firma\}\}/g, String(meses[today.getMonth()] ?? ""))
    .replace(/\{\{anio_firma\}\}/g, String(today.getFullYear()))
    .replace(/\{\{template_version_short\}\}/g, templateVersionShort);

  // ── 7. Generar PDF con Puppeteer ─────────────────────────────────────────
  let pdfBuffer: Buffer;
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfData = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "2cm", bottom: "2cm", left: "2.5cm", right: "2.5cm" },
    });
    pdfBuffer = Buffer.from(pdfData);
  } finally {
    await browser.close();
  }

  // ── 8. Generar DOCX con html-to-docx ────────────────────────────────────
  const docxBuffer: Buffer = await HTMLtoDOCX(html, null, {
    table: { row: { cantSplit: true } },
    footer: true,
    pageNumber: true,
  });

  // ── 9. Subir a R2 con keys inmutables (nunca sobrescribir) ───────────────
  const ts = Date.now();
  const pdfKey  = `contracts/${numero_contrato}_${ts}.pdf`;
  const docxKey = `contracts/${numero_contrato}_${ts}.docx`;

  const [pdf_url, docx_url] = await Promise.all([
    uploadAndSign(pdfKey,  pdfBuffer,  "application/pdf"),
    uploadAndSign(docxKey, docxBuffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
  ]);

  // ── 10. Registrar en leasing_contract_versions (sin PII) ─────────────────
  const auditPayload = {
    comprador_id:      data.driver_id,
    plate:             data.vehiculo_placa,
    purchase_price:    data.purchase_price,
    down_payment:      data.down_payment,
    financed_capital:  data.financed_capital,
    monthly_rate_pct:  data.monthly_rate_pct,
    mora_pct:          moraPct,
    daily_maintenance: data.daily_maintenance,
    daily_admin:       data.daily_admin,
    start_date:        data.start_date,
    total_installments: amortRows.length,
    // NUNCA incluir cédula / email / teléfono / geocerca en texto plano aquí
  };

  const { data: versionRow, error: vErr } = await supabase
    .from("leasing_contract_versions")
    .insert({
      contract_id:      data.contract_id,
      numero_contrato,
      numero_pagare,
      template_version: templateHash,
      pdf_s3_key:       pdfKey,
      docx_s3_key:      docxKey,
      generated_by:     data.generated_by || "system",
      audit_payload:    auditPayload,
    })
    .select("id")
    .single();

  if (vErr || !versionRow) {
    console.error("⚠️ Error guardando version en leasing_contract_versions:", vErr?.message);
    // No es bloqueante — el PDF y DOCX ya se generaron
  }

  return {
    numero_contrato,
    numero_pagare,
    pdf_url,
    docx_url,
    template_version: templateHash,
    version_id: versionRow?.id ?? 0,
  };
}
