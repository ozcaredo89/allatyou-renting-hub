// Helpers compartidos para la cancelación de un leasing en curso
// (POST /leasing/contracts/:id/cancel-active). Usados por AdminVehicles y AdminAmortization.

// Hora de Bogotá legible para avisos al usuario, ej. "20/10/2026, 8:21 p. m."
export function formatBogotaDateTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export type CancelActiveOutcome =
  | { ok: true }
  // final = true: el estado ya cambió desde otra sesión; reintentar no sirve (solo refrescar y cerrar).
  | { ok: false; message: string; final: boolean };

// Códigos de conflicto que envía el backend cuando el contrato ya no es cancelable.
const FINAL_CODES = ["ALREADY_CANCELLED", "NOT_ACTIVE", "STATE_CHANGED"];

export async function requestCancelActiveLeasing(url: string, authHeader: string): Promise<CancelActiveOutcome> {
  let rs: Response;
  try {
    rs = await fetch(url, { method: "POST", headers: { Authorization: authHeader } });
  } catch {
    return {
      ok: false,
      final: false,
      message: "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
    };
  }
  if (rs.ok) return { ok: true };

  // Si la respuesta no es JSON (ej. HTML de un proxy), no se muestra cruda al usuario.
  const data = await rs.json().catch(() => null);
  const code: string | undefined = data?.code;

  if (code && FINAL_CODES.includes(code)) {
    const when = code === "ALREADY_CANCELLED" ? formatBogotaDateTime(data?.cancelled_at) : null;
    return {
      ok: false,
      final: true,
      message: when
        ? `Este leasing ya fue cancelado desde otra sesión el ${when}. Actualizamos la lista para mostrar el estado actual.`
        : data?.error || "El contrato cambió desde otra sesión. Actualizamos la lista para mostrar el estado actual.",
    };
  }

  return {
    ok: false,
    final: false,
    message: data?.error || "No se pudo cancelar el leasing. Intenta de nuevo en unos segundos.",
  };
}
