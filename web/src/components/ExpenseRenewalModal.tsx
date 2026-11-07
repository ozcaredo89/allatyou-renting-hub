import { useState } from "react";
import {
  Calendar,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles,
  ArrowRight,
  X,
  Loader2,
  ShieldCheck,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { requestWithBasicAuth } from "../lib/auth";
import type { FleetVehicle } from "../lib/resolveSubmission";
import {
  type RenewalType,
  computeSuggestedRenewalDate,
  formatDisplayDate,
  toIsoDate,
  validateDetectedExpiry,
} from "../lib/expenseRenewal";

export type RenewalConfirmData = {
  soat?: { date: string; fileUrl?: string };
  tecno?: { date: string };
};

interface ExpenseRenewalModalProps {
  /** Tipos detectados en el gasto (SOAT y/o Tecnomecánica) */
  types: RenewalType[];
  plate: string;
  vehicle?: FleetVehicle | null;
  /** Fecha del gasto, fijada al momento de enviar el formulario */
  expenseDate: string;
  onConfirm: (data: RenewalConfirmData) => Promise<void> | void;
  onSkip: () => Promise<void> | void;
  onCancel: () => void;
  isSubmitting?: boolean;
  /** Error del guardado del gasto: el modal sigue abierto para reintentar (Issue #13) */
  errorMessage?: string | null;
}

type AiData = {
  plate?: string | null;
  expires_at?: string | null;
  start_date?: string | null;
  insurance_company?: string | null;
  policy_number?: string | null;
  error?: string;
};

const LABELS: Record<RenewalType, string> = { soat: "SOAT", tecno: "Tecnomecánica" };

/**
 * Montar solo cuando hay renovación pendiente (render condicional + key en el padre):
 * así el estado se inicializa limpio en cada apertura y se conserva si falla el guardado.
 */
export function ExpenseRenewalModal({
  types,
  plate,
  vehicle,
  expenseDate,
  onConfirm,
  onSkip,
  onCancel,
  isSubmitting = false,
  errorMessage = null,
}: ExpenseRenewalModalProps) {
  const currentExpiry: Record<RenewalType, string | null> = {
    soat: toIsoDate(vehicle?.soat_expires_at),
    tecno: toIsoDate(vehicle?.tecno_expires_at),
  };

  const [dates, setDates] = useState<Record<RenewalType, string>>(() => ({
    soat: computeSuggestedRenewalDate(currentExpiry.soat, expenseDate),
    tecno: computeSuggestedRenewalDate(currentExpiry.tecno, expenseDate),
  }));
  // Con un solo tipo siempre se actualiza; con ambos, el usuario puede desmarcar uno
  const [enabled, setEnabled] = useState<Record<RenewalType, boolean>>({ soat: true, tecno: true });

  const [soatFile, setSoatFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [aiData, setAiData] = useState<AiData | null>(null);
  const [aiDateWarning, setAiDateWarning] = useState<string | null>(null);
  const [plateConfirmed, setPlateConfirmed] = useState(false);

  const multi = types.length > 1;
  const active = types.filter((t) => !multi || enabled[t]);

  function resetSoatUpload() {
    setSoatFile(null);
    setUploadedUrl(null);
    setAiData(null);
    setUploadError(null);
    setAiDateWarning(null);
    setPlateConfirmed(false);
  }

  // Subida y extracción por IA al seleccionar archivo
  async function handleFileSelect(file: File) {
    resetSoatUpload();
    setSoatFile(file);
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "vehicles");

      const API = import.meta.env.VITE_API_URL || "";
      const res = await requestWithBasicAuth(`${API}/uploads/soat`, { method: "POST", body: fd });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error ${res.status} al procesar el archivo`);
      }

      const resData = await res.json();
      setUploadedUrl(resData.url);
      const data: AiData | null = resData.data || null;
      setAiData(data);

      if (data?.expires_at) {
        // Solo pre-llenar si la fecha leída es razonable; si no, se advierte y se deja la sugerida
        const warning = validateDetectedExpiry(data.expires_at, currentExpiry.soat, expenseDate);
        if (warning) setAiDateWarning(warning);
        else setDates((d) => ({ ...d, soat: data.expires_at as string }));
      } else if (data?.error) {
        setUploadError(`No se pudo leer la fecha automáticamente: ${data.error}`);
      }
    } catch (err: unknown) {
      console.warn("[ExpenseRenewalModal] Error en subida/OCR:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg || "No se pudo interpretar el archivo automáticamente.");
    } finally {
      setIsUploading(false);
    }
  }

  // Comparar placa detectada con la del vehículo
  const detectedPlate = aiData?.plate ? aiData.plate.toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
  const currentVehiclePlate = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const plateMismatch = Boolean(detectedPlate && currentVehiclePlate && detectedPlate !== currentVehiclePlate);

  const busy = isSubmitting || isUploading || isConfirming;
  const soatActive = active.includes("soat");
  const blockedByPlate = soatActive && plateMismatch && !plateConfirmed;
  const missingDate = active.some((t) => !dates[t]);
  const confirmDisabled = busy || active.length === 0 || missingDate || blockedByPlate;

  async function handleConfirmClick() {
    if (confirmDisabled) return;
    setIsConfirming(true);
    try {
      const data: RenewalConfirmData = {};
      if (active.includes("soat")) data.soat = { date: dates.soat, fileUrl: uploadedUrl || undefined };
      if (active.includes("tecno")) data.tecno = { date: dates.tecno };
      await onConfirm(data);
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleSkipClick() {
    if (busy) return;
    setIsConfirming(true);
    try {
      await onSkip();
    } finally {
      setIsConfirming(false);
    }
  }

  const title = multi
    ? "Renovación de SOAT y Tecnomecánica"
    : types[0] === "soat"
      ? "Renovación de SOAT"
      : "Renovación de Tecnomecánica";

  function renderDateBlock(t: RenewalType) {
    const cur = currentExpiry[t];
    const isCurrentActive = Boolean(cur && cur >= expenseDate);
    const disabledSection = multi && !enabled[t];
    return (
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            {t === "soat" ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            ) : (
              <Wrench className="w-4 h-4 text-blue-600" />
            )}
            {LABELS[t]}
          </label>
          {multi && (
            <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled[t]}
                disabled={busy}
                onChange={(e) => setEnabled((s) => ({ ...s, [t]: e.target.checked }))}
              />
              Actualizar
            </label>
          )}
        </div>

        <div className={`space-y-3 ${disabledSection ? "opacity-40 pointer-events-none" : ""}`}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Vigencia actual</span>
            <span className="font-bold text-slate-700 flex items-center gap-1">
              {formatDisplayDate(cur)}
              {cur && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                    isCurrentActive ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {isCurrentActive ? "Vigente" : "Vencido"}
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Nueva fecha de vencimiento
            </span>
            <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              +1 año exacto
            </span>
          </div>

          <input
            type="date"
            className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-sm disabled:opacity-60"
            value={dates[t]}
            onChange={(e) => setDates((d) => ({ ...d, [t]: e.target.value }))}
            disabled={busy || disabledSection}
          />

          <p className="text-[11px] text-slate-500 flex items-center gap-1">
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {isCurrentActive
              ? "Calculada a +1 año manteniendo el mismo mes y día de la vigencia activa. Puedes ajustarla."
              : "Calculada a 1 año desde la fecha del gasto (inicia nueva vigencia). Puedes ajustarla."}
          </p>

          {t === "soat" && renderSoatUpload()}
        </div>
      </div>
    );
  }

  function renderSoatUpload() {
    return (
      <div className="pt-1 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
            Soporte documental (PDF o imagen)
          </span>
          <span className="text-[10px] text-slate-400 font-semibold uppercase">Lectura IA</span>
        </div>

        {!soatFile ? (
          <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl cursor-pointer bg-white transition-all group">
            <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-emerald-500 transition-colors mb-2" />
            <span className="text-xs font-bold text-slate-700 group-hover:text-emerald-600">
              Haz clic para subir el PDF del SOAT
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5">
              La IA extraerá la fecha de vigencia automáticamente
            </span>
            <input
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) handleFileSelect(e.target.files[0]);
              }}
            />
          </label>
        ) : (
          <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                <div className="truncate">
                  <div className="text-xs font-bold text-slate-800 truncate">{soatFile.name}</div>
                  <div className="text-[10px] text-slate-400">{(soatFile.size / 1024).toFixed(1)} KB</div>
                </div>
              </div>
              {!busy && (
                <button
                  type="button"
                  onClick={resetSoatUpload}
                  className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-md hover:bg-red-50"
                >
                  Cambiar
                </button>
              )}
            </div>

            {isUploading && (
              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100 animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin shrink-0 text-emerald-600" />
                <span>Subiendo y leyendo vigencia del SOAT con IA...</span>
              </div>
            )}

            {aiData && (
              <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 p-2.5 rounded-lg space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Datos detectados por IA:</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px] pt-0.5">
                  <div>
                    <span className="text-emerald-700">Vigencia hasta: </span>
                    <strong className="font-bold">{aiData.expires_at || "No visible"}</strong>
                  </div>
                  <div>
                    <span className="text-emerald-700">Placa en doc: </span>
                    <strong className="font-bold">{aiData.plate || "No visible"}</strong>
                  </div>
                  {aiData.insurance_company && (
                    <div>
                      <span className="text-emerald-700">Aseguradora: </span>
                      <span>{aiData.insurance_company}</span>
                    </div>
                  )}
                  {aiData.policy_number && (
                    <div>
                      <span className="text-emerald-700">Póliza: </span>
                      <span>{aiData.policy_number}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {aiDateWarning && (
              <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  {aiDateWarning} Se mantuvo la fecha sugerida; ajústala manualmente si corresponde.
                </div>
              </div>
            )}

            {/* Placa distinta: requiere confirmación explícita (Issue #13) */}
            {plateMismatch && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">¡Placa diferente!</strong> El SOAT indica placa{" "}
                    <strong>{aiData?.plate}</strong>, pero el gasto es del vehículo <strong>{plate}</strong>.
                  </div>
                </div>
                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={plateConfirmed}
                    disabled={busy}
                    onChange={(e) => setPlateConfirmed(e.target.checked)}
                  />
                  Confirmo que este SOAT corresponde a {plate}
                </label>
              </div>
            )}

            {uploadError && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-amber-400 text-slate-900 font-black text-sm rounded-lg shadow-sm tracking-wider border border-amber-500">
                {plate}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                  Opcional
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {vehicle?.brand || "Vehículo"} {vehicle?.line || ""}
                {vehicle?.model_year ? ` · Modelo ${vehicle.model_year}` : ""} — ¿Actualizar la vigencia en su ficha?
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="p-6 overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">No se pudo guardar el gasto:</strong> {errorMessage} Tus datos de
                renovación se conservaron: puedes reintentar. Si debes corregir el formulario, cierra esta
                ventana (tendrás que volver a cargar el PDF).
              </div>
            </div>
          )}

          {types.map((t) => (
            <div key={t}>{renderDateBlock(t)}</div>
          ))}

          {!types.includes("soat") && (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900">
                <strong>Sin soporte documental requerido:</strong> para tecnomecánica solo necesitas confirmar la
                fecha de vigencia.
              </div>
            </div>
          )}
        </div>

        {/* Footer con Acciones */}
        <div className="p-6 pt-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-2 justify-end">
          <button
            type="button"
            onClick={handleSkipClick}
            disabled={busy}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors shadow-sm disabled:opacity-50"
          >
            Omitir y Solo Guardar Gasto
          </button>

          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={confirmDisabled}
            title={blockedByPlate ? "Confirma la placa del SOAT para continuar" : undefined}
            className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
          >
            {isSubmitting || isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Actualizar Ficha y Guardar Gasto
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
