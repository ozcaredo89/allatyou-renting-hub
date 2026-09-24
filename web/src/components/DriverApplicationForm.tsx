import { useState } from "react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

interface DriverFormProps {
  referralCode?: string;
}

export function DriverApplicationForm({ referralCode }: DriverFormProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado alineado con las columnas de driver_applications y tu backend
  const [formData, setFormData] = useState({
    personal: { fullName: "", documentNumber: "", dateOfBirth: "", phoneMobile: "", email: "", address: "" },
    workExperience: { hasCommercialExp: false, drivingExpTime: "", similarJobExp: "" },
    license: { hasValidLicense: false, licenseNumberCat: "", familiarWithVehicle: "Sí", familiarWithVehicleOther: "" },
    responsibilities: { willingBasicMaintenance: true, weeklyDeliveryCommitment: true },
    substances: { substanceUseLast6Months: false, substanceDetails: "", toxicologyTestConsent: true },
    confirmations: { acceptsWorkConditions: false, understandsDamageLiability: false, truthDeclarationAccepted: false },
    references: [
      { name: "", phone: "" },
      { name: "", phone: "" }
    ],
    documents: [
      { kind: "id_document_photo", url: "https://allatyou.storage/id_placeholder.jpg" }, 
      { kind: "driver_license_photo", url: "https://allatyou.storage/license_placeholder.jpg" },
      { kind: "digital_signature", url: "https://allatyou.storage/sig_placeholder.jpg" }
    ],
    referral: { referralCodeUsed: referralCode || "" }
  });

  const validateStep = (currentStep: number): boolean => {
    setError(null);
    if (currentStep === 1) {
      if (!formData.personal.fullName.trim() || formData.personal.fullName.trim().length < 5) {
        setError("Por favor ingresa tu nombre completo (mínimo 5 letras).");
        return false;
      }
      if (!formData.personal.documentNumber.trim() || formData.personal.documentNumber.trim().length < 5) {
        setError("Por favor ingresa tu número de documento/cédula (mínimo 5 caracteres).");
        return false;
      }
      if (!formData.personal.dateOfBirth) {
        setError("Por favor selecciona tu fecha de nacimiento.");
        return false;
      }
      const dob = new Date(formData.personal.dateOfBirth + "T00:00:00Z");
      const now = new Date();
      let age = now.getUTCFullYear() - dob.getUTCFullYear();
      const m = now.getUTCMonth() - dob.getUTCMonth();
      if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
      if (isNaN(age) || age < 18) {
        setError("Debes ser mayor de 18 años para postularte como conductor.");
        return false;
      }
      if (!formData.personal.phoneMobile.trim() || formData.personal.phoneMobile.trim().length < 7) {
        setError("Por favor ingresa un número de celular de contacto válido.");
        return false;
      }
      if (!formData.personal.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.personal.email.trim())) {
        setError("Por favor ingresa un correo electrónico válido (ej. usuario@gmail.com).");
        return false;
      }
      if (formData.personal.address.trim().length < 8) {
        setError("La dirección de residencia debe tener mínimo 8 caracteres.");
        return false;
      }
    }

    if (currentStep === 2) {
      if (formData.license.hasValidLicense && !formData.license.licenseNumberCat.trim()) {
        setError("Por favor ingresa la categoría de tu licencia (ej. C1, C2).");
        return false;
      }
      if (!formData.workExperience.drivingExpTime.trim()) {
        setError("Por favor indica tus años de experiencia manejando.");
        return false;
      }
    }

    if (currentStep === 3) {
      const { acceptsWorkConditions, understandsDamageLiability, truthDeclarationAccepted } = formData.confirmations;
      if (!acceptsWorkConditions || !understandsDamageLiability || !truthDeclarationAccepted) {
        setError("Debes aceptar todas las confirmaciones legales para continuar.");
        return false;
      }
    }

    if (currentStep === 4) {
      const ref1Name = formData.references[0]?.name?.trim() || "";
      const ref1Phone = formData.references[0]?.phone?.trim() || "";
      const ref2Name = formData.references[1]?.name?.trim() || "";
      const ref2Phone = formData.references[1]?.phone?.trim() || "";

      if (!ref1Name || ref1Name.length < 2) {
        setError("Por favor ingresa el nombre de la Referencia 1.");
        return false;
      }
      if (!ref1Phone || ref1Phone.length < 7) {
        setError("Por favor ingresa un número de teléfono válido para la Referencia 1.");
        return false;
      }
      if (!ref2Name || ref2Name.length < 2) {
        setError("Por favor ingresa el nombre de la Referencia 2.");
        return false;
      }
      if (!ref2Phone || ref2Phone.length < 7) {
        setError("Por favor ingresa un número de teléfono válido para la Referencia 2.");
        return false;
      }
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) setStep(prev => prev + 1);
  };
  
  const handleBack = () => {
    setError(null);
    setStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    // Validar todos los pasos por seguridad antes de enviar
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API}/driver-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errData = await response.json();
        if (errData.fields && Array.isArray(errData.fields) && errData.fields.length > 0) {
          const fieldLabels: Record<string, string> = {
            "personal.fullName": "Nombre completo",
            "personal.documentNumber": "Cédula / Documento",
            "personal.dateOfBirth": "Fecha de nacimiento (debes tener al menos 18 años)",
            "personal.phoneMobile": "Celular",
            "personal.email": "Correo electrónico",
            "personal.address": "Dirección de residencia",
            "workExperience.drivingExpTime": "Años de experiencia",
            "workExperience.similarJobExp": "Experiencia previa",
            "license.licenseNumberCat": "Categoría de licencia",
            "references": "Referencias (mínimo 2)",
            "references[0].name": "Nombre Referencia 1",
            "references[0].phone": "Teléfono Referencia 1",
            "references[1].name": "Nombre Referencia 2",
            "references[1].phone": "Teléfono Referencia 2",
            "confirmations.acceptsWorkConditions": "Aceptación de condiciones de trabajo",
            "confirmations.understandsDamageLiability": "Responsabilidad civil por daños",
            "confirmations.truthDeclarationAccepted": "Certificación de veracidad de datos",
          };
          const issues = errData.fields
            .map((f: any) => fieldLabels[f.path] || f.path)
            .join(", ");
          throw new Error(`Por favor revisa los siguientes campos: ${issues}`);
        }
        throw new Error(errData.message || "Error en la validación del formulario.");
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado al enviar la postulación.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-3xl border border-emerald-500/30 bg-slate-900/80 p-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl text-emerald-400">✓</div>
        <h3 className="text-xl font-bold text-white">¡Postulación Enviada!</h3>
        <p className="mt-2 text-slate-300 text-sm">Pronto nos pondremos en contacto contigo.</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
      <div className="mb-6 flex justify-between gap-2">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${step >= s ? 'bg-emerald-500' : 'bg-slate-700'}`} />
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-400 border border-red-500/20 leading-relaxed">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white">1. Información Personal</h3>
          
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre Completo *</label>
            <input
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
              placeholder="Ej. Juan Pérez Restrepo"
              value={formData.personal.fullName}
              onChange={e => setFormData({...formData, personal: {...formData.personal, fullName: e.target.value}})}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Cédula / Documento *</label>
              <input
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
                placeholder="Número de cédula"
                value={formData.personal.documentNumber}
                onChange={e => setFormData({...formData, personal: {...formData.personal, documentNumber: e.target.value}})}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Fecha de Nacimiento *</label>
              <input
                type="date"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
                value={formData.personal.dateOfBirth}
                onChange={e => setFormData({...formData, personal: {...formData.personal, dateOfBirth: e.target.value}})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Celular / WhatsApp *</label>
              <input
                type="tel"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
                placeholder="Ej. 3123456789"
                value={formData.personal.phoneMobile}
                onChange={e => setFormData({...formData, personal: {...formData.personal, phoneMobile: e.target.value}})}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Correo Electrónico *</label>
              <input
                type="email"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
                placeholder="ejemplo@correo.com"
                value={formData.personal.email}
                onChange={e => setFormData({...formData, personal: {...formData.personal, email: e.target.value}})}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Dirección de Residencia *</label>
            <input
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
              placeholder="Dirección, Barrio, Ciudad"
              value={formData.personal.address}
              onChange={e => setFormData({...formData, personal: {...formData.personal, address: e.target.value}})}
            />
          </div>

          <button onClick={handleNext} className="w-full mt-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">
            Siguiente
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">2. Experiencia</h3>
          <div className="flex flex-col gap-3 py-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-500"
                checked={formData.license.hasValidLicense}
                onChange={e => setFormData({...formData, license: {...formData.license, hasValidLicense: e.target.checked}})}
              />
              <span className="text-sm text-slate-300">Tengo licencia de conducción vigente</span>
            </label>
            {formData.license.hasValidLicense && (
              <input
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white"
                placeholder="Categoría de licencia (Ej. C1, C2, B1)"
                value={formData.license.licenseNumberCat}
                onChange={e => setFormData({...formData, license: {...formData.license, licenseNumberCat: e.target.value}})}
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Años de experiencia manejando *</label>
            <input
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white"
              placeholder="Ej. 3 años (o sólo el número)"
              value={formData.workExperience.drivingExpTime}
              onChange={e => setFormData({...formData, workExperience: {...formData.workExperience, drivingExpTime: e.target.value}})}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Experiencia previa (opcional)</label>
            <textarea
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white h-24"
              placeholder="Describe en qué plataformas has conducido (Uber, Didi, taxi, renting, etc.)..."
              value={formData.workExperience.similarJobExp}
              onChange={e => setFormData({...formData, workExperience: {...formData.workExperience, similarJobExp: e.target.value}})}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">
              Atrás
            </button>
            <button onClick={handleNext} className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">
              Siguiente
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">3. Compromisos y Aceptaciones</h3>
          <div className="rounded-xl bg-slate-950 p-4 space-y-4 border border-white/5">
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-500"
                checked={formData.responsibilities.weeklyDeliveryCommitment}
                onChange={e => setFormData({...formData, responsibilities: {...formData.responsibilities, weeklyDeliveryCommitment: e.target.checked}})}
              />
              Acepto entrega semanal de liquidación estipulada para el vehículo
            </label>
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-500"
                checked={formData.substances.toxicologyTestConsent}
                onChange={e => setFormData({...formData, substances: {...formData.substances, toxicologyTestConsent: e.target.checked}})}
              />
              Acepto pruebas de toxicología aleatorias por seguridad
            </label>
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-500"
                required
                checked={formData.confirmations.acceptsWorkConditions}
                onChange={e => setFormData({...formData, confirmations: {...formData.confirmations, acceptsWorkConditions: e.target.checked}})}
              />
              Acepto las condiciones de trabajo y reglas de uso del renting *
            </label>
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-500"
                required
                checked={formData.confirmations.understandsDamageLiability}
                onChange={e => setFormData({...formData, confirmations: {...formData.confirmations, understandsDamageLiability: e.target.checked}})}
              />
              Entiendo mi responsabilidad civil sobre daños y buen cuidado del auto *
            </label>
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-500"
                required
                checked={formData.confirmations.truthDeclarationAccepted}
                onChange={e => setFormData({...formData, confirmations: {...formData.confirmations, truthDeclarationAccepted: e.target.checked}})}
              />
              Certifico que toda la información ingresada en esta postulación es verídica *
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">
              Atrás
            </button>
            <button onClick={handleNext} className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">
              Siguiente
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">4. Referencias Personales / Familiares</h3>
          <p className="text-xs text-slate-400">
            Ingresa los datos de contacto de 2 personas que puedan dar referencia tuya.
          </p>
          
          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-2">
            <span className="text-xs font-semibold text-emerald-400">Referencia 1</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="Nombre completo"
                value={formData.references[0]?.name || ""}
                onChange={e => {
                  const val = e.target.value;
                  const r = [...formData.references];
                  // Si el usuario escribe o pega nombre y teléfono en el mismo campo
                  const phoneMatch = val.match(/(\+?\d[\d\s\-]{6,}\d)/);
                  if (phoneMatch && (!r[0]?.phone || r[0].phone === "Consultar")) {
                    r[0] = {
                      name: val.replace(phoneMatch[0], "").trim(),
                      phone: phoneMatch[0].replace(/\s+/g, ""),
                    };
                  } else {
                    r[0] = { ...r[0], name: val };
                  }
                  setFormData({ ...formData, references: r });
                }}
              />
              <input
                type="tel"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="Teléfono / Celular"
                value={formData.references[0]?.phone === "Consultar" ? "" : formData.references[0]?.phone || ""}
                onChange={e => {
                  const r = [...formData.references];
                  r[0] = { ...r[0], phone: e.target.value };
                  setFormData({ ...formData, references: r });
                }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-2">
            <span className="text-xs font-semibold text-emerald-400">Referencia 2</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="Nombre completo"
                value={formData.references[1]?.name || ""}
                onChange={e => {
                  const val = e.target.value;
                  const r = [...formData.references];
                  const phoneMatch = val.match(/(\+?\d[\d\s\-]{6,}\d)/);
                  if (phoneMatch && (!r[1]?.phone || r[1].phone === "Consultar")) {
                    r[1] = {
                      name: val.replace(phoneMatch[0], "").trim(),
                      phone: phoneMatch[0].replace(/\s+/g, ""),
                    };
                  } else {
                    r[1] = { ...r[1], name: val };
                  }
                  setFormData({ ...formData, references: r });
                }}
              />
              <input
                type="tel"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="Teléfono / Celular"
                value={formData.references[1]?.phone === "Consultar" ? "" : formData.references[1]?.phone || ""}
                onChange={e => {
                  const r = [...formData.references];
                  r[1] = { ...r[1], phone: e.target.value };
                  setFormData({ ...formData, references: r });
                }}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">
              Atrás
            </button>
            <button
              disabled={loading}
              onClick={handleSubmit}
              className="flex-[2] rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Finalizar Registro"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}