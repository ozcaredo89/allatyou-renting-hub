import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

type PublicTrip = {
  id: string;
  origin_address: string;
  dest_address: string;
  distance_km: number;
  pickup_time: string;
  status: string;
  waypoints?: { address: string }[];
};

export default function BidTrip() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [trip, setTrip] = useState<PublicTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fetchTrip = async () => {
      try {
        const res = await fetch(`${API_URL}/trips/${id}/public`);
        if (!res.ok) throw new Error("Viaje no encontrado o ya expiró");
        const data = await res.json();
        setTrip(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchTrip();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const payload = {
      driver_name: formData.get("driver_name"),
      driver_phone: formData.get("driver_phone"),
      offer_amount: parseFloat(formData.get("offer_amount") as string),
    };

    try {
      setIsSubmitting(true);
      const res = await fetch(`${API_URL}/trips/${id}/offers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al enviar la oferta");
      }

      setSuccess(true);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">Cargando detalles del viaje...</div>;
  }

  if (error || !trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4 text-center">
        <h2 className="text-xl font-bold text-red-400 mb-2">Error</h2>
        <p className="text-slate-400 mb-6">{error}</p>
        <button onClick={() => navigate("/")} className="text-emerald-400 hover:underline">Volver al inicio</button>
      </div>
    );
  }

  if (trip.status !== "pending") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-4 text-center">
        <h2 className="text-xl font-bold text-slate-300 mb-2">Subasta Cerrada</h2>
        <p className="text-slate-500 mb-6">Este viaje ya fue asignado a un conductor o fue cancelado.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-200">
      <header className="border-b border-white/10 bg-[#0b1220] px-4 py-4 flex justify-center">
        <Logo className="h-8" />
      </header>

      <main className="max-w-md mx-auto p-4 mt-8">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl mb-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-bold text-blue-400 mb-4 uppercase tracking-wider">
            Nueva Ruta Solicitada
          </div>
          
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Origen</p>
              <p className="font-medium text-white">{trip.origin_address}</p>
            </div>

            {trip.waypoints && trip.waypoints.length > 0 && (
              <div className="pl-4 border-l-2 border-slate-700 my-2 space-y-2">
                {trip.waypoints.map((wp, idx) => (
                  <div key={idx}>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Parada {idx + 1}</p>
                    <p className="text-sm font-medium text-slate-300">{wp.address}</p>
                  </div>
                ))}
              </div>
            )}

            <div>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Destino</p>
              <p className="font-medium text-white">{trip.dest_address}</p>
            </div>
            
            <div className="flex justify-between border-t border-slate-800 pt-4 mt-4">
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Distancia</p>
                <p className="font-medium text-emerald-400">{trip.distance_km} km</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Hora Recogida</p>
                <p className="font-medium text-white">
                  {new Date(trip.pickup_time).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {success ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center">
            <h3 className="text-lg font-bold text-white mb-2">¡Oferta Enviada!</h3>
            <p className="text-sm text-emerald-200">Si tu oferta es aceptada por el cliente, te contactaremos inmediatamente por WhatsApp.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Haz tu Oferta (COP)</h3>
            
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Tu Nombre</label>
              <input type="text" name="driver_name" required className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500" placeholder="Ej: Juan Pérez" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Tu Teléfono (WhatsApp)</label>
              <input type="tel" name="driver_phone" required className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500" placeholder="Ej: 3001234567" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Oferta por el viaje ($ COP)</label>
              <input type="number" name="offer_amount" required min="1000" step="500" className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-emerald-400 font-bold text-xl focus:outline-none focus:border-emerald-500" placeholder="Ej: 45000" />
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl mt-4 transition-colors disabled:opacity-50">
              {isSubmitting ? "Enviando..." : "Enviar Oferta"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
