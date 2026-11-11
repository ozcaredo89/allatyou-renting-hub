import { useEffect, useState, useMemo } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import {
  X,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Search,
  Calendar as CalendarIcon,
  Users,
  ChevronLeft,
  ChevronRight,
  FileText,
  CheckCircle2,
  Clock,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { useSortableData } from "../hooks/useSortableData";
import { LiquidationModal } from "../components/LiquidationModal";
import { DriverModal } from "../components/DriverModal";
import { type Driver, EMPTY_DRIVER } from "../types/driver";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type CalendarLiquidationItem = {
  id: string;
  liquidation_id: string | null;
  driver_id: number;
  driver_name: string;
  document_number: string;
  phone: string;
  plate: string | null;
  retire_date: string; // YYYY-MM-DD
  payment_due_date: string; // YYYY-MM-DD (+20 días SIMIT)
  total_incomes: number;
  total_deductions: number;
  final_balance: number;
  has_paz_salvo: boolean;
  payment_proof_url: string | null;
  paid_at: string | null;
  payment_notes: string | null;
  is_paid: boolean;
  has_liquidation: boolean;
};

function diffDaysYmd(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd.slice(0, 10)}T12:00:00Z`).getTime();
  const b = new Date(`${toYmd.slice(0, 10)}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function AdminDrivers() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const { items: sortedItems, requestSort, sortConfig } = useSortableData(drivers);

  // Vista activa: directorio vs calendario de retiros y liquidaciones
  const [activeTab, setActiveTab] = useState<"directory" | "calendar">(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("view") === "calendar" ? "calendar" : "directory";
  });

  const [calendarItems, setCalendarItems] = useState<CalendarLiquidationItem[]>([]);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  // Mes visible en el calendario (por defecto el mes actual)
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth()); // 0-11
  const [selectedDayYmd, setSelectedDayYmd] = useState<string | null>(null);

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig?.key !== columnKey) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
    return sortConfig.direction === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const [loading, setLoading] = useState(false);

  // Filtros
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "suspended">("all");

  // Modal State
  const [editing, setEditing] = useState<Partial<Driver> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [liquidationDriverId, setLiquidationDriverId] = useState<number | null>(null);
  const [openingPdfId, setOpeningPdfId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    loadCalendarData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/drivers?all=true`, {
        headers: { Authorization: auth },
      });

      if (res.status === 401) {
        clearBasicAuth();
        window.location.reload();
        return;
      }
      const json = await res.json();
      setDrivers(Array.isArray(json) ? json : []);
    } catch (e) {
      console.error(e);
      alert("Error cargando conductores.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCalendarData() {
    setLoadingCalendar(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/liquidations/calendar`, {
        headers: { Authorization: auth },
      });
      if (res.ok) {
        const json = await res.json();
        setCalendarItems(Array.isArray(json.items) ? json.items : []);
      }
    } catch (e) {
      console.error("Error cargando calendario de liquidaciones:", e);
    } finally {
      setLoadingCalendar(false);
    }
  }

  async function handleOpenPazSalvoPdf(liquidationId: string) {
    setOpeningPdfId(liquidationId);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/liquidations/${liquidationId}/document-urls`, {
        headers: { Authorization: auth },
      });
      if (!res.ok) throw new Error("No se pudo obtener el enlace del Paz y Salvo");
      const data = await res.json();
      if (data?.pdf_url) {
        window.open(data.pdf_url, "_blank", "noopener,noreferrer");
      }
    } catch (e: any) {
      alert(e.message || "Error abriendo Paz y Salvo");
    } finally {
      setOpeningPdfId(null);
    }
  }

  function handleCreate() {
    setEditing({ ...EMPTY_DRIVER });
    setIsCreating(true);
  }

  function handleEdit(d: Driver) {
    setEditing({ ...d });
    setIsCreating(false);
  }

  // ── Filtrado derivado ──────────────────────────────────────────
  const filteredItems = sortedItems.filter((d) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      d.full_name.toLowerCase().includes(q) ||
      d.document_number.toLowerCase().includes(q) ||
      d.phone.toLowerCase().includes(q) ||
      (d.email ?? "").toLowerCase().includes(q);
    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">
            Activo
          </span>
        );
      case "suspended":
        return (
          <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase">
            Suspendido
          </span>
        );
      case "inactive":
        return (
          <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase">
            Inactivo
          </span>
        );
      default:
        return status;
    }
  };

  // ── Cálculos del Calendario ──────────────────────────────────────
  const todayYmd = new Date().toLocaleDateString("en-CA");

  const urgentUnpaidCount = useMemo(() => {
    return calendarItems.filter((it) => {
      if (it.is_paid) return false;
      const daysLeft = diffDaysYmd(todayYmd, it.payment_due_date);
      return daysLeft <= 3;
    }).length;
  }, [calendarItems, todayYmd]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    // Ajustar para que lunes sea 0 y domingo 6
    const startOffset = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();

    const cells: Array<{ day: number | null; ymd: string | null }> = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push({ day: null, ymd: null });
    }
    for (let d = 1; d <= totalDays; d++) {
      const ymd = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, ymd });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, ymd: null });
    }
    return cells;
  }, [calYear, calMonth]);

  const eventsByDate = useMemo(() => {
    const map = new Map<
      string,
      Array<{ type: "retire" | "due"; item: CalendarLiquidationItem }>
    >();
    for (const it of calendarItems) {
      if (it.retire_date) {
        const list = map.get(it.retire_date) || [];
        list.push({ type: "retire", item: it });
        map.set(it.retire_date, list);
      }
      if (it.payment_due_date) {
        const list = map.get(it.payment_due_date) || [];
        list.push({ type: "due", item: it });
        map.set(it.payment_due_date, list);
      }
    }
    return map;
  }, [calendarItems]);

  const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
  const monthRetirementsCount = calendarItems.filter((i) => i.retire_date.startsWith(monthPrefix)).length;
  const pendingSimitCount = calendarItems.filter((i) => !i.is_paid).length;
  const paidCount = calendarItems.filter((i) => i.is_paid).length;

  const filteredCalendarTableItems = useMemo(() => {
    if (!selectedDayYmd) return calendarItems;
    return calendarItems.filter(
      (i) => i.retire_date === selectedDayYmd || i.payment_due_date === selectedDayYmd
    );
  }, [calendarItems, selectedDayYmd]);

  const goPrevMonth = () => {
    setSelectedDayYmd(null);
    if (calMonth === 0) {
      setCalYear(calYear - 1);
      setCalMonth(11);
    } else {
      setCalMonth(calMonth - 1);
    }
  };

  const goNextMonth = () => {
    setSelectedDayYmd(null);
    if (calMonth === 11) {
      setCalYear(calYear + 1);
      setCalMonth(0);
    } else {
      setCalMonth(calMonth + 1);
    }
  };

  const goToday = () => {
    const t = new Date();
    setCalYear(t.getFullYear());
    setCalMonth(t.getMonth());
    setSelectedDayYmd(null);
  };

  return (
    <div className="h-full flex flex-col p-6 bg-slate-50">
      <div className="mx-auto max-w-[1400px] w-full flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-3 shrink-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {activeTab === "directory"
                ? "Directorio de Conductores"
                : "Calendario de Retiros y Liquidaciones (20 Días SIMIT)"}
            </h1>
            <p className="text-sm text-slate-500">
              {activeTab === "directory"
                ? "Gestión de personal, contactos y expediente digital."
                : "Control de fechas de retiro, validación SIMIT (20 días calendario), Paz y Salvo y comprobantes de pago."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Selector de vista */}
            <div className="inline-flex rounded-xl bg-slate-200/80 p-1">
              <button
                onClick={() => setActiveTab("directory")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "directory"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Directorio
              </button>
              <button
                onClick={() => setActiveTab("calendar")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === "calendar"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                Calendario de Retiros
                {urgentUnpaidCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black">
                    {urgentUnpaidCount}
                  </span>
                )}
              </button>
            </div>

            <button
              onClick={() => {
                loadData();
                loadCalendarData();
              }}
              className="text-sm text-emerald-600 hover:underline px-2 font-medium"
            >
              Refrescar
            </button>
            {activeTab === "directory" && (
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-black transition-all"
              >
                <span>+</span> Nuevo Conductor
              </button>
            )}
          </div>
        </div>

        {activeTab === "directory" ? (
          <>
            {/* ── Barra de Filtros ── */}
            <div className="mb-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center shrink-0">
              {/* Búsqueda de texto */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, documento, celular o email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent placeholder-slate-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Chips de Estado */}
              <div className="flex gap-2 shrink-0">
                {(
                  [
                    { value: "all", label: "Todos" },
                    { value: "active", label: "Activos" },
                    { value: "inactive", label: "Inactivos" },
                    { value: "suspended", label: "Suspendidos" },
                  ] as const
                ).map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => setStatusFilter(value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                      statusFilter === value
                        ? value === "all"
                          ? "bg-slate-900 text-white border-slate-900"
                          : value === "active"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : value === "suspended"
                          ? "bg-red-500 text-white border-red-500"
                          : "bg-slate-500 text-white border-slate-500"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Contador */}
              <span className="text-xs text-slate-400 shrink-0">
                {filteredItems.length} de {drivers.length} conductor{drivers.length !== 1 ? "es" : ""}
              </span>
            </div>

            {/* Tabla — flex-1 + min-h-0 para que ocupe exactamente el espacio restante del viewport */}
            <div className="flex-1 min-h-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-left uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3">
                        <div
                          onClick={() => requestSort("full_name")}
                          className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors w-max"
                        >
                          Nombre Completo <SortIcon columnKey="full_name" />
                        </div>
                      </th>
                      <th className="px-4 py-3">
                        <div
                          onClick={() => requestSort("document_number")}
                          className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors w-max"
                        >
                          Documento <SortIcon columnKey="document_number" />
                        </div>
                      </th>
                      <th className="px-4 py-3">
                        <div
                          onClick={() => requestSort("phone")}
                          className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors w-max"
                        >
                          Contacto <SortIcon columnKey="phone" />
                        </div>
                      </th>
                      <th className="px-4 py-3">
                        <div
                          onClick={() => requestSort("created_at")}
                          className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors w-max"
                        >
                          Registro <SortIcon columnKey="created_at" />
                        </div>
                      </th>
                      <th className="px-4 py-3">
                        <div
                          onClick={() => requestSort("status")}
                          className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors w-max"
                        >
                          Estado <SortIcon columnKey="status" />
                        </div>
                      </th>
                      <th className="px-4 py-3">Documentación</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="p-10 text-center text-slate-400">
                          Cargando...
                        </td>
                      </tr>
                    ) : filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-10 text-center text-slate-400">
                          {searchQuery || statusFilter !== "all"
                            ? "No se encontraron conductores con ese filtro."
                            : "No hay conductores registrados."}
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((d) => (
                        <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {d.photo_url ? (
                                <img
                                  src={d.photo_url}
                                  alt="Avatar"
                                  className="w-8 h-8 rounded-full object-cover border border-slate-200"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                                  {d.full_name.charAt(0)}
                                </div>
                              )}
                              <span className="font-bold text-slate-700">{d.full_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600">{d.document_number}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <div className="flex flex-col">
                              <span className="font-medium">{d.phone}</span>
                              <span className="text-[10px] text-slate-400">{d.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                            {new Date(d.created_at).toLocaleDateString("es-CO", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                          <td className="px-4 py-3">{statusBadge(d.status)}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {d.cv_url && (
                                <span title="Hoja de Vida" className="cursor-help text-xs">
                                  📄
                                </span>
                              )}
                              {d.contract_url && (
                                <span title="Contrato" className="cursor-help text-xs">
                                  📝
                                </span>
                              )}
                              {(d.license_front_url || d.license_back_url) && (
                                <span title="Licencia" className="cursor-help text-xs">
                                  🚗
                                </span>
                              )}
                              {!d.cv_url && !d.contract_url && (
                                <span className="text-slate-300 text-[10px] italic">Pendiente</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex gap-4 justify-end">
                              <button
                                onClick={() => setLiquidationDriverId(d.id)}
                                className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                              >
                                {d.status === "inactive" ? "Ver Liquidación" : "Liquidar"}
                              </button>
                              <button
                                onClick={() => handleEdit(d)}
                                className="text-emerald-600 hover:text-emerald-800 font-medium text-sm"
                              >
                                Ver Ficha
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          /* ── VISTA DE CALENDARIO DE RETIROS Y LIQUIDACIONES ── */
          <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pb-6">
            {/* Tarjetas resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <span className="text-xs font-semibold text-slate-500">
                  Retiros en {MONTH_NAMES[calMonth]} {calYear}
                </span>
                <div className="text-2xl font-black text-slate-800 mt-1">{monthRetirementsCount}</div>
                <span className="text-[11px] text-slate-400">Conductores retirados en el mes</span>
              </div>

              <div className="bg-white rounded-xl border border-amber-200 p-4 shadow-sm">
                <span className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> En Alerta de Pago (≤ 3 días SIMIT)
                </span>
                <div className="text-2xl font-black text-amber-600 mt-1">{urgentUnpaidCount}</div>
                <span className="text-[11px] text-slate-400">Notificadas por correo 3 días antes</span>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <span className="text-xs font-semibold text-slate-500">
                  En Validación SIMIT (Pendientes)
                </span>
                <div className="text-2xl font-black text-blue-600 mt-1">{pendingSimitCount}</div>
                <span className="text-[11px] text-slate-400">Plazo de 20 días calendario tras retiro</span>
              </div>

              <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-sm">
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Pagadas con Comprobante
                </span>
                <div className="text-2xl font-black text-emerald-600 mt-1">{paidCount}</div>
                <span className="text-[11px] text-slate-400">Paz y Salvo y pago cerrados</span>
              </div>
            </div>

            {/* Calendario Mensual */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Barra superior del calendario */}
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-800">
                    {MONTH_NAMES[calMonth]} {calYear}
                  </h2>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={goPrevMonth}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
                      title="Mes anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={goToday}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700"
                    >
                      Hoy
                    </button>
                    <button
                      onClick={goNextMonth}
                      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
                      title="Mes siguiente"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  {selectedDayYmd && (
                    <button
                      onClick={() => setSelectedDayYmd(null)}
                      className="text-xs bg-slate-800 text-white px-2.5 py-1 rounded-full flex items-center gap-1"
                    >
                      Filtrando día: {selectedDayYmd} <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Leyenda */}
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-800 inline-block" /> Día de Retiro Conductor
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Pago Liquidación (+20d SIMIT Pendiente)
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Liquidación Pagada
                  </span>
                </div>
              </div>

              {/* Encabezados de días */}
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60 text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-2">
                    {w}
                  </div>
                ))}
              </div>

              {/* Celdas del mes */}
              <div className="grid grid-cols-7 divide-x divide-y divide-slate-100">
                {calendarCells.map((cell, idx) => {
                  if (!cell.day || !cell.ymd) {
                    return <div key={idx} className="min-h-[105px] bg-slate-50/40 p-2" />;
                  }

                  const dayEvents = eventsByDate.get(cell.ymd) || [];
                  const isToday = cell.ymd === todayYmd;
                  const isSelected = cell.ymd === selectedDayYmd;

                  return (
                    <div
                      key={cell.ymd}
                      onClick={() =>
                        dayEvents.length > 0 &&
                        setSelectedDayYmd(isSelected ? null : cell.ymd)
                      }
                      className={`min-h-[105px] p-2 transition-colors flex flex-col gap-1 ${
                        dayEvents.length > 0 ? "cursor-pointer hover:bg-slate-50" : ""
                      } ${isSelected ? "ring-2 ring-inset ring-emerald-500 bg-emerald-50/20" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                            isToday
                              ? "bg-emerald-600 text-white"
                              : "text-slate-600"
                          }`}
                        >
                          {cell.day}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] font-semibold text-slate-400">
                            {dayEvents.length} reg.
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 mt-0.5">
                        {dayEvents.map((ev, i) => {
                          const it = ev.item;
                          if (ev.type === "retire") {
                            return (
                              <button
                                key={`ret-${it.id}-${i}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLiquidationDriverId(it.driver_id);
                                }}
                                className="w-full text-left px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[10px] leading-tight transition-colors shadow-xs"
                                title={`Retiro de ${it.driver_name} (${it.plate || "Sin placa"}) — Clic para ver Paz y Salvo y Comprobante`}
                              >
                                <div className="font-bold truncate">
                                  🚗 Retiro: {it.driver_name}
                                </div>
                                <div className="flex items-center justify-between text-[9px] text-slate-300 mt-0.5">
                                  <span>{it.plate || "Sin placa"}</span>
                                  <span>
                                    {it.has_paz_salvo ? "📄" : ""}{" "}
                                    {it.is_paid ? "✅ Pagado" : "⏳"}
                                  </span>
                                </div>
                              </button>
                            );
                          }

                          // Evento de vencimiento de pago (+20 días SIMIT)
                          return (
                            <button
                              key={`due-${it.id}-${i}`}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLiquidationDriverId(it.driver_id);
                              }}
                              className={`w-full text-left px-2 py-1 rounded-md text-[10px] leading-tight transition-colors border ${
                                it.is_paid
                                  ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200"
                                  : "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300"
                              }`}
                              title={`Pago Liquidación (20 días SIMIT): ${it.driver_name} — Clic para ver detalle, Paz y Salvo y Comprobante`}
                            >
                              <div className="font-bold truncate">
                                {it.is_paid ? "✅ Pagado:" : "💰 Pago 20d:"} {it.driver_name}
                              </div>
                              <div className="flex items-center justify-between text-[9px] mt-0.5 opacity-85">
                                <span>${it.final_balance.toLocaleString("es-CO")}</span>
                                <span className="underline font-semibold">Ver detalle</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tabla detallada con links directos a Paz y Salvo y Comprobante de Pago */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Detalle de Retiros, Documento de Paz y Salvo y Comprobantes de Pago
                  </h3>
                  <p className="text-xs text-slate-500">
                    Haz clic en cualquier conductor o en los enlaces directos para ver el Paz y Salvo y el comprobante de pago.
                  </p>
                </div>
                {loadingCalendar && (
                  <span className="text-xs text-slate-400">Actualizando...</span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-left uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Conductor / Placa</th>
                      <th className="px-4 py-3">Día de Retiro</th>
                      <th className="px-4 py-3">Pago (+20 Días SIMIT)</th>
                      <th className="px-4 py-3 text-right">Saldo Liquidación</th>
                      <th className="px-4 py-3">Documento Paz y Salvo</th>
                      <th className="px-4 py-3">Comprobante de Pago</th>
                      <th className="px-4 py-3 text-right">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredCalendarTableItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          No hay retiros o liquidaciones registradas para este filtro.
                        </td>
                      </tr>
                    ) : (
                      filteredCalendarTableItems.map((it) => {
                        const daysLeft = diffDaysYmd(todayYmd, it.payment_due_date);
                        return (
                          <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-bold text-slate-800">{it.driver_name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                CC: {it.document_number} • Placa: {it.plate || "Sin asignar"}
                              </div>
                            </td>

                            <td className="px-4 py-3 font-mono font-semibold text-slate-700">
                              {it.retire_date}
                            </td>

                            <td className="px-4 py-3">
                              <div className="font-mono font-bold text-slate-800">
                                {it.payment_due_date}
                              </div>
                              {it.is_paid ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                                  <CheckCircle2 className="w-3 h-3" /> Pagado{" "}
                                  {it.paid_at ? `(${new Date(it.paid_at).toLocaleDateString("en-CA")})` : ""}
                                </span>
                              ) : daysLeft < 0 ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600">
                                  <Clock className="w-3 h-3" /> Vencido hace {-daysLeft} día(s)
                                </span>
                              ) : daysLeft <= 3 ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600">
                                  <Clock className="w-3 h-3" /> Vence en {daysLeft} día(s) (Alerta correo)
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-500">
                                  En validación SIMIT ({daysLeft} días restantes)
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                              ${it.final_balance.toLocaleString("es-CO")}
                            </td>

                            <td className="px-4 py-3">
                              {it.has_paz_salvo && it.liquidation_id ? (
                                <button
                                  type="button"
                                  disabled={openingPdfId === it.liquidation_id}
                                  onClick={() => handleOpenPazSalvoPdf(it.liquidation_id!)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  {openingPdfId === it.liquidation_id
                                    ? "Abriendo..."
                                    : "Ver Paz y Salvo (PDF)"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setLiquidationDriverId(it.driver_id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs transition-colors"
                                >
                                  <FileText className="w-3.5 h-3.5" /> Generar Paz y Salvo
                                </button>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              {it.payment_proof_url ? (
                                <div className="flex flex-col gap-0.5">
                                  <a
                                    href={it.payment_proof_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs w-max transition-colors"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" /> Ver Comprobante de Pago
                                  </a>
                                  {it.payment_notes && (
                                    <span className="text-[10px] text-slate-400 truncate max-w-[180px]">
                                      {it.payment_notes}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setLiquidationDriverId(it.driver_id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold text-xs transition-colors"
                                >
                                  + Subir Comprobante
                                </button>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => setLiquidationDriverId(it.driver_id)}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
                              >
                                Abrir Liquidación
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {editing && (
        <DriverModal
          driver={editing}
          isCreating={isCreating}
          onClose={() => {
            setEditing(null);
            setIsCreating(false);
          }}
          onSaved={() => {
            loadData();
            loadCalendarData();
          }}
        />
      )}

      {liquidationDriverId && (
        <LiquidationModal
          isOpen={true}
          driverId={liquidationDriverId}
          onClose={() => setLiquidationDriverId(null)}
          onSuccess={() => {
            loadData();
            loadCalendarData();
          }}
        />
      )}
    </div>
  );
}
