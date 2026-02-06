import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import { Eye, X, User, FileText, Truck } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

// Traducción de las claves de la BD a texto legible
const PHOTO_LABELS: Record<string, string> = {
  front: "Frente",
  back: "Atrás",
  left: "Lado Izquierdo",
  right: "Lado Derecho",
  engine: "Motor",
  interior_dash: "Tablero",
  interior_front: "Sillas Delanteras",
  interior_back: "Sillas Traseras",
  tires_front_left: "Llanta Del. Izq.",
  tires_front_right: "Llanta Del. Der.",
  tires_back_left: "Llanta Tras. Izq.",
  tires_back_right: "Llanta Tras. Der."
};

type Inspection = {
  id: number;
  vehicle_plate: string;
  driver_id: number;
  driver?: { full_name: string };
  created_at: string;
  type: string;
  photos: Record<string, string>;
  comments: string;
  inspector_name: string;
};

export default function AdminInspections() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Inspection | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/inspections`, { headers: { Authorization: auth } });
      
      if (res.status === 401) {
          clearBasicAuth();
          window.location.reload();
          return;
      }
      
      const data = await res.json();
      setInspections(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("es-CO", { 
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" 
    });
  };

  const TypeBadge = ({ type }: { type: string }) => {
      const styles = {
          entrega: "bg-emerald-100 text-emerald-700",
          recepcion: "bg-blue-100 text-blue-700",
          general: "bg-slate-100 text-slate-600"
      };
      const color = styles[type as keyof typeof styles] || styles.general;
      return <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${color}`}>{type}</span>;
  };

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="mx-auto max-w-6xl">
        
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Historial de Inspecciones</h1>
            <p className="text-sm text-slate-500">Auditoría visual y reporte de estado de la flota.</p>
          </div>
          <button onClick={loadData} className="text-sm text-emerald-600 font-bold hover:underline">
            Refrescar Lista
          </button>
        </div>

        {/* TABLA PRINCIPAL */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                            <th className="px-6 py-4">Fecha</th>
                            <th className="px-6 py-4">Vehículo</th>
                            <th className="px-6 py-4">Conductor</th>
                            <th className="px-6 py-4">Tipo</th>
                            <th className="px-6 py-4">Inspector</th>
                            <th className="px-6 py-4 text-right">Detalle</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-400">Cargando...</td></tr>
                        ) : inspections.length === 0 ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-400">No hay registros aún.</td></tr>
                        ) : (
                            inspections.map(i => (
                                <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 font-mono text-slate-600 whitespace-nowrap">{formatDate(i.created_at)}</td>
                                    <td className="px-6 py-4 font-bold">{i.vehicle_plate}</td>
                                    <td className="px-6 py-4 text-slate-600">{i.driver?.full_name || "N/A"}</td>
                                    <td className="px-6 py-4"><TypeBadge type={i.type} /></td>
                                    <td className="px-6 py-4 text-slate-500 text-xs uppercase">{i.inspector_name || "-"}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => setSelected(i)}
                                            className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-colors"
                                            title="Ver Fotos y Reporte"
                                        >
                                            <Eye className="w-5 h-5" />
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

      {/* MODAL / VISOR DE DETALLE */}
      {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
                  
                  {/* HEADER DEL MODAL */}
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                      <div className="flex items-center gap-4">
                          <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                              <span className="block text-xs text-slate-400 font-bold uppercase">Placa</span>
                              <span className="text-xl font-black text-slate-800">{selected.vehicle_plate}</span>
                          </div>
                          <div>
                              <div className="flex items-center gap-2 mb-1">
                                  <TypeBadge type={selected.type} />
                                  <span className="text-xs text-slate-400 font-mono">{formatDate(selected.created_at)}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600">
                                  <User className="w-4 h-4" />
                                  <span className="font-bold">{selected.driver?.full_name || "Sin conductor"}</span>
                              </div>
                          </div>
                      </div>
                      <button onClick={() => setSelected(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                          <X className="w-6 h-6 text-slate-500" />
                      </button>
                  </div>

                  {/* CONTENIDO SCROLLABLE */}
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
                      
                      {/* REPORTE ESCRITO */}
                      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
                          <div className="flex items-center gap-2 mb-3 text-emerald-700">
                              <FileText className="w-5 h-5" />
                              <h3 className="font-bold uppercase tracking-wider text-sm">Reporte / Observaciones</h3>
                          </div>
                          <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                              {selected.comments || "Sin observaciones registradas."}
                          </p>
                      </div>

                      {/* GALERÍA DE FOTOS */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {Object.entries(selected.photos).map(([key, url]) => (
                              <div key={key} className="group relative bg-white p-2 rounded-xl shadow-sm border border-slate-200 break-inside-avoid">
                                  {/* Título de la foto */}
                                  <div className="mb-2 px-1">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                          {PHOTO_LABELS[key] || key}
                                      </span>
                                  </div>
                                  
                                  {/* Contenedor Imagen */}
                                  <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-100 cursor-zoom-in relative">
                                      <img 
                                          src={url} 
                                          alt={key} 
                                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" 
                                          onClick={() => window.open(url, '_blank')}
                                      />
                                      {/* Overlay Hover */}
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
                                  </div>
                              </div>
                          ))}
                      </div>

                      {Object.keys(selected.photos).length === 0 && (
                          <div className="text-center py-10 text-slate-400">
                              <Truck className="w-12 h-12 mx-auto mb-2 opacity-20" />
                              <p>No se adjuntaron fotografías en esta inspección.</p>
                          </div>
                      )}

                  </div>
              </div>
          </div>
      )}

    </div>
  );
}