import { useEffect, useState } from "react";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  CreditCard,
  ExternalLink,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

export type AdvanceInfo = {
  plate: string;
  owner_name: string | null;
  days_overdue: number;
  is_overdue: boolean;
  daily_rate: number;
  last_payment_date: string | null;
  has_active_advance: boolean;
  active_advance: {
    id: number;
    person_name: string;
    amount: number;
    daily_installment: number;
    installments: number;
    current_installment: number;
    start_date: string;
    status: string;
    notes?: string | null;
    created_at: string;
  } | null;
  max_covered_days: number;
  recommended_days: number;
};

interface AdvancePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plate: string | null;
  ownerName?: string | null;
  onSuccess: () => void;
}

export function AdvancePaymentModal({
  isOpen,
  onClose,
  plate,
  ownerName,
  onSuccess,
}: AdvancePaymentModalProps) {
  const [info, setInfo] = useState<AdvanceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!isOpen || !plate) {
      setInfo(null);
      setErrorMsg(null);
      setSubmitting(false);
      return;
    }

    let isCancelled = false;

    async function fetchInfo() {
      setLoading(true);
      setErrorMsg(null);
      try {
        let auth = ensureBasicAuth();
        let res = await fetch(`${API}/payments/advance-payment-info?plate=${encodeURIComponent(plate!)}`, {
          headers: { Authorization: auth },
        });

        if (res.status === 401 || res.status === 403) {
          clearBasicAuth();
          auth = ensureBasicAuth();
          res = await fetch(`${API}/payments/advance-payment-info?plate=${encodeURIComponent(plate!)}`, {
            headers: { Authorization: auth },
          });
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Error al consultar información del anticipo");
        }

        const data: AdvanceInfo = await res.json();
        if (!isCancelled) {
          setInfo(data);
          const defaultDays = data.recommended_days > 0 ? data.recommended_days : 1;
          setSelectedDays(defaultDays);
          setNotes(`Pago de mora cubierto con anticipo #${data.active_advance?.id ?? ""}`);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setErrorMsg(err.message || "Error al cargar datos del anticipo");
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    fetchInfo();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, plate]);

  if (!isOpen || !plate) return null;

  const activeAdvance = info?.active_advance;
  const dailyRate = info?.daily_rate ?? 70000;
  const advanceAmount = activeAdvance ? Number(activeAdvance.amount) : 0;
  const totalToPay = selectedDays * dailyRate;
  const isCovered = advanceAmount > 0 && totalToPay <= advanceAmount;

  async function handleConfirmPayment() {
    if (!info?.active_advance) return;
    if (!isCovered || selectedDays < 1) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      let auth = ensureBasicAuth();
      let res = await fetch(`${API}/payments/pay-with-advance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
        },
        body: JSON.stringify({
          plate,
          advance_id: info.active_advance.id,
          days_count: selectedDays,
          notes: notes.trim() || undefined,
        }),
      });

      if (res.status === 401 || res.status === 403) {
        clearBasicAuth();
        auth = ensureBasicAuth();
        res = await fetch(`${API}/payments/pay-with-advance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: auth,
          },
          body: JSON.stringify({
            plate,
            advance_id: info.active_advance.id,
            days_count: selectedDays,
            notes: notes.trim() || undefined,
          }),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Error al procesar el pago con anticipo");
      }

      alert(`✅ Se registraron con éxito ${selectedDays} día(s) de pago con el anticipo #${info.active_advance.id}.`);
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || "Error al registrar el pago");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                Pagar mora con anticipo
              </h2>
              <p className="text-xs text-gray-500">
                Vehículo <strong className="text-gray-800">{plate}</strong>
                {ownerName ? ` • ${ownerName}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-500">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
              <p className="text-xs font-medium">Consultando estado del conductor y anticipos...</p>
            </div>
          )}

          {!loading && errorMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 flex items-start gap-2.5 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Atención</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {!loading && info && !info.has_active_advance && (
            /* CASO: No tiene anticipo activo */
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-amber-900">
                  <p className="text-sm font-bold text-amber-950">
                    Sin anticipo activo registrado
                  </p>
                  <p>
                    El vehículo <strong>{plate}</strong> ({info.owner_name || ownerName || "Conductor"}) tiene{" "}
                    <strong className="text-red-700">{info.days_overdue} días en mora</strong>, pero aún no tiene ningún anticipo activo creado en el sistema.
                  </p>
                  <p className="text-amber-800/90 pt-1">
                    Para usar esta función, primero debes registrar el anticipo del conductor desde el módulo de anticipos.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                <a
                  href={`/advances?plate=${encodeURIComponent(plate)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black text-white text-xs font-semibold hover:bg-gray-800 shadow-xs transition-all cursor-pointer"
                >
                  <span>Crear anticipo para {plate}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {!loading && info && info.has_active_advance && activeAdvance && (
            /* CASO: Sí tiene anticipo activo */
            <div className="space-y-4">
              {/* Tarjeta de información del anticipo */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-xs text-emerald-950">
                <div className="flex items-center justify-between font-semibold pb-1.5 border-b border-emerald-200/60">
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
                    Anticipo #{activeAdvance.id}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-200/80 text-emerald-800 text-[11px] font-bold">
                    Activo
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div>
                    <span className="text-emerald-700/80 block text-[11px]">Beneficiario</span>
                    <span className="font-semibold text-gray-900">{activeAdvance.person_name}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700/80 block text-[11px]">Monto del anticipo</span>
                    <span className="font-bold text-emerald-800 text-sm">
                      ${fmtCOP.format(activeAdvance.amount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Detalle de mora y tarifa */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200 text-center">
                <div>
                  <span className="text-[11px] text-gray-500 block">Días en mora</span>
                  <span className="text-sm font-bold text-red-600">
                    {info.days_overdue} días
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-gray-500 block">Tarifa diaria</span>
                  <span className="text-sm font-semibold text-gray-800">
                    ${fmtCOP.format(dailyRate)}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-gray-500 block">Deuda calculada</span>
                  <span className="text-sm font-semibold text-gray-800">
                    ${fmtCOP.format(info.days_overdue * dailyRate)}
                  </span>
                </div>
              </div>

              {/* Selector de días a ponerse al día */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-700">
                    ¿Cuántos días se van a poner al día?
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedDays(1)}
                      className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-medium transition-colors cursor-pointer"
                    >
                      1 día
                    </button>
                    {info.days_overdue > 1 && (
                      <button
                        type="button"
                        onClick={() => setSelectedDays(info.days_overdue)}
                        className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[11px] font-semibold transition-colors cursor-pointer"
                      >
                        Poner al día ({info.days_overdue} d)
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={Math.max(info.days_overdue, 15)}
                    value={selectedDays}
                    onChange={(e) => setSelectedDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 accent-emerald-600 cursor-pointer"
                  />
                  <div className="flex items-center border border-gray-300 rounded-lg px-2 py-1 bg-white shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={selectedDays}
                      onChange={(e) => setSelectedDays(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-12 text-center text-xs font-bold text-gray-900 outline-none"
                    />
                    <span className="text-xs text-gray-500">días</span>
                  </div>
                </div>
              </div>

              {/* Validación del valor cubierto */}
              <div className={`p-3 rounded-xl border text-xs transition-colors ${
                isCovered
                  ? "bg-emerald-50/80 border-emerald-200 text-emerald-900"
                  : "bg-red-50 border-red-200 text-red-900"
              }`}>
                <div className="flex items-center justify-between font-medium">
                  <span>Total a pagar ({selectedDays} día{selectedDays > 1 ? "s" : ""} × ${fmtCOP.format(dailyRate)}):</span>
                  <strong className="text-sm font-bold">${fmtCOP.format(totalToPay)}</strong>
                </div>

                <div className="mt-2 pt-2 border-t border-current/10 flex items-center gap-1.5 font-medium">
                  {isCovered ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        El anticipo de <strong>${fmtCOP.format(advanceAmount)}</strong> cubre la entrega (${fmtCOP.format(totalToPay)}).
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>
                        El total (${fmtCOP.format(totalToPay)}) supera el monto del anticipo (${fmtCOP.format(advanceAmount)}). Reduce el número de días.
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  disabled={submitting || !isCovered || selectedDays < 1}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Registrando pago...</span>
                    </>
                  ) : (
                    <>
                      <span>Confirmar pago con anticipo</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
