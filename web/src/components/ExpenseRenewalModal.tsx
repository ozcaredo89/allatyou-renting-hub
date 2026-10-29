import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { requestWithBasicAuth } from "../lib/auth";
import type { FleetVehicle } from "../lib/resolveSubmission";
import {
  RenewalType,
  computeSuggestedRenewalDate,
  formatDisplayDate,
} from "../lib/expenseRenewal";

interface ExpenseRenewalModalProps {
  isOpen: boolean;
  type: RenewalType;
  plate: string;
  vehicle?: FleetVehicle | null;
  expenseDate: string;
  onConfirm: (data: { date: string; fileUrl?: string; file?: File }) => Promise<void> | void;
  onSkip: () => Promise<void> | void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ExpenseRenewalModal({
  isOpen,
  type,
  plate,
  vehicle,
  expenseDate,
  onConfirm,
  onSkip,
  onCancel,
  isSubmitting = false,
}: ExpenseRenewalModalProps) {
  if (!isOpen) return null;

  const currentExpiry =
    type === "soat" ? vehicle?.soat_expires_at : vehicle?.tecno_expires_at;

  const initialSuggested = computeSuggestedRenewalDate(currentExpiry, expenseDate);

  const [selectedDate, setSelectedDate] = useState<string>(initialSuggested);
  const [soatFile, setSoatFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [aiDetectedData, setAiDetectedData] = useState<{
    expires_at?: string | null;
    start_date?: string | null;
    insurance_company?: string | null;
    policy_number?: string | null;
  } | null>(null);

  // Reiniciar estado cada vez que se abre
  useEffect(() => {
    setSelectedDate(initialSuggested);
    setSoatFile(null);
    setUploadedUrl(null);
    setIsUploading(false);
    setUploadError(null);
    setAiDetectedData(null);
  }, [isOpen, type, plate, currentExpiry, initialSuggested]);

  // Manejar subida automática y extracción por IA cuando se selecciona archivo
  async function handleFileSelect(file: File) {
    setSoatFile(file);
    setUploadError(null);
    setIsUploading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "vehicles");

      const API = import.meta.env.VITE_API_URL || "";
      const res = await requestWithBasicAuth(`${API}/uploads/soat`, {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Error ${res.status} al procesar el archivo`);
      }

      const resData = await res.json();
      setUploadedUrl(resData.url);

      if (resData.data) {
        setAiDetectedData(resData.data);
        if (resData.data.expires_at) {
          // Pre-llenar la fecha detectada por la IA
          setSelectedDate(resData.data.expires_at);
        }
      }
    } catch (err: any) {
      console.warn("[ExpenseRenewalModal] Error en subida/OCR:", err);
      setUploadError(err?.message || "No se pudo interpretar el archivo automáticamente.");
    } finally {
      setIsUploading(false);
    }
  }

  const isSoat = type === "soat";
  const title = isSoat ? "Renovación de SOAT" : "Renovación de Tecnomecánica";
  const icon = isSoat ? (
    <ShieldCheck className="w-6 h-6 text-emerald-600" />
  ) : (
    <Wrench className="w-6 h-6 text-blue-600" />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-2xl ${
                isSoat ? "bg-emerald-100" : "bg-blue-100"
              }`}
            >
              {icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                  Opcional
                </span>
              </div>
              <p className="text-xs text-slate-500">
                ¿Deseas actualizar la vigencia en la ficha de este vehículo?
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={isSubmitting || isUploading}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Ficha rápida del vehículo */}
          <div className="flex items-center justify-between p-3.5 bg-slate-100/70 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-amber-400 text-slate-900 font-black text-sm rounded-lg shadow-sm tracking-wider border border-amber-500">
                {plate}
              </span>
              <div>
                <div className="text-sm font-semibold text-slate-700">
                  {vehicle?.brand || "Vehículo"} {vehicle?.line || ""}
                </div>
                {vehicle?.model_year && (
                  <div className="text-xs text-slate-400">Modelo {vehicle.model_year}</div>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-slate-400 font-medium">Vigencia actual</div>
              <div className="text-xs font-bold text-slate-700">
                {formatDisplayDate(currentExpiry)}
              </div>
            </div>
          </div>

          {/* Opción 1: Fecha de vencimiento sugerida */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-500" />
                Nueva fecha de vencimiento sugerida
              </label>
              <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                +1 año exacto
              </span>
            </div>

            <input
              type="date"
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-sm"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={isSubmitting || isUploading}
            />

            <p className="text-[11px] text-slate-500 flex items-center gap-1">
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {currentExpiry
                ? "Calculada exactamente un año después manteniendo el mismo día y mes."
                : "Calculada exactamente a un año a partir de la fecha del gasto reportado."}
            </p>
          </div>

          {/* Opción 2: Subida de PDF (Solo para SOAT) */}
          {isSoat ? (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <UploadCloud className="w-4 h-4 text-emerald-600" />
                  Soporte documental (PDF o Imagen del SOAT)
                </label>
                <span className="text-[10px] text-slate-400 font-semibold uppercase">
                  Lectura IA
                </span>
              </div>

              {!soatFile ? (
                <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl cursor-pointer bg-white transition-all group">
                  <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-emerald-500 transition-colors mb-2" />
                  <span className="text-xs font-bold text-slate-700 group-hover:text-emerald-600">
                    Haz clic o arrastra el PDF del SOAT aquí
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5">
                    La IA extraerá la fecha de vigencia automáticamente
                  </span>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    disabled={isSubmitting || isUploading}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                  />
                </label>
              ) : (
                <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {soatFile.name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {(soatFile.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>

                    {!isUploading && (
                      <button
                        type="button"
                        onClick={() => {
                          setSoatFile(null);
                          setUploadedUrl(null);
                          setAiDetectedData(null);
                          setUploadError(null);
                        }}
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

                  {aiDetectedData && (
                    <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 p-2.5 rounded-lg space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Datos detectados por IA:</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 text-[11px] pt-1">
                        <div>
                          <span className="text-emerald-700">Vigencia hasta: </span>
                          <strong className="text-emerald-900 font-bold">
                            {aiDetectedData.expires_at || "No visible"}
                          </strong>
                        </div>
                        {aiDetectedData.insurance_company && (
                          <div>
                            <span className="text-emerald-700">Aseguradora: </span>
                            <span className="text-emerald-900">
                              {aiDetectedData.insurance_company}
                            </span>
                          </div>
                        )}
                        {aiDetectedData.policy_number && (
                          <div className="col-span-2">
                            <span className="text-emerald-700">Póliza: </span>
                            <span className="text-emerald-900">
                              {aiDetectedData.policy_number}
                            </span>
                          </div>
                        )}
                      </div>
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
          ) : (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900">
                <strong>Sin soporte documental requerido:</strong> Para tecnomecánica solo
                necesitas confirmar la fecha de vigencia estimada.
              </div>
            </div>
          )}
        </div>

        {/* Footer con Acciones */}
        <div className="p-6 pt-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-2 justify-end">
          <button
            type="button"
            onClick={onSkip}
            disabled={isSubmitting || isUploading}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors shadow-sm"
          >
            Omitir y Solo Guardar Gasto
          </button>

          <button
            type="button"
            onClick={() =>
              onConfirm({
                date: selectedDate,
                fileUrl: uploadedUrl || undefined,
                file: soatFile || undefined,
              })
            }
            disabled={isSubmitting || isUploading || !selectedDate}
            className={`w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-2 ${
              isSoat
                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200"
                : "bg-blue-600 hover:bg-blue-700 shadow-blue-200"
            }`}
          >
            {isSubmitting ? (
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
