/**
 * Utilidades para detección y cálculo de renovaciones de SOAT y Tecnomecánica
 * en el registro de gastos operativos (Issue #4).
 */

export type RenewalType = "soat" | "tecno";

/**
 * Detecta si algún ítem del gasto corresponde a SOAT o Tecnomecánica.
 */
export function detectRenewalType(
  items: { item: string; category?: string }[]
): RenewalType | null {
  if (!items || !items.length) return null;

  for (const it of items) {
    const text = `${it.item || ""} ${it.category || ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // Prioridad 1: SOAT
    if (/\bsoat\b/.test(text) || text.includes("seguro obligatorio")) {
      return "soat";
    }
  }

  for (const it of items) {
    const text = `${it.item || ""} ${it.category || ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // Prioridad 2: Tecnomecánica
    if (
      /\btecno\b/.test(text) ||
      text.includes("tecnomecanica") ||
      text.includes("tecnico mecanica") ||
      text.includes("revision tecnica") ||
      /\brtm\b/.test(text)
    ) {
      return "tecno";
    }
  }

  return null;
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
  const parseYmd = (s: string) => {
    const parts = s.split("-").map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return { y: parts[0], m: parts[1], d: parts[2] };
    }
    return null;
  };

  const expParsed = parseYmd(expenseDate) || {
    y: new Date().getFullYear(),
    m: new Date().getMonth() + 1,
    d: new Date().getDate(),
  };

  const isCurrentStillActive = Boolean(
    currentExpiry &&
    /^\d{4}-\d{2}-\d{2}$/.test(currentExpiry) &&
    currentExpiry >= expenseDate
  );

  const base = isCurrentStillActive ? parseYmd(currentExpiry!)! : expParsed;

  const targetYear = base.y + 1;
  let targetDay = base.d;
  // Control de año bisiesto (29 de febrero -> 28 en año común)
  if (base.m === 2 && base.d === 29) {
    const isLeap = (targetYear % 4 === 0 && targetYear % 100 !== 0) || (targetYear % 400 === 0);
    if (!isLeap) targetDay = 28;
  }

  const mm = String(base.m).padStart(2, "0");
  const dd = String(targetDay).padStart(2, "0");
  return `${targetYear}-${mm}-${dd}`;
}

/**
 * Formato amigable en español (ej. "15 de noviembre de 2026")
 */
export function formatDisplayDate(isoDate: string | null | undefined): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "Sin fecha registrada";
  const [y, m, d] = isoDate.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
