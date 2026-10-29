import { useState, useRef } from "react";
import { Camera, CheckCircle2, AlertCircle, UploadCloud, Trash2, MessageCircle, Sparkles } from "lucide-react";
import { compressImage } from "../utils/compressImage";
import { BRANDS, BRAND_LINES } from "../constants/vehicleCatalog";
import { VehicleModelCombobox } from "./VehicleModelCombobox";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const SUPPORT_WHATSAPP = "573113738912";

// Listas estáticas para facilitar el llenado y evitar datos basura
const CITIES = ["Cali", "Jamundí", "Yumbo", "Palmira", "Buga", "Otra"];

const COMMON_COLORS = ["Blanco", "Gris", "Plata", "Negro", "Rojo", "Azul", "Beige"];
const FUELS = ["Gasolina", "Gas/Gasolina", "Diesel", "Eléctrico", "Híbrido"];

const APPOINTMENT_SUGGESTIONS = [
  "Mañana en la mañana",
  "Mañana en la tarde",
  "Esta semana",
  "Este fin de semana",
  "Lo antes posible",
];

function sanitizeColombianPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("57")) {
    digits = digits.slice(2);
  }
  return digits.slice(0, 10);
}

function isGibberishText(v: string): boolean {
  const clean = v.trim();
  if (!clean) return false;
  const words = clean.split(/\s+/);
  for (const word of words) {
    if (word.length > 25) return true;
    if (/[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]{6,}/.test(word)) return true;
    // Solo evaluar cambios de mayúscula/minúscula en palabras de 10 letras o más
    if (word.length >= 10 && word !== word.toUpperCase()) {
      let transitions = 0;
      for (let i = 1; i < word.length; i++) {
        const prevChar = word.charAt(i - 1);
        const currChar = word.charAt(i);
        const prevUpper = /[A-ZÁÉÍÓÚÑ]/.test(prevChar);
        const currUpper = /[A-ZÁÉÍÓÚÑ]/.test(currChar);
        const prevLet = /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(prevChar);
        const currLet = /[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(currChar);
        if (prevLet && currLet && prevUpper !== currUpper) transitions++;
      }
      if (transitions >= 3) return true;
    }
  }
  return false;
}

export function VehicleApplicationForm() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDuplicatePlateError, setIsDuplicatePlateError] = useState(false);
  const errorBannerRef = useRef<HTMLDivElement>(null);

  const showError = (msg: string, isDuplicate = false) => {
    setError(msg);
    setIsDuplicatePlateError(isDuplicate);
    setTimeout(() => {
      errorBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  };

  // Honeypot anti-bots
  const [website, setWebsite] = useState("");

  // Estado inicial alineado con el payload del backend
  const [formData, setFormData] = useState({
    owner: { fullName: "", phone: "", email: "", city: "Cali" },
    vehicle: {
      plate: "",
      brand: "Chevrolet",
      isBrandNewSuggestion: false,
      line: "",
      isLineNewSuggestion: false,
      year: new Date().getFullYear(),
      color: "Blanco",
      fuel: "Gasolina",
    },
    business: {
      appointmentDate: "",
      availability: "unlimited",
      expectedPrice: 70000,
    },
    status: {
      mileage: 0,
      soatDate: "",
      technoDate: "",
      hasInsurance: false,
    },
    photos: [] as { kind: string; url: string }[],
  });

  // Manejo para marca personalizada ("Otra")
  const [customBrand, setCustomBrand] = useState("");

  const clearErrors = () => {
    setError(null);
    setIsDuplicatePlateError(false);
  };

  const handleBrandChange = (newBrand: string) => {
    clearErrors();
    setCustomBrand("");
    setFormData(prev => ({
      ...prev,
      vehicle: {
        ...prev.vehicle,
        brand: newBrand,
        line: "",
      },
    }));
  };

  const handleMultiplePhotosUpload = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    clearErrors();
    setUploadProgress(`Procesando 1 de ${fileArray.length}...`);

    const newPhotos: Array<{ kind: string; url: string }> = [];

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      if (!file) continue;
      setUploadProgress(`Subiendo foto ${i + 1} de ${fileArray.length}...`);

      try {
        const compressedFile = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
        const fd = new FormData();
        fd.append("file", compressedFile);
        fd.append("folder", "vehicles");
        const res = await fetch(`${API}/uploads`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || "No se pudo subir la imagen");
        }
        const data = await res.json();
        newPhotos.push({ kind: "general", url: data.url });
      } catch (err: any) {
        showError(`Error subiendo foto: ${err.message}`);
        break;
      }
    }

    if (newPhotos.length > 0) {
      setFormData(prev => ({
        ...prev,
        photos: [...prev.photos, ...newPhotos],
      }));
    }
    setUploadProgress(null);
  };

  const removePhotoByIndex = (index: number) => {
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index),
    }));
  };

  const validateStep = (currentStep: number): boolean => {
    clearErrors();

    if (currentStep === 1) {
      const name = formData.owner.fullName.trim();
      if (name.length < 3) {
        showError("Por favor ingresa tu nombre completo (mínimo 3 letras).");
        return false;
      }
      if (isGibberishText(name)) {
        showError("Revisa el nombre, parece tener un error de escritura.");
        return false;
      }

      const phone = formData.owner.phone.trim();
      if (!/^3\d{9}$/.test(phone)) {
        showError("Ingresa un número de celular colombiano válido de 10 dígitos (debe iniciar en 3).");
        return false;
      }

      const email = formData.owner.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError("Por favor ingresa un correo electrónico válido (ej: nombre@correo.com).");
        return false;
      }
    }

    if (currentStep === 2) {
      const plate = formData.vehicle.plate.trim().toUpperCase();
      if (!/^[A-Z]{3}\d{3}$/.test(plate)) {
        showError("La placa debe tener formato colombiano de 3 letras y 3 números (ej: ABC123).");
        return false;
      }

      const currentYear = new Date().getFullYear();
      if (!formData.vehicle.year || formData.vehicle.year < 1990 || formData.vehicle.year > currentYear + 1) {
        showError(`Ingresa un año/modelo válido (entre 1990 y ${currentYear + 1}).`);
        return false;
      }

      const effectiveBrand = formData.vehicle.brand === "Otra" ? customBrand.trim() : formData.vehicle.brand.trim();
      if (!effectiveBrand || effectiveBrand.length < 2 || isGibberishText(effectiveBrand)) {
        showError("Revisa la marca del vehículo, parece tener un error de escritura.");
        return false;
      }

      const effectiveLine = formData.vehicle.line.trim();
      if (!effectiveLine || effectiveLine.length < 1 || isGibberishText(effectiveLine)) {
        showError("Por favor selecciona o escribe la línea de tu vehículo (ej: Odyssey, Civic, Picanto).");
        return false;
      }

      const color = formData.vehicle.color.trim();
      if (!color || color.length < 3 || isGibberishText(color)) {
        showError("Por favor indica el color del vehículo.");
        return false;
      }
    }

    if (currentStep === 3) {
      if (!formData.business.expectedPrice || formData.business.expectedPrice < 20000) {
        showError("Ingresa un precio diario esperado válido (ej: $70.000 COP).");
        return false;
      }
      const appt = formData.business.appointmentDate.trim();
      if (!appt) {
        showError("Por favor selecciona o escribe cuándo podríamos ver el vehículo.");
        return false;
      }
      if (isGibberishText(appt)) {
        showError("Por favor ingresa una disponibilidad válida para ver el vehículo.");
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    clearErrors();
    setStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;

    setLoading(true);
    clearErrors();

    const effectiveBrand = formData.vehicle.brand === "Otra" ? customBrand.trim() : formData.vehicle.brand.trim();
    const effectiveLine = formData.vehicle.line.trim();
    const isBrandNew = formData.vehicle.brand === "Otra";
    const knownLines = BRAND_LINES[effectiveBrand] || [];
    const isLineNew = isBrandNew || !knownLines.some(l => l.toLowerCase() === effectiveLine.toLowerCase());

    const payload = {
      ...formData,
      website, // Honeypot
      vehicle: {
        ...formData.vehicle,
        brand: effectiveBrand,
        isBrandNewSuggestion: isBrandNew,
        line: effectiveLine,
        isLineNewSuggestion: isLineNew,
      },
    };

    try {
      const response = await fetch(`${API}/vehicle-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const isDup = response.status === 409 || errData.error === "vehicle_already_exists";
        showError(errData.message || "Error al enviar la solicitud del vehículo.", isDup);
        return;
      }
      setSuccess(true);
    } catch (err: any) {
      showError(err.message || "Error de conexión al enviar la solicitud.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-3xl border border-emerald-500/30 bg-slate-900/80 p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <h3 className="text-xl font-bold text-white">¡Vehículo Registrado!</h3>
        <p className="mt-2 text-slate-300 text-sm leading-relaxed">
          Hemos recibido la información de tu <strong>{formData.vehicle.brand === "Otra" ? customBrand : formData.vehicle.brand}</strong> de placa <strong>{formData.vehicle.plate}</strong>.<br />
          Nuestro equipo comercial te contactará al WhatsApp <strong>{formData.owner.phone}</strong> para agendar la revisión.
        </p>
      </div>
    );
  }

  const STEP_TITLES = [
    { num: 1, label: "Propietario" },
    { num: 2, label: "Vehículo" },
    { num: 3, label: "Negocio" },
    { num: 4, label: "Fotos y Estado" },
  ];

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
      {/* Honeypot invisible para bots */}
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

      {/* Barra de Progreso con Etiquetas */}
      <div className="mb-6">
        <div className="grid grid-cols-4 gap-2 mb-2">
          {STEP_TITLES.map(s => (
            <div key={s.num} className="flex flex-col gap-1.5">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  step >= s.num ? "bg-emerald-500" : "bg-slate-700"
                }`}
              />
              <span
                className={`text-[10px] font-semibold truncate ${
                  step === s.num ? "text-emerald-400" : step > s.num ? "text-slate-300" : "text-slate-500"
                }`}
              >
                {s.num}. {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div
          ref={errorBannerRef}
          className="mb-4 rounded-xl bg-red-500/15 p-3.5 text-xs text-red-300 border border-red-500/30 animate-in fade-in space-y-2"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          {isDuplicatePlateError && (
            <a
              href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
                `Hola AllAtYou, intento registrar mi vehículo de placa ${formData.vehicle.plate} pero dice que ya está registrado.`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              ¿Es tu vehículo? Escríbenos por WhatsApp
            </a>
          )}
        </div>
      )}

      {/* STEP 1: Propietario */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">1. Datos del Propietario</h3>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nombre completo *</label>
            <input
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-400 outline-none"
              placeholder="Ej: Juan Carlos Pérez"
              value={formData.owner.fullName}
              onChange={e => {
                clearErrors();
                setFormData({ ...formData, owner: { ...formData.owner, fullName: e.target.value } });
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Celular / WhatsApp (10 dígitos) *</label>
              <input
                type="tel"
                maxLength={18}
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-400 outline-none font-mono"
                placeholder="3001234567"
                value={formData.owner.phone}
                onChange={e => {
                  clearErrors();
                  setFormData({
                    ...formData,
                    owner: { ...formData.owner, phone: sanitizeColombianPhone(e.target.value) },
                  });
                }}
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Ciudad *</label>
              <select
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-400 outline-none"
                value={formData.owner.city}
                onChange={e => setFormData({ ...formData, owner: { ...formData.owner, city: e.target.value } })}
              >
                {CITIES.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Correo electrónico *</label>
            <input
              type="email"
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-emerald-400 outline-none"
              placeholder="ejemplo@correo.com"
              value={formData.owner.email}
              onChange={e => {
                clearErrors();
                setFormData({ ...formData, owner: { ...formData.owner, email: e.target.value } });
              }}
            />
          </div>

          <button
            onClick={handleNext}
            className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/10"
          >
            Siguiente: Datos del Vehículo →
          </button>
        </div>
      )}

      {/* STEP 2: Vehículo */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">2. Datos del Vehículo</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Placa (3 letras + 3 números) *</label>
              <input
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm text-white uppercase outline-none font-mono tracking-wider focus:ring-2 focus:ring-emerald-400"
                placeholder="ABC123"
                maxLength={6}
                value={formData.vehicle.plate}
                onChange={e => {
                  clearErrors();
                  setFormData({
                    ...formData,
                    vehicle: {
                      ...formData.vehicle,
                      plate: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6),
                    },
                  });
                }}
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Modelo / Año *</label>
              <input
                type="number"
                min={1990}
                max={new Date().getFullYear() + 1}
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Ej: 2023"
                value={formData.vehicle.year || ""}
                onChange={e => {
                  clearErrors();
                  setFormData({
                    ...formData,
                    vehicle: { ...formData.vehicle, year: Number(e.target.value) },
                  });
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Marca *</label>
              <select
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-400"
                value={formData.vehicle.brand}
                onChange={e => handleBrandChange(e.target.value)}
              >
                {BRANDS.map(b => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {formData.vehicle.brand === "Otra" && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">¿Cuál marca? *</label>
                <input
                  className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-400"
                  placeholder="Ej: Volvo, Subaru, JAC..."
                  value={customBrand}
                  onChange={e => {
                    clearErrors();
                    setCustomBrand(e.target.value);
                  }}
                />
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Línea / Referencia *</label>
              <VehicleModelCombobox
                brand={formData.vehicle.brand === "Otra" ? customBrand || "Otra" : formData.vehicle.brand}
                value={formData.vehicle.line}
                onChange={val => {
                  clearErrors();
                  setFormData(prev => ({
                    ...prev,
                    vehicle: { ...prev.vehicle, line: val },
                  }));
                }}
                variant="dark"
                placeholder={formData.vehicle.brand === "Otra" ? "Escribe la línea (ej: XC60, Forester...)" : undefined}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Color *</label>
              <input
                list="common-vehicle-colors"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Ej: Blanco, Gris, Plata..."
                value={formData.vehicle.color}
                onChange={e => {
                  clearErrors();
                  setFormData({ ...formData, vehicle: { ...formData.vehicle, color: e.target.value } });
                }}
              />
              <datalist id="common-vehicle-colors">
                {COMMON_COLORS.map(c => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Combustible *</label>
              <select
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-400"
                value={formData.vehicle.fuel}
                onChange={e => setFormData({ ...formData, vehicle: { ...formData.vehicle, fuel: e.target.value } })}
              >
                {FUELS.map(f => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleBack}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5"
            >
              Atrás
            </button>
            <button
              onClick={handleNext}
              className="flex-[2] rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400"
            >
              Siguiente: Negocio →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Negocio */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">3. Expectativa de Negocio</h3>

          <div className="rounded-xl bg-slate-950 p-4 border border-white/5 space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Precio diario esperado (COP) *</label>
              <input
                type="number"
                step={5000}
                min={20000}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-2.5 text-sm text-emerald-400 font-bold outline-none focus:ring-2 focus:ring-emerald-400"
                value={formData.business.expectedPrice}
                onChange={e => {
                  clearErrors();
                  setFormData({
                    ...formData,
                    business: { ...formData.business, expectedPrice: Number(e.target.value) },
                  });
                }}
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Disponibilidad para alquilar *</label>
              <select
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-400"
                value={formData.business.availability}
                onChange={e =>
                  setFormData({
                    ...formData,
                    business: { ...formData.business, availability: e.target.value },
                  })
                }
              >
                <option value="unlimited">Tiempo Ilimitado (Recomendado)</option>
                <option value="days">Solo algunos días</option>
                <option value="hours">Por horas</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-300 font-medium mb-2 block">
                ¿Cuándo podríamos ver el vehículo para revisión? *
              </label>

              {/* Chips rápidos para evitar que el usuario lo deje vacío */}
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {APPOINTMENT_SUGGESTIONS.map(sug => {
                  const isSelected = formData.business.appointmentDate === sug;
                  return (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        clearErrors();
                        setFormData({
                          ...formData,
                          business: { ...formData.business, appointmentDate: sug },
                        });
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                        isSelected
                          ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                          : "bg-slate-900 border-white/10 text-slate-400 hover:text-white hover:border-white/25"
                      }`}
                    >
                      {sug}
                    </button>
                  );
                })}
              </div>

              <input
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-400"
                placeholder="Selecciona una opción arriba o escribe día y hora (Ej: Lunes 10am)"
                value={formData.business.appointmentDate}
                onChange={e => {
                  clearErrors();
                  setFormData({
                    ...formData,
                    business: { ...formData.business, appointmentDate: e.target.value },
                  });
                }}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleBack}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5"
            >
              Atrás
            </button>
            <button
              onClick={handleNext}
              className="flex-[2] rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400"
            >
              Siguiente: Fotos y Estado →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Estado, Fotos y Finalizar */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">4. Fotos y Estado del Vehículo</h3>

          {/* Subida de Fotos Flexible con Auto-Etiquetado IA */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-emerald-400" />
                Fotos de tu vehículo (Opcional pero recomendado)
              </label>
              {formData.photos.length > 0 && (
                <span className="text-[11px] font-bold text-emerald-400">
                  {formData.photos.length} {formData.photos.length === 1 ? "foto agregada" : "fotos agregadas"}
                </span>
              )}
            </div>

            {/* Guía visual con recomendaciones amigables */}
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 text-xs text-emerald-200 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-emerald-300 text-xs">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Recomendaciones para mejores fotos (nuestra IA las organiza):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-300 mt-1">
                <div className="flex items-center gap-1.5 bg-slate-950/50 rounded-lg p-2 border border-white/5">
                  <span className="text-base">☀️</span>
                  <span>Buena luz natural (de día)</span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-950/50 rounded-lg p-2 border border-white/5">
                  <span className="text-base">🚗</span>
                  <span>Carro completo (ángulo 3/4)</span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-950/50 rounded-lg p-2 border border-white/5">
                  <span className="text-base">💺</span>
                  <span>Tablero o silletería</span>
                </div>
              </div>
            </div>

            {/* Galería de fotos subidas */}
            {formData.photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {formData.photos.map((p, idx) => (
                  <div key={idx} className="relative group rounded-xl border border-white/10 bg-slate-950 overflow-hidden shadow-sm">
                    <img src={p.url} alt={`Foto ${idx + 1}`} className="h-24 w-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between p-2">
                      <span className="text-[10px] text-white font-mono bg-black/70 px-1.5 py-0.5 rounded">
                        #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePhotoByIndex(idx)}
                        className="p-1 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shadow-sm"
                        title="Eliminar foto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Dropzone / Botón de subida múltiple */}
            <label className={`w-full border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              uploadProgress 
                ? "border-emerald-500/50 bg-emerald-500/10 pointer-events-none" 
                : "border-white/15 bg-slate-950 hover:border-emerald-500/40 hover:bg-slate-900/60"
            }`}>
              <UploadCloud className="w-7 h-7 text-emerald-400 mb-1.5" />
              <span className="text-xs font-bold text-white">
                {uploadProgress ? uploadProgress : formData.photos.length > 0 ? "+ Agregar más fotos" : "Subir o Tomar Fotos"}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">
                Selecciona 1 o varias fotos de tu galería o cámara
              </span>
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                disabled={!!uploadProgress}
                onChange={e => {
                  if (e.target.files) handleMultiplePhotosUpload(e.target.files);
                }}
              />
            </label>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Kilometraje aproximado (Opcional)</label>
            <input
              type="number"
              min={0}
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="Ej: 45000"
              value={formData.status.mileage || ""}
              onChange={e =>
                setFormData({
                  ...formData,
                  status: { ...formData.status, mileage: Number(e.target.value) },
                })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-400 mb-1 block">Vencimiento SOAT (Opcional)</label>
              <input
                type="date"
                value={formData.status.soatDate}
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
                onChange={e =>
                  setFormData({
                    ...formData,
                    status: { ...formData.status, soatDate: e.target.value },
                  })
                }
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 mb-1 block">Vencimiento Tecno (Opcional)</label>
              <input
                type="date"
                value={formData.status.technoDate}
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-xs text-white"
                onChange={e =>
                  setFormData({
                    ...formData,
                    status: { ...formData.status, technoDate: e.target.value },
                  })
                }
              />
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-xl bg-slate-950 p-3 border border-white/5 cursor-pointer hover:bg-slate-900 transition-colors">
            <input
              type="checkbox"
              className="accent-emerald-500 h-5 w-5"
              checked={formData.status.hasInsurance}
              onChange={e =>
                setFormData({
                  ...formData,
                  status: { ...formData.status, hasInsurance: e.target.checked },
                })
              }
            />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">Seguro Todo Riesgo</span>
              <span className="text-[10px] text-slate-400">¿El vehículo cuenta con póliza vigente?</span>
            </div>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleBack}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5"
            >
              Atrás
            </button>
            <button
              disabled={loading || !!uploadProgress}
              onClick={handleSubmit}
              className="flex-[2] rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
            >
              {loading ? "Registrando..." : "Registrar Vehículo"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
