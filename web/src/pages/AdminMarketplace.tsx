import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import { CheckCircle, XCircle, Clock, MapPin, Phone, Car } from "lucide-react";

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
  photo_exterior_url: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  plate: string;
};

export default function AdminMarketplace() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      // Usamos el endpoint "admin/all" que creamos en el Paso 1
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
      alert("Error cargando solicitudes.");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: number, newStatus: string) => {
      if(!confirm(`¿Seguro que deseas marcar como ${newStatus}?`)) return;

      try {
          const auth = ensureBasicAuth();
          const res = await fetch(`${API}/marketplace/admin/${id}/status`, {
              method: "PUT",
              headers: { "Content-Type": "application/json", Authorization: auth },
              body: JSON.stringify({ status: newStatus })
          });

          if (!res.ok) throw new Error("Error actualizando");
          
          // Actualizamos la lista localmente para que se sienta instantáneo
          setListings(prev => prev.map(item => 
              item.id === id ? { ...item, status: newStatus as any } : item
          ));

      } catch (error) {
          alert("Error al actualizar estado");
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
            <p className="text-sm text-slate-500">Aprueba o rechaza los vehículos subidos por usuarios.</p>
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
                {listings.map(car => (
                    <div key={car.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col ${car.status === 'pending' ? 'border-orange-200 ring-2 ring-orange-100' : 'border-slate-200 opacity-80'}`}>
                        
                        {/* Header con Estado */}
                        <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <span className="text-xs font-mono text-slate-400">{new Date(car.created_at).toLocaleDateString()}</span>
                            <StatusBadge status={car.status} />
                        </div>

                        {/* Imagen */}
                        <div className="h-48 bg-slate-200 relative">
                            <img src={car.photo_exterior_url} alt="Car" className="w-full h-full object-cover" />
                            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm font-bold">
                                {car.plate}
                            </div>
                        </div>

                        {/* Info */}
                        <div className="p-4 flex-1">
                            <h3 className="text-lg font-bold text-slate-900 mb-1">{car.brand} {car.model}</h3>
                            <div className="flex gap-2 text-xs text-slate-500 mb-4">
                                <span className="bg-slate-100 px-2 py-1 rounded">{car.year}</span>
                                <span className="bg-slate-100 px-2 py-1 rounded font-mono">${car.price_per_day.toLocaleString()} /día</span>
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
                                <button onClick={() => updateStatus(car.id, 'rejected')} className="col-span-2 py-2 text-red-600 text-xs font-bold hover:bg-red-50 rounded border border-transparent hover:border-red-200 transition-colors">
                                    Ocultar del Catálogo
                                </button>
                            ) : car.status === 'rejected' ? (
                                <button onClick={() => updateStatus(car.id, 'pending')} className="col-span-2 py-2 text-slate-500 text-xs font-bold hover:bg-slate-200 rounded">
                                    Volver a Revisión
                                </button>
                            ) : (
                                <>
                                    <button onClick={() => updateStatus(car.id, 'rejected')} className="py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-700 text-xs font-bold transition-colors">
                                        Rechazar
                                    </button>
                                    <button onClick={() => updateStatus(car.id, 'approved')} className="py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold shadow-sm transition-colors">
                                        Aprobar
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
}

function UserIcon() {
    return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-slate-400"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}