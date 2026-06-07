import { useEffect, useState } from "react";
import { MapPin, Clock, ExternalLink, RefreshCw, Satellite } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopLocation {
  rank_order: 1 | 2 | 3;
  latitude: number;
  longitude: number;
  total_parked_hours: number;
  last_seen_at: string | null;
  updated_at: string;
}

interface Props {
  /** Vehicle license plate, used to call GET /vehicles/:plate/top-locations */
  plate: string;
  /** Optional: basic auth header value */
  authHeader: string;
}

// ─── Medal config (Oro / Plata / Bronce) ─────────────────────────────────────

const MEDAL_CONFIG = {
  1: {
    label: "Oro",
    emoji: "🥇",
    gradient: "from-amber-400 to-yellow-500",
    border: "border-amber-300",
    bg: "bg-amber-50",
    text: "text-amber-900",
    badge: "bg-amber-400 text-white",
    ring: "ring-amber-300",
    glow: "shadow-amber-100",
  },
  2: {
    label: "Plata",
    emoji: "🥈",
    gradient: "from-slate-400 to-slate-500",
    border: "border-slate-300",
    bg: "bg-slate-50",
    text: "text-slate-800",
    badge: "bg-slate-400 text-white",
    ring: "ring-slate-200",
    glow: "shadow-slate-100",
  },
  3: {
    label: "Bronce",
    emoji: "🥉",
    gradient: "from-orange-400 to-amber-600",
    border: "border-orange-200",
    bg: "bg-orange-50",
    text: "text-orange-900",
    badge: "bg-orange-500 text-white",
    ring: "ring-orange-200",
    glow: "shadow-orange-100",
  },
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatLastSeen(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function formatCoord(val: number, decimals = 5): string {
  return val.toFixed(decimals);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TopDwellLocations({ plate, authHeader }: Props) {
  const [locations, setLocations] = useState<TopLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchLocations() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/vehicles/${plate}/top-locations`, {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: TopLocation[] = await res.json();
      setLocations(data);
    } catch (e: any) {
      setError("No se pudo cargar la información de parqueaderos.");
      console.error("[TopDwellLocations] fetch error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (plate) fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plate]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-3 p-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 animate-pulse border border-slate-100"
          />
        ))}
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
          <Satellite className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-sm font-medium text-slate-600">{error}</p>
        <button
          onClick={fetchLocations}
          className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" /> Reintentar
        </button>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (locations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-3 px-4">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
          <MapPin className="w-7 h-7 text-slate-300" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-600">Sin datos de hotspots aún</p>
          <p className="text-xs text-slate-400 mt-1 max-w-[240px]">
            El análisis de parqueaderos se genera automáticamente cada noche a las 3:00 AM a medida que el GPS acumula historial.
          </p>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Header strip */}
      <div className="flex items-center justify-between px-1 mb-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Top 3 Parqueaderos Frecuentes · últimos 30 días
        </p>
        <button
          onClick={fetchLocations}
          title="Actualizar"
          className="text-slate-300 hover:text-emerald-500 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cards */}
      {locations.map((loc) => {
        const cfg = MEDAL_CONFIG[loc.rank_order as 1 | 2 | 3];

        return (
          <div
            key={loc.rank_order}
            className={`
              relative rounded-2xl border ${cfg.border} ${cfg.bg}
              shadow-sm ${cfg.glow} hover:shadow-md transition-all duration-200
              ring-1 ${cfg.ring} overflow-hidden
            `}
          >
            {/* Colored left accent bar */}
            <div
              className={`absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b ${cfg.gradient} rounded-l-2xl`}
            />

            <div className="pl-5 pr-4 py-4">
              {/* Row 1: Medal badge + hours */}
              <div className="flex items-center justify-between mb-2.5">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${cfg.badge} shadow-sm`}
                >
                  {cfg.emoji} {cfg.label}
                </span>
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span className={`text-sm font-black ${cfg.text}`}>
                    {formatHours(loc.total_parked_hours)}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">estacionado</span>
                </div>
              </div>

              {/* Row 2: Coordinates + maps link */}
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-2">
                  <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.text} opacity-70`} />
                  <div>
                    <p className={`text-xs font-bold font-mono ${cfg.text}`}>
                      {formatCoord(loc.latitude)}, {formatCoord(loc.longitude)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Visto por última vez:{" "}
                      <span className="font-medium text-slate-500">
                        {formatLastSeen(loc.last_seen_at)}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Google Maps CTA */}
                <a
                  href={googleMapsUrl(loc.latitude, loc.longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`
                    flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold
                    bg-white border ${cfg.border} ${cfg.text}
                    hover:scale-105 transition-all duration-150 shadow-sm hover:shadow
                  `}
                  title="Abrir en Google Maps"
                >
                  <ExternalLink className="w-3 h-3" />
                  Ver mapa
                </a>
              </div>
            </div>
          </div>
        );
      })}

      {/* Footer: last computed */}
      {locations[0]?.updated_at && (
        <p className="text-[10px] text-slate-300 text-center pt-1">
          Calculado el{" "}
          {new Date(locations[0].updated_at).toLocaleDateString("es-CO", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </p>
      )}
    </div>
  );
}
