import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ensureBasicAuth } from "../lib/auth";
import { compressImage } from "../utils/compressImage";
import { Camera, X, Check, Plus, Image as ImageIcon, Gauge, Fuel, Share2, CheckCircle2, RotateCcw, ArrowRight } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

const PHOTO_FIELDS = [
  { key: "front", label: "Frente (Exterior)", section: "Exterior" },
  { key: "back", label: "Atrás (Exterior)", section: "Exterior" },
  { key: "left", label: "Lado Izquierdo", section: "Exterior" },
  { key: "right", label: "Lado Derecho", section: "Exterior" },
  { key: "engine", label: "Motor", section: "Mecánica" },
  { key: "interior_dash", label: "Tablero / Consola", section: "Interior" },
  { key: "interior_front", label: "Sillas Delanteras", section: "Interior" },
  { key: "interior_back", label: "Sillas Traseras", section: "Interior" },
  { key: "tires_front_left", label: "Llanta Delantera Izq.", section: "Llantas" },
  { key: "tires_front_right", label: "Llanta Delantera Der.", section: "Llantas" },
  { key: "tires_back_left", label: "Llanta Trasera Izq.", section: "Llantas" },
  { key: "tires_back_right", label: "Llanta Trasera Der.", section: "Llantas" },
];

const FUEL_OPTIONS = [
  { value: "empty", label: "Vacío", short: "E", pct: "0%", color: "text-rose-600 bg-rose-50 border-rose-300" },
  { value: "1/4", label: "1/4", short: "1/4", pct: "25%", color: "text-amber-600 bg-amber-50 border-amber-300" },
  { value: "1/2", label: "1/2", short: "1/2", pct: "50%", color: "text-yellow-700 bg-yellow-50 border-yellow-300" },
  { value: "3/4", label: "3/4", short: "3/4", pct: "75%", color: "text-emerald-600 bg-emerald-50 border-emerald-300" },
  { value: "full", label: "Lleno", short: "F", pct: "100%", color: "text-emerald-700 bg-emerald-100 border-emerald-400" },
];

interface VehicleOption {
  plate: string;
  driver?: { id?: number; full_name?: string; phone?: string } | null;
  current_mileage?: number | null;
}

interface CreatedInspectionResult {
  id: number;
  vehicle_plate: string;
  driver_id?: number | null;
  driver?: { id?: number; full_name?: string; phone?: string } | null;
  type: string;
  mileage?: number | null;
  fuel_level?: string | null;
  comments?: string | null;
  inspector_name?: string | null;
  photos?: Record<string, string>;
}

export default function NewInspection() {
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  // Guardado exitoso con reporte generado
  const [createdInspection, setCreatedInspection] = useState<CreatedInspectionResult | null>(null);

  // Estado del formulario
  const [form, setForm] = useState({
    vehicle_plate: "",
    driver_id: "",
    type: "general",
    mileage: "",
    fuel_level: "1/2",
    comments: "",
    inspector_name: localStorage.getItem("last_inspector_name") || "",
    photos: {} as Record<string, string>,
  });

  // Estado para el Action Sheet (Menú Inferior)
  const [actionSheetField, setActionSheetField] = useState<{ key: string; label: string } | null>(null);

  // --- LOGICA DE CÁMARA WEBRTC ---
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Referencia oculta para abrir el selector de archivos nativo
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const auth = ensureBasicAuth();
    fetch(`${API}/vehicles`, { headers: { Authorization: auth } })
      .then((res) => res.json())
      .then((data) => setVehicles(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Error fetching vehicles:", err));
  }, []);

  const selectedVehicle = vehicles.find((v) => v.plate === form.vehicle_plate);

  // Auto-asignar conductor cuando cambia el vehículo
  const handleVehicleChange = (plate: string) => {
    const v = vehicles.find((item) => item.plate === plate);
    setForm((prev) => ({
      ...prev,
      vehicle_plate: plate,
      driver_id: v?.driver?.id ? String(v.driver.id) : "",
    }));
  };

  // --- ACCIONES DEL MENÚ ---
  const openActionSheet = (key: string, label: string) => {
    setActionSheetField({ key, label });
  };

  const closeActionSheet = () => {
    setActionSheetField(null);
  };

  const handleChooseCamera = () => {
    if (actionSheetField) {
      startCamera();
    }
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
    closeActionSheet();
  };

  // --- LOGICA CÁMARA ---
  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("No pudimos acceder a la cámara. Revisa los permisos.");
      setIsCameraOpen(false);
      closeActionSheet();
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
    closeActionSheet();
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !actionSheetField) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Redimensionar directamente a max 1400px para ahorrar memoria en móvil
    let width = video.videoWidth || 1280;
    let height = video.videoHeight || 720;
    const maxDim = 1400;
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const file = new File([blob], `${actionSheetField.key}_${Date.now()}.jpg`, {
              type: "image/jpeg",
            });
            handleUpload(file, actionSheetField.key);
            stopCamera();
          }
        },
        "image/jpeg",
        0.75
      );
    }
  };

  // --- SUBIDA CON COMPRESIÓN CLIENT-SIDE ---
  const handleUpload = async (file: File, key: string) => {
    setUploading(true);
    setUploadStatus("Comprimiendo imagen...");
    try {
      // 1. Compresión client-side en el móvil (pasa de 5-15MB a <250KB)
      const compressedFile = await compressImage(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.75,
      });

      setUploadStatus("Subiendo foto...");
      const fd = new FormData();
      fd.append("file", compressedFile);
      fd.append("folder", "inspections");

      const res = await fetch(`${API}/uploads`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Error en la subida al servidor");
      const data = await res.json();

      setForm((prev) => ({
        ...prev,
        photos: { ...prev.photos, [key]: data.url },
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al subir la imagen";
      alert(msg);
    } finally {
      setUploading(false);
      setUploadStatus("");
    }
  };

  // --- GUARDAR INSPECCIÓN ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicle_plate) return alert("Selecciona un vehículo");
    if (Object.keys(form.photos).length === 0) {
      return alert("Por favor toma al menos una foto de evidencia");
    }

    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      if (form.inspector_name) {
        localStorage.setItem("last_inspector_name", form.inspector_name.trim());
      }

      const payload = {
        vehicle_plate: form.vehicle_plate,
        driver_id: form.driver_id || null,
        type: form.type,
        mileage: form.mileage ? Number(form.mileage) : null,
        fuel_level: form.fuel_level || null,
        comments: form.comments,
        inspector_name: form.inspector_name,
        photos: form.photos,
      };

      const res = await fetch(`${API}/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Error al guardar la inspección");
      }

      const created = await res.json();
      setCreatedInspection(created);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error guardando la inspección";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  // --- COMPARTIR POR WHATSAPP ---
  const handleShareWhatsApp = (targetPhone?: string) => {
    if (!createdInspection) return;
    const viewUrl = `${window.location.origin}/inspection/${createdInspection.id}`;
    const kmText = createdInspection.mileage
      ? `${Number(createdInspection.mileage).toLocaleString("es-CO")} km`
      : "No registrado";
    const fuelText = createdInspection.fuel_level
      ? (FUEL_OPTIONS.find((f) => f.value === createdInspection.fuel_level)?.label || createdInspection.fuel_level)
      : "No registrado";
    const typeLabel =
      createdInspection.type === "entrega"
        ? "Entrega"
        : createdInspection.type === "recepcion"
        ? "Recepción"
        : "Control General";

    const text =
      `📋 *ACTA DE INSPECCIÓN VEHICULAR*\n` +
      `🚗 *Vehículo:* ${createdInspection.vehicle_plate}\n` +
      `📅 *Fecha:* ${new Date().toLocaleDateString("es-CO", { dateStyle: "medium" })}\n` +
      `🔍 *Tipo:* ${typeLabel}\n` +
      `👤 *Inspector:* ${createdInspection.inspector_name || "N/A"}\n` +
      `🛣️ *Kilometraje:* ${kmText}\n` +
      `⛽ *Combustible:* ${fuelText}\n` +
      (createdInspection.comments ? `📝 *Observaciones:* ${createdInspection.comments}\n` : "") +
      `\n📸 *Ver reporte y fotos:* ${viewUrl}`;

    const cleanPhone = (targetPhone || "").replace(/\D/g, "");
    const waUrl = cleanPhone
      ? `https://wa.me/57${cleanPhone.startsWith("57") ? cleanPhone.slice(2) : cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(waUrl, "_blank");
  };

  const handleResetForNew = () => {
    setCreatedInspection(null);
    setForm({
      vehicle_plate: "",
      driver_id: "",
      type: "general",
      mileage: "",
      fuel_level: "1/2",
      comments: "",
      inspector_name: localStorage.getItem("last_inspector_name") || "",
      photos: {},
    });
  };

  const groupedFields = PHOTO_FIELDS.reduce((acc, field) => {
    if (!acc[field.section]) acc[field.section] = [];
    acc[field.section].push(field);
    return acc;
  }, {} as Record<string, typeof PHOTO_FIELDS>);

  const photosCount = Object.keys(form.photos).length;

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6 relative">
      {/* INPUT FILE OCULTO (Global) */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0] && actionSheetField) {
            handleUpload(e.target.files[0], actionSheetField.key);
            closeActionSheet();
          }
        }}
      />

      <div className="mx-auto max-w-2xl bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* HEADER */}
        <div className="bg-slate-900 p-5 sm:p-6 text-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-400">
              Operaciones · Revisión Móvil
            </span>
            <Link
              to="/inspections"
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Ver Historial
            </Link>
          </div>
          <h1 className="text-2xl font-black">Nueva Inspección</h1>
          <p className="text-slate-400 text-xs">
            Registro ágil del vehículo con fotos comprimidas para campo
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
          {/* 1. SELECCIÓN DE VEHÍCULO */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Vehículo a Inspeccionar
              </label>
              <select
                className="w-full p-3 rounded-xl border border-slate-300 font-black text-slate-800 uppercase bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                value={form.vehicle_plate}
                onChange={(e) => handleVehicleChange(e.target.value)}
                required
              >
                <option value="">-- SELECCIONAR PLACA --</option>
                {vehicles.map((v) => (
                  <option key={v.plate} value={v.plate}>
                    {v.plate} · {v.driver?.full_name || "LIBRE (Sin conductor)"}
                  </option>
                ))}
              </select>
            </div>

            {selectedVehicle && (
              <div className="text-xs bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-slate-400">Conductor: </span>
                  <span className="font-bold text-slate-800">
                    {selectedVehicle.driver?.full_name || "Sin conductor asignado"}
                  </span>
                  {selectedVehicle.driver?.phone && (
                    <span className="text-slate-500 ml-1">({selectedVehicle.driver.phone})</span>
                  )}
                </div>
                {selectedVehicle.current_mileage && (
                  <div className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                    Último Km: {Number(selectedVehicle.current_mileage).toLocaleString("es-CO")} km
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. TIPO DE INSPECCIÓN Y DATOS DEL INSPECTOR */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Evento</label>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                {[
                  { id: "general", label: "Control" },
                  { id: "entrega", label: "Entrega" },
                  { id: "recepcion", label: "Recepción" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setForm({ ...form, type: t.id })}
                    className={`py-2 rounded-lg text-xs font-extrabold transition-all ${
                      form.type === t.id
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Inspector Responsable</label>
              <input
                className="w-full p-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Tu nombre o cargo"
                value={form.inspector_name}
                onChange={(e) => setForm({ ...form, inspector_name: e.target.value })}
                required
              />
            </div>
          </div>

          {/* 3. ODÓMETRO / KILOMETRAJE ACTUAL */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-emerald-600" />
                Kilometraje Actual (Odómetro)
              </label>
              {form.mileage && (
                <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  {Number(form.mileage).toLocaleString("es-CO")} KM
                </span>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Ej. 84500"
                value={form.mileage}
                onChange={(e) => {
                  const clean = e.target.value.replace(/\D/g, "");
                  setForm({ ...form, mileage: clean });
                }}
                className="w-full text-lg font-black tracking-wider p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                KM
              </span>
            </div>
          </div>

          {/* 4. NIVEL DE GASOLINA / COMBUSTIBLE (VISUAL) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Fuel className="w-4 h-4 text-amber-600" />
                Tanque de Gasolina
              </label>
              <span className="text-xs font-black text-slate-700">
                Nivel:{" "}
                <span className="text-emerald-600 uppercase">
                  {FUEL_OPTIONS.find((f) => f.value === form.fuel_level)?.label || form.fuel_level}
                </span>
              </span>
            </div>

            {/* BARRA SEGMENTADA INTERACTIVA */}
            <div className="h-4 w-full bg-slate-200 rounded-full overflow-hidden p-0.5 flex gap-1 shadow-inner">
              {FUEL_OPTIONS.map((opt, idx) => {
                const activeIdx = FUEL_OPTIONS.findIndex((f) => f.value === form.fuel_level);
                const isFilled = idx <= activeIdx;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, fuel_level: opt.value })}
                    className={`h-full flex-1 rounded-sm transition-all ${
                      isFilled
                        ? activeIdx === 0
                          ? "bg-rose-500"
                          : activeIdx === 1
                          ? "bg-amber-500"
                          : activeIdx === 2
                          ? "bg-yellow-500"
                          : "bg-emerald-500"
                        : "bg-slate-300 hover:bg-slate-400"
                    }`}
                    title={`Marcar ${opt.label}`}
                  />
                );
              })}
            </div>

            {/* BOTONES TÁCTILES GRANDES (PENSADOS PARA MÓVIL) */}
            <div className="grid grid-cols-5 gap-1.5">
              {FUEL_OPTIONS.map((opt) => {
                const isSelected = form.fuel_level === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm({ ...form, fuel_level: opt.value })}
                    className={`py-2.5 px-1 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${
                      isSelected
                        ? `${opt.color} ring-2 ring-emerald-500 font-black shadow-sm scale-102`
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold"
                    }`}
                  >
                    <span className="text-sm">{opt.short}</span>
                    <span className="text-[10px] text-slate-400 font-normal">{opt.pct}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. FOTOS DE EVIDENCIA (GRID MÓVIL) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Fotos de Evidencia
                </h3>
                <p className="text-[11px] text-slate-400">
                  Compresión automática activa para no saturar memoria
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                {photosCount} / {PHOTO_FIELDS.length} listas
              </span>
            </div>

            {Object.entries(groupedFields).map(([section, fields]) => (
              <div key={section} className="pt-2">
                <h4 className="text-emerald-700 font-extrabold uppercase text-[11px] mb-3 tracking-wider">
                  {section}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {fields.map((field) => (
                    <div key={field.key} className="relative">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1 truncate">
                        {field.label}
                      </label>

                      {form.photos[field.key] ? (
                        // FOTO CARGADA
                        <div className="relative h-28 w-full rounded-2xl overflow-hidden border border-emerald-200 bg-emerald-50 shadow-sm group">
                          <img
                            src={form.photos[field.key]}
                            alt={field.label}
                            className="h-full w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => {
                                const newPhotos = { ...form.photos };
                                delete newPhotos[field.key];
                                setForm({ ...form, photos: newPhotos });
                              }}
                              className="bg-red-500 text-white rounded-full p-2 shadow-lg hover:bg-red-600 active:scale-95"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[10px] font-bold text-center py-0.5 flex items-center justify-center gap-1">
                            <Check className="w-3 h-3" /> LISTO
                          </div>
                        </div>
                      ) : (
                        // BOTÓN DE CARGA
                        <button
                          type="button"
                          onClick={() => openActionSheet(field.key, field.label)}
                          className="w-full h-28 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-emerald-500 hover:text-emerald-600 text-slate-400 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95"
                        >
                          <div className="p-2.5 bg-white rounded-full shadow-sm text-slate-500">
                            <Plus className="w-5 h-5" />
                          </div>
                          <span className="text-[10px] font-bold">Tomar Foto</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* 6. OBSERVACIONES */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Observaciones / Novedades / Rayones
            </label>
            <textarea
              className="w-full p-3 rounded-xl border border-slate-300 h-28 resize-none focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
              placeholder="Detalles sobre rayones, kit de carretera, llanta de repuesto, documentos..."
              value={form.comments}
              onChange={(e) => setForm({ ...form, comments: e.target.value })}
            />
          </div>

          {/* BOTÓN SUBMIT */}
          <button
            type="submit"
            disabled={loading || uploading}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg shadow-xl disabled:opacity-50 transition-all active:scale-98"
          >
            {loading ? "Guardando Inspección..." : "Guardar y Finalizar Revisión"}
          </button>
        </form>
      </div>

      {/* --- ACTION SHEET INFERIOR (CÁMARA O ARCHIVO) --- */}
      {actionSheetField && !isCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 space-y-4 animate-in slide-in-from-bottom duration-300 shadow-2xl">
            <div className="flex justify-between items-center mb-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  Captura de Evidencia
                </span>
                <h3 className="text-lg font-black text-slate-800">{actionSheetField.label}</h3>
              </div>
              <button
                onClick={closeActionSheet}
                className="p-1.5 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Las fotos se comprimen en tu celular antes de subir para ahorrar datos y espacio.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleChooseCamera}
                className="flex flex-col items-center justify-center gap-3 p-5 rounded-2xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 transition-colors active:scale-95"
              >
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <Camera className="w-6 h-6" />
                </div>
                <span className="text-xs font-black text-slate-700">Usar Cámara</span>
              </button>

              <button
                onClick={handleChooseFile}
                className="flex flex-col items-center justify-center gap-3 p-5 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-colors active:scale-95"
              >
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-black text-slate-700">Galería / Archivo</span>
              </button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={closeActionSheet} />
        </div>
      )}

      {/* --- MODAL DE CÁMARA (WEBRTC) --- */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-in fade-in duration-300">
          <div className="p-4 flex justify-between items-center bg-black/60 absolute top-0 w-full z-10 backdrop-blur-sm">
            <span className="text-white font-extrabold text-sm">{actionSheetField?.label}</span>
            <button onClick={stopCamera} className="text-white bg-white/20 p-2 rounded-full">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 relative flex items-center justify-center bg-black">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="p-8 bg-black flex justify-center pb-12">
            <button
              onClick={capturePhoto}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:bg-white active:scale-95 transition-all shadow-2xl"
            >
              <div className="w-16 h-16 bg-white rounded-full" />
            </button>
          </div>
        </div>
      )}

      {/* LOADING OVERLAY CON STATUS */}
      {uploading && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex flex-col items-center justify-center text-white backdrop-blur-sm">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mb-4"></div>
          <p className="font-bold text-sm">{uploadStatus || "Procesando imagen..."}</p>
          <p className="text-xs text-slate-400 mt-1">Optimizando tamaño para el bucket</p>
        </div>
      )}

      {/* --- MODAL DE ÉXITO & COMPARTIR POR WHATSAPP --- */}
      {createdInspection && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full mx-auto flex items-center justify-center shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                Registro Completado
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-0.5">
                ¡Inspección Guardada!
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                La evidencia ha sido archivada de manera segura con sus fotos comprimidas.
              </p>
            </div>

            {/* RESUMEN RÁPIDO */}
            <div className="bg-slate-50 rounded-2xl p-4 text-left text-xs space-y-2 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Vehículo:</span>
                <span className="font-black text-slate-800">{createdInspection.vehicle_plate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Kilometraje:</span>
                <span className="font-bold text-slate-800">
                  {createdInspection.mileage
                    ? `${Number(createdInspection.mileage).toLocaleString("es-CO")} km`
                    : "No registrado"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Combustible:</span>
                <span className="font-bold text-slate-800 uppercase">
                  {createdInspection.fuel_level || "No registrado"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Evidencias:</span>
                <span className="font-bold text-emerald-600">
                  {Object.keys(createdInspection.photos || {}).length} fotos adjuntas
                </span>
              </div>
            </div>

            {/* BOTONES DE WHATSAPP */}
            <div className="space-y-2 pt-1">
              {createdInspection.driver?.phone && (
                <button
                  onClick={() => handleShareWhatsApp(createdInspection.driver?.phone)}
                  className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
                >
                  <Share2 className="w-4 h-4" /> Enviar por WhatsApp al Conductor ({createdInspection.driver.phone})
                </button>
              )}

              <button
                onClick={() => handleShareWhatsApp()}
                className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition active:scale-95"
              >
                <Share2 className="w-4 h-4 text-emerald-400" /> Compartir por WhatsApp (Cualquier Persona)
              </button>

              <Link
                to={`/inspection/${createdInspection.id}`}
                target="_blank"
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
              >
                Ver reporte completo online <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* ACCIÓN NUEVA INSPECCIÓN */}
            <button
              onClick={handleResetForNew}
              className="text-xs text-slate-500 hover:text-slate-800 font-bold flex items-center justify-center gap-1 mx-auto pt-2"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Realizar otra inspección
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
