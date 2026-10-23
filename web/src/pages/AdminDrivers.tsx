import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import { X, ArrowUp, ArrowDown, ChevronsUpDown, Search } from "lucide-react";
import { useSortableData } from "../hooks/useSortableData";
import { LiquidationModal } from "../components/LiquidationModal";
import { DriverModal } from "../components/DriverModal";
import { type Driver, EMPTY_DRIVER } from "../types/driver";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

export default function AdminDrivers() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const { items: sortedItems, requestSort, sortConfig } = useSortableData(drivers);

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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/drivers?all=true`, {
        headers: { Authorization: auth }
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
      case "active": return <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">Activo</span>;
      case "suspended": return <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase">Suspendido</span>;
      case "inactive": return <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase">Inactivo</span>;
      default: return status;
    }
  };

  return (
    <div className="h-full flex flex-col p-6 bg-slate-50">
      <div className="mx-auto max-w-[1400px] w-full flex-1 flex flex-col min-h-0">

        {/* Header */}
        <div className="mb-4 flex items-end justify-between shrink-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Directorio de Conductores</h1>
            <p className="text-sm text-slate-500">Gestión de personal, contactos y expediente digital.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={loadData} className="text-sm text-emerald-600 hover:underline px-3 font-medium">Refrescar</button>
            <button onClick={handleCreate} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-black transition-all">
              <span>+</span> Nuevo Conductor
            </button>
          </div>
        </div>

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
            {([
              { value: "all", label: "Todos" },
              { value: "active", label: "Activos" },
              { value: "inactive", label: "Inactivos" },
              { value: "suspended", label: "Suspendidos" },
            ] as const).map(({ value, label }) => (
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
                    <div onClick={() => requestSort('full_name')} className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors w-max">
                      Nombre Completo <SortIcon columnKey="full_name" />
                    </div>
                  </th>
                  <th className="px-4 py-3">
                    <div onClick={() => requestSort('document_number')} className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors w-max">
                      Documento <SortIcon columnKey="document_number" />
                    </div>
                  </th>
                  <th className="px-4 py-3">
                    <div onClick={() => requestSort('phone')} className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors w-max">
                      Contacto <SortIcon columnKey="phone" />
                    </div>
                  </th>
                  <th className="px-4 py-3">
                    <div onClick={() => requestSort('created_at')} className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors w-max">
                      Registro <SortIcon columnKey="created_at" />
                    </div>
                  </th>
                  <th className="px-4 py-3">
                    <div onClick={() => requestSort('status')} className="flex items-center gap-1 cursor-pointer hover:bg-slate-100 p-1 rounded transition-colors w-max">
                      Estado <SortIcon columnKey="status" />
                    </div>
                  </th>
                  <th className="px-4 py-3">Documentación</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="p-10 text-center text-slate-400">Cargando...</td></tr>
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
                            <img src={d.photo_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover border border-slate-200" />
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
                        {new Date(d.created_at).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" })}
                      </td>
                      <td className="px-4 py-3">{statusBadge(d.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {d.cv_url && <span title="Hoja de Vida" className="cursor-help text-xs">📄</span>}
                          {d.contract_url && <span title="Contrato" className="cursor-help text-xs">📝</span>}
                          {(d.license_front_url || d.license_back_url) && <span title="Licencia" className="cursor-help text-xs">🚗</span>}
                          {!d.cv_url && !d.contract_url && <span className="text-slate-300 text-[10px] italic">Pendiente</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-4 justify-end">
                          <button onClick={() => setLiquidationDriverId(d.id)} className="text-blue-600 hover:text-blue-800 font-medium text-sm">
                            {d.status === 'inactive' ? 'Ver Liquidación' : 'Liquidar'}
                          </button>
                          <button onClick={() => handleEdit(d)} className="text-emerald-600 hover:text-emerald-800 font-medium text-sm">Ver Ficha</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <DriverModal
          driver={editing}
          isCreating={isCreating}
          onClose={() => {
            setEditing(null);
            setIsCreating(false);
          }}
          onSaved={loadData}
        />
      )}

      {liquidationDriverId && (
        <LiquidationModal 
          isOpen={true} 
          driverId={liquidationDriverId} 
          onClose={() => setLiquidationDriverId(null)}
          onSuccess={() => { setLiquidationDriverId(null); loadData(); }}
        />
      )}
    </div>
  );
}
