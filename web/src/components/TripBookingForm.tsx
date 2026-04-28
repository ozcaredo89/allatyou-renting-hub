import { useState, useEffect, useRef } from "react";
import { useJsApiLoader, GoogleMap, DirectionsRenderer } from "@react-google-maps/api";
import { MapPin, Navigation, Calendar as CalendarIcon, Phone, Mail, Loader2, CheckCircle2 } from "lucide-react";

const LIBRARIES: ("places" | "geometry")[] = ["places", "geometry"];

// Límites aproximados del Valle del Cauca
const VALLE_DEL_CAUCA_BOUNDS = {
  north: 4.8,
  south: 3.0,
  east: -75.7,
  west: -77.3,
};

const MAP_CENTER = { lat: 3.4516, lng: -76.5320 }; // Cali center
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

type PlaceData = {
  address: string;
  lat: number;
  lng: number;
};

export function TripBookingForm() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: LIBRARIES,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [originData, setOriginData] = useState<PlaceData | null>(null);
  const [destData, setDestData] = useState<PlaceData | null>(null);
  const [waypoints, setWaypoints] = useState<(PlaceData | null)[]>([]);

  // Recurrence state
  const [recurrenceType, setRecurrenceType] = useState("none");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [customDetails, setCustomDetails] = useState("");

  // Map state
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);

  useEffect(() => {
    if (!isLoaded || !originData || !destData || !window.google) {
      setDirectionsResponse(null);
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();
    const validWaypoints = waypoints.filter((wp): wp is PlaceData => wp !== null);
    
    const waypts = validWaypoints.map(wp => ({
      location: new window.google.maps.LatLng(wp.lat, wp.lng),
      stopover: true
    }));

    directionsService.route({
      origin: new window.google.maps.LatLng(originData.lat, originData.lng),
      destination: new window.google.maps.LatLng(destData.lat, destData.lng),
      waypoints: waypts,
      travelMode: window.google.maps.TravelMode.DRIVING
    }, (result, status) => {
      if (status === window.google.maps.DirectionsStatus.OK && result) {
        setDirectionsResponse(result);
      } else {
        setDirectionsResponse(null);
      }
    });
  }, [isLoaded, originData, destData, waypoints]);

  const toggleDay = (day: string) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const validWaypoints = waypoints.filter((wp): wp is PlaceData => wp !== null);

    if (!originData || !destData) {
      setError("Por favor selecciona direcciones de origen y destino válidas.");
      return;
    }

    if (waypoints.some(wp => wp === null)) {
      setError("Por favor completa todas las paradas agregadas o elimínalas.");
      return;
    }

    if (recurrenceType === "weekly" && selectedDays.length === 0) {
      setError("Por favor selecciona al menos un día para la ruta semanal.");
      return;
    }

    if (recurrenceType === "custom" && !customDetails.trim()) {
      setError("Por favor brinda detalles sobre tu viaje recurrente.");
      return;
    }

    // Calcular distancia
    const points = [originData, ...validWaypoints, destData];
    let distanceMeters = 0;
    for (let i = 0; i < points.length - 1; i++) {
      distanceMeters += google.maps.geometry.spherical.computeDistanceBetween(
        new google.maps.LatLng(points[i].lat, points[i].lng),
        new google.maps.LatLng(points[i + 1].lat, points[i + 1].lng)
      );
    }
    const distanceKm = (distanceMeters / 1000).toFixed(2);

    let finalRecurrence = "none";
    if (recurrenceType === "weekly") {
      finalRecurrence = `weekly: ${selectedDays.join(",")}`;
    } else if (recurrenceType === "custom") {
      finalRecurrence = `custom: ${customDetails}`;
    }

    const formData = new FormData(e.currentTarget);
    const payload = {
      client_phone: formData.get("client_phone"),
      client_email: formData.get("client_email"),
      origin_address: originData.address,
      origin_lat: originData.lat,
      origin_lng: originData.lng,
      dest_address: destData.address,
      dest_lat: destData.lat,
      dest_lng: destData.lng,
      distance_km: parseFloat(distanceKm),
      pickup_time: formData.get("pickup_time"),
      recurrence: finalRecurrence,
      waypoints: validWaypoints.map(wp => ({ address: wp.address, lat: wp.lat, lng: wp.lng })),
    };

    try {
      setIsLoading(true);
      const res = await fetch(`${API_URL}/trips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Error al solicitar la ruta");

      setSuccess(true);
      e.currentTarget.reset();
      setOriginData(null);
      setDestData(null);
      setWaypoints([]);
      setSelectedDays([]);
      setCustomDetails("");
      setRecurrenceType("none");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center backdrop-blur-sm animate-in fade-in">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Navigation className="w-8 h-8" />
        </div>
        <h3 className="mb-2 text-2xl font-bold text-white">¡Viaje Solicitado!</h3>
        <p className="text-emerald-200 mb-6">Hemos enviado tu ruta a nuestra red de conductores en el Valle del Cauca. Te contactaremos pronto con las mejores ofertas.</p>
        <button onClick={() => setSuccess(false)} className="rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-500 transition-colors">
          Solicitar otra ruta
        </button>
      </div>
    );
  }

  const minDateTime = new Date().toISOString().slice(0, 16);

  return (
    <div className="rounded-3xl border border-white/10 bg-[#0f172a]/80 shadow-2xl backdrop-blur-md relative overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Formulario (Columna Izquierda) */}
        <div className="p-6 md:p-8 overflow-y-auto max-h-[80vh] custom-scrollbar">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Cotizar Ruta Especial</h2>
              <p className="text-sm text-slate-400">Servicio exclusivo para el Valle del Cauca y alrededores.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <CustomPlaceAutocomplete 
                label="Punto de Origen" 
                placeholder="Ej: Chipichape, Cali"
                iconColor="text-slate-500"
                hasValidSelection={originData !== null}
                isLoaded={isLoaded}
                onPlaceSelected={(place) => setOriginData(place)}
              />

              <CustomPlaceAutocomplete 
                label="Punto de Destino" 
                placeholder="Ej: Aeropuerto Alfonso Bonilla"
                iconColor="text-blue-500"
                hasValidSelection={destData !== null}
                isLoaded={isLoaded}
                onPlaceSelected={(place) => setDestData(place)}
              />
            </div>

            {/* Waypoints Section */}
            {waypoints.length > 0 && (
              <div className="space-y-3 pl-4 border-l-2 border-slate-700/50 pt-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Paradas Intermedias</label>
                {waypoints.map((wp, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="flex-1">
                      <CustomPlaceAutocomplete 
                        label={`Parada ${idx + 1}`} 
                        placeholder="Ej: Terminal de Transportes"
                        iconColor="text-emerald-500"
                        hasValidSelection={waypoints[idx] !== null}
                        isLoaded={isLoaded}
                        onPlaceSelected={(place) => {
                          const newWp = [...waypoints];
                          newWp[idx] = place;
                          setWaypoints(newWp);
                        }}
                      />
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setWaypoints(waypoints.filter((_, i) => i !== idx))}
                      className="mt-6 flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                      title="Eliminar parada"
                    >
                      <span className="font-bold">✕</span>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Contenedor explícito para el botón de Agregar Parada (Bloque completo) */}
            <div className="w-full border-b border-slate-800/50 pb-5">
              <button 
                type="button"
                onClick={() => setWaypoints([...waypoints, null])}
                className="mx-auto text-xs font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-400/10 hover:bg-emerald-400/20 px-4 py-2 rounded-full transition-colors flex items-center justify-center gap-1"
              >
                <span>+</span> Agregar Parada Intermedia
              </button>
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-slate-800 pt-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">WhatsApp de contacto</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    name="client_phone"
                    required
                    placeholder="Ej: 311 000 0000"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/50 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Email (Opcional)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    name="client_email"
                    placeholder="tucorreo@ejemplo.com"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/50 py-3 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Timing & Recurrence */}
            <div className="space-y-5 border-t border-slate-800 pt-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Fecha y Hora de recogida inicial</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <CalendarIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="datetime-local"
                    name="pickup_time"
                    required
                    min={minDateTime}
                    style={{ colorScheme: "dark" }}
                    onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) {} }}
                    className="w-full cursor-pointer rounded-xl border border-slate-700 bg-slate-900/50 py-3 pl-10 pr-4 text-sm text-white focus:border-blue-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Tipo de Viaje</label>
                <select
                  value={recurrenceType}
                  onChange={(e) => setRecurrenceType(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/50 py-3 px-4 text-sm text-white focus:border-blue-500 focus:outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="none">Servicio Único</option>
                  <option value="weekly">Ruta Semanal Fija</option>
                  <option value="custom">Ruta Personalizada / Varios Días</option>
                </select>

                {/* Recurrence Options */}
                {recurrenceType === "weekly" && (
                  <div className="mt-3 bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                    <label className="block text-xs font-medium text-slate-400 mb-3 text-center">Selecciona los días a la semana:</label>
                    <div className="flex justify-center gap-2">
                      {DAYS.map(day => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                            selectedDays.includes(day) 
                              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30" 
                              : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {recurrenceType === "custom" && (
                  <div className="mt-3">
                    <textarea
                      value={customDetails}
                      onChange={(e) => setCustomDetails(e.target.value)}
                      placeholder="Ej: Necesito el servicio todos los días pares del mes a las 6am..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-900/50 py-3 px-4 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none transition-all resize-none h-24"
                    />
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
                {error}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 font-bold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Enviando solicitud..." : "Solicitar Cotización de Ruta"}
              </button>
              <p className="mt-3 text-center text-[10px] text-slate-500">
                * Las rutas que salgan del perímetro urbano pueden tener cargos adicionales.
              </p>
            </div>
          </form>
        </div>

        {/* Mapa (Columna Derecha) */}
        <div className="h-[400px] md:h-auto min-h-[400px] w-full border-t md:border-t-0 md:border-l border-slate-700/50 bg-[#0b1121] relative flex flex-col">
          {!isLoaded ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm font-bold">Cargando mapas...</span>
              </div>
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
            center={MAP_CENTER}
            zoom={12}
            options={{
              disableDefaultUI: true,
              styles: [
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
                { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
                { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
                { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
                { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
                { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
              ]
            }}
          >
            {directionsResponse && (
              <DirectionsRenderer 
                directions={directionsResponse} 
                options={{
                  polylineOptions: {
                    strokeColor: "#3b82f6",
                    strokeWeight: 4,
                    strokeOpacity: 0.8
                  }
                }}
              />
            )}
          </GoogleMap>
          )}

          {!directionsResponse && isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6 text-center">
              <div className="bg-slate-900/80 backdrop-blur-sm rounded-2xl p-4 border border-slate-800">
                <Navigation className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-bold text-slate-400">El mapa se actualizará</p>
                <p className="text-xs text-slate-500">Ingresa origen y destino para ver la ruta estimada</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Custom Autocomplete Component using raw Google Maps Services to avoid the deprecated widget
function CustomPlaceAutocomplete({ 
  label, 
  placeholder, 
  iconColor, 
  hasValidSelection,
  isLoaded,
  onPlaceSelected 
}: { 
  label: string; 
  placeholder: string; 
  iconColor: string;
  hasValidSelection?: boolean;
  isLoaded: boolean;
  onPlaceSelected: (place: PlaceData | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);

  useEffect(() => {
    if (!isLoaded || !window.google) return;
    if (!autocompleteService.current) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService();
    }
    if (!geocoder.current) {
      geocoder.current = new window.google.maps.Geocoder();
    }
  }, [isLoaded]);

  // Handle outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchPredictions = (input: string) => {
    if (!input || !autocompleteService.current) {
      setPredictions([]);
      return;
    }
    
    const bounds = new window.google.maps.LatLngBounds(
      new window.google.maps.LatLng(VALLE_DEL_CAUCA_BOUNDS.south, VALLE_DEL_CAUCA_BOUNDS.west),
      new window.google.maps.LatLng(VALLE_DEL_CAUCA_BOUNDS.north, VALLE_DEL_CAUCA_BOUNDS.east)
    );

    autocompleteService.current.getPlacePredictions({
      input,
      componentRestrictions: { country: "co" },
      bounds: bounds,
      strictBounds: true
    }, (results, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
        setPredictions(results);
        setIsOpen(true);
      } else {
        setPredictions([]);
      }
    });
  };

  const handleSelect = (prediction: google.maps.places.AutocompletePrediction) => {
    setQuery(prediction.description);
    setIsOpen(false);
    
    if (!geocoder.current) return;

    geocoder.current.geocode({ placeId: prediction.place_id }, (results, status) => {
      if (status === window.google.maps.GeocoderStatus.OK && results && results[0]) {
        const location = results[0].geometry.location;
        onPlaceSelected({
          address: results[0].formatted_address,
          lat: location.lat(),
          lng: location.lng(),
        });
      }
    });
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="mb-1 block text-xs font-medium text-slate-400">{label}</label>
      <div className="relative">
        <div className={`absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none ${iconColor}`}>
          <MapPin className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onPlaceSelected(null); // invalidate until a real place is picked
            fetchPredictions(e.target.value);
          }}
          required
          placeholder={placeholder}
          className="w-full rounded-xl border border-slate-700 bg-slate-900/50 py-3 pl-10 pr-10 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
        />
        {hasValidSelection && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-emerald-500 animate-in zoom-in fade-in duration-200">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        )}
      </div>

      {isOpen && predictions.length > 0 && (
        <ul className="absolute z-[100] w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
          {predictions.map((p) => (
            <li
              key={p.place_id}
              onClick={() => handleSelect(p)}
              className="px-4 py-3 hover:bg-blue-600/20 cursor-pointer text-sm text-slate-200 border-b border-slate-700/50 last:border-0 transition-colors"
            >
              <div className="font-bold text-white">{p.structured_formatting.main_text}</div>
              <div className="text-xs text-slate-400">{p.structured_formatting.secondary_text}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
