import { useEffect, useState, useCallback } from "react";
import {
  GoogleMap,
  useJsApiLoader,
  Marker,
  InfoWindow,
} from "@react-google-maps/api";
import { ensureBasicAuth } from "../lib/auth";
import { MapPin, RefreshCw, Car, Clock, AlertCircle, Layers } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// ─── Types ────────────────────────────────────────────────────────────────────

interface FleetPin {
  plate: string;
  owner_name: string;
  status: "active" | "maintenance";
  brand: string | null;
  line: string | null;
  latitude: number;
  longitude: number;
  total_parked_hours: number;
  last_seen_at: string | null;
}

// ─── Map style: clean dark-reduced (neutral, not distracting) ─────────────────

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry",           stylers: [{ color: "#f5f5f5" }] },
  { elementType: "labels.icon",        stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill",   stylers: [{ color: "#616161" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f5f5f5" }] },
  { featureType: "road",               elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial",      elementType: "labels.text.fill", stylers: [{ color: "#757575" }] },
  { featureType: "road.highway",       elementType: "geometry", stylers: [{ color: "#dadada" }] },
  { featureType: "water",              elementType: "geometry", stylers: [{ color: "#c9e4f0" }] },
  { featureType: "poi.park",           elementType: "geometry", stylers: [{ color: "#e5f5e0" }] },
];

const MAP_OPTIONS: google.maps.MapOptions = {
  styles: MAP_STYLES,
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`;
}

function formatLastSeen(ds: string | null): string {
  if (!ds) return "—";
  return new Date(ds).toLocaleDateString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// SVG pin generator — returns a Google Maps Symbol for a colored circle marker
function buildMarkerIcon(status: "active" | "maintenance", selected: boolean): google.maps.Symbol {
  const fillColor =
    status === "maintenance" ? "#f59e0b"  // amber for maintenance
    : selected              ? "#059669"   // emerald-600 when selected
    :                         "#10b981";  // emerald-500 default
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: selected ? 12 : 9,
    fillColor,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: selected ? 3 : 2,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FleetMap() {
  const [pins, setPins]             = useState<FleetPin[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [selected, setSelected]     = useState<FleetPin | null>(null);
  const [mapRef, setMapRef]         = useState<google.maps.Map | null>(null);
  const [mapCenter, setMapCenter]   = useState({ lat: 4.710989, lng: -74.072092 }); // Bogotá default

  // Load the Google Maps JS SDK (cached — won't re-fetch on re-renders)
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    id: "allatyou-fleet-map",
  });

  // ── Data fetching ──────────────────────────────────────────────────────────
  async function fetchPins() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/fleet-map/top-1`, {
        headers: { Authorization: ensureBasicAuth() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: FleetPin[] = await res.json();
      setPins(data);

      // Auto-center map on the centroid of all pins
      if (data.length > 0) {
        const avgLat = data.reduce((s, p) => s + p.latitude,  0) / data.length;
        const avgLng = data.reduce((s, p) => s + p.longitude, 0) / data.length;
        setMapCenter({ lat: avgLat, lng: avgLng });
      }
    } catch (e: any) {
      setError("No se pudo cargar la ubicación de la flota. Verifica tu conexión.");
      console.error("[FleetMap] fetch error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPins(); }, []);

  const onMapLoad = useCallback((map: google.maps.Map) => setMapRef(map), []);

  // Fly to a specific pin when selected from the legend
  function flyTo(pin: FleetPin) {
    setSelected(pin);
    mapRef?.panTo({ lat: pin.latitude, lng: pin.longitude });
    mapRef?.setZoom(16);
  }

  // ── Status helpers ─────────────────────────────────────────────────────────
  const activeCount      = pins.filter(p => p.status === "active").length;
  const maintenanceCount = pins.filter(p => p.status === "maintenance").length;

  // ── Render states ──────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500 gap-3">
        <AlertCircle className="w-6 h-6 text-red-400" />
        <p>No se pudo cargar Google Maps. Verifica la API Key.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden w-full">


      {/* ── Main content: map + sidebar ──────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar: vehicle list */}
        <aside className="hidden lg:flex flex-col w-64 bg-slate-900 border-r border-slate-800 overflow-hidden shrink-0">
          <div className="p-3 border-b border-slate-800">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
              <Layers className="w-3 h-3" /> {pins.length} vehículos en mapa
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-14 rounded-xl bg-slate-800/60 animate-pulse" />
                ))}
              </div>
            ) : pins.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">
                Sin datos de parqueadero.<br />
                <span className="text-xs">Espera el cálculo nocturno.</span>
              </div>
            ) : (
              <ul className="p-2 space-y-1">
                {pins.map((pin) => (
                  <li key={pin.plate}>
                    <button
                      onClick={() => flyTo(pin)}
                      className={`w-full text-left p-3 rounded-xl transition-all group ${
                        selected?.plate === pin.plate
                          ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <Car className="w-3.5 h-3.5 shrink-0 opacity-60" />
                        <span className="text-xs font-black font-mono tracking-wider">
                          {pin.plate}
                        </span>
                        {pin.status === "maintenance" && (
                          <span className="ml-auto text-[9px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full border border-amber-800">
                            Mant.
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] truncate opacity-70">
                        {pin.owner_name !== "SIN CONDUCTOR ASIGNADO"
                          ? pin.owner_name
                          : "Sin conductor"}
                      </p>
                      <div className="flex items-center gap-1 mt-1 opacity-60">
                        <Clock className="w-3 h-3" />
                        <span className="text-[10px]">{formatHours(pin.total_parked_hours)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Map area */}
        <div className="flex-1 relative">
          {!isLoaded || loading ? (
            // Loading skeleton with pulsing overlay
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 gap-4">
              <div className="w-10 h-10 border-4 border-slate-600 border-t-emerald-500 rounded-full animate-spin" />
              <p className="text-slate-400 text-sm font-medium">Cargando mapa de flota...</p>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-800 gap-3 text-center p-8">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-slate-300 font-medium">{error}</p>
              <button onClick={fetchPins} className="text-sm text-emerald-400 hover:text-emerald-300 font-bold underline">
                Reintentar
              </button>
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={mapCenter}
              zoom={12}
              options={MAP_OPTIONS}
              onLoad={onMapLoad}
              onClick={() => setSelected(null)}
            >
              {pins.map((pin) => (
                <Marker
                  key={pin.plate}
                  position={{ lat: pin.latitude, lng: pin.longitude }}
                  icon={buildMarkerIcon(pin.status, selected?.plate === pin.plate)}
                  title={pin.plate}
                  onClick={() => setSelected(pin)}
                />
              ))}

              {/* InfoWindow popup */}
              {selected && (
                <InfoWindow
                  position={{ lat: selected.latitude, lng: selected.longitude }}
                  onCloseClick={() => setSelected(null)}
                  options={{ pixelOffset: new google.maps.Size(0, -12) }}
                >
                  <div className="min-w-[180px] font-sans">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${selected.status === "maintenance" ? "bg-amber-400" : "bg-emerald-500"}`} />
                      <span className="font-black text-slate-900 text-base font-mono tracking-widest">
                        {selected.plate}
                      </span>
                    </div>

                    {/* Vehicle info */}
                    {(selected.brand || selected.line) && (
                      <p className="text-xs text-slate-500 mb-1">
                        {[selected.brand, selected.line].filter(Boolean).join(" ")}
                      </p>
                    )}

                    {/* Driver */}
                    <p className="text-sm text-slate-700 font-medium mb-2">
                      🧢 {selected.owner_name !== "SIN CONDUCTOR ASIGNADO"
                        ? selected.owner_name
                        : <span className="italic text-slate-400">Sin conductor asignado</span>
                      }
                    </p>

                    {/* Stats */}
                    <div className="border-t border-slate-100 pt-2 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">⏱ Tiempo total</span>
                        <span className="font-bold text-slate-700">{formatHours(selected.total_parked_hours)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">📅 Última vez</span>
                        <span className="font-medium text-slate-600">{formatLastSeen(selected.last_seen_at)}</span>
                      </div>
                    </div>

                    {/* Google Maps deep-link */}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 block text-center text-xs font-bold text-emerald-600 hover:text-emerald-700 underline"
                    >
                      Abrir en Google Maps →
                    </a>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          )}

          {/* Floating legend (bottom-left) */}
          {isLoaded && !loading && pins.length > 0 && (
            <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-3 border border-slate-200 flex flex-col gap-1.5 text-xs">
              <p className="font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-0.5">Leyenda</p>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shrink-0" />
                <span className="text-slate-600">Activo</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-400 inline-block shrink-0" />
                <span className="text-slate-600">En mantenimiento</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-600 border-2 border-white inline-block shrink-0" />
                <span className="text-slate-600">Seleccionado</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
