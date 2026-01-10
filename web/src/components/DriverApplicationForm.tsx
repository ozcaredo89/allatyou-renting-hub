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
    responsibilities: { willingBasicMaintenance: false, weeklyDeliveryCommitment: false },
    substances: { substanceUseLast6Months: false, substanceDetails: "", toxicologyTestConsent: false },
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

  const handleNext = () => setStep(prev => prev + 1);
  const handleBack = () => setStep(prev => prev - 1);

  const handleSubmit = async () => {
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
        throw new Error(errData.message || "Error en la validación del formulario.");
      }
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
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

      {error && <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-400 border border-red-500/20">{error}</div>}

      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">1. Información Personal</h3>
          <input className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400" placeholder="Nombre completo" onChange={e => setFormData({...formData, personal: {...formData.personal, fullName: e.target.value}})} />
          <div className="grid grid-cols-2 gap-3">
            <input className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white" placeholder="Cédula" onChange={e => setFormData({...formData, personal: {...formData.personal, documentNumber: e.target.value}})} />
            <input type="date" className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white" onChange={e => setFormData({...formData, personal: {...formData.personal, dateOfBirth: e.target.value}})} />
          </div>
          <input className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white" placeholder="Celular" onChange={e => setFormData({...formData, personal: {...formData.personal, phoneMobile: e.target.value}})} />
          <input className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white" placeholder="Correo" onChange={e => setFormData({...formData, personal: {...formData.personal, email: e.target.value}})} />
          <button onClick={handleNext} className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">Siguiente</button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">2. Experiencia</h3>
          <div className="flex items-center gap-3 py-2">
            <input type="checkbox" className="h-4 w-4 accent-emerald-500" onChange={e => setFormData({...formData, license: {...formData.license, hasValidLicense: e.target.checked}})} />
            <span className="text-sm text-slate-300">Tengo licencia vigente</span>
          </div>
          <input className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white" placeholder="Años de experiencia" onChange={e => setFormData({...formData, workExperience: {...formData.workExperience, drivingExpTime: e.target.value}})} />
          <textarea className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white h-24" placeholder="Describe tu experiencia previa..." onChange={e => setFormData({...formData, workExperience: {...formData.workExperience, similarJobExp: e.target.value}})} />
          <div className="flex gap-3 pt-2">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">Atrás</button>
            <button onClick={handleNext} className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">Siguiente</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">3. Compromisos</h3>
          <div className="rounded-xl bg-slate-950 p-4 space-y-4 border border-white/5">
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input type="checkbox" className="mt-1 accent-emerald-500" onChange={e => setFormData({...formData, responsibilities: {...formData.responsibilities, weeklyDeliveryCommitment: e.target.checked}})} />
              Acepto entrega semanal de $330.000 COP
            </label>
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input type="checkbox" className="mt-1 accent-emerald-500" onChange={e => setFormData({...formData, substances: {...formData.substances, toxicologyTestConsent: e.target.checked}})} />
              Acepto pruebas de toxicología aleatorias
            </label>
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input type="checkbox" className="mt-1 accent-emerald-500" onChange={e => setFormData({...formData, confirmations: {...formData.confirmations, truthDeclarationAccepted: true, acceptsWorkConditions: true, understandsDamageLiability: true}})} />
              Certifico que toda la información es verídica
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">Atrás</button>
            <button onClick={handleNext} className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">Siguiente</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">4. Referencias</h3>
          <input className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white" placeholder="Referencia 1: Nombre y Tel" onChange={e => {
              const r = [...formData.references]; r[0] = { name: e.target.value, phone: "Consultar" }; setFormData({...formData, references: r});
          }} />
          <input className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white" placeholder="Referencia 2: Nombre y Tel" onChange={e => {
              const r = [...formData.references]; r[1] = { name: e.target.value, phone: "Consultar" }; setFormData({...formData, references: r});
          }} />
          <div className="flex gap-3 pt-4">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">Atrás</button>
            <button disabled={loading} onClick={handleSubmit} className="flex-[2] rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
              {loading ? "Enviando..." : "Finalizar Registro"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}