// web/src/components/GlobalOilReport.tsx
// Global fleet-wide oil change report — v2 (session-aware + drill-down)
//
// What changed in v2:
//  - Types updated to carry `sessions[]` per month (from the new RPC payload)
//  - Bar chart bars are now clickable → reveals a detail panel below the chart
//  - Detail panel lists every oil change session for the selected month:
//      plate · date · line items (aceite, filtro, etc.) · session total
//  - Count on the KPI cards now reflects real service visits, not raw expense rows

import { useEffect, useState, useRef } from "react";
import { X, Droplets, TrendingUp, BarChart3, RefreshCw, ChevronDown, Car } from "lucide-react";
import { ensureBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionItem {
  item: string;
  amount: number;
}

interface OilSession {
  plate: string;
  date: string;          // "YYYY-MM-DD"
  items: SessionItem[];
  session_total: number;
}

interface MonthData {
  month: string;         // "2025-07"
  month_label: string;   // "Jul"
  year: number;
  count: number;
  sessions: OilSession[];
}

interface OilStats {
  total_changes: number;
  monthly_data: MonthData[];
  generated_at: string;
}

interface GlobalOilReportProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Spanish month map ──────────────────────────────────────────────────────────
const ES_MONTHS: Record<string, string> = {
  Jan: "Ene", Feb: "Feb", Mar: "Mar", Apr: "Abr",
  May: "May", Jun: "Jun", Jul: "Jul", Aug: "Ago",
  Sep: "Sep", Oct: "Oct", Nov: "Nov", Dec: "Dic",
};
function toSpanishMonth(abbr: string) { return ES_MONTHS[abbr] ?? abbr; }

// ── Skeleton ───────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="h-3 w-24 rounded bg-slate-200 mb-3" />
      <div className="h-9 w-16 rounded bg-slate-200" />
    </div>
  );
}

// ── Format currency ────────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

// ── Session detail card ────────────────────────────────────────────────────────
function SessionCard({ session }: { session: OilSession }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Header row: plate + date + toggle */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Plate badge */}
          <div className="flex items-center gap-1.5 bg-slate-900 text-white px-2.5 py-1 rounded-lg">
            <Car className="w-3 h-3 text-slate-400" />
            <span className="font-mono font-bold text-xs tracking-widest">{session.plate}</span>
          </div>
          {/* Date */}
          <span className="text-xs text-slate-500 font-medium">
            {new Date(session.date + "T12:00:00").toLocaleDateString("es-CO", {
              day: "2-digit", month: "short", year: "numeric"
            })}
          </span>
          {/* Item count badge */}
          <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded-full">
            {session.items.length} ítem{session.items.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">{fmt(session.session_total)}</span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Expandable item list */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-1.5">
          {session.items.map((it, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-xs text-slate-700 font-medium">{it.item}</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">{fmt(it.amount)}</span>
            </div>
          ))}
          <div className="pt-2 mt-1 border-t border-slate-200 flex justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total sesión</span>
            <span className="text-xs font-black text-slate-800">{fmt(session.session_total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Month detail panel (slides in below the chart) ────────────────────────────
function MonthDetailPanel({
  month,
  onClose,
}: {
  month: MonthData;
  onClose: () => void;
}) {
  const label = `${toSpanishMonth(month.month_label)} ${month.year}`;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 overflow-hidden animate-in slide-in-from-top-2 duration-200">
      {/* Sub-header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-emerald-600 text-white">
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-emerald-200" />
          <span className="font-bold text-sm">{label}</span>
          <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            {month.count} servicio{month.count !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/20 transition-colors text-emerald-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Session list */}
      <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
        {month.sessions.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Sin servicios registrados este mes.</p>
        ) : (
          month.sessions.map((s, i) => <SessionCard key={`${s.plate}-${s.date}-${i}`} session={s} />)
        )}
      </div>
    </div>
  );
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────
interface BarChartProps {
  data: MonthData[];
  animate: boolean;
  selectedMonth: string | null;
  onBarClick: (month: MonthData) => void;
}

function OilBarChart({ data, animate, selectedMonth, onBarClick }: BarChartProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="relative">
      {/* Grid lines */}
      <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
        {[maxCount, Math.ceil(maxCount / 2), 0].map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 w-4 text-right shrink-0">{v}</span>
            <div className="flex-1 border-t border-dashed border-slate-100" />
          </div>
        ))}
      </div>

      {/* Bars */}
      <div className="flex items-end gap-1.5 h-48 pl-7">
        {data.map((month) => {
          const pct = maxCount > 0 ? (month.count / maxCount) * 100 : 0;
          const isCurrentMonth = month.month === new Date().toISOString().slice(0, 7);
          const isSelected = selectedMonth === month.month;
          const hasData = month.count > 0;

          return (
            <div
              key={month.month}
              className="relative group flex-1 flex flex-col items-center justify-end h-full"
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
                <div className="bg-slate-800 text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-xl">
                  {hasData
                    ? `${month.count} servicio${month.count !== 1 ? "s" : ""}`
                    : "Sin cambios"}
                  {hasData && (
                    <div className="text-slate-400 font-normal mt-0.5">Click para ver detalle</div>
                  )}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                </div>
              </div>

              {/* Bar */}
              <div
                onClick={() => hasData && onBarClick(month)}
                className={`
                  w-full rounded-t-lg transition-all duration-700 ease-out
                  ${hasData ? "cursor-pointer" : "cursor-default"}
                  ${isSelected
                    ? "ring-2 ring-offset-1 ring-emerald-500 brightness-110 scale-x-110"
                    : hasData ? "hover:brightness-110" : ""}
                  ${!hasData
                    ? "bg-slate-100 border border-dashed border-slate-200"
                    : isCurrentMonth
                    ? "bg-gradient-to-t from-amber-500 to-amber-400 shadow-sm shadow-amber-200"
                    : "bg-gradient-to-t from-emerald-600 to-emerald-400 shadow-sm shadow-emerald-200"
                  }
                `}
                style={{
                  height: animate ? `${Math.max(pct, hasData ? 4 : 1)}%` : "0%",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex gap-1.5 pl-7 mt-1.5">
        {data.map((month) => {
          const isCurrentMonth = month.month === new Date().toISOString().slice(0, 7);
          const isSelected = selectedMonth === month.month;
          return (
            <div key={month.month} className="flex-1 text-center">
              <span
                className={`text-[9px] font-bold uppercase tracking-wide transition-colors
                  ${isSelected
                    ? "text-emerald-600"
                    : isCurrentMonth
                    ? "text-amber-600"
                    : "text-slate-400"}`}
              >
                {toSpanishMonth(month.month_label)}
              </span>
              {month.month_label === "Jan" && (
                <div className="text-[8px] text-slate-300 leading-none">{month.year}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pl-7 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-gradient-to-t from-emerald-600 to-emerald-400" />
          <span className="text-[10px] text-slate-500 font-medium">Servicios realizados</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-gradient-to-t from-amber-500 to-amber-400" />
          <span className="text-[10px] text-slate-500 font-medium">Mes actual</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-slate-100 border border-dashed border-slate-300" />
          <span className="text-[10px] text-slate-500 font-medium">Sin registros</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-3 h-3 rounded-sm ring-2 ring-emerald-500 bg-emerald-400" />
          <span className="text-[10px] text-slate-500 font-medium">Seleccionado</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function GlobalOilReport({ isOpen, onClose }: GlobalOilReportProps) {
  const [stats, setStats] = useState<OilStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animate, setAnimate] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<MonthData | null>(null);
  const hasFetchedRef = useRef(false);
  const detailRef = useRef<HTMLDivElement>(null);

  async function fetchStats() {
    setLoading(true);
    setError(null);
    setAnimate(false);
    setSelectedMonth(null);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/reports/global-oil`, {
        headers: { Authorization: auth },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json: OilStats = await res.json();
      setStats(json);
      setTimeout(() => setAnimate(true), 120);
    } catch (err: any) {
      setError(err.message ?? "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchStats();
    }
    if (!isOpen) {
      hasFetchedRef.current = false;
      setSelectedMonth(null);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // First Escape closes the detail panel, second closes the slide-over
        if (selectedMonth) setSelectedMonth(null);
        else onClose();
      }
    }
    if (isOpen) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, selectedMonth]);

  // Scroll to detail panel when a month is selected
  useEffect(() => {
    if (selectedMonth && detailRef.current) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    }
  }, [selectedMonth]);

  if (!isOpen) return null;

  const monthlyAvg =
    stats && stats.monthly_data.length > 0
      ? (stats.total_changes / stats.monthly_data.length).toFixed(1)
      : "0";

  const bestMonth = stats
    ? [...stats.monthly_data].sort((a, b) => b.count - a.count)[0]
    : null;

  function handleBarClick(month: MonthData) {
    setSelectedMonth((prev) => (prev?.month === month.month ? null : month));
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-over — wider than the per-vehicle panel (max-w-xl vs max-w-md) */}
      <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-xl bg-white shadow-2xl animate-in slide-in-from-right duration-300">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-xl">
              <Droplets className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Reporte Global de Aceites</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Toda la flota · Últimos 12 meses · Agrupado por servicio
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { hasFetchedRef.current = false; fetchStats(); }}
              disabled={loading}
              title="Actualizar datos"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 space-y-6">

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-3 gap-3">
            {loading ? (
              <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
            ) : stats ? (
              <>
                {/* Total */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-1.5 mb-3">
                    <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Servicios</p>
                  </div>
                  <p className="text-3xl font-black text-slate-900 leading-none">{stats.total_changes}</p>
                  <p className="text-[10px] text-slate-400 mt-2">últimos 12 meses</p>
                </div>

                {/* Monthly Avg */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-1.5 mb-3">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Promedio/Mes</p>
                  </div>
                  <p className="text-3xl font-black text-slate-900 leading-none">{monthlyAvg}</p>
                  <p className="text-[10px] text-slate-400 mt-2">servicios por mes</p>
                </div>

                {/* Peak month */}
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Droplets className="w-3.5 h-3.5 text-amber-600" />
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Mes Pico</p>
                  </div>
                  <p className="text-2xl font-black text-amber-800 leading-none">
                    {bestMonth && bestMonth.count > 0
                      ? `${toSpanishMonth(bestMonth.month_label)} ${bestMonth.year}`
                      : "—"}
                  </p>
                  <p className="text-[10px] text-amber-600 mt-2">
                    {bestMonth && bestMonth.count > 0
                      ? `${bestMonth.count} servicio${bestMonth.count !== 1 ? "s" : ""}`
                      : "sin datos"}
                  </p>
                </div>
              </>
            ) : null}
          </div>

          {/* Bar Chart card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Servicios por Mes</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Haz clic en una barra para ver el detalle de esa flota
                </p>
              </div>
              {stats && (
                <span className="text-[10px] text-slate-400">
                  {new Date(stats.generated_at).toLocaleString("es-CO", {
                    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            {loading ? (
              <div className="h-48 flex items-end gap-1.5 mt-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-lg bg-slate-100 animate-pulse"
                    style={{ height: `${25 + ((i * 17) % 55)}%` }}
                  />
                ))}
              </div>
            ) : stats && stats.monthly_data.length > 0 ? (
              <OilBarChart
                data={stats.monthly_data}
                animate={animate}
                selectedMonth={selectedMonth?.month ?? null}
                onBarClick={handleBarClick}
              />
            ) : !loading && !error ? (
              <div className="h-48 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl mt-4">
                <Droplets className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">Sin registros de aceite en el período</p>
                <p className="text-xs mt-1">Los datos aparecerán al registrar cambios en Gastos.</p>
              </div>
            ) : null}
          </div>

          {/* Month drill-down panel */}
          {selectedMonth && (
            <div ref={detailRef}>
              <MonthDetailPanel
                month={selectedMonth}
                onClose={() => setSelectedMonth(null)}
              />
            </div>
          )}

          {/* Footer */}
          {stats && (
            <p className="text-center text-[10px] text-slate-400 pb-2">
              Cada servicio = una visita al taller por vehículo y fecha · Datos en tiempo real desde Supabase
            </p>
          )}
        </div>
      </div>
    </>
  );
}
