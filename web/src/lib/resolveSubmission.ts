// src/lib/resolveSubmission.ts
//
// Función pura y aislada que encapsula la lógica de "auto-captura" del formulario
// de gastos. No tiene efectos secundarios ni dependencias de React.
//
// Casos borde manejados (checklist de prueba):
//  1. cart vacío + ítem y monto válidos en inputs   → auto-incorpora el ítem al cart final
//  2. cart vacío + ítem y/o monto vacíos            → error: "Agrega al menos un repuesto o servicio"
//  3. plates vacío + placa válida en input           → auto-incorpora la placa
//  4. plates vacío + placa válida no en flota        → auto-incorpora de todas formas (formato ok)
//  5. plates vacío + input vacío o formato inválido  → error: "Agrega al menos una placa válida"
//  6. cart ya tiene ítems + input con datos          → respeta el carrito, NO duplica el input
//  7. plates ya tiene chips + input con placa        → respeta las placas existentes, NO duplica
//  8. placa con guiones/espacios/minúsculas          → normaliza a ABC123 antes de agregar

const PLATE_RE = /^[A-Z]{3}\d{3}$/;

export type CartItem = {
  item: string;
  category: string;
  amount: number;
  isNew?: boolean;
};

export type FleetVehicle = {
  plate: string;
  brand?: string | null;
  line?: string | null;
  model_year?: number | null;
};

export type ResolveSubmissionInput = {
  cart: CartItem[];
  plates: string[];
  plateInput: string;
  item: string;
  category: string;
  amountStr: string;
  fleet: FleetVehicle[];
};

export type ResolveSubmissionResult =
  | { ok: true; finalPlates: string[]; finalCart: CartItem[] }
  | { ok: false; error: string };

/** Normaliza una cadena de placa: trim, uppercase, quitar no alfanuméricos. */
export function normalizePlate(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function resolveSubmission({
  cart,
  plates,
  plateInput,
  item,
  category,
  amountStr,
}: ResolveSubmissionInput): ResolveSubmissionResult {
  // --- Resolver placas finales ---
  let finalPlates: string[];

  if (plates.length > 0) {
    // Casos 6/7: ya hay placas agregadas → respeta las existentes, ignora el input
    finalPlates = plates;
  } else {
    // Intentar auto-captura desde el input
    const normalized = normalizePlate(plateInput);
    if (!PLATE_RE.test(normalized)) {
      // Caso 5: plates vacío + input inválido o vacío
      return {
        ok: false,
        error: "Agrega al menos una placa válida (formato: ABC123).",
      };
    }
    // Casos 3 y 4: formato válido (esté o no en la flota)
    finalPlates = [normalized];
  }

  // --- Resolver carrito final ---
  let finalCart: CartItem[];

  if (cart.length > 0) {
    // Caso 6: ya hay ítems en el carrito → respeta el carrito, ignora los inputs
    finalCart = cart;
  } else {
    // Intentar auto-captura desde los inputs de ítem/monto
    const trimmedItem = item.trim();
    const amount = Number(amountStr);

    if (!trimmedItem || !amountStr || amount <= 0) {
      // Caso 2: cart vacío + inputs incompletos
      return {
        ok: false,
        error: "Agrega al menos un repuesto o servicio con su monto.",
      };
    }

    // Caso 1: auto-incorporar el ítem desde los inputs
    finalCart = [{ item: trimmedItem, category, amount, isNew: true }];
  }

  return { ok: true, finalPlates, finalCart };
}

// ---------------------------------------------------------------------------
// parseServerError
// ---------------------------------------------------------------------------
// Convierte errores crudos del servidor (SQL, validaciones de la API, etc.)
// en mensajes que hablan en el lenguaje del usuario, con un campo opcional
// para que la UI pueda mover el foco al input problemático.
//
// Regla de oro: NUNCA exponer términos técnicos (columnas, tablas, constraints)
// al usuario final. Esos detalles van a la consola del dev, no a la pantalla.
// ---------------------------------------------------------------------------

export type ParsedServerError = {
  /** Mensaje amigable para mostrar en la UI */
  message: string;
  /** ID del campo HTML al que debe moverse el foco, si aplica */
  field?: string;
};

/** Extrae el string de error desde la respuesta cruda del servidor (JSON o texto plano). */
export function extractErrorText(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return parsed.error ?? parsed.message ?? parsed.detail ?? raw;
  } catch {
    return raw;
  }
}

/** Mapea un mensaje de error técnico a un mensaje humano + campo de foco. */
export function parseServerError(raw: string): ParsedServerError {
  const text = extractErrorText(raw).toLowerCase();

  // Errores de campos obligatorios / NOT NULL
  if (text.includes("description") && (text.includes("not-null") || text.includes("null value")))
    return { message: "El campo Descripción no puede estar vacío.", field: "description" };

  if (text.includes("date") && (text.includes("not-null") || text.includes("null value") || text.includes("invalid")))
    return { message: "La fecha del gasto no es válida.", field: "date" };

  if (text.includes("plate") || text.includes("vehicle"))
    return { message: "Debes asociar al menos un vehículo válido.", field: "plate-input" };

  if (text.includes("item") && (text.includes("not-null") || text.includes("null value")))
    return { message: "El nombre del repuesto o servicio es requerido.", field: "item-input" };

  if (text.includes("total_amount") || text.includes("amount"))
    return { message: "El monto ingresado no es válido.", field: "amount-input" };

  // Error de red / servidor caído
  if (text.includes("failed to fetch") || text.includes("network"))
    return { message: "Sin conexión. Verifica tu internet e intenta de nuevo." };

  // Fallback genérico — amigable pero sin detalles técnicos
  return { message: "No se pudo guardar el gasto. Revisa los datos e intenta de nuevo." };
}
