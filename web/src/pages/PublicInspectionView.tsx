import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Gauge, Fuel, Calendar, User, FileText, CheckCircle, Share2, ShieldCheck, Car, Timer, AlertTriangle, Users } from "lucide-react";
import { ImageViewer } from "../components/ImageViewer";
import { formatDuration } from "../utils/formatDuration";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

const PHOTO_LABELS: Record<string, string> = {
  front: "Frente (Exterior)",
  back: "Atrás (Exterior)",
  left: "Lado Izquierdo",
  right: "Lado Derecho",
  engine: "Motor",
  interior_dash: "Tablero / Consola",
  interior_front: "Sillas Delanteras",
  interior_back: "Sillas Traseras",
  tires_front_left: "Llanta Delantera Izq.",
  tires_front_right: "Llanta Delantera Der.",
  tires_back_left: "Llanta Trasera Izq.",
  tires_back_right: "Llanta Trasera Der.",
};

const FUEL_LABELS: Record<string, { label: string; pct: number; color: string }> = {
  empty: { label: "Vacío (0%)", pct: 0, color: "text-rose-600 bg-rose-50 border-rose-200" },
  "1/4": { label: "1/4 Tanque (25%)", pct: 25, color: "text-amber-600 bg-amber-50 border-amber-200" },
  "1/2": { label: "1/2 Tanque (50%)", pct: 50, color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
  "3/4": { label: "3/4 Tanque (75%)", pct: 75, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  full: { label: "Lleno / Full (100%)", pct: 100, color: "text-emerald-700 bg-emerald-100 border-emerald-300" },
};

interface PublicInspectionData {
  id: number;
  vehicle_plate: string;
  driver?: { full_name?: string } | null;
  created_at: string;
  type: string;
  mileage?: number | null;
  fuel_level?: string | null;
  comments?: string | null;
  inspector_name?: string | null;
  photos?: Record<string, string>;
  status?: "draft" | "completed";
  duration_seconds?: number | null;
  road_test?: boolean | null;
  participants?: string[];
}

export default function PublicInspectionView() {
  const { id } = useParams<{ id: string }>();
  const [inspection, setInspection] = useState<PublicInspectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingImages, setViewingImages] = useState<{ urls: { url: string; title?: string }[]; startingIndex: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${API}/public/inspections/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Inspección no encontrada");
        return res.json();
      })
      .then((data: PublicInspectionData) => {
        setInspection(data);
        setError(null);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Error al cargar la inspección";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleString("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const handleShareWhatsApp = () => {
    if (!inspection) return;
    const currentUrl = window.location.href;
    const kmText = inspection.mileage ? `${Number(inspection.mileage).toLocaleString("es-CO")} km` : "No registrado";
    const fuelText = inspection.fuel_level ? (FUEL_LABELS[inspection.fuel_level]?.label || inspection.fuel_level) : "No registrado";
    const typeLabel = inspection.type === "entrega" ? "Entrega" : inspection.type === "recepcion" ? "Recepción" : "Control General";

    const text = `📋 *ACTA DE INSPECCIÓN VEHICULAR*\n🚗 *Vehículo:* ${inspection.vehicle_plate}\n📅 *Fecha:* ${formatDate(inspection.created_at)}\n🔍 *Tipo:* ${typeLabel}\n👤 *Inspector:* ${inspection.inspector_name || "N/A"}\n🛣️ *Kilometraje:* ${kmText}\n⛽ *Combustible:* ${fuelText}\n🚦 *Prueba de ruta:* ${inspection.road_test ? "Sí" : inspection.road_test === false ? "No" : "No registrado"}\n\n📸 *Ver reporte y fotos:* ${currentUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent mb-4"></div>
        <p className="text-slate-600 font-semibold text-sm">Cargando reporte de inspección...</p>
      </div>
    );
  }

  if (error || !inspection) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
          <FileText className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Reporte no disponible</h2>
        <p className="text-slate-500 text-sm max-w-md mb-6">{error || "No pudimos encontrar el registro de inspección solicitado."}</p>
        <Link to="/" className="px-5 py-2.5 bg-slate-800 text-white font-medium rounded-xl text-sm hover:bg-slate-700 transition">
          Volver al Inicio
        </Link>
      </div>
    );
  }

  const photosList = Object.entries(inspection.photos || {}).map(([k, u]) => ({
    key: k,
    url: u as string,
    title: PHOTO_LABELS[k] || k,
  }));

  const fuelInfo = inspection.fuel_level ? FUEL_LABELS[inspection.fuel_level] : null;

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* HEADER / BRANDING */}
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
                <ShieldCheck className="w-4 h-4" /> AllAtYou Renting Hub · Certificado de Inspección
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-3">
                <span>{inspection.vehicle_plate}</span>
                <span className={`text-xs uppercase font-extrabold px-3 py-1 rounded-full ${
                  inspection.type === "entrega" ? "bg-blue-500/20 text-blue-300 border border-blue-400/30" :
                  inspection.type === "recepcion" ? "bg-purple-500/20 text-purple-300 border border-purple-400/30" :
                  "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                }`}>
                  {inspection.type === "entrega" ? "Entrega" : inspection.type === "recepcion" ? "Recepción" : "Control General"}
                </span>
              </h1>
            </div>

            <button
              onClick={handleShareWhatsApp}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl shadow-lg transition active:scale-95 text-sm"
            >
              <Share2 className="w-4 h-4" /> Compartir por WhatsApp
            </button>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-300">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatDate(inspection.created_at)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Insp: {inspection.inspector_name || "No especificado"}</span>
            </div>
            {inspection.driver?.full_name && (
              <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate">Cond: {inspection.driver.full_name}</span>
              </div>
            )}
          </div>
        </div>

        {inspection.status === "draft" && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-2xl p-4 text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            Inspección en progreso: aún no ha sido completada y cerrada.
          </div>
        )}

        {/* PRUEBA DE RUTA, DURACIÓN Y PARTICIPANTES */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 flex-shrink-0">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs uppercase font-bold text-slate-400 tracking-wider">Prueba de ruta</p>
              <p className="text-lg font-black text-slate-800">
                {inspection.road_test === true ? "Sí, se probó andando" : inspection.road_test === false ? "No" : "No registrado"}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 flex-shrink-0">
              <Timer className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs uppercase font-bold text-slate-400 tracking-wider">Duración de la revisión</p>
              <p className="text-lg font-black text-slate-800 font-mono">
                {inspection.duration_seconds != null ? formatDuration(inspection.duration_seconds) : "—"}
              </p>
            </div>
          </div>
        </div>

        {inspection.participants && inspection.participants.length > 1 && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-sm text-slate-700 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>Realizada por: <span className="font-bold">{inspection.participants.join(" → ")}</span></span>
          </div>
        )}

        {/* MÉTRICAS CLAVE (ODÓMETRO Y COMBUSTIBLE) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* TARJETA KILOMETRAJE */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 flex-shrink-0">
              <Gauge className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs uppercase font-bold text-slate-400 tracking-wider">Odómetro / Kilometraje</p>
              <p className="text-2xl font-black text-slate-800 mt-0.5">
                {inspection.mileage ? `${Number(inspection.mileage).toLocaleString("es-CO")} km` : "No registrado"}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Lectura al momento de la revisión</p>
            </div>
          </div>

          {/* TARJETA COMBUSTIBLE */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
                  <Fuel className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs uppercase font-bold text-slate-400 tracking-wider">Tanque de Gasolina</p>
                  <p className="text-base font-extrabold text-slate-800">
                    {fuelInfo ? fuelInfo.label : (inspection.fuel_level || "No registrado")}
                  </p>
                </div>
              </div>
              {fuelInfo && (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${fuelInfo.color}`}>
                  {fuelInfo.pct}%
                </span>
              )}
            </div>

            {/* BARRA VISUAL DE COMBUSTIBLE */}
            {fuelInfo && (
              <div className="mt-3">
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 flex gap-1">
                  {[
                    { key: "empty", width: "20%" },
                    { key: "1/4", width: "20%" },
                    { key: "1/2", width: "20%" },
                    { key: "3/4", width: "20%" },
                    { key: "full", width: "20%" },
                  ].map((seg, idx) => {
                    const stepValues = ["empty", "1/4", "1/2", "3/4", "full"];
                    const activeIdx = stepValues.indexOf(inspection.fuel_level || "");
                    const isFilled = idx <= activeIdx;
                    return (
                      <div
                        key={seg.key}
                        className={`h-full rounded-sm flex-1 transition-all ${
                          isFilled
                            ? activeIdx === 0
                              ? "bg-rose-500"
                              : activeIdx === 1
                              ? "bg-amber-500"
                              : activeIdx === 2
                              ? "bg-yellow-500"
                              : "bg-emerald-500"
                            : "bg-slate-200"
                        }`}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1 px-0.5">
                  <span>E (Vacío)</span>
                  <span>1/4</span>
                  <span>1/2</span>
                  <span>3/4</span>
                  <span>F (Lleno)</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* OBSERVACIONES */}
        {inspection.comments && (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 mb-2 text-slate-800 font-bold text-sm">
              <FileText className="w-4 h-4 text-emerald-600" />
              <span>Observaciones / Novedades</span>
            </div>
            <p className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 font-mono">
              {inspection.comments}
            </p>
          </div>
        )}

        {/* EVIDENCIA FOTOGRÁFICA */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              Evidencia Fotográfica ({photosList.length} fotos)
            </h2>
            <span className="text-xs text-slate-400">Toca para ampliar</span>
          </div>

          {photosList.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-sm">No se adjuntaron fotografías en este reporte.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photosList.map((photo, idx) => (
                <div
                  key={photo.key}
                  onClick={() => setViewingImages({ urls: photosList.map(p => ({ url: p.url, title: p.title })), startingIndex: idx })}
                  className="group relative bg-slate-50 border border-slate-200 rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition active:scale-98"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-slate-200">
                    <img
                      src={photo.url}
                      alt={photo.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-2 bg-white">
                    <p className="text-[11px] font-bold text-slate-700 truncate">{photo.title}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="text-center text-xs text-slate-400 py-4">
          AllAtYou Renting Hub · Registro digital inmutable con fines de auditoría.
        </div>

      </div>

      {/* VISOR DE FOTOS FULL SCREEN */}
      {viewingImages && (
        <ImageViewer
          images={viewingImages.urls}
          initialIndex={viewingImages.startingIndex}
          onClose={() => setViewingImages(null)}
        />
      )}
    </div>
  );
}
