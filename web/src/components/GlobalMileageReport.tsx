/**
 * GlobalMileageReport.tsx
 * Fleet-wide mileage utilization slide-over panel.
 *
 * - Fetches data from GET /reports/global-mileage (Supabase RPC-backed).
 * - Provides four temporal tabs: Hoy / Esta Semana / Este Mes / Este Año.
 * - Renders 3 KPI summary cards, then a ranked vehicle table with:
 *     • Inline progress bars (relative to fleet maximum for the active tab).
 *     • Dynamic utilization badges (Alto / Normal / Bajo) with tab-aware thresholds.
 *     • Sticky table header so column labels persist while scrolling.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  X,
  Activity,
  Gauge,
  TrendingUp,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { ensureBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface VehicleMileage {
  plate: string;
  brand: string;
  line: string;
  model_year: number;
  status: string;
  has_gps: boolean;
  current_odometer: number;
  daily_km: number;
  weekly_km: number;
  monthly_km: number;
  yearly_km: number;
}

interface ApiResponse {
  vehicles: VehicleMileage[];
  generated_at: string;
}

type TemporalTab = "day" | "week" | "month" | "year";

interface TabConfig {
  key: TemporalTab;
  label: string;
  kmField: keyof Pick<VehicleMileage, "daily_km" | "weekly_km" | "monthly_km" | "yearly_km">;
  /** KM/day equivalent threshold for "Alto" badge */
  highThreshold: number;
  /** KM/day equivalent threshold above which "Normal" starts */
  lowThreshold: number;
  unit: string;
}

const TABS: TabConfig[] = [
  { key: "day",   label: "Hoy",         kmField: "daily_km",   highThreshold: 150,   lowThreshold: 20,   unit: "km hoy" },
  { key: "week",  label: "Esta Semana",  kmField: "weekly_km",  highThreshold: 1050,  lowThreshold: 140,  unit: "km esta sem." },
  { key: "month", label: "Este Mes",     kmField: "monthly_km", highThreshold: 4500,  lowThreshold: 600,  unit: "km este mes" },
  { key: "year",  label: "Este Año",     kmField: "yearly_km",  highThreshold: 54000, lowThreshold: 7200, unit: "km este año" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmt(n: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(n);
}

function getStatusBadge(km: number, tab: TabConfig): {
  label: string;
  bg: string;
  text: string;
  dot: string;
} {
  if (km >= tab.highThreshold)
    return { label: "Alto",   bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-500"    };
  if (km >= tab.lowThreshold)
    return { label: "Normal", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" };
  return   { label: "Bajo",   bg: "bg-slate-100",  text: "text-slate-500",  dot: "bg-slate-400"  };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GlobalMileageReport({ isOpen, onClose }: Props) {
  const [vehicles, setVehicles] = useState<VehicleMileage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TemporalTab>("month");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/reports/global-mileage`, {
        headers: { Authorization: auth },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: ApiResponse = await res.json();
      setVehicles(json.vehicles ?? []);
      setGeneratedAt(json.generated_at ?? null);
    } catch (e: any) {
      setError(e.message ?? "Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Derived data ────────────────────────────────────────────────────────────
  const tab = TABS.find((t) => t.key === activeTab)!;

  const filtered = vehicles.filter((v) => {
    const q = search.toLowerCase();
    return (
      v.plate.toLowerCase().includes(q) ||
      v.brand.toLowerCase().includes(q) ||
      (v.line ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const delta = Number(b[tab.kmField]) - Number(a[tab.kmField]);
    return sortDir === "desc" ? delta : -delta;
  });

  const maxKm = Math.max(1, ...sorted.map((v) => Number(v[tab.kmField])));

  // KPI aggregates
  const totalKm      = vehicles.reduce((s, v) => s + Number(v[tab.kmField]), 0);
  const activeCount  = vehicles.filter((v) => Number(v[tab.kmField]) > 0).length;
  const avgKm        = activeCount > 0 ? totalKm / activeCount : 0;
  const gpsCount     = vehicles.filter((v) => v.has_gps).length;
  const gpsPercent   = vehicles.length > 0 ? Math.round((gpsCount / vehicles.length) * 100) : 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Monitor Global de Kilometraje"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl"
        style={{ animation: "slideIn 0.25s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <style>{`
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex-none bg-slate-900 px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20">
                <Activity className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight">Monitor Global de Recorrido</h2>
                <p className="text-xs text-slate-400">
                  {vehicles.length} vehículos activos
                  {generatedAt && (
                    <> · Act. {new Date(generatedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Temporal tabs */}
          <div className="mt-4 flex gap-1 rounded-xl bg-white/10 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
                  activeTab === t.key
                    ? "bg-white text-slate-900 shadow-md"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
                <span className="text-sm">Cargando datos de la flota…</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center text-sm text-red-500">
                <p className="font-bold">Error al cargar</p>
                <p className="mt-1 text-slate-400">{error}</p>
                <button
                  onClick={fetchData}
                  className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-100"
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ── KPI Cards ─────────────────────────────────────────── */}
              <div className="grid grid-cols-3 gap-3 p-4">
                {/* Total Fleet KM */}
                <div className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                    Total recorrido
                  </div>
                  <p className="text-xl font-black text-slate-900">
                    {fmt(totalKm)}
                    <span className="ml-1 text-xs font-medium text-slate-400">km</span>
                  </p>
                  <p className="text-[10px] text-slate-400">{tab.label.toLowerCase()}</p>
                </div>

                {/* Fleet Average */}
                <div className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Gauge className="h-3.5 w-3.5 text-emerald-500" />
                    Promedio/unidad
                  </div>
                  <p className="text-xl font-black text-slate-900">
                    {fmt(avgKm)}
                    <span className="ml-1 text-xs font-medium text-slate-400">km</span>
                  </p>
                  <p className="text-[10px] text-slate-400">{activeCount} con actividad</p>
                </div>

                {/* GPS Coverage */}
                <div className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Wifi className="h-3.5 w-3.5 text-violet-500" />
                    Cobertura GPS
                  </div>
                  <p className="text-xl font-black text-slate-900">
                    {gpsPercent}
                    <span className="ml-1 text-xs font-medium text-slate-400">%</span>
                  </p>
                  <p className="text-[10px] text-slate-400">{gpsCount} de {vehicles.length} unidades</p>
                </div>
              </div>

              {/* Threshold legend */}
              <div className="mx-4 mb-3 flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Umbrales {tab.label}:</span>
                <span className="flex items-center gap-1 text-[10px] text-red-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />
                  Alto &gt; {fmt(tab.highThreshold)} km
                </span>
                <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                  Normal {fmt(tab.lowThreshold)}–{fmt(tab.highThreshold)} km
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400 inline-block" />
                  Bajo &lt; {fmt(tab.lowThreshold)} km
                </span>
              </div>

              {/* Search */}
              <div className="mx-4 mb-2">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por placa, marca o modelo…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* ── Ranked Table ───────────────────────────────────────── */}
              <div className="mx-4 mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  {/* Sticky table header */}
                  <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e2e8f0]">
                    <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 w-6">#</th>
                      <th className="px-2 py-3">Vehículo</th>
                      <th className="px-2 py-3 text-center">GPS</th>
                      <th className="px-2 py-3 text-right">Odómetro</th>
                      <th className="px-2 py-3">
                        <button
                          onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                          className="flex items-center gap-1 ml-auto hover:text-slate-600 transition-colors"
                        >
                          Uso ({tab.label})
                          {sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sorted.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                          {search ? "Sin resultados para esa búsqueda." : "No hay datos disponibles."}
                        </td>
                      </tr>
                    ) : (
                      sorted.map((v, idx) => {
                        const km = Number(v[tab.kmField]);
                        const barPct = maxKm > 0 ? (km / maxKm) * 100 : 0;
                        const badge = getStatusBadge(km, tab);

                        return (
                          <tr
                            key={v.plate}
                            className="group transition-colors hover:bg-slate-50"
                          >
                            {/* Rank */}
                            <td className="px-4 py-3 text-xs font-bold text-slate-300">
                              {idx + 1}
                            </td>

                            {/* Vehicle info */}
                            <td className="px-2 py-3">
                              <p className="font-black text-slate-800 tracking-tight">{v.plate}</p>
                              <p className="text-[11px] text-slate-400 truncate max-w-[130px]">
                                {v.brand} {v.line} {v.model_year}
                              </p>
                            </td>

                            {/* GPS indicator */}
                            <td className="px-2 py-3 text-center">
                              {v.has_gps ? (
                                <Wifi className="mx-auto h-3.5 w-3.5 text-blue-500" aria-label="GPS Activo" />
                              ) : (
                                <WifiOff className="mx-auto h-3.5 w-3.5 text-slate-300" aria-label="Sin GPS" />
                              )}
                            </td>

                            {/* Current odometer */}
                            <td className="px-2 py-3 text-right">
                              <span className="text-xs font-bold text-slate-600">
                                {v.current_odometer > 0 ? `${fmt(v.current_odometer)} km` : "—"}
                              </span>
                            </td>

                            {/* KM + inline progress bar */}
                            <td className="px-2 py-3 min-w-[140px]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
                                    style={{ width: `${barPct.toFixed(1)}%` }}
                                  />
                                </div>
                                <span className="w-16 text-right text-xs font-bold text-slate-700 shrink-0">
                                  {km > 0 ? `${fmt(km)} km` : "—"}
                                </span>
                              </div>
                            </td>

                            {/* Status badge */}
                            <td className="px-4 py-3 text-center">
                              {km > 0 ? (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.bg} ${badge.text}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                                  {badge.label}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-300">Sin datos</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex-none border-t border-slate-100 bg-slate-50 px-6 py-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-400">
              Datos calculados vía RPC <code className="rounded bg-slate-200 px-1 py-0.5">get_global_mileage_stats</code>
            </p>
            <button
              onClick={fetchData}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Actualizando…" : "↻ Actualizar"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
