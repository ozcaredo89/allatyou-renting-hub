import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import { CheckCircle, XCircle, Clock, MapPin, Phone, Key, Tag } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type Listing = {
  id: number;
  owner_name: string;
  owner_phone: string;
  owner_city: string;
  brand: string;
  model: string;
  year: number;
  price_per_day: number;
  sale_price?: number | null;
  listing_type?: "rent" | "sale" | "both";
  photo_exterior_url: string;
  photo_interior_url?: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  plate: string;
};

export default function AdminMarketplace() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmingAction, setConfirmingAction] = useState<{
    id: number;
    newStatus: string;
    title: string;
    desc: string;
    buttonText: string;
    buttonColor: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/marketplace/admin/all`, { 
        headers: { Authorization: auth } 
      });
      
      if (res.status === 401) {
          clearBasicAuth();
          window.location.reload();
          return;
      }
      
      const data = await res.json();
      setListings(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setPageError("Error cargando solicitudes.");
    } finally {
      setLoading(false);
    }
  };

  const executeStatusUpdate = async () => {
    if (!confirmingAction) return;
    setActionLoading(true);
    setPageError(null);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/marketplace/admin/${confirmingAction.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ status: confirmingAction.newStatus })
      });

      if (!res.ok) throw new Error("Error al actualizar estado en el servidor");
      
      setListings(prev => prev.map(item => 
        item.id === confirmingAction.id ? { ...item, status: confirmingAction.newStatus as Listing["status"] } : item
      ));
      setConfirmingAction(null);
    } catch (err: any) {
      setPageError(err?.message || "Error al actualizar estado");
    } finally {
      setActionLoading(false);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
      switch(status) {
          case 'approved': return <span className="flex items-center gap-1 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3"/> Publicado</span>;
          case 'rejected': return <span className="flex items-center gap-1 text-[10px] font-bold uppercase bg-red-100 text-red-700 px-2 py-1 rounded-full"><XCircle className="w-3 h-3"/> Rechazado</span>;
          default: return <span className="flex items-center gap-1 text-[10px] font-bold uppercase bg-orange-100 text-orange-700 px-2 py-1 rounded-full"><Clock className="w-3 h-3"/> Pendiente Revisión</span>;
      }
  };

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Moderación Marketplace</h1>
            <p className="text-sm text-slate-500">Aprueba o rechaza los vehículos subidos por usuarios (Alquiler y Venta).</p>
          </div>
          <button onClick={loadData} className="text-sm text-emerald-600 font-bold hover:underline">Refrescar</button>
        </div>

        {loading ? (
            <p className="text-center text-slate-400 py-10">Cargando solicitudes...</p>
        ) : listings.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
                <p className="text-slate-500">No hay solicitudes nuevas.</p>
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map(car => {
                  const type = car.listing_type || "rent";
                  return (
                    <div key={car.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col ${car.status === 'pending' ? 'border-orange-200 ring-2 ring-orange-100' : 'border-slate-200 opacity-80'}`}>
                        
                        {/* Header con Estado y Modalidad */}
                        <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-slate-400">{new Date(car.created_at).toLocaleDateString()}</span>
                              {type === "both" && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-800 text-white">
                                  Renta/Venta
                                </span>
                              )}
                              {type === "rent" && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-0.5">
                                  <Key className="w-2.5 h-2.5" /> Renta
                                </span>
                              )}
                              {type === "sale" && (
                                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 flex items-center gap-0.5">
                                  <Tag className="w-2.5 h-2.5" /> Venta
                                </span>
                              )}
                            </div>
                            <StatusBadge status={car.status} />
                        </div>

                        {/* Imagen */}
                        <div className="h-48 bg-slate-200 relative flex overflow-hidden">
                            <a href={car.photo_exterior_url} target="_blank" rel="noreferrer" className="flex-1 h-full block relative group" title="Ver foto exterior">
                                <img src={car.photo_exterior_url} alt="Exterior" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-bold backdrop-blur-xs">
                                    Exterior
                                </span>
                            </a>
                            {car.photo_interior_url && (
                                <a href={car.photo_interior_url} target="_blank" rel="noreferrer" className="w-28 h-full border-l border-white/60 block relative group" title="Ver foto interior">
                                    <img src={car.photo_interior_url} alt="Interior" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                    <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-bold backdrop-blur-xs">
                                        Interior
                                    </span>
                                </a>
                            )}
                            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm font-bold">
                                {car.plate}
                            </div>
                        </div>

                        {/* Info */}
                        <div className="p-4 flex-1">
                            <h3 className="text-lg font-bold text-slate-900 mb-1">{car.brand} {car.model}</h3>
                            <div className="flex flex-wrap gap-2 text-xs text-slate-600 mb-4">
                                <span className="bg-slate-100 px-2 py-1 rounded font-medium">{car.year}</span>
                                {(type === "rent" || type === "both") && car.price_per_day > 0 && (
                                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-1 rounded font-mono font-bold">
                                    ${car.price_per_day.toLocaleString()} /día
                                  </span>
                                )}
                                {(type === "sale" || type === "both") && car.sale_price && car.sale_price > 0 && (
                                  <span className="bg-indigo-50 text-indigo-800 border border-indigo-100 px-2 py-1 rounded font-mono font-bold">
                                    Venta: ${car.sale_price.toLocaleString()}
                                  </span>
                                )}
                            </div>

                            <div className="space-y-2 mb-4 border-t border-slate-100 pt-3">
                                <div className="flex items-center gap-2 text-sm text-slate-700">
                                    <UserIcon /> <span className="font-medium">{car.owner_name}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-700">
                                    <Phone className="w-4 h-4 text-slate-400" /> 
                                    <a href={`https://wa.me/57${car.owner_phone}`} target="_blank" rel="noreferrer" className="hover:text-emerald-600 underline">
                                        {car.owner_phone}
                                    </a>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-700">
                                    <MapPin className="w-4 h-4 text-slate-400" /> {car.owner_city}
                                </div>
                            </div>
                        </div>

                        {/* Acciones */}
                        <div className="p-3 border-t border-slate-100 grid grid-cols-2 gap-3 bg-slate-50">
                            {car.status === 'approved' ? (
                                <button 
                                  onClick={() => setConfirmingAction({
                                    id: car.id,
                                    newStatus: 'rejected',
                                    title: '¿Ocultar vehículo del catálogo?',
                                    desc: `¿Deseas ocultar el ${car.brand} ${car.model} (${car.plate}) del catálogo público de clientes?`,
                                    buttonText: 'Sí, Ocultar',
                                    buttonColor: 'bg-red-600 hover:bg-red-700'
                                  })}
                                  className="col-span-2 py-2 text-red-600 text-xs font-bold hover:bg-red-50 rounded border border-transparent hover:border-red-200 transition-colors"
                                >
                                    Ocultar del Catálogo
                                </button>
                            ) : car.status === 'rejected' ? (
                                <button 
                                  onClick={() => setConfirmingAction({
                                    id: car.id,
                                    newStatus: 'pending',
                                    title: '¿Volver a estado de revisión?',
                                    desc: `¿Deseas regresar el ${car.brand} ${car.model} (${car.plate}) a estado de revisión?`,
                                    buttonText: 'Sí, Volver a Revisión',
                                    buttonColor: 'bg-slate-900 hover:bg-slate-800'
                                  })}
                                  className="col-span-2 py-2 text-slate-500 text-xs font-bold hover:bg-slate-200 rounded"
                                >
                                    Volver a Revisión
                                </button>
                            ) : (
                                <>
                                    <button 
                                      onClick={() => setConfirmingAction({
                                        id: car.id,
                                        newStatus: 'rejected',
                                        title: '¿Rechazar publicación?',
                                        desc: `¿Deseas rechazar la publicación del ${car.brand} ${car.model} (${car.plate}) de ${car.owner_name}? No aparecerá en el catálogo.`,
                                        buttonText: 'Sí, Rechazar',
                                        buttonColor: 'bg-red-600 hover:bg-red-700'
                                      })}
                                      className="py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-700 text-xs font-bold transition-colors"
                                    >
                                        Rechazar
                                    </button>
                                    <button 
                                      onClick={() => setConfirmingAction({
                                        id: car.id,
                                        newStatus: 'approved',
                                        title: '¿Aprobar y publicar en catálogo?',
                                        desc: `¿Confirmas que deseas publicar el ${car.brand} ${car.model} (${car.plate}) de ${car.owner_name} para que sea visible de inmediato en el catálogo público?`,
                                        buttonText: 'Sí, Publicar en Catálogo',
                                        buttonColor: 'bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-200'
                                      })}
                                      className="py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold shadow-sm transition-colors"
                                    >
                                        Aprobar
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                  );
                })}
            </div>
        )}
      </div>

      {/* Modal de confirmación elegante */}
      {confirmingAction && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => !actionLoading && setConfirmingAction(null)}
        >
          <div 
            className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 animate-in fade-in"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">{confirmingAction.title}</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">{confirmingAction.desc}</p>
            
            {pageError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                {pageError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmingAction(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={executeStatusUpdate}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-colors shadow-md ${confirmingAction.buttonColor} disabled:opacity-50`}
              >
                {actionLoading ? "Procesando..." : confirmingAction.buttonText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserIcon() {
    return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-400"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}
