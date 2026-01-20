import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type DriverSimple = { id: number; full_name: string };

type Vehicle = {
  plate: string;
  brand: string | null;
  line: string | null;
  model_year: number | null;
  current_driver_id: number | null;
  driver?: DriverSimple; // Join que viene del backend
  soat_expires_at: string | null;
  tecno_expires_at: string | null;
  alarm_code: string | null;
  timing_belt_last_date: string | null;
  extinguisher_expiry: string | null;
  battery_install_date: string | null;
  tires_notes: string | null;
};

export default function AdminVehicles() {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<DriverSimple[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  // Carga inicial
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const headers = { Authorization: auth };

      // 1. Cargar Vehículos (Trae el JOIN con drivers)
      const rsV = await fetch(`${API}/vehicles`, { headers });
      if (rsV.status === 401) {
        clearBasicAuth();
        window.location.reload();
        return;
      }
      const jsonV = await rsV.json();

      // 2. Cargar lista de Conductores (Para el select de asignar)
      const rsD = await fetch(`${API}/drivers`, { headers }); 
      const jsonD = await rsD.json();

      setItems(Array.isArray(jsonV) ? jsonV : []);
      setDrivers(Array.isArray(jsonD) ? jsonD : []);
    } catch (e) {
      console.error(e);
      alert("Error cargando datos. Revisa la consola.");
    } finally {
      setLoading(false);
    }
  }

  async function saveChanges(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;

    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/vehicles/${editing.plate}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(editing),
      });

      if (!res.ok) throw new Error("Error guardando cambios");

      await loadData(); // Recargar tabla para ver cambios
      setEditing(null); // Cerrar modal
    } catch (error) {
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  }

  // Helper visual para fechas vencidas
  const dateCellClass = (dateStr: string | null) => {
    if (!dateStr) return "text-gray-300";
    const d = new Date(dateStr);
    const now = new Date();
    // Diferencia en días
    const diffTime = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return "bg-red-100 text-red-700 font-bold"; // Vencido
    if (diffDays < 30) return "bg-amber-100 text-amber-700 font-medium"; // Próximo a vencer
    return "text-gray-700";
  };

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Gestión de Flota
            </h1>
            <p className="text-sm text-slate-500">
              Hoja de vida, mantenimientos y asignación de conductores.
            </p>
          </div>
          <button
            onClick={loadData}
            className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline font-medium"
          >
            Refrescar datos
          </button>
        </div>

        {/* TABLA DE VEHÍCULOS */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Vehículo</th>
                  <th className="px-4 py-3">Placa</th>
                  <th className="px-4 py-3">Conductor Actual</th>
                  <th className="px-4 py-3 text-center">SOAT</th>
                  <th className="px-4 py-3 text-center">Tecno</th>
                  <th className="px-4 py-3">Mantenimientos</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400">
                      Cargando flota...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400">
                      No hay vehículos registrados.
                    </td>
                  </tr>
                ) : (
                  items.map((v) => (
                    <tr key={v.plate} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {v.brand || "Generico"} {v.line || ""} 
                        {v.model_year && <span className="text-slate-400 text-[10px] ml-1">({v.model_year})</span>}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">
                        {v.plate}
                      </td>
                      <td className="px-4 py-3">
                        {v.driver ? (
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">
                              {v.driver.full_name.charAt(0)}
                            </div>
                            <span className="text-slate-700 truncate max-w-[150px]" title={v.driver.full_name}>
                              {v.driver.full_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Sin asignar</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-center font-mono ${dateCellClass(v.soat_expires_at)}`}>
                        {v.soat_expires_at || "—"}
                      </td>
                      <td className={`px-4 py-3 text-center font-mono ${dateCellClass(v.tecno_expires_at)}`}>
                        {v.tecno_expires_at || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-slate-400 w-12">Correa</span>
                          <span className="font-mono">{v.timing_belt_last_date || "—"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-slate-400 w-12">Extintor</span>
                          <span className="font-mono">{v.extinguisher_expiry || "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEditing(v)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors font-medium"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL EDITAR */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-0 shadow-2xl max-h-[90vh] flex flex-col">
            
            {/* Header Modal */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  Editar Vehículo <span className="font-mono text-emerald-600">{editing.plate}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">Actualiza información técnica y operativa.</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>

            {/* Body Scrollable */}
            <div className="p-6 overflow-y-auto">
              <form id="editForm" onSubmit={saveChanges} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* SECCIÓN 1: DATOS BÁSICOS */}
                <div className="md:col-span-2 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-emerald-100 pb-2">
                    Identificación y Asignación
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Marca</label>
                      <input 
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Ej: Kia"
                        value={editing.brand || ""}
                        onChange={e => setEditing({...editing, brand: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Línea</label>
                      <input 
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Ej: Picanto"
                        value={editing.line || ""}
                        onChange={e => setEditing({...editing, line: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Modelo (Año)</label>
                      <input 
                        type="number"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="2024"
                        value={editing.model_year || ""}
                        onChange={e => setEditing({...editing, model_year: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Clave Alarma</label>
                      <input 
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                        placeholder="****"
                        value={editing.alarm_code || ""}
                        onChange={e => setEditing({...editing, alarm_code: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                    <label className="block text-xs font-bold text-emerald-800 mb-2">
                      Conductor Asignado (Responsable)
                    </label>
                    <div className="relative">
                      <select 
                        className="w-full appearance-none rounded-lg border border-emerald-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                        value={editing.current_driver_id || ""}
                        onChange={e => setEditing({...editing, current_driver_id: Number(e.target.value) || null})}
                      >
                        <option value="">-- Vehículo sin asignar --</option>
                        {drivers.map(d => (
                          <option key={d.id} value={d.id}>{d.full_name} — {d.id}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-emerald-600">
                        ▼
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-emerald-600">
                      * Al cambiar esto, el vehículo aparecerá bajo la responsabilidad de este conductor.
                    </p>
                  </div>
                </div>

                {/* SECCIÓN 2: LEGAL */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                    Documentación
                  </h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Vencimiento SOAT</label>
                    <input 
                      type="date" 
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editing.soat_expires_at || ""}
                      onChange={e => setEditing({...editing, soat_expires_at: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Vencimiento Tecno</label>
                    <input 
                      type="date" 
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editing.tecno_expires_at || ""}
                      onChange={e => setEditing({...editing, tecno_expires_at: e.target.value})}
                    />
                  </div>
                </div>

                {/* SECCIÓN 3: MANTENIMIENTO */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">
                    Mantenimiento
                  </h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Cambio Correa (Fecha)</label>
                    <input 
                      type="date" 
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editing.timing_belt_last_date || ""}
                      onChange={e => setEditing({...editing, timing_belt_last_date: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Vencimiento Extintor</label>
                    <input 
                      type="date" 
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editing.extinguisher_expiry || ""}
                      onChange={e => setEditing({...editing, extinguisher_expiry: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Instalación Batería</label>
                    <input 
                      type="date" 
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editing.battery_install_date || ""}
                      onChange={e => setEditing({...editing, battery_install_date: e.target.value})}
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Notas Llantas / Observaciones</label>
                  <textarea 
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm h-20 resize-none"
                    placeholder="Estado de las llantas, rayones, etc..."
                    value={editing.tires_notes || ""}
                    onChange={e => setEditing({...editing, tires_notes: e.target.value})}
                  />
                </div>

              </form>
            </div>

            {/* Footer Modal */}
            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button 
                type="button" 
                onClick={() => setEditing(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white hover:border-slate-300 transition-all"
              >
                Cancelar
              </button>
              <button 
                form="editForm"
                type="submit" 
                className="px-5 py-2.5 rounded-xl bg-slate-900 text-sm font-bold text-white shadow-lg shadow-slate-900/20 hover:bg-black hover:scale-[1.02] transition-all"
              >
                Guardar Cambios
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}