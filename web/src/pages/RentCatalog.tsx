import { useEffect, useState, useMemo } from "react";
import { MessageCircle, Gauge, MapPin, Tag, Key, PlusCircle, Search, Fuel, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const ALLATYOU_WHATSAPP = "573113738912";

export type Car = {
  id: number;
  brand: string;
  model: string;
  year: number;
  transmission: string;
  fuel_type?: string;
  price_per_day: number;
  sale_price?: number | null;
  listing_type?: "rent" | "sale" | "both";
  photo_exterior_url: string;
  photo_interior_url?: string | null;
  owner_city: string;
  owner_name?: string;
  owner_phone?: string;
};

type FilterMode = "all" | "rent" | "sale";

function normalizeWhatsAppPhone(phone?: string | null): string {
  if (!phone) return ALLATYOU_WHATSAPP;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `57${digits}`;
  if (digits.startsWith("57") && digits.length === 12) return digits;
  return digits.length >= 10 ? digits : ALLATYOU_WHATSAPP;
}

export default function RentCatalog() {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterMode>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch(`${API}/marketplace/catalog`)
      .then((res) => res.json())
      .then((data) => setCars(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Error al cargar catálogo:", err))
      .finally(() => setLoading(false));
  }, []);

  const formatPrice = (val?: number | null) => {
    if (!val || val <= 0) return null;
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);
  };

  /**
   * Enlace directo de WhatsApp con el VENDEDOR / PROPIETARIO del vehículo
   */
  const getWhatsappSellerLink = (car: Car) => {
    const sellerPhone = normalizeWhatsAppPhone(car.owner_phone);
    const sellerName = car.owner_name ? ` ${car.owner_name}` : "";
    const priceText = car.sale_price ? ` por valor de ${formatPrice(car.sale_price)}` : "";
    const msg = `Hola${sellerName}, vi tu ${car.brand} ${car.model} (${car.year}) en venta${priceText} en AllAtYou. Me interesa comprarlo. ¿Sigue disponible y podemos coordinar para verlo?`;
    return `https://wa.me/${sellerPhone}?text=${encodeURIComponent(msg)}`;
  };

  /**
   * Enlace de WhatsApp para RENTA (dirigido al contacto del vehículo o soporte AllAtYou)
   */
  const getWhatsappRentLink = (car: Car) => {
    const contactPhone = normalizeWhatsAppPhone(car.owner_phone || ALLATYOU_WHATSAPP);
    const priceText = car.price_per_day ? ` ($${car.price_per_day.toLocaleString()}/día)` : "";
    const msg = `Hola, me interesa rentar el ${car.brand} ${car.model} (${car.year})${priceText} que vi en el catálogo de AllAtYou. ¿Cuáles son los requisitos y fechas disponibles?`;
    return `https://wa.me/${contactPhone}?text=${encodeURIComponent(msg)}`;
  };

  const filteredCars = useMemo(() => {
    return cars.filter((car) => {
      const type = car.listing_type || "rent";
      if (activeFilter === "rent" && type !== "rent" && type !== "both") return false;
      if (activeFilter === "sale" && type !== "sale" && type !== "both") return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const fullText = `${car.brand} ${car.model} ${car.year} ${car.owner_city} ${car.transmission} ${car.owner_name || ""}`.toLowerCase();
        if (!fullText.includes(query)) return false;
      }

      return true;
    });
  }, [cars, activeFilter, searchQuery]);

  const countRent = cars.filter((c) => (c.listing_type || "rent") === "rent" || c.listing_type === "both").length;
  const countSale = cars.filter((c) => c.listing_type === "sale" || c.listing_type === "both").length;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Encabezado Principal */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50 px-4 py-1.5 text-xs font-bold text-emerald-700 mb-3 shadow-xs">
            🚗 FLOTA DISPONIBLE & VERIFICADA
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-3">
            Carros Listos para <span className="text-emerald-600">Alquiler</span> y <span className="text-indigo-600">Venta</span>
          </h1>
          <p className="text-base md:text-lg text-slate-600 max-w-2xl mx-auto">
            Vehículos inspeccionados con contacto directo por WhatsApp al vendedor o asesor. Elige si deseas rentar o comprar con respaldo.
          </p>

          {/* Botón CTA para propietarios */}
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              to="/rent-your-car"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold shadow-md transition-all hover:-translate-y-0.5"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              ¿Tienes un carro? Publícalo para Alquiler o Venta
            </Link>
          </div>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row gap-4 justify-between items-center">
          {/* Tabs por Modalidad */}
          <div className="flex bg-slate-100 p-1.5 rounded-xl w-full md:w-auto">
            <button
              onClick={() => setActiveFilter("all")}
              className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${
                activeFilter === "all"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Todos ({cars.length})
            </button>
            <button
              onClick={() => setActiveFilter("rent")}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${
                activeFilter === "rent"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-emerald-700"
              }`}
            >
              <Key className="w-3.5 h-3.5" /> En Alquiler ({countRent})
            </button>
            <button
              onClick={() => setActiveFilter("sale")}
              className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all ${
                activeFilter === "sale"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-indigo-700"
              }`}
            >
              <Tag className="w-3.5 h-3.5" /> En Venta ({countSale})
            </button>
          </div>

          {/* Buscador */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar marca, modelo, ciudad..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Listado de Vehículos */}
        {loading ? (
          <div className="text-center py-24 text-slate-400 font-medium">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-300 border-t-emerald-600 mb-3" />
            <p>Cargando vehículos disponibles...</p>
          </div>
        ) : filteredCars.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm max-w-xl mx-auto px-6">
            <div className="text-5xl mb-3">🚗</div>
            <h3 className="text-xl font-bold text-slate-800">No encontramos vehículos en esta sección</h3>
            <p className="text-slate-500 mt-2 text-sm">
              {searchQuery
                ? "Intenta con otra búsqueda o elimina los filtros."
                : "La flota rota rápidamente. ¡Sé el primero en publicar el tuyo o consúltanos por WhatsApp!"}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Limpiar búsqueda
                </button>
              )}
              <Link
                to="/rent-your-car"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
              >
                Publicar un Vehículo
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredCars.map((car) => {
              const type = car.listing_type || "rent";
              const isRent = type === "rent" || type === "both";
              const isSale = type === "sale" || type === "both";

              return (
                <div
                  key={car.id}
                  className="bg-white rounded-2xl shadow-md hover:shadow-xl border border-slate-200/80 overflow-hidden transition-all duration-300 flex flex-col group"
                >
                  {/* Foto de Portada */}
                  <div className="relative h-56 bg-slate-200 overflow-hidden">
                    <img
                      src={car.photo_exterior_url || "https://placehold.co/600x400?text=Sin+Foto"}
                      alt={`${car.brand} ${car.model}`}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />

                    {/* Badge de Modalidad */}
                    <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                      {type === "both" && (
                        <span className="inline-flex items-center gap-1 bg-gradient-to-r from-emerald-600 to-indigo-600 text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-md">
                          🔄 Renta o Venta
                        </span>
                      )}
                      {type === "rent" && (
                        <span className="inline-flex items-center gap-1 bg-emerald-600 text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-md">
                          <Key className="w-3 h-3" /> En Alquiler
                        </span>
                      )}
                      {type === "sale" && (
                        <span className="inline-flex items-center gap-1 bg-indigo-600 text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-md">
                          <Tag className="w-3 h-3" /> En Venta
                        </span>
                      )}
                    </div>

                    {/* Ciudad */}
                    <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-full text-xs font-bold text-slate-800 shadow-sm flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" /> {car.owner_city}
                    </div>
                  </div>

                  {/* Información Técnica */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <h3 className="text-xl font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                            {car.brand} {car.model}
                          </h3>
                          <p className="text-xs text-slate-500 font-medium">Modelo / Año {car.year}</p>
                        </div>
                      </div>

                      {/* Chips de Características */}
                      <div className="flex flex-wrap gap-1.5 my-3">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-[11px] font-bold flex items-center gap-1">
                          <Gauge className="w-3 h-3 text-slate-500" /> {car.transmission}
                        </span>
                        {car.fuel_type && (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md text-[11px] font-bold flex items-center gap-1">
                            <Fuel className="w-3 h-3 text-slate-500" /> {car.fuel_type}
                          </span>
                        )}
                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[11px] font-bold">
                          ✓ Verificado
                        </span>
                      </div>

                      {/* Info del Vendedor si está en Venta */}
                      {isSale && car.owner_name && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded-lg mb-2">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate">Vendedor: <strong className="text-slate-800">{car.owner_name}</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Precios y Llamados a la Acción */}
                    <div className="border-t border-slate-100 pt-4 mt-2 space-y-3">
                      {/* Visualización de Precios */}
                      <div className="space-y-1">
                        {isRent && car.price_per_day > 0 && (
                          <div className="flex justify-between items-baseline">
                            <span className="text-slate-500 text-xs font-bold uppercase flex items-center gap-1">
                              <Key className="w-3 h-3 text-emerald-600" /> Canon diario:
                            </span>
                            <span className="text-xl font-black text-emerald-700">
                              {formatPrice(car.price_per_day)}
                              <span className="text-xs font-normal text-slate-400"> /día</span>
                            </span>
                          </div>
                        )}

                        {isSale && car.sale_price && car.sale_price > 0 && (
                          <div className="flex justify-between items-baseline">
                            <span className="text-slate-500 text-xs font-bold uppercase flex items-center gap-1">
                              <Tag className="w-3 h-3 text-indigo-600" /> Precio Venta:
                            </span>
                            <span className="text-xl font-black text-indigo-700">
                              {formatPrice(car.sale_price)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Botón WhatsApp de Contacto con el VENDEDOR */}
                      <div className="flex flex-col gap-2 pt-1">
                        {type === "both" ? (
                          <div className="space-y-2">
                            <a
                              href={getWhatsappSellerLink(car)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-center gap-2 w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm hover:shadow-md"
                            >
                              <MessageCircle className="w-4 h-4" /> Contactar al Vendedor por WhatsApp
                            </a>
                            <a
                              href={getWhatsappRentLink(car)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
                            >
                              <Key className="w-3.5 h-3.5 text-emerald-600" /> Solicitar para Renta
                            </a>
                          </div>
                        ) : isSale ? (
                          <div>
                            <a
                              href={getWhatsappSellerLink(car)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg text-sm group/btn"
                            >
                              <MessageCircle className="w-5 h-5 text-emerald-100 group-hover/btn:scale-110 transition-transform" />
                              Contactar al Vendedor por WhatsApp
                            </a>
                            <p className="text-[11px] text-center text-slate-400 mt-1">
                              Chat directo y seguro por WhatsApp con el dueño
                            </p>
                          </div>
                        ) : (
                          <div>
                            <a
                              href={getWhatsappRentLink(car)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg text-sm"
                            >
                              <MessageCircle className="w-4 h-4" /> Reservar Renta por WhatsApp
                            </a>
                            <p className="text-[11px] text-center text-slate-400 mt-1">
                              Consulta disponibilidad y agenda entrega inmediata
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
