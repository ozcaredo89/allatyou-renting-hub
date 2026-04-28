import React, { useState, useEffect } from "react";
import CompanyLock from "../components/CompanyLock";
import { ensureBasicAuth } from "../lib/auth";
import { ChevronDown, ChevronUp, Share2, CheckCircle2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

type Trip = {
  id: string;
  client_phone: string;
  client_email: string;
  origin_address: string;
  dest_address: string;
  distance_km: number;
  pickup_time: string;
  status: string;
  created_at: string;
  waypoints?: { address: string; lat: number; lng: number }[];
};

type Offer = {
  id: string;
  trip_id: string;
  driver_name: string;
  driver_phone: string;
  offer_amount: number;
  created_at: string;
};

export default function AdminTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [offers, setOffers] = useState<Record<string, Offer[]>>({});
  const [loadingOffers, setLoadingOffers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchTrips();
  }, []);

  const fetchTrips = async () => {
    try {
      const res = await fetch(`${API_URL}/trips`, {
        headers: { Authorization: ensureBasicAuth() },
      });
      if (res.ok) {
        const data = await res.json();
        setTrips(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = async (tripId: string) => {
    if (expandedTripId === tripId) {
      setExpandedTripId(null);
      return;
    }
    setExpandedTripId(tripId);

    if (!offers[tripId]) {
      setLoadingOffers(prev => ({ ...prev, [tripId]: true }));
      try {
        const res = await fetch(`${API_URL}/trips/${tripId}/offers`, {
          headers: { Authorization: ensureBasicAuth() },
        });
        if (res.ok) {
          const data = await res.json();
          setOffers(prev => ({ ...prev, [tripId]: data }));
        }
      } catch (err) {
        console.error("Error cargando ofertas:", err);
      } finally {
        setLoadingOffers(prev => ({ ...prev, [tripId]: false }));
      }
    }
  };

  const handleSendToDrivers = (trip: Trip) => {
    // Generate public link
    const domain = window.location.origin;
    const bidLink = `${domain}/bid/${trip.id}`;
    
    const msg = `*🚗 Nuevo Viaje Disponible!*\n\n📍 *Origen:* ${trip.origin_address}\n🏁 *Destino:* ${trip.dest_address}\n📏 *Distancia:* ${trip.distance_km ?? "N/A"} km\n\n👉 Haz tu oferta para ganar el viaje aquí:\n${bidLink}`;
    
    const encodedMsg = encodeURIComponent(msg);
    // Open generic WhatsApp api to allow selecting group
    window.open(`https://api.whatsapp.com/send?text=${encodedMsg}`, "_blank");
  };

  const handleAcceptOffer = async (trip: Trip, offer: Offer) => {
    if (!confirm(`¿Confirmas aceptar la oferta de ${offer.driver_name} por $${offer.offer_amount.toLocaleString('es-CO')}?`)) return;

    try {
      const res = await fetch(`${API_URL}/trips/${trip.id}/assign/${offer.id}`, {
        method: "POST",
        headers: { Authorization: ensureBasicAuth() },
      });

      if (!res.ok) throw new Error("Error al asignar oferta");

      // Actualizar estado local
      setTrips(trips.map(t => t.id === trip.id ? { ...t, status: "assigned" } : t));
      
      // Formatear teléfono del conductor (asumimos 57 si no lo tiene)
      let phone = offer.driver_phone.replace(/\D/g, "");
      if (phone.length === 10) phone = `57${phone}`;

      const msg = `*🎉 ¡Felicidades ${offer.driver_name}! Tu oferta fue aceptada.*\n\n📍 Origen: ${trip.origin_address}\n🏁 Destino: ${trip.dest_address}\n📞 Teléfono Cliente: ${trip.client_phone}\n\nPor favor contacta al cliente de inmediato.`;
      const encodedMsg = encodeURIComponent(msg);
      window.open(`https://wa.me/${phone}?text=${encodedMsg}`, "_blank");

    } catch (err) {
      alert(err);
    }
  };

  if (loading) return <div className="p-8">Cargando panel de viajes...</div>;

  return (
    <CompanyLock>
      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800">Panel de Subastas y Rutas</h1>
          <p className="text-slate-500">Administra las rutas solicitadas bajo demanda y sus ofertas.</p>
        </header>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs font-bold">
              <tr>
                <th className="p-4">Estado / Fecha</th>
                <th className="p-4">Ruta</th>
                <th className="p-4">Cliente</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {trips.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-500">No hay viajes registrados.</td></tr>
              ) : trips.map(trip => (
                <React.Fragment key={trip.id}>
                  <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 align-top">
                      <div className={`inline-flex px-2 py-1 rounded text-xs font-bold mb-2 ${
                        trip.status === "assigned" ? "bg-emerald-100 text-emerald-700" :
                        trip.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"
                      }`}>
                        {trip.status.toUpperCase()}
                      </div>
                      <div className="text-slate-400 text-[11px]">
                        {new Date(trip.created_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                      </div>
                    </td>
                    <td className="p-4 align-top">
                      <div className="font-medium text-slate-800 mb-1">{trip.origin_address}</div>
                      
                      {trip.waypoints && trip.waypoints.length > 0 && trip.waypoints.map((wp, idx) => (
                        <div key={idx} className="my-1 pl-2 border-l-2 border-slate-300">
                          <div className="text-slate-400 text-[10px] uppercase font-bold">Parada {idx + 1}</div>
                          <div className="text-slate-600 text-xs">{wp.address}</div>
                        </div>
                      ))}

                      <div className="text-slate-500 text-xs my-1">↓ hacia ↓</div>
                      <div className="font-medium text-slate-800 mb-1">{trip.dest_address}</div>
                      <div className="text-emerald-600 font-bold text-xs">{trip.distance_km} km</div>
                    </td>
                    <td className="p-4 align-top">
                      <div className="font-medium text-slate-800">{trip.client_phone}</div>
                      <div className="text-slate-500 text-xs">{trip.client_email || "Sin email"}</div>
                      <div className="mt-2 text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 inline-block rounded">
                        {new Date(trip.pickup_time).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                      </div>
                    </td>
                    <td className="p-4 align-top text-right space-y-2">
                      <button 
                        onClick={() => handleSendToDrivers(trip)}
                        className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors w-full justify-center"
                      >
                        <Share2 className="w-3 h-3" /> WhatsApp
                      </button>
                      <button 
                        onClick={() => toggleExpand(trip.id)}
                        className="inline-flex items-center gap-1 border border-slate-300 hover:bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors w-full justify-center"
                      >
                        {expandedTripId === trip.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Ofertas
                      </button>
                    </td>
                  </tr>

                  {/* EXPANDED ROW: OFFERS */}
                  {expandedTripId === trip.id && (
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td colSpan={4} className="p-0">
                        <div className="p-4 md:pl-8 border-l-4 border-emerald-500 bg-slate-50">
                          <h4 className="text-xs font-bold uppercase text-slate-500 mb-3 tracking-wider">Ofertas de Conductores</h4>
                          
                          {loadingOffers[trip.id] ? (
                            <div className="text-sm text-slate-400">Cargando ofertas...</div>
                          ) : !offers[trip.id] || offers[trip.id].length === 0 ? (
                            <div className="text-sm text-slate-400">Aún no hay ofertas para este viaje.</div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {offers[trip.id].map((offer, idx) => (
                                <div key={offer.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-col">
                                  <div className="flex justify-between items-start mb-2">
                                    <div>
                                      <div className="font-bold text-slate-800 flex items-center gap-2">
                                        {idx === 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[10px]">1</span>}
                                        {offer.driver_name}
                                      </div>
                                      <div className="text-xs text-slate-500">{offer.driver_phone}</div>
                                    </div>
                                    <div className="font-bold text-emerald-600 text-lg">
                                      ${offer.offer_amount.toLocaleString('es-CO')}
                                    </div>
                                  </div>
                                  
                                  {trip.status === "pending" ? (
                                    <button 
                                      onClick={() => handleAcceptOffer(trip, offer)}
                                      className="mt-auto flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 rounded-lg transition-colors"
                                    >
                                      <CheckCircle2 className="w-3 h-3" /> Aceptar Oferta
                                    </button>
                                  ) : (
                                    <div className="mt-auto text-center text-xs font-bold text-slate-400 bg-slate-100 py-2 rounded-lg">
                                      Viaje Asignado
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </CompanyLock>
  );
}
