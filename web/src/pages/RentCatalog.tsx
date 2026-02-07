import { useEffect, useState } from "react";
import { MessageCircle, Gauge, MapPin } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const WHATSAPP_PHONE = "573113738912"; // <--- ¡CAMBIA ESTO POR TU NÚMERO DE VENTAS!

type Car = {
  id: number;
  brand: string;
  model: string;
  year: number;
  transmission: string;
  price_per_day: number;
  photo_exterior_url: string;
  owner_city: string;
};

export default function RentCatalog() {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/marketplace/catalog`)
      .then((res) => res.json())
      .then((data) => setCars(Array.isArray(data) ? data : []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const formatPrice = (val: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  const getWhatsappLink = (car: Car) => {
    const msg = `Hola, me interesa rentar el ${car.brand} ${car.model} (${car.year}) que vi en la web. ¿Está disponible?`;
    return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Renta el carro perfecto 🔑</h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Sin papeleos eternos. Elige, reserva por WhatsApp y conduce. Vehículos verificados por AllAtYou.
          </p>
        </div>

        {/* Grid de Carros */}
        {loading ? (
          <div className="text-center py-20 text-slate-400">Cargando flota disponible...</div>
        ) : cars.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xl font-bold text-slate-800">No hay vehículos disponibles hoy 😔</h3>
            <p className="text-slate-500 mt-2">Nuestra flota se mueve rápido. Vuelve a intentar mañana.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {cars.map((car) => (
              <div key={car.id} className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden hover:shadow-xl transition-shadow flex flex-col">
                
                {/* Foto */}
                <div className="relative h-56 bg-slate-200 group overflow-hidden">
                  <img 
                    src={car.photo_exterior_url || "https://placehold.co/600x400?text=Sin+Foto"} 
                    alt={`${car.brand} ${car.model}`} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-slate-800 shadow-sm flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-600" /> {car.owner_city}
                  </div>
                </div>

                {/* Info */}
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">{car.brand} {car.model}</h3>
                            <p className="text-sm text-slate-500 font-medium">Año {car.year}</p>
                        </div>
                    </div>

                    {/* Características (Chips) */}
                    <div className="flex flex-wrap gap-2 my-4">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                            <Gauge className="w-3 h-3" /> {car.transmission}
                        </span>
                        {/* Aquí podrías agregar más chips si el backend los trajera */}
                    </div>
                  </div>

                  {/* Precio y CTA */}
                  <div className="border-t border-slate-100 pt-4 mt-2">
                     <div className="flex justify-between items-end mb-4">
                        <span className="text-slate-400 text-xs font-bold uppercase">Precio x Día</span>
                        <span className="text-2xl font-black text-slate-900">{formatPrice(car.price_per_day)}</span>
                     </div>

                     <a 
                        href={getWhatsappLink(car)} 
                        target="_blank" 
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors shadow-emerald-200 shadow-lg"
                     >
                        <MessageCircle className="w-5 h-5" /> Reservar por WhatsApp
                     </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}