import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Loader2, AlertTriangle, CheckCircle2, CalendarClock, Wrench, UserX, FileMinus, CreditCard } from "lucide-react";
import { requestWithBasicAuth } from "../lib/auth";

// "Resolver días en mora" (docs/specs/pagos.md §6): lista los días pendientes de la placa
// con el conductor de cada día y los resuelve por día o por rango con un motivo.

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

type DayDriver = { driver_id: number; driver_name: string | null; start: string; end: string | null };
type PendingDay = {
  date: string;
  payable: boolean;
  drivers: DayDriver[];
  responsible: DayDriver | null;
  counts_as_mora: boolean;
};
type PendingInfo = {
  plate: string;
  last_payment_date: string | null;
  today: string;
  has_assignment_history: boolean;
  truncated: boolean;
  days: PendingDay[];
  days_in_mora: number;
  daily_rate: number;
  is_leasing: boolean;
  active_advance: { id: number; person_name: string | null; amount: number; daily_installment: number } | null;
};
type Warning = { code: string; message: string };
type MaintCheck = {
  taller: { available: boolean };
  days: { date: string; validation: { warnings: Warning[]; covering_stay: { entrada: string; salida: string | null } | null } | null }[];
  has_warnings: boolean;
};
type Reason = "maintenance" | "no_driver" | "liquidation" | "advance";

const LATE_FEE_MAX = 15000; // recargo máximo por día (src/lib/lateFee.ts)

const REASONS: { id: Reason; label: string; icon: typeof Wrench }[] = [
  { id: "maintenance", label: "Mantenimiento", icon: Wrench },
  { id: "no_driver", label: "Sin conductor", icon: UserX },
  { id: "liquidation", label: "Descuento en liquidación", icon: FileMinus },
  { id: "advance", label: "Pago con anticipo", icon: CreditCard },
];

const WEEKDAY = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const weekday = (ymd: string) => WEEKDAY[new Date(`${ymd}T12:00:00Z`).getUTCDay()];
const driverNames = (d: PendingDay) => d.drivers.map((x) => x.driver_name || `#${x.driver_id}`).join(" → ");

interface ResolveDaysModalProps {
  isOpen: boolean;
  onClose: () => void;
  plate: string | null;
  ownerName?: string | null;
  /** Se llama después de resolver días, para recargar la tabla de Reportes */
  onResolved: () => void;
}

export function ResolveDaysModal({ isOpen, onClose, plate, ownerName, onResolved }: ResolveDaysModalProps) {
  const [info, setInfo] = useState<PendingInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // Cantidad de días seleccionados desde el más antiguo (se resuelven en orden)
  const [selCount, setSelCount] = useState(0);
  const [reason, setReason] = useState<Reason>("maintenance");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [maint, setMaint] = useState<MaintCheck | null>(null);
  const [maintLoading, setMaintLoading] = useState(false);
  const [assigned, setAssigned] = useState<{ date: string; drivers: DayDriver[] }[] | null>(null);

  const load = useCallback(async () => {
    if (!plate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await requestWithBasicAuth(`${API}/reports/plates/${encodeURIComponent(plate)}/pending-days`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Error cargando los días pendientes");
      setInfo(json);
      setSelCount(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [plate]);

  useEffect(() => {
    if (!isOpen || !plate) {
      setInfo(null);
      return;
    }
    setReason("maintenance");
    setNotes("");
    setSuccess(null);
    setAssigned(null);
    load();
  }, [isOpen, plate, load]);

  const moraDays = useMemo(() => (info?.days ?? []).filter((d) => d.counts_as_mora), [info]);
  const selected = useMemo(() => moraDays.slice(0, selCount).map((d) => d.date), [moraDays, selCount]);
  const selectedKey = selected.join(",");

  // Validación contra el taller cuando el motivo es mantenimiento
  useEffect(() => {
    setMaint(null);
    if (!isOpen || !plate || reason !== "maintenance" || !selectedKey) return;
    let alive = true;
    setMaintLoading(true);
    requestWithBasicAuth(`${API}/reports/plates/${encodeURIComponent(plate)}/pending-days/maintenance-check?dates=${selectedKey}`)
      .then((r) => r.json())
      .then((j) => alive && setMaint(j))
      .catch(() => alive && setMaint(null))
      .finally(() => alive && setMaintLoading(false));
    return () => {
      alive = false;
    };
  }, [isOpen, plate, reason, selectedKey]);

  useEffect(() => setAssigned(null), [reason, selectedKey]);

  if (!isOpen || !plate) return null;

  const rate = info?.daily_rate ?? 70000;
  const total = selected.length * rate;
  const adv = info?.active_advance ?? null;
  const advCovers = !!adv && total <= Number(adv.amount);
  // Descuento en liquidación: canon + recargo máximo; en leasing no hay recargo (pagos.md §3 y §6)
  const perDayDebt = rate + (info?.is_leasing ? 0 : LATE_FEE_MAX);
  const debtByDriver = moraDays.slice(0, selCount).reduce<Record<string, number>>((acc, d) => {
    const name = d.responsible?.driver_name || `#${d.responsible?.driver_id}`;
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const noteRequired = reason === "maintenance" && !!maint?.has_warnings;

  // Clic en un día de mora: selecciona desde el más antiguo hasta ese día (o solo ese si es el primero)
  function toggleDay(date: string) {
    const idx = moraDays.findIndex((d) => d.date === date);
    if (idx < 0) return;
    setSelCount(selCount === idx + 1 ? idx : idx + 1);
    setSuccess(null);
  }

  const canSubmit =
    selected.length > 0 &&
    !submitting &&
    (reason !== "maintenance" || (!maintLoading && (!noteRequired || notes.trim().length >= 10))) &&
    (reason !== "advance" || advCovers);

  async function submit() {
    if (!canSubmit || !plate) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setAssigned(null);
    try {
      const res = await requestWithBasicAuth(`${API}/reports/plates/${encodeURIComponent(plate)}/resolve-days`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dates: selected, reason, notes: notes.trim() || undefined, advance_id: adv?.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && json.code === "DRIVER_ASSIGNED") {
        setAssigned(json.days || []);
        return;
      }
      if (!res.ok) throw new Error(json.error || "No se pudo resolver los días");
      setSuccess(json.message || (reason === "advance" ? `${selected.length} día(s) pagados con el anticipo.` : "Días resueltos."));
      setNotes("");
      onResolved();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // z-[60]: por encima del menú lateral (z-50). En celular ocupa toda la pantalla.
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-3xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-50 rounded-xl">
              <CalendarClock className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-black text-white font-mono text-xs rounded-md">{plate}</span>
                Resolver días
              </h2>
              <p className="text-xs text-gray-500">
                {ownerName || "Conductor"}
                {info ? ` · ${info.days_in_mora} día${info.days_in_mora === 1 ? "" : "s"} en mora · último pago ${info.last_payment_date ?? "—"}` : ""}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {loading && (
            <div className="py-10 flex items-center justify-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando días pendientes...
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-2 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {!loading && info && (
            <>
              {info.days.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No hay días pendientes desde el último pago.</p>
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-2">
                    Toque un día para seleccionar desde el más antiguo hasta ese día. Los días se resuelven en orden.
                  </p>
                  <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {info.days.map((d) => {
                      const isSel = selected.includes(d.date);
                      return (
                        <button
                          key={d.date}
                          type="button"
                          disabled={!d.counts_as_mora}
                          onClick={() => toggleDay(d.date)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left text-xs ${
                            d.counts_as_mora ? "cursor-pointer hover:bg-gray-50" : "cursor-default bg-gray-50/60 text-gray-400"
                          } ${isSel ? "bg-red-50 hover:bg-red-50" : ""}`}
                        >
                          <input type="checkbox" readOnly checked={isSel} disabled={!d.counts_as_mora} className="accent-red-600 pointer-events-none" />
                          <span className="font-mono w-24 shrink-0">
                            {d.date} <span className="text-gray-400">{weekday(d.date)}</span>
                          </span>
                          <span className="flex-1 truncate">
                            {d.drivers.length ? driverNames(d) : <span className="italic">Sin conductor asignado</span>}
                          </span>
                          <span className="shrink-0">
                            {!d.payable ? (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">No pagable</span>
                            ) : !d.drivers.length ? (
                              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">No cuenta</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">En mora</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {info.truncated && <p className="text-[11px] text-amber-700 mt-1">Se muestran solo los primeros 120 días.</p>}
                  {!info.has_assignment_history && (
                    <p className="text-[11px] text-gray-500 mt-1">La placa no tiene historial de asignaciones; se usa el conductor actual.</p>
                  )}
                </div>
              )}

              {moraDays.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-700">
                      {selected.length ? `${selected.length} día(s): ${selected[0]}${selected.length > 1 ? ` → ${selected[selected.length - 1]}` : ""}` : "Ningún día seleccionado"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelCount(selCount === moraDays.length ? 0 : moraDays.length)}
                      className="px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer"
                    >
                      {selCount === moraDays.length ? "Quitar selección" : `Todos (${moraDays.length})`}
                    </button>
                  </div>

                  {/* Motivo */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {REASONS.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setReason(r.id)}
                        className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-[11px] font-semibold text-center cursor-pointer ${
                          reason === r.id ? "border-black bg-black text-white" : "border-gray-200 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <r.icon className="w-4 h-4" />
                        {r.label}
                      </button>
                    ))}
                  </div>

                  {/* Detalle por motivo */}
                  {reason === "maintenance" && selected.length > 0 && (
                    <div className="rounded-xl border border-gray-200 p-3 text-xs space-y-2">
                      {maintLoading && (
                        <p className="flex items-center gap-2 text-gray-500">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Consultando en el taller...
                        </p>
                      )}
                      {!maintLoading && maint?.taller.available && !maint.has_warnings && (
                        <p className="text-emerald-700 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Todos los días están dentro de una estadía en el taller.
                        </p>
                      )}
                      {!maintLoading &&
                        maint?.days
                          .filter((d) => d.validation?.warnings.length)
                          .map((d) => (
                            <div key={d.date} className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900">
                              <p className="font-semibold">{d.date}</p>
                              {d.validation!.warnings.map((w) => (
                                <p key={w.code}>{w.message}</p>
                              ))}
                            </div>
                          ))}
                      <p className="text-gray-500">Cada día queda como pago confirmado de $0 en mantenimiento.</p>
                    </div>
                  )}

                  {reason === "no_driver" && (
                    <div className="rounded-xl border border-gray-200 p-3 text-xs text-gray-600 space-y-2">
                      <p>Los días sin conductor asignado ya no cuentan como mora y no hay que registrar nada.</p>
                      {assigned && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-900 space-y-1">
                          <p className="font-semibold">Estos días tienen conductor asignado. Quite primero la asignación del conductor:</p>
                          {assigned.map((a) => (
                            <p key={a.date}>
                              {a.date}: {a.drivers.map((x) => `${x.driver_name || `#${x.driver_id}`} (desde ${x.start}${x.end ? ` hasta ${x.end}` : ""})`).join(", ")}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {reason === "liquidation" && selected.length > 0 && (
                    <div className="rounded-xl border border-gray-200 p-3 text-xs text-gray-700 space-y-1">
                      {Object.entries(debtByDriver).map(([name, n]) => (
                        <p key={name}>
                          <strong>{name}</strong>: {n} día(s) × ${fmtCOP.format(perDayDebt)} = <strong>${fmtCOP.format(n * perDayDebt)}</strong>
                        </p>
                      ))}
                      <p className="text-gray-500">
                        Por día: canon ${fmtCOP.format(rate)}
                        {info?.is_leasing ? " (leasing, sin recargo)" : ` + recargo $${fmtCOP.format(LATE_FEE_MAX)}`}. Se descuenta en la
                        liquidación del conductor que tenía el carro.
                      </p>
                    </div>
                  )}

                  {reason === "advance" && selected.length > 0 && (
                    <div className={`rounded-xl border p-3 text-xs space-y-1 ${adv ? (advCovers ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50") : "border-amber-200 bg-amber-50"}`}>
                      {adv ? (
                        <>
                          <p>
                            Anticipo <strong>#{adv.id}</strong> de {adv.person_name || "—"} por <strong>${fmtCOP.format(Number(adv.amount))}</strong>
                          </p>
                          <p>
                            Total: {selected.length} × ${fmtCOP.format(rate)} = <strong>${fmtCOP.format(total)}</strong>
                          </p>
                          {!advCovers && <p className="text-red-700 font-semibold">El total supera el anticipo. Seleccione menos días.</p>}
                        </>
                      ) : (
                        <p className="text-amber-900">
                          La placa no tiene anticipo activo.{" "}
                          <a href={`/advances?plate=${encodeURIComponent(plate)}`} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
                            Crear anticipo
                          </a>
                        </p>
                      )}
                    </div>
                  )}

                  {reason !== "no_driver" && (
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      placeholder={
                        noteRequired
                          ? "Obligatoria: qué tipo de mantenimiento es y por qué no se hace en el taller (mín. 10 caracteres)"
                          : "Nota (opcional)"
                      }
                      className={`w-full rounded-xl border px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-black/10 ${
                        noteRequired && notes.trim().length < 10 ? "border-amber-400" : "border-gray-300"
                      }`}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Pie */}
        <div className="px-5 py-3 border-t flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50 cursor-pointer">
            Cerrar
          </button>
          {moraDays.length > 0 && (
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {reason === "no_driver" ? "Verificar sin conductor" : `Resolver ${selected.length || ""} día(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
