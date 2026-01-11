import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import { StatusBadge } from "../components/StatusBadge";
import { WhatsAppBtn, EmailBtn } from "../components/ContactButtons";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

export default function AdminRecruitment() {
  const [tab, setTab] = useState<"drivers" | "vehicles">("drivers");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const endpoint = tab === "drivers" ? "/driver-applications" : "/vehicle-applications";
      const rs = await fetch(`${API}${endpoint}?limit=100`, {
        headers: { Authorization: ensureBasicAuth() },
      });

      if (rs.status === 401) {
        clearBasicAuth();
        window.location.reload();
        return;
      }

      const json = await rs.json();
      setItems(Array.isArray(json) ? json : []);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setSelected(null);
  }, [tab]);

  const changeStatus = async (id: number, newStatus: string) => {
    if (!confirm(`¿Estás seguro de marcar esto como ${newStatus.toUpperCase()}?`)) return;
    
    const endpoint = tab === "drivers" ? "/driver-applications" : "/vehicle-applications";
    try {
      await fetch(`${API}${endpoint}/${id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: ensureBasicAuth() 
        },
        body: JSON.stringify({ status: newStatus })
      });
      
      setSelected(null);
      loadData();
    } catch (error) {
      alert("Error actualizando estado");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Reclutamiento</h1>
            <p className="text-slate-500 text-sm mt-1">Gestiona postulaciones de conductores y vehículos.</p>
          </div>
          <button 
            onClick={loadData} 
            className="self-start md:self-auto px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
          >
            🔄 Refrescar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-white rounded-2xl border border-slate-200 w-fit mb-6 shadow-sm">
          <button
            onClick={() => setTab("drivers")}
            className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all ${
              tab === "drivers" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Conductores
          </button>
          <button
            onClick={() => setTab("vehicles")}
            className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all ${
              tab === "vehicles" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Vehículos
          </button>
        </div>

        {/* Tabla Listado */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400 animate-pulse">Cargando datos...</div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-slate-500">No hay registros para mostrar.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Nombre / Contacto</th>
                    <th className="px-6 py-4">{tab === "drivers" ? "Perfil" : "Vehículo"}</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const name = item.full_name || item.owner_name;
                    const phone = item.phone_mobile || item.owner_phone;
                    const email = item.email || item.owner_email;
                    
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                          {new Date(item.created_at).toLocaleDateString()}
                          <div className="text-xs text-slate-400">
                            {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{name}</div>
                          <div className="flex gap-2 mt-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <WhatsAppBtn value={phone} contextMsg={`Hola ${name}, te escribo de AllAtYou sobre tu proceso.`} />
                            <EmailBtn value={email} contextMsg="Actualización proceso AllAtYou" />
                          </div>
                        </td>

                        <td className="px-6 py-4 text-slate-600">
                          {tab === "drivers" ? (
                            <div className="space-y-1">
                              <div className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded w-fit">{item.document_number}</div>
                              <div className="text-xs">
                                {item.has_valid_license ? `Licencia: ${item.license_number_cat}` : <span className="text-red-500">Sin licencia vigente</span>}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded w-fit">{item.plate}</div>
                              <div className="text-xs">{item.brand} {item.line} ({item.model_year})</div>
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <StatusBadge status={item.status} />
                        </td>

                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => setSelected(item)}
                            className="text-slate-600 hover:text-slate-900 font-bold hover:underline decoration-2 underline-offset-2"
                          >
                            Ver Detalle →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DETALLE */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            
            {/* Header Modal */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{selected.full_name || selected.owner_name}</h2>
                <div className="mt-2 flex gap-2">
                  <StatusBadge status={selected.status} />
                  <span className="text-sm text-slate-500 self-center">
                    Registrado el {new Date(selected.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                ✕
              </button>
            </div>
            
            {/* Body Modal */}
            <div className="p-8 space-y-8">
              
              {/* Sección Contacto */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Teléfono</label>
                  <p className="font-mono font-medium text-slate-700">{selected.phone_mobile || selected.owner_phone}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Email</label>
                  <p className="font-medium text-slate-700 break-words">{selected.email || selected.owner_email}</p>
                </div>
                {/* Botones de acción rápida dentro del modal */}
                <div className="col-span-2 flex gap-3 pt-2">
                   <WhatsAppBtn value={selected.phone_mobile || selected.owner_phone} contextMsg={`Hola ${selected.full_name || selected.owner_name}, revisando tu proceso...`} />
                   <EmailBtn value={selected.email || selected.owner_email} contextMsg="Actualización proceso AllAtYou" />
                </div>
                
                {tab === "vehicles" && (
                  <div className="col-span-2 pt-2 border-t border-slate-200 mt-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ciudad</label>
                    <p className="font-medium text-slate-700">{selected.owner_city}</p>
                  </div>
                )}
              </div>

              {/* Data Específica */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 border-b pb-2">Información del {tab === "drivers" ? "Candidato" : "Vehículo"}</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6 text-sm">
                  {tab === "drivers" ? (
                    <>
                      <div><dt className="text-slate-500">Cédula</dt><dd className="font-medium">{selected.document_number}</dd></div>
                      <div><dt className="text-slate-500">Fecha Nacimiento</dt><dd className="font-medium">{selected.date_of_birth}</dd></div>
                      <div><dt className="text-slate-500">Dirección</dt><dd className="font-medium">{selected.address}</dd></div>
                      <div><dt className="text-slate-500">Licencia</dt><dd className="font-medium">{selected.has_valid_license ? `Sí (${selected.license_number_cat})` : "No"}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-slate-500">Experiencia</dt><dd className="font-medium mt-1 p-2 bg-slate-50 rounded-lg">{selected.similar_job_exp || "No especificada"}</dd></div>
                      <div><dt className="text-slate-500">Compromiso Semanal</dt><dd className="font-medium">{selected.weekly_delivery_commitment ? "✅ Aceptado" : "❌ Rechazado"}</dd></div>
                      <div><dt className="text-slate-500">Test Toxicología</dt><dd className="font-medium">{selected.toxicology_test_consent ? "✅ Aceptado" : "❌ Rechazado"}</dd></div>
                    </>
                  ) : (
                    <>
                      <div><dt className="text-slate-500">Placa</dt><dd className="font-mono font-bold text-lg">{selected.plate}</dd></div>
                      <div><dt className="text-slate-500">Vehículo</dt><dd className="font-medium">{selected.brand} {selected.line}</dd></div>
                      <div><dt className="text-slate-500">Modelo</dt><dd className="font-medium">{selected.model_year}</dd></div>
                      <div><dt className="text-slate-500">Combustible</dt><dd className="font-medium">{selected.fuel_type}</dd></div>
                      <div><dt className="text-slate-500">Color</dt><dd className="font-medium">{selected.color}</dd></div>
                      <div><dt className="text-slate-500">Kilometraje</dt><dd className="font-medium">{selected.mileage ? selected.mileage.toLocaleString() : "N/A"}</dd></div>
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 sm:col-span-2">
                        <dt className="text-emerald-800 text-xs font-bold uppercase">Expectativa de Renta</dt>
                        <dd className="font-bold text-emerald-700 text-lg">${new Intl.NumberFormat('es-CO').format(selected.expected_daily_rent)} / día</dd>
                        <dd className="text-xs text-emerald-600 mt-1">Disponibilidad: {selected.availability_type}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>

              {/* Acciones de Gestión */}
              <div className="pt-6 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Gestionar Estado</h4>
                <div className="flex gap-4">
                  <button 
                    onClick={() => changeStatus(selected.id, "approved")}
                    className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all active:scale-95"
                  >
                    Aprobar / Contactado
                  </button>
                  {selected.status !== "rejected" && (
                    <button 
                      onClick={() => changeStatus(selected.id, "rejected")}
                      className="px-6 py-3 border border-red-200 text-red-600 bg-red-50 rounded-xl font-bold hover:bg-red-100 transition-colors active:scale-95"
                    >
                      Rechazar
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}