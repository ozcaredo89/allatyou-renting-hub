import { useState, useEffect } from "react";
import { ensureBasicAuth } from "../lib/auth";

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
  
  { key: "tires_front", label: "Llantas Delanteras", section: "Llantas" },
  { key: "tires_back", label: "Llantas Traseras", section: "Llantas" },
];

export default function NewInspection() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Estado del formulario
  const [form, setForm] = useState({
    vehicle_plate: "",
    driver_id: "",
    type: "general", // <--- CAMBIO 2: Default General
    comments: "",
    inspector_name: "",
    photos: {} as Record<string, string> 
  });

  useEffect(() => {
    const auth = ensureBasicAuth();
    fetch(`${API}/vehicles`, { headers: { Authorization: auth } })
      .then(res => res.json())
      .then(data => setVehicles(Array.isArray(data) ? data : []));
  }, []);

  const handleUpload = async (file: File, key: string) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/uploads`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Error subiendo");
      const data = await res.json();
      
      setForm(prev => ({
        ...prev,
        photos: { ...prev.photos, [key]: data.url }
      }));
    } catch (e) {
      alert("Error al subir imagen");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicle_plate) return alert("Selecciona un vehículo");
    
    setLoading(true);
    try {
       const auth = ensureBasicAuth();
       
       // Intentamos buscar el ID del conductor asociado al vehículo seleccionado para guardarlo
       const selectedVehicle = vehicles.find(v => v.plate === form.vehicle_plate);
       const driverId = selectedVehicle?.driver?.id || null;

       const payload = {
           ...form,
           driver_id: driverId // Guardamos quién lo tenía en ese momento
       };

       const res = await fetch(`${API}/inspections`, {
         method: "POST",
         headers: { "Content-Type": "application/json", Authorization: auth },
         body: JSON.stringify(payload)
       });
       if (!res.ok) throw new Error("Error guardando revisión");
       
       alert("✅ Revisión guardada con éxito!");
       window.location.reload(); 
    } catch (e: any) {
        alert(e.message);
    } finally {
        setLoading(false);
    }
  };

  const groupedFields = PHOTO_FIELDS.reduce((acc, field) => {
    if (!acc[field.section]) acc[field.section] = [];
    acc[field.section].push(field);
    return acc;
  }, {} as Record<string, typeof PHOTO_FIELDS>);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 p-6 text-white">
          <h1 className="text-2xl font-bold">Nueva Inspección</h1>
          <p className="text-slate-400 text-sm">Registro de estado del vehículo (Fotos + Notas)</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          
          {/* DATOS GENERALES */}
          <div className="grid grid-cols-2 gap-4">
             <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Vehículo (Conductor - Placa)</label>
                <select 
                  className="w-full p-3 rounded-lg border border-slate-300 font-bold uppercase"
                  value={form.vehicle_plate}
                  onChange={e => setForm({...form, vehicle_plate: e.target.value})}
                  required
                >
                    <option value="">-- Seleccionar --</option>
                    {/* CAMBIO 1: Mostrar NOMBRE - PLACA */}
                    {vehicles.map(v => (
                        <option key={v.plate} value={v.plate}>
                            {v.driver?.full_name || "LIBRE"} - {v.plate}
                        </option>
                    ))}
                </select>
             </div>
             
             <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tipo Revisión</label>
                <select 
                  className="w-full p-2 rounded-lg border border-slate-300"
                  value={form.type}
                  onChange={e => setForm({...form, type: e.target.value})}
                >
                    <option value="general">Control General</option>
                    <option value="entrega">Entrega (Salida)</option>
                    <option value="recepcion">Recepción (Entrada)</option>
                </select>
             </div>
             
             <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Inspector</label>
                <input 
                  className="w-full p-2 rounded-lg border border-slate-300"
                  placeholder="Tu nombre"
                  value={form.inspector_name}
                  onChange={e => setForm({...form, inspector_name: e.target.value})}
                />
             </div>
          </div>

          {/* FOTOS */}
          {Object.entries(groupedFields).map(([section, fields]) => (
            <div key={section} className="border-t border-slate-100 pt-4">
               <h3 className="text-emerald-600 font-bold uppercase text-xs mb-4 tracking-wider">{section}</h3>
               <div className="grid grid-cols-2 gap-4">
                  {fields.map(field => (
                    <div key={field.key} className="relative group">
                       <label className="block text-[10px] font-bold text-slate-500 mb-1">{field.label}</label>
                       
                       {form.photos[field.key] ? (
                         <div className="relative h-24 w-full rounded-lg overflow-hidden border border-emerald-200 bg-emerald-50">
                            <img src={form.photos[field.key]} alt={field.label} className="h-full w-full object-cover" />
                            <button 
                                type="button"
                                onClick={() => {
                                    const newPhotos = {...form.photos};
                                    delete newPhotos[field.key];
                                    setForm({...form, photos: newPhotos});
                                }}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600"
                            >
                                ✕
                            </button>
                         </div>
                       ) : (
                         <label className="flex flex-col items-center justify-center h-24 w-full rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-emerald-400 cursor-pointer transition-all">
                             <span className="text-2xl text-slate-400 mb-1">📷</span>
                             <span className="text-[10px] text-slate-500 font-medium">Foto / Archivo</span>
                             
                             {/* CAMBIO 3: Quitamos capture="environment" para que el cel pregunte */}
                             <input 
                               type="file" 
                               accept="image/*" 
                               className="hidden" 
                               onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], field.key)}
                               disabled={uploading}
                             />
                         </label>
                       )}
                    </div>
                  ))}
               </div>
            </div>
          ))}

          {/* OBSERVACIONES */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Observaciones</label>
            <textarea 
                className="w-full p-3 rounded-lg border border-slate-300 h-24 resize-none focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Describe rayones, golpes o novedades..."
                value={form.comments}
                onChange={e => setForm({...form, comments: e.target.value})}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading || uploading}
            className="w-full py-4 rounded-xl bg-emerald-600 text-white font-bold text-lg shadow-lg hover:bg-emerald-500 disabled:opacity-50 transition-all"
          >
            {loading ? "Guardando..." : "Guardar Revisión"}
          </button>

        </form>
      </div>
    </div>
  );
}