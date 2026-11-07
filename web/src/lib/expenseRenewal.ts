/**
 * Utilidades para detección y cálculo de renovaciones de SOAT y Tecnomecánica
 * en el registro de gastos operativos (Issue #4, correcciones #13).
 */

export type RenewalType = "soat" | "tecno";

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // "técnico-mecánica", "tecno_mecanica" → separadores como espacio
    .replace(/[-_/.]+/g, " ")
    .replace(/\s+/g, " ");
}

function isSoatText(text: string): boolean {
  return /\bsoat\b/.test(text) || text.includes("seguro obligatorio");
}

function isTecnoText(text: string): boolean {
  return (
    /\btecno\b/.test(text) ||
    text.includes("tecnomecanica") ||
    text.includes("tecnico mecanica") ||
    text.includes("revision tecnica") ||
    text.includes("revision tecnico") ||
    /\brtm\b/.test(text)
  );
}

/**
 * Detecta todos los tipos de renovación presentes en los ítems del gasto.
 * Un mismo carrito puede traer SOAT y Tecnomecánica a la vez (Issue #13).
 * Orden estable: SOAT primero, luego Tecnomecánica.
 */
export function detectRenewalTypes(
  items: { item: string; category?: string }[]
): RenewalType[] {
  if (!items || !items.length) return [];
  let soat = false;
  let tecno = false;
  for (const it of items) {
    const text = normalizeText(`${it.item || ""} ${it.category || ""}`);
    if (isSoatText(text)) soat = true;
    if (isTecnoText(text)) tecno = true;
  }
  const out: RenewalType[] = [];
  if (soat) out.push("soat");
  if (tecno) out.push("tecno");
  return out;
}

type Ymd = { y: number; m: number; d: number };

function parseYmd(s: string | null | undefined): Ymd | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toYmd({ y, m, d }: Ymd): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Suma meses a una fecha YYYY-MM-DD, ajustando al último día del mes si hace falta. */
function addMonths(base: Ymd, months: number): Ymd {
  const total = base.m - 1 + months;
  const y = base.y + Math.floor(total / 12);
  const m = (total % 12 + 12) % 12 + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d: Math.min(base.d, lastDay) };
}

/** Recorta un valor de fecha (date o timestamp) a YYYY-MM-DD, o null. */
export function toIsoDate(s: string | null | undefined): string | null {
  const p = parseYmd(s);
  return p ? toYmd(p) : null;
}

/**
 * Calcula la fecha sugerida de renovación exactamente 1 año después.
 * - Si la vigencia actual está vigente (es igual o posterior a la fecha del gasto reportado):
 *   Se trata de una renovación anticipada. Se suma 1 año a la vigencia actual manteniendo
 *   el mismo mes y día.
 * - Si la vigencia actual ya está vencida (anterior a la fecha del gasto) o no existe fecha previa:
 *   La nueva póliza o revisión inicia a partir del día de compra/reporte.
 *   Se suma exactamente 1 año a partir de la fecha del gasto reportado.
 */
export function computeSuggestedRenewalDate(
  currentExpiry: string | null | undefined,
  expenseDate: string
): string {
  const now = new Date();
  const expParsed = parseYmd(expenseDate) || {
    y: now.getFullYear(),
    m: now.getMonth() + 1,
    d: now.getDate(),
  };
  const expIso = toYmd(expParsed);
  const current = toIsoDate(currentExpiry);
  const base = current && current >= expIso ? parseYmd(current)! : expParsed;
  // addMonths ajusta 29-feb → 28-feb en año común
  return toYmd(addMonths(base, 12));
}

/**
 * Valida la fecha de vencimiento leída por IA (Issue #13).
 * Rango aceptado: desde la fecha del gasto hasta 1 mes después de la fecha sugerida.
 * Devuelve un mensaje de advertencia si está fuera de rango, o null si es razonable.
 */
export function validateDetectedExpiry(
  detected: string,
  currentExpiry: string | null | undefined,
  expenseDate: string
): string | null {
  const det = toIsoDate(detected);
  if (!det) return "La fecha leída no tiene un formato válido.";
  const expIso = toIsoDate(expenseDate);
  if (expIso && det < expIso) {
    return `La fecha leída (${det}) es anterior a la fecha del gasto: puede ser un SOAT vencido o una lectura errónea.`;
  }
  const suggested = parseYmd(computeSuggestedRenewalDate(currentExpiry, expenseDate))!;
  const maxIso = toYmd(addMonths(suggested, 1));
  if (det > maxIso) {
    return `La fecha leída (${det}) está demasiado lejos (máximo esperado ${maxIso}): verifica el documento.`;
  }
  return null;
}

/**
 * Formato amigable en español (ej. "15 de noviembre de 2026")
 */
export function formatDisplayDate(isoDate: string | null | undefined): string {
  const p = parseYmd(isoDate);
  if (!p) return "Sin fecha registrada";
  return new Date(p.y, p.m - 1, p.d).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
