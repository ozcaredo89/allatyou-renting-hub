import { useState } from "react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

// Listas estáticas para facilitar el llenado
const CITIES = ["Cali", "Jamundí", "Yumbo", "Palmira", "Buga", "Otra"];
const BRANDS = ["Chevrolet", "Kia", "Renault", "Mazda", "Nissan", "Suzuki", "Toyota", "Ford", "Volkswagen", "Otra"];
const FUELS = ["Gasolina", "Gas/Gasolina", "Diesel", "Eléctrico"];

export function VehicleApplicationForm() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado inicial alineado con el payload del backend
  const [formData, setFormData] = useState({
    owner: { fullName: "", phone: "", email: "", city: "Cali" },
    vehicle: { 
      plate: "", 
      brand: "Chevrolet", 
      isBrandNewSuggestion: false,
      line: "", 
      year: new Date().getFullYear(), 
      color: "", 
      fuel: "Gasolina" 
    },
    business: { 
      appointmentDate: "", 
      availability: "unlimited", 
      expectedPrice: 70000 
    },
    status: { 
      mileage: 0, 
      soatDate: "", 
      technoDate: "", 
      hasInsurance: false 
    },
    photos: [] as { kind: string, url: string }[] // Placeholder para futura implementación de carga de fotos
  });

  // Manejo especial para marcas "Otra"
  const [customBrand, setCustomBrand] = useState("");

  const handleNext = () => setStep(prev => prev + 1);
  const handleBack = () => setStep(prev => prev - 1);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    // Preparamos el payload final (si es marca custom, reemplazamos el valor)
    const payload = { ...formData };
    if (payload.vehicle.brand === "Otra") {
      payload.vehicle.brand = customBrand;
      payload.vehicle.isBrandNewSuggestion = true;
    }

    try {
      const response = await fetch(`${API}/vehicle-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "Error al enviar la solicitud del vehículo.");
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
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl text-emerald-400">🚗</div>
        <h3 className="text-xl font-bold text-white">¡Vehículo Registrado!</h3>
        <p className="mt-2 text-slate-300 text-sm">
          Hemos recibido la información de tu vehículo. <br/>
          Nuestro equipo comercial te contactará para agendar el peritaje.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
      {/* Barra de Progreso */}
      <div className="mb-6 flex justify-between gap-2">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${step >= s ? 'bg-emerald-500' : 'bg-slate-700'}`} />
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-400 border border-red-500/20">{error}</div>}

      {/* STEP 1: Propietario */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">1. Datos del Propietario</h3>
          
          <input 
            className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400 outline-none" 
            placeholder="Nombre completo" 
            value={formData.owner.fullName}
            onChange={e => setFormData({...formData, owner: {...formData.owner, fullName: e.target.value}})} 
          />
          
          <div className="grid grid-cols-2 gap-3">
            <input 
              className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white outline-none" 
              placeholder="Celular / WhatsApp" 
              value={formData.owner.phone}
              onChange={e => setFormData({...formData, owner: {...formData.owner, phone: e.target.value.replace(/\D/g, '')}})} 
            />
            <select 
              className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white outline-none"
              value={formData.owner.city}
              onChange={e => setFormData({...formData, owner: {...formData.owner, city: e.target.value}})}
            >
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <input 
            type="email"
            className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white outline-none" 
            placeholder="Correo electrónico" 
            value={formData.owner.email}
            onChange={e => setFormData({...formData, owner: {...formData.owner, email: e.target.value}})} 
          />
          
          <button onClick={handleNext} className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition-colors">
            Siguiente
          </button>
        </div>
      )}

      {/* STEP 2: Vehículo */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">2. Datos del Vehículo</h3>
          
          <div className="grid grid-cols-2 gap-3">
            <input 
              className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white uppercase outline-none font-mono" 
              placeholder="PLACA (ABC123)" 
              maxLength={6}
              value={formData.vehicle.plate}
              onChange={e => setFormData({...formData, vehicle: {...formData.vehicle, plate: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")}})} 
            />
             <input 
              type="number"
              className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white outline-none" 
              placeholder="Año (Ej: 2022)" 
              value={formData.vehicle.year}
              onChange={e => setFormData({...formData, vehicle: {...formData.vehicle, year: Number(e.target.value)}})} 
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <select 
              className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white outline-none"
              value={formData.vehicle.brand}
              onChange={e => setFormData({...formData, vehicle: {...formData.vehicle, brand: e.target.value}})}
            >
              {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            {formData.vehicle.brand === "Otra" ? (
               <input 
               className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white outline-none" 
               placeholder="¿Cuál marca?" 
               value={customBrand}
               onChange={e => setCustomBrand(e.target.value)} 
             />
            ) : (
              <input 
                className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white outline-none" 
                placeholder="Línea (Ej: Picanto)" 
                value={formData.vehicle.line}
                onChange={e => setFormData({...formData, vehicle: {...formData.vehicle, line: e.target.value}})} 
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
             <input 
                className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white outline-none" 
                placeholder="Color" 
                value={formData.vehicle.color}
                onChange={e => setFormData({...formData, vehicle: {...formData.vehicle, color: e.target.value}})} 
              />
             <select 
              className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white outline-none"
              value={formData.vehicle.fuel}
              onChange={e => setFormData({...formData, vehicle: {...formData.vehicle, fuel: e.target.value}})}
            >
              {FUELS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">Atrás</button>
            <button onClick={handleNext} className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">Siguiente</button>
          </div>
        </div>
      )}

      {/* STEP 3: Negocio */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">3. Expectativa de Negocio</h3>
          
          <div className="rounded-xl bg-slate-950 p-4 border border-white/5 space-y-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Precio diario esperado (COP)</label>
              <input 
                type="number"
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-2 text-sm text-emerald-400 font-bold outline-none" 
                value={formData.business.expectedPrice}
                onChange={e => setFormData({...formData, business: {...formData.business, expectedPrice: Number(e.target.value)}})} 
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Disponibilidad para alquilar</label>
              <select 
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-2 text-sm text-white outline-none"
                value={formData.business.availability}
                onChange={e => setFormData({...formData, business: {...formData.business, availability: e.target.value as any}})}
              >
                <option value="unlimited">Tiempo Ilimitado (Recomendado)</option>
                <option value="days">Solo algunos días</option>
                <option value="hours">Por horas</option>
              </select>
            </div>

            <div>
               <label className="text-xs text-slate-400 mb-1 block">¿Cuándo podríamos ver el vehículo?</label>
               <input 
                  className="w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-2 text-sm text-white outline-none" 
                  placeholder="Ej: Lunes en la mañana" 
                  value={formData.business.appointmentDate}
                  onChange={e => setFormData({...formData, business: {...formData.business, appointmentDate: e.target.value}})} 
                />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">Atrás</button>
            <button onClick={handleNext} className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">Siguiente</button>
          </div>
        </div>
      )}

      {/* STEP 4: Estado y Finalizar */}
      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">4. Estado y Documentos</h3>
          
          <input 
             type="number"
             className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white outline-none" 
             placeholder="Kilometraje aproximado" 
             value={formData.status.mileage || ''}
             onChange={e => setFormData({...formData, status: {...formData.status, mileage: Number(e.target.value)}})} 
          />

          <div className="space-y-2">
            <p className="text-xs text-slate-400">Vencimientos (Opcional si no los recuerdas)</p>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-xs text-white" onChange={e => setFormData({...formData, status: {...formData.status, soatDate: e.target.value}})} />
              <input type="date" className="rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-xs text-white" onChange={e => setFormData({...formData, status: {...formData.status, technoDate: e.target.value}})} />
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-xl bg-slate-950 p-3 border border-white/5 cursor-pointer hover:bg-slate-900 transition-colors">
             <input 
                type="checkbox" 
                className="accent-emerald-500 h-5 w-5" 
                checked={formData.status.hasInsurance}
                onChange={e => setFormData({...formData, status: {...formData.status, hasInsurance: e.target.checked}})} 
             />
             <div className="flex flex-col">
               <span className="text-sm font-semibold text-white">Seguro Todo Riesgo</span>
               <span className="text-[10px] text-slate-400">¿El vehículo cuenta con póliza vigente?</span>
             </div>
          </label>
          
          <div className="rounded-xl bg-blue-500/10 p-3 text-xs text-blue-200 border border-blue-500/20">
             ℹ️ Si tienes fotos, te las pediremos por WhatsApp para agilizar el proceso.
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">Atrás</button>
            <button 
              disabled={loading} 
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