// src/lib/numberToWords.ts
// =============================================================================
// Utilidades compartidas de formateo numérico y conversión a letras (pesos colombianos)
// Reutilizado en contratos de leasing y actas de liquidación / paz y salvo.
// =============================================================================

/** Formatea un número como pesos colombianos: 1234567 → "1.234.567" */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString("es-CO");
}

/** Convierte número a letras para moneda legal colombiana */
export function toWords(n: number, suffix: string = "PESOS M/CTE"): string {
  const units = [
    "", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
    "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
    "DIECIOCHO", "DIECINUEVE"
  ];
  const tens = [
    "", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA",
    "OCHENTA", "NOVENTA"
  ];
  const hundreds = [
    "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
    "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"
  ];

  if (n === 0) return `CERO ${suffix}`.trim();
  if (n === 100) return `CIEN ${suffix}`.trim();
  if (n < 0) return "MENOS " + toWords(-n, suffix);

  let result = "";
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const rest = n % 1_000;

  if (millions > 0) {
    result += millions === 1 ? "UN MILLÓN " : toWords(millions, "").trim() + " MILLONES ";
  }
  if (thousands > 0) {
    result += thousands === 1 ? "MIL " : toWords(thousands, "").trim() + " MIL ";
  }
  if (rest > 0) {
    const h = Math.floor(rest / 100);
    const t = Math.floor((rest % 100) / 10);
    const u = rest % 10;
    if (h > 0) result += hundreds[h] + " ";
    if (t > 2) {
      result += tens[t];
      if (u > 0) result += " Y " + units[u];
      result += " ";
    } else if (t === 2) {
      if (u === 0) {
        result += "VEINTE ";
      } else {
        const veintis = ["", "VEINTIÚN", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
        result += veintis[u] + " ";
      }
    } else if (t === 1) {
      result += units[10 + u] + " ";
    } else if (u > 0) {
      result += units[u] + " ";
    }
  }

  const clean = result.trim();
  return suffix ? `${clean} ${suffix}`.trim() : clean;
}
