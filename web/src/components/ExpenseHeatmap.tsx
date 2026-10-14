import { useState, useMemo, useEffect, useRef } from "react";
import { Calendar, DollarSign, TrendingUp, Flame, X, ExternalLink, FileText } from "lucide-react";
import { requestWithBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

export type DailyExpense = {
  date: string;
  total: number;
  count: number;
};

type ExpenseItem = {
  id: number;
  date: string;
  item: string;
  category?: string;
  description: string;
  total_amount: number;
  attachment_url: string | null;
  expense_attachments?: { kind: "evidence" | "invoice"; url: string }[];
  expense_vehicles?: { plate: string; share_amount: number }[];
};

interface ExpenseHeatmapProps {
  dailyExpenses: DailyExpense[];
  selectedYear: string;
  onSelectYear: (year: string) => void;
  availableYears?: string[];
  isLoading?: boolean;
}

function formatCOP(val: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(val);
}

function formatDateFriendly(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("es-CO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function ExpenseHeatmap({
  dailyExpenses = [],
  selectedYear,
  onSelectYear,
  availableYears,
  isLoading = false
}: ExpenseHeatmapProps) {
  // Generación dinámica de años disponibles a partir del año en curso
  const effectiveAvailableYears = useMemo(() => {
    if (availableYears && availableYears.length > 0) return availableYears;
    const currentYear = new Date().getFullYear();
    return ["last12", String(currentYear), String(currentYear - 1), String(currentYear - 2), String(currentYear - 3)];
  }, [availableYears]);

  const periodLabel = selectedYear === "last12" ? "Últimos 12 meses" : `Año ${selectedYear}`;
  // Map para búsqueda rápida O(1) de gastos por fecha YYYY-MM-DD
  const expenseMap = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const d of dailyExpenses) {
      if (d.date) {
        const key = d.date.slice(0, 10);
        const existing = map.get(key) || { total: 0, count: 0 };
        map.set(key, {
          total: existing.total + (Number(d.total) || 0),
          count: existing.count + (Number(d.count) || 1)
        });
      }
    }
    return map;
  }, [dailyExpenses]);

  // Cálculo de umbrales para los 4 niveles de color usando percentiles de días con gasto
  const { thresholds, maxDay, totalSpent, daysWithExpenses, activeDayAvg } = useMemo(() => {
    const positiveDays: { date: string; total: number; count: number }[] = [];
    let sum = 0;
    let max = { date: "", total: 0, count: 0 };

    for (const [date, val] of expenseMap.entries()) {
      if (val.total > 0) {
        positiveDays.push({ date, total: val.total, count: val.count });
        sum += val.total;
        if (val.total > max.total) {
          max = { date, total: val.total, count: val.count };
        }
      }
    }

    positiveDays.sort((a, b) => a.total - b.total);
    const n = positiveDays.length;

    let q1 = 50000;
    let q2 = 150000;
    let q3 = 400000;

    if (n >= 4) {
      q1 = positiveDays[Math.floor(n * 0.25)].total;
      q2 = positiveDays[Math.floor(n * 0.50)].total;
      q3 = positiveDays[Math.floor(n * 0.75)].total;
    } else if (max.total > 0) {
      q1 = max.total * 0.25;
      q2 = max.total * 0.50;
      q3 = max.total * 0.75;
    }

    return {
      thresholds: [q1, q2, q3],
      maxDay: max,
      totalSpent: sum,
      daysWithExpenses: n,
      activeDayAvg: n > 0 ? Math.round(sum / n) : 0
    };
  }, [expenseMap]);

  // Generación de la grilla de semanas (52-53 semanas, 7 días cada una, estilo GitHub)
  const { weeks, monthHeaders } = useMemo(() => {
    const today = new Date();
    let startDate: Date;
    let endDate: Date;

    if (selectedYear === "last12") {
      // Hasta el domingo de la semana actual
      endDate = new Date(today);
      const dayOfWeekEnd = (endDate.getDay() + 6) % 7; // 0=Lun ... 6=Dom
      endDate.setDate(endDate.getDate() + (6 - dayOfWeekEnd));

      // 52 semanas completas atrás desde ese lunes
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - (53 * 7 - 1));
    } else {
      const yr = parseInt(selectedYear, 10) || today.getFullYear();
      startDate = new Date(yr, 0, 1);
      // Alinear al lunes previo
      const startDay = (startDate.getDay() + 6) % 7;
      startDate.setDate(startDate.getDate() - startDay);

      endDate = new Date(yr, 11, 31);
      // Alinear al domingo posterior
      const endDay = (endDate.getDay() + 6) % 7;
      endDate.setDate(endDate.getDate() + (6 - endDay));
    }

    const weeksList: {
      weekIndex: number;
      days: {
        dateStr: string;
        dayOfWeek: number; // 0=Lun, 6=Dom
        total: number;
        count: number;
        level: number;
        isFuture: boolean;
        inTargetYear: boolean;
      }[];
    }[] = [];

    const headers: { colIndex: number; label: string }[] = [];
    let currentWeek: typeof weeksList[0]["days"] = [];
    let weekIndex = 0;
    let lastMonthSeen = -1;

    const curr = new Date(startDate);
    const targetYrNum = selectedYear === "last12" ? null : parseInt(selectedYear, 10);

    while (curr <= endDate) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, "0");
      const day = String(curr.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      const dayOfWeek = (curr.getDay() + 6) % 7; // 0=Lun, ..., 6=Dom

      const isFuture = curr > today;
      const inTargetYear = targetYrNum === null || year === targetYrNum;

      const expense = expenseMap.get(dateStr) || { total: 0, count: 0 };
      let level = 0;
      if (expense.total > 0 && inTargetYear && !isFuture) {
        if (expense.total <= thresholds[0]) level = 1;
        else if (expense.total <= thresholds[1]) level = 2;
        else if (expense.total <= thresholds[2]) level = 3;
        else level = 4;
      }

      // Detectar cambio de mes para poner cabecera en el lunes o primer día de la semana
      if (curr.getDate() <= 7 && curr.getMonth() !== lastMonthSeen && inTargetYear) {
        headers.push({
          colIndex: weekIndex,
          label: MONTH_NAMES[curr.getMonth()]
        });
        lastMonthSeen = curr.getMonth();
      }

      currentWeek.push({
        dateStr,
        dayOfWeek,
        total: inTargetYear && !isFuture ? expense.total : 0,
        count: inTargetYear && !isFuture ? expense.count : 0,
        level: inTargetYear && !isFuture ? level : 0,
        isFuture,
        inTargetYear
      });

      if (dayOfWeek === 6) {
        weeksList.push({ weekIndex, days: currentWeek });
        currentWeek = [];
        weekIndex++;
      }

      curr.setDate(curr.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      weeksList.push({ weekIndex, days: currentWeek });
    }

    return { weeks: weeksList, monthHeaders: headers };
  }, [selectedYear, expenseMap, thresholds]);

  // Estado del Tooltip flotante
  const [hoveredDay, setHoveredDay] = useState<{
    x: number;
    y: number;
    dateStr: string;
    total: number;
    count: number;
    level: number;
  } | null>(null);

  // Estado del modal de detalle al hacer clic en un día
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalDayTotal, setModalDayTotal] = useState<number>(0);
  const [modalExpenses, setModalExpenses] = useState<ExpenseItem[]>([]);
  const [loadingModal, setLoadingModal] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll a la derecha para ver los días más recientes en pantallas reducidas
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = containerRef.current.scrollWidth;
    }
  }, [weeks]);

  // Cargar detalles al abrir modal
  const handleOpenDayModal = async (dateStr: string, total: number) => {
    if (total <= 0) return;
    setModalDate(dateStr);
    setModalDayTotal(total);
    setLoadingModal(true);
    try {
      const res = await requestWithBasicAuth(`${API}/expenses?from=${dateStr}&to=${dateStr}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        // El endpoint /expenses responde con { items, total, limit, offset }
        setModalExpenses(data.items ?? (Array.isArray(data) ? data : []));
      }
    } catch (e) {
      console.error("Error al cargar detalles del día:", e);
    } finally {
      setLoadingModal(false);
    }
  };

  // Nivel de color de GitHub adaptado a tema esmeralda / finanzas
  const getColorClass = (level: number, isFuture: boolean, inTargetYear: boolean) => {
    if (isFuture || !inTargetYear) {
      return "bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 opacity-40 cursor-not-allowed";
    }
    switch (level) {
      case 1:
        return "bg-emerald-200 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 hover:ring-2 hover:ring-emerald-400";
      case 2:
        return "bg-emerald-400 dark:bg-emerald-700 border border-emerald-500 dark:border-emerald-600 hover:ring-2 hover:ring-emerald-500";
      case 3:
        return "bg-emerald-600 dark:bg-emerald-500 border border-emerald-700 dark:border-emerald-400 hover:ring-2 hover:ring-emerald-600";
      case 4:
        return "bg-emerald-800 dark:bg-emerald-300 border border-emerald-900 dark:border-emerald-200 hover:ring-2 hover:ring-emerald-700";
      case 0:
      default:
        return "bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 hover:ring-1 hover:ring-slate-400";
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 dark:border-slate-800 relative overflow-hidden transition-all">
      {/* Luz ambiental sutil */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-100/40 dark:bg-emerald-900/10 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2" />

      {/* ENCABEZADO Y SELECTOR DE PERÍODO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                Matriz de Gastos Diarios
                <span className="text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-200/50">
                  Estilo GitHub
                </span>
                {isLoading && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full animate-pulse border border-emerald-200/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Actualizando...
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Cuadros más oscuros indican mayor concentración de gasto en ese día ({periodLabel}). Haz clic en un día para ver sus recibos.
              </p>
            </div>
          </div>
        </div>

        {/* SELECTOR DE AÑO / ÚLTIMOS 12 MESES */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-auto border border-slate-200/60 dark:border-slate-700">
          <button
            onClick={() => onSelectYear("last12")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              selectedYear === "last12"
                ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-xs"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
            }`}
          >
            Últimos 12 meses
          </button>
          {effectiveAvailableYears
            .filter((y) => y !== "last12")
            .map((yr) => (
              <button
                key={yr}
                onClick={() => onSelectYear(yr)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  selectedYear === yr
                    ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                }`}
              >
                {yr}
              </button>
            ))}
        </div>
      </div>

      {/* METRICAS RÁPIDAS DEL PERÍODO */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> Total Período
          </div>
          <p className="text-lg md:text-xl font-black text-slate-800 dark:text-white">
            {formatCOP(totalSpent)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Suma ({periodLabel})</p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Calendar className="w-3.5 h-3.5 text-blue-500" /> Días con Gasto
          </div>
          <p className="text-lg md:text-xl font-black text-slate-800 dark:text-white">
            {daysWithExpenses}{" "}
            <span className="text-xs font-normal text-slate-400">
              ({Math.round((daysWithExpenses / (selectedYear === "last12" || parseInt(selectedYear, 10) % 4 === 0 ? 366 : 365)) * 100)}% de {selectedYear === "last12" ? "12 meses" : selectedYear})
            </span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Días con compras o taller</p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-500" /> Promedio / Día Activo
          </div>
          <p className="text-lg md:text-xl font-black text-slate-800 dark:text-white">
            {formatCOP(activeDayAvg)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">En jornadas con compras</p>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-3.5">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Flame className="w-3.5 h-3.5 text-amber-500" /> Día Récord
          </div>
          <p className="text-lg md:text-xl font-black text-amber-600 dark:text-amber-400">
            {formatCOP(maxDay.total)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate" title={maxDay.date}>
            {maxDay.date ? maxDay.date : "Sin registros"}
          </p>
        </div>
      </div>

      {/* GRILLA DE CALENDARIO HEATMAP */}
      <div className="relative">
        <div
          ref={containerRef}
          className={`overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700 transition-opacity duration-200 ${
            isLoading ? "opacity-40 pointer-events-none" : "opacity-100"
          }`}
        >
          <div className="inline-block min-w-max select-none">
            {/* Cabecera de Meses */}
            <div className="flex text-[11px] font-semibold text-slate-400 mb-2 pl-8 h-4 relative">
              {monthHeaders.map((m, idx) => (
                <div
                  key={`${m.label}-${idx}`}
                  className="absolute"
                  style={{ left: `${m.colIndex * 15.5 + 32}px` }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Contenedor Grilla: Días a la izquierda + Columnas de Semanas */}
            <div className="flex items-start gap-2">
              {/* Etiquetas Días de la Semana (Lun, Mié, Vie) */}
              <div className="grid grid-rows-7 gap-[3px] text-[10px] font-bold text-slate-400 pr-1 select-none">
                <span className="h-[13px] leading-[13px]">Lun</span>
                <span className="h-[13px] leading-[13px] opacity-0">Mar</span>
                <span className="h-[13px] leading-[13px]">Mié</span>
                <span className="h-[13px] leading-[13px] opacity-0">Jue</span>
                <span className="h-[13px] leading-[13px]">Vie</span>
                <span className="h-[13px] leading-[13px] opacity-0">Sáb</span>
                <span className="h-[13px] leading-[13px] opacity-0">Dom</span>
              </div>

              {/* Matriz de Cuadritos */}
              <div className="flex gap-[3px]">
                {weeks.map((week) => (
                  <div key={week.weekIndex} className="grid grid-rows-7 gap-[3px]">
                    {week.days.map((day) => {
                      const colorClass = getColorClass(day.level, day.isFuture, day.inTargetYear);
                      return (
                        <div
                          key={day.dateStr}
                          onClick={() => handleOpenDayModal(day.dateStr, day.total)}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredDay({
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                              dateStr: day.dateStr,
                              total: day.total,
                              count: day.count,
                              level: day.level
                            });
                          }}
                          onMouseLeave={() => setHoveredDay(null)}
                          className={`w-[12.5px] h-[12.5px] rounded-[2.5px] transition-all transform hover:scale-125 ${colorClass} ${
                            day.total > 0 ? "cursor-pointer" : "cursor-default"
                          }`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* LEYENDA TIPO GITHUB AL PIE */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Haz clic sobre cualquier cuadro verde para ver los recibos y placas asignadas.</span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto font-medium">
            <span className="text-[11px] text-slate-400">Menos</span>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-[2px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                title="Sin gastos ($0)"
              />
              <div
                className="w-3 h-3 rounded-[2px] bg-emerald-200 dark:bg-emerald-950/70 border border-emerald-300"
                title={`Nivel 1: Hasta ${formatCOP(thresholds[0])}`}
              />
              <div
                className="w-3 h-3 rounded-[2px] bg-emerald-400 dark:bg-emerald-700 border border-emerald-500"
                title={`Nivel 2: Hasta ${formatCOP(thresholds[1])}`}
              />
              <div
                className="w-3 h-3 rounded-[2px] bg-emerald-600 dark:bg-emerald-500 border border-emerald-700"
                title={`Nivel 3: Hasta ${formatCOP(thresholds[2])}`}
              />
              <div
                className="w-3 h-3 rounded-[2px] bg-emerald-800 dark:bg-emerald-300 border border-emerald-900"
                title={`Nivel 4: Más de ${formatCOP(thresholds[2])}`}
              />
            </div>
            <span className="text-[11px] text-slate-400">Más</span>
          </div>
        </div>
      </div>

      {/* TOOLTIP FLOTANTE (Fixed/Portal style) */}
      {hoveredDay && (
        <div
          className="fixed pointer-events-none z-50 -translate-x-1/2 -translate-y-full mb-2 bg-slate-900/95 dark:bg-slate-800/95 text-white backdrop-blur-md px-3 py-2 rounded-xl text-xs shadow-2xl border border-slate-700/60 transition-opacity animate-in fade-in duration-150"
          style={{
            left: `${hoveredDay.x}px`,
            top: `${hoveredDay.y - 8}px`
          }}
        >
          <p className="font-semibold capitalize text-slate-200">
            {formatDateFriendly(hoveredDay.dateStr)}
          </p>
          <div className="mt-1 flex items-center justify-between gap-3 text-slate-300">
            <span>Gasto acumulado:</span>
            <span
              className={`font-black ${
                hoveredDay.total > 0 ? "text-emerald-400" : "text-slate-400"
              }`}
            >
              {formatCOP(hoveredDay.total)}
            </span>
          </div>
          {hoveredDay.total > 0 ? (
            <p className="text-[10px] text-emerald-300/80 mt-0.5 flex items-center gap-1">
              <span>• {hoveredDay.count} {hoveredDay.count === 1 ? "registro" : "registros"}</span>
              <span className="text-slate-400">| Clic para ver detalle</span>
            </p>
          ) : (
            <p className="text-[10px] text-slate-400 mt-0.5">Sin gastos en esta fecha</p>
          )}
        </div>
      )}

      {/* MODAL DETALLE DEL DÍA */}
      {modalDate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between">
              <div>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  Detalle de Gastos Diarios
                </span>
                <h3 className="text-xl font-bold text-slate-800 dark:text-white capitalize mt-0.5">
                  {formatDateFriendly(modalDate)}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Total del día:{" "}
                  <span className="font-bold text-slate-800 dark:text-white">
                    {formatCOP(modalDayTotal)}
                  </span>
                </p>
              </div>
              <button
                onClick={() => setModalDate(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-3">
              {loadingModal ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <div className="w-7 h-7 rounded-full border-3 border-emerald-500 border-t-transparent animate-spin" />
                  <p className="text-xs font-medium">Cargando comprobantes...</p>
                </div>
              ) : modalExpenses.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="font-medium text-sm">No se encontraron ítems detallados para esta fecha.</p>
                </div>
              ) : (
                modalExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:border-emerald-300 dark:hover:border-emerald-700 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-white text-base">
                          {exp.item}
                        </span>
                        {exp.category && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {exp.category}
                          </span>
                        )}
                      </div>

                      {exp.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                          {exp.description}
                        </p>
                      )}

                      {exp.expense_vehicles && exp.expense_vehicles.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {exp.expense_vehicles.map((v) => (
                            <span
                              key={v.plate}
                              className="text-[10px] font-mono font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300"
                            >
                              {v.plate}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200 dark:border-slate-700">
                      <p className="text-base font-black text-slate-800 dark:text-white">
                        {formatCOP(exp.total_amount)}
                      </p>

                      {/* Adjunto si existe */}
                      {exp.attachment_url || (exp.expense_attachments && exp.expense_attachments.length > 0) ? (
                        <a
                          href={exp.attachment_url || exp.expense_attachments?.[0]?.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                        >
                          Ver comprobante <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-400">Sin comprobante</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setModalDate(null)}
                className="px-5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
