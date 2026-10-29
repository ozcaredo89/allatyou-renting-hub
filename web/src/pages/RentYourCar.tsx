import { useState, useRef } from "react";
import {
  UploadCloud,
  CheckCircle,
  Car,
  DollarSign,
  Camera,
  MapPin,
  X,
  MessageCircle,
  AlertCircle,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { compressImage } from "../utils/compressImage";
import { BRANDS } from "../constants/vehicleCatalog";
import { VehicleModelCombobox } from "../components/VehicleModelCombobox";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

// Número para el servicio de GPS y soporte
const GPS_SERVICE_PHONE = "573238035356";
const SUPPORT_WHATSAPP = "573113738912";

function sanitizeColombianPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("57")) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 10);
}

export default function RentYourCar() {
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isDuplicatePlateError, setIsDuplicatePlateError] = useState(false);

  // Honeypot anti-bots
  const [website, setWebsite] = useState("");

  // --- ESTADOS PARA FOTOS Y CÁMARA ---
  const [photos, setPhotos] = useState<Array<{ url: string; kind?: string }>>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);

  // Estado del formulario (year como string para permitir borrar y editar libremente)
  const [form, setForm] = useState({
    owner_name: "",
    owner_phone: "",
    owner_email: "",
    owner_city: "Cali",
    brand: "Chevrolet",
    model: "",
    year: String(new Date().getFullYear()),
    transmission: "Automática",
    fuel_type: "Gasolina",
    plate: "",
    price_per_day: "",
    has_gps: "Sí",
  });

  const [customBrand, setCustomBrand] = useState("");

  const showError = (msg: string, isDuplicate = false) => {
    setFormError(msg);
    setIsDuplicatePlateError(isDuplicate);
    setTimeout(() => {
      errorBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  // --- LÓGICA DE SUBIDA (GENÉRICA) ---
  const uploadFile = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "vehicles");
    const res = await fetch(`${API}/uploads`, { method: "POST", body: fd });
    if (!res.ok) throw new Error("Error subiendo imagen");
    const data = await res.json();
    return data.url;
  };

  const handleMultipleFilesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    const newPhotos: Array<{ url: string; kind?: string }> = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        setUploadProgress(`Comprimiendo y subiendo foto ${i + 1} de ${files.length}...`);
        const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
        const url = await uploadFile(compressed);
        newPhotos.push({ url, kind: "general" });
      }
      setPhotos(prev => [...prev, ...newPhotos]);
    } catch {
      alert("Error al procesar o subir las fotos.");
    } finally {
      setLoading(false);
      setUploadProgress(null);
      if (e.target) e.target.value = "";
    }
  };

  const removePhotoByIndex = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // --- LÓGICA DE CÁMARA (WEBRTC) ---
  const startCamera = async () => {
    setShowCamera(true);
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
      console.error(err);
      alert("No pudimos acceder a la cámara.");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Escalar si el video supera 1600px
    let w = video.videoWidth;
    let h = video.videoHeight;
    const maxDim = 1600;
    if (w > maxDim || h > maxDim) {
      const ratio = Math.min(maxDim / w, maxDim / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d");

    if (context) {
      context.drawImage(video, 0, 0, w, h);
      canvas.toBlob(
        async blob => {
          if (blob) {
            const file = new File([blob], `car_${Date.now()}.jpg`, { type: "image/jpeg" });
            stopCamera();
            setLoading(true);
            setUploadProgress("Subiendo foto capturada...");
            try {
              const url = await uploadFile(file);
              setPhotos(prev => [...prev, { url, kind: "general" }]);
            } catch {
              alert("Error guardando la foto");
            } finally {
              setLoading(false);
              setUploadProgress(null);
            }
          }
        },
        "image/jpeg",
        0.8
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsDuplicatePlateError(false);

    const effectiveBrand = form.brand === "Otra" ? customBrand.trim() : form.brand.trim();
    const effectiveModel = form.model.trim();
    const normalizedPlate = form.plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const cleanPhone = sanitizeColombianPhone(form.owner_phone);
    const parsedYear = parseInt(form.year, 10);
    const currentYear = new Date().getFullYear();

    if (!effectiveBrand || !effectiveModel) {
      showError("Por favor selecciona o escribe la Marca y Línea de tu vehículo.");
      return;
    }

    if (Number.isNaN(parsedYear) || parsedYear < 1990 || parsedYear > currentYear + 1) {
      showError(`Ingresa un año/modelo válido entre 1990 y ${currentYear + 1}.`);
      return;
    }

    if (!/^[A-Z]{3}\d{3}$/.test(normalizedPlate)) {
      showError("La placa debe tener formato colombiano de 3 letras y 3 números (ej: ABC123).");
      return;
    }

    if (!/^3\d{9}$/.test(cleanPhone)) {
      showError("Ingresa un número de celular colombiano válido de 10 dígitos (ej: 3001234567).");
      return;
    }

    if (photos.length === 0) {
      showError("Por favor sube al menos una foto de tu vehículo.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API}/marketplace/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          website,
          brand: effectiveBrand,
          model: effectiveModel,
          year: parsedYear,
          plate: normalizedPlate,
          owner_phone: cleanPhone,
          photos: photos.map(p => ({ url: p.url, kind: p.kind || "general" })),
          photo_exterior_url: photos[0]?.url || "",
          photo_interior_url: photos[1]?.url || photos[0]?.url || "",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const isDup = res.status === 409 || err.code === "vehicle_already_exists";
        showError(err.error || "Error al enviar la solicitud", isDup);
        return;
      }

      setSuccess(true);
      window.scrollTo(0, 0);
    } catch (error: any) {
      showError(error.message || "Error de conexión al enviar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white max-w-lg w-full p-8 rounded-3xl shadow-xl text-center">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-4">¡Solicitud Recibida!</h2>
          <p className="text-slate-600 mb-8 text-lg">
            Gracias por confiar en <strong>AllAtYou</strong>. Hemos recibido los datos de tu vehículo.
            <br />
            <br />
            {form.has_gps === "No" && (
              <span className="block bg-blue-50 text-blue-800 p-3 rounded-xl text-sm font-medium mb-4">
                📢 Nota: Vimos que tu carro no tiene GPS. Un asesor te contactará para coordinar la instalación antes de activarlo.
              </span>
            )}
            Nuestro equipo revisará tu vehículo y te contactaremos por WhatsApp al <strong>{form.owner_phone}</strong> en las próximas 24 horas.
          </p>
          <Link to="/" className="block w-full py-4 bg-black text-white font-bold rounded-xl hover:bg-slate-800 transition-colors">
            Volver al Inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Pon tu carro a trabajar 💸</h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            Convierte tu vehículo en un activo que genera ingresos pasivos.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          {/* Honeypot anti-bots */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            className="hidden"
            aria-hidden="true"
          />

          {/* SECCIÓN 1: EL DUEÑO */}
          <div className="p-8 border-b border-slate-100">
            <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-6 flex items-center gap-2">
              <UserIcon /> 1. Datos del Propietario
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-bold text-slate-700 mb-2">Nombre Completo</label>
                <input
                  required
                  type="text"
                  placeholder="Ej: Juan Pérez"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.owner_name}
                  onChange={e => setForm({ ...form, owner_name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">WhatsApp / Celular (10 dígitos)</label>
                <input
                  required
                  type="tel"
                  maxLength={18}
                  placeholder="3001234567"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  value={form.owner_phone}
                  onChange={e => setForm({ ...form, owner_phone: sanitizeColombianPhone(e.target.value) })}
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-bold text-slate-700 mb-2">Correo Electrónico (Notificaciones)</label>
                <input
                  required
                  type="email"
                  placeholder="ejemplo@email.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.owner_email}
                  onChange={e => setForm({ ...form, owner_email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Ciudad</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                  <select
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
                    value={form.owner_city}
                    onChange={e => setForm({ ...form, owner_city: e.target.value })}
                  >
                    <option value="Cali">Cali, Valle</option>
                    <option value="Jamundí">Jamundí</option>
                    <option value="Yumbo">Yumbo</option>
                    <option value="Palmira">Palmira</option>
                    <option value="Bogotá">Bogotá D.C.</option>
                    <option value="Medellín">Medellín</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: EL CARRO */}
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-6 flex items-center gap-2">
              <Car className="w-4 h-4" /> 2. Datos del Vehículo
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Marca</label>
                <select
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.brand}
                  onChange={e => {
                    const nextBrand = e.target.value;
                    setForm({ ...form, brand: nextBrand, model: "" });
                    setCustomBrand("");
                  }}
                >
                  {BRANDS.map(b => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              {form.brand === "Otra" && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">¿Cuál marca?</label>
                  <input
                    required
                    type="text"
                    placeholder="Ej: Subaru, Volvo, JAC..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                    value={customBrand}
                    onChange={e => setCustomBrand(e.target.value)}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Modelo / Línea</label>
                <VehicleModelCombobox
                  brand={form.brand === "Otra" ? customBrand || "Otra" : form.brand}
                  value={form.model}
                  onChange={val => setForm(prev => ({ ...prev, model: val }))}
                  variant="light"
                  placeholder={form.brand === "Otra" ? "Escribe el modelo (ej: Forester, XC60...)" : undefined}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Año</label>
                <input
                  required
                  type="number"
                  min={1990}
                  max={new Date().getFullYear() + 1}
                  placeholder="2023"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.year}
                  onChange={e => setForm({ ...form, year: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Transmisión</label>
                <select
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.transmission}
                  onChange={e => setForm({ ...form, transmission: e.target.value })}
                >
                  <option value="Automática">Automática</option>
                  <option value="Mecánica">Mecánica</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Placa (Privado)</label>
                <input
                  required
                  type="text"
                  maxLength={6}
                  placeholder="ABC123"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500 uppercase font-mono tracking-wider"
                  value={form.plate}
                  onChange={e =>
                    setForm({ ...form, plate: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) })
                  }
                />
              </div>

              {/* --- PREGUNTA GPS --- */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">¿Tiene GPS Satelital?</label>
                <select
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.has_gps}
                  onChange={e => setForm({ ...form, has_gps: e.target.value })}
                >
                  <option value="Sí">Sí, ya tiene</option>
                  <option value="No">No tiene</option>
                </select>
              </div>

              {/* --- CARD DE SERVICIO GPS (SOLO SI DICE NO) --- */}
              {form.has_gps === "No" && (
                <div className="col-span-1 md:col-span-3 bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 animate-in fade-in slide-in-from-top-2">
                  <div className="bg-blue-100 p-3 rounded-full text-blue-600 shrink-0">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h4 className="font-bold text-slate-800 text-sm flex items-center justify-center sm:justify-start gap-2">
                      <AlertCircle className="w-4 h-4 text-orange-500" /> Requisito Obligatorio
                    </h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Para rentar en AllAtYou es <strong>obligatorio</strong> tener GPS. <br />
                      No te preocupes, nosotros recogemos tu carro, lo instalamos y te lo devolvemos listo.
                    </p>
                  </div>
                  <a
                    href={`https://wa.me/${GPS_SERVICE_PHONE}?text=${encodeURIComponent("Necesito ayuda para poner GPS en mi carro.")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="whitespace-nowrap px-5 py-3 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-200"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Solicitar Instalación
                  </a>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Precio Esperado / Día</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    placeholder="120000"
                    className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                    value={form.price_per_day}
                    onChange={e => setForm({ ...form, price_per_day: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: FOTOS (FLEXIBLE CON IA Y RECOMENDACIONES) */}
          <div className="p-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4" /> 3. Fotos del Vehículo
              </h3>
              {photos.length > 0 && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                  {photos.length} {photos.length === 1 ? "foto agregada" : "fotos agregadas"}
                </span>
              )}
            </div>

            {/* Guía visual con recomendaciones amigables */}
            <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-xs text-emerald-950 space-y-2 mb-6">
              <div className="flex items-center gap-1.5 font-bold text-emerald-800 text-sm">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                Recomendaciones para mejores fotos (nuestra IA las organiza):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-700 mt-2">
                <div className="flex items-center gap-2 bg-white rounded-xl p-3 border border-emerald-100 shadow-sm">
                  <span className="text-xl">☀️</span>
                  <div>
                    <strong className="block text-slate-900">Buena luz natural</strong>
                    <span className="text-slate-500 text-[11px]">De día, sin sombras fuertes</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white rounded-xl p-3 border border-emerald-100 shadow-sm">
                  <span className="text-xl">🚗</span>
                  <div>
                    <strong className="block text-slate-900">Carro completo</strong>
                    <span className="text-slate-500 text-[11px]">Ángulo frontal o 3/4</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-white rounded-xl p-3 border border-emerald-100 shadow-sm">
                  <span className="text-xl">💺</span>
                  <div>
                    <strong className="block text-slate-900">Interior y tablero</strong>
                    <span className="text-slate-500 text-[11px]">Limpio y bien iluminado</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Galería de fotos subidas */}
            {photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {photos.map((p, idx) => (
                  <div key={idx} className="relative group rounded-xl border border-slate-200 bg-slate-100 overflow-hidden shadow-sm aspect-[4/3]">
                    <img src={p.url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between p-2">
                      <span className="text-[11px] text-white font-bold bg-black/60 px-2 py-0.5 rounded">
                        {idx === 0 ? "Portada" : `#${idx + 1}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePhotoByIndex(idx)}
                        className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shadow-sm"
                        title="Eliminar foto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Botones de acción: Tomar Foto o Subir desde Galería */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={startCamera}
                disabled={loading}
                className="flex items-center justify-center gap-2.5 p-4 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-800 font-bold text-sm transition-all active:scale-[0.99] disabled:opacity-50"
              >
                <Camera className="w-5 h-5 text-emerald-600" />
                <span>Tomar Foto con Cámara</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="flex items-center justify-center gap-2.5 p-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-sm transition-all active:scale-[0.99] disabled:opacity-50"
              >
                <UploadCloud className="w-5 h-5 text-slate-500" />
                <span>{uploadProgress ? uploadProgress : "Subir desde Galería / Archivos"}</span>
              </button>
            </div>
            <p className="text-center text-xs text-slate-400 mt-2">
              Puedes subir una o varias fotos. No te preocupes por el orden ni el lado, nuestra IA las clasifica automáticamente.
            </p>
          </div>

          {/* FOOTER */}
          <div className="p-8 bg-slate-50 border-t border-slate-100 space-y-4">
            {formError && (
              <div
                ref={errorBannerRef}
                className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium space-y-2 animate-in fade-in"
              >
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <span>{formError}</span>
                </div>
                {isDuplicatePlateError && (
                  <a
                    href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
                      `Hola AllAtYou, intento registrar mi vehículo de placa ${form.plate} en el Marketplace pero dice que ya está registrado.`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    ¿Es tu vehículo? Escríbenos por WhatsApp
                  </a>
                )}
              </div>
            )}

            <button
              disabled={loading}
              type="submit"
              className="w-full bg-slate-900 text-white font-bold text-lg py-4 rounded-xl shadow-lg hover:bg-black hover:scale-[1.01] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (uploadProgress || "Enviando Solicitud...") : "Enviar Solicitud de Registro 🚀"}
            </button>
            <p className="text-center text-xs text-slate-400 mt-4">
              Al enviar, aceptas nuestros términos de servicio.
            </p>
          </div>
        </form>
      </div>

      {/* INPUT OCULTO PARA SUBIDA DE ARCHIVOS */}
      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        className="hidden"
        onChange={handleMultipleFilesSelect}
      />

      {/* --- MODAL DE CÁMARA FULLSCREEN --- */}
      {showCamera && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col animate-in fade-in duration-300">
          <div className="p-4 flex justify-between items-center bg-black/50 absolute top-0 w-full z-10 backdrop-blur-sm">
            <span className="text-white font-bold text-sm">Tomar Foto</span>
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
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:bg-white active:scale-95 transition-all"
            >
              <div className="w-16 h-16 bg-white rounded-full" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
