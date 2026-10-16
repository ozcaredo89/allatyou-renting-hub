import { useEffect, useState, useRef } from "react";
import { ensureBasicAuth, requestWithBasicAuth } from "../lib/auth";
import { ShieldAlert, TrendingDown, BellIcon, Settings, AlertTriangle, AlertCircle, CheckCircle, X, Save, Edit2 } from "lucide-react";
import ExpenseHeatmap, { type DailyExpense } from "../components/ExpenseHeatmap";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type AuditRule = {
    id: string;
    item_name: string;
    avg_price: number;
    max_allowed_price: number | null;
    expected_frequency_days: number | null;
    is_active: boolean;
};

type TopItem = { name: string; amount: number; percentage: number };
type WorstVehicle = { plate: string; total_expenses: number };
type AuditAlert = {
    id: string;
    expense_id: number;
    vehicle_plate: string;
    alert_type: "PRICE_HIGH" | "FREQUENCY_HIGH";
    message: string;
    actual_value: number;
    expected_value: number;
    expense_audit_rules: { item_name: string };
    expenses: { date: string; total_amount: number };
    created_at: string;
};

type AuditsDashboard = {
    summary: { total_expenses_year: number; active_alerts_count: number };
    top_expense_items: TopItem[];
    worst_roi_vehicles: WorstVehicle[];
    active_alerts: AuditAlert[];
    expenses_history: { month: string; total: number }[];
    daily_expenses?: DailyExpense[];
};

function formatCurrencyStr(val: number) {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);
}

function formatCompactCurrency(val: number): string {
    if (!val || val === 0) return "$0";
    if (val >= 1_000_000) {
        const m = val / 1_000_000;
        return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
    }
    if (val >= 1_000) {
        return `$${Math.round(val / 1_000)}k`;
    }
    return `$${val}`;
}

// ==========================================
// COMPONENTE MODAL DE REGLAS
// ==========================================
function RulesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [rules, setRules] = useState<AuditRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Partial<AuditRule>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (isOpen) fetchRules();
    }, [isOpen]);

    const fetchRules = async () => {
        setLoading(true);
        try {
            const res = await requestWithBasicAuth(`${API}/audits/rules`);
            if (res.ok) {
                const data = await res.json();
                setRules(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (r: AuditRule) => {
        setEditingId(r.id);
        setEditForm({ max_allowed_price: r.max_allowed_price, expected_frequency_days: r.expected_frequency_days, is_active: r.is_active });
    };

    const handleSave = async (id: string) => {
        setSaving(true);
        try {
            const res = await requestWithBasicAuth(`${API}/audits/rules/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm)
            });
            if (res.ok) {
                setRules(rules.map(r => r.id === id ? { ...r, ...editForm } : r));
                setEditingId(null);
            } else {
                alert("Error al guardar la regla");
            }
        } catch (e) {
            console.error(e);
            alert("Error de conexión");
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-start md:items-center bg-slate-50 gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Settings className="w-5 h-5 text-emerald-600" />
                            Reglas de Auditoría
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">
                            Ajusta el precio máximo tolerado y la frecuencia esperada en días para cada insumo.
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-white rounded-full shadow-sm shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 md:p-6 overflow-y-auto bg-slate-50/50 flex-1">
                    {loading ? (
                        <div className="flex justify-center py-10">
                            <div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                        </div>
                    ) : (
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden w-full">
                            <div className="overflow-x-auto w-full">
                                <table className="w-full text-left border-collapse min-w-max">
                                    <thead>
                                        <tr className="bg-slate-100 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                                            <th className="p-3 font-bold whitespace-nowrap">Insumo</th>
                                            <th className="p-3 font-bold whitespace-nowrap">Precio Promed. Histórico</th>
                                            <th className="p-3 font-bold whitespace-nowrap">Tope Máx Permitido</th>
                                            <th className="p-3 font-bold whitespace-nowrap">Frecuencia (Días)</th>
                                            <th className="p-3 font-bold text-center whitespace-nowrap">Activa</th>
                                            <th className="p-3 font-bold text-center whitespace-nowrap">Acciones</th>
                                        </tr>
                                    </thead>
                                <tbody>
                                    {rules.map(r => {
                                        const isEditing = editingId === r.id;
                                        return (
                                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                                <td className="p-3 font-semibold text-slate-700">{r.item_name}</td>
                                                <td className="p-3 text-slate-500 font-medium">{formatCurrencyStr(r.avg_price)}</td>

                                                <td className="p-3">
                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            value={editForm.max_allowed_price || ""}
                                                            onChange={e => setEditForm({ ...editForm, max_allowed_price: Number(e.target.value) })}
                                                            className="w-full p-2 border border-emerald-300 rounded font-medium text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                                                            placeholder="Ej: 150000"
                                                        />
                                                    ) : (
                                                        <span className="font-semibold text-emerald-700">
                                                            {r.max_allowed_price ? formatCurrencyStr(r.max_allowed_price) : <span className="text-slate-300 italic">No definido</span>}
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="p-3">
                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            value={editForm.expected_frequency_days || ""}
                                                            onChange={e => setEditForm({ ...editForm, expected_frequency_days: Number(e.target.value) })}
                                                            className="w-full p-2 border border-emerald-300 rounded font-medium text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/20"
                                                            placeholder="Días mín."
                                                        />
                                                    ) : (
                                                        <span className="text-slate-600 font-medium">
                                                            {r.expected_frequency_days ? `${r.expected_frequency_days} días` : <span className="text-slate-300 italic">N/A</span>}
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="p-3 text-center">
                                                    {isEditing ? (
                                                        <input
                                                            type="checkbox"
                                                            checked={editForm.is_active}
                                                            onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })}
                                                            className="w-5 h-5 accent-emerald-500 rounded"
                                                        />
                                                    ) : (
                                                        <span className={`px-2 py-1 text-xs font-bold rounded-full ${r.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                                            {r.is_active ? "SÍ" : "NO"}
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="p-3 text-center">
                                                    {isEditing ? (
                                                        <button
                                                            onClick={() => handleSave(r.id)}
                                                            disabled={saving}
                                                            className="flex items-center gap-1 mx-auto bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                                        >
                                                            <Save className="w-4 h-4" /> Guardar
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleEdit(r)}
                                                            className="p-2 text-slate-400 hover:text-emerald-600 bg-white hover:bg-emerald-50 border border-transparent hover:border-emerald-100 rounded-lg transition-all mx-auto"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AdminAudits() {
    const [dashboard, setDashboard] = useState<AuditsDashboard | null>(null);
    const [loading, setLoading] = useState(true);
    const [isChangingYear, setIsChangingYear] = useState(false);
    const [isRulesModalOpen, setRulesModalOpen] = useState(false);
    const [selectedYear, setSelectedYear] = useState<string>("last12");
    const [showAlerts, setShowAlerts] = useState<boolean>(() => {
        try {
            const s = localStorage.getItem("audits_show_alerts");
            return s !== null ? s === "true" : true;
        } catch {
            return true;
        }
    });

    // Evitar race conditions cuando el usuario cambia rápidamente de año
    const activeRequestId = useRef(0);

    useEffect(() => {
        ensureBasicAuth();
        fetchDashboard(selectedYear);
    }, [selectedYear]);

    const fetchDashboard = async (year = selectedYear) => {
        const reqId = ++activeRequestId.current;
        if (dashboard) {
            setIsChangingYear(true);
        } else {
            setLoading(true);
        }
        try {
            const url = year === "last12"
                ? `${API}/audits/dashboard`
                : `${API}/audits/dashboard?year=${year}`;
            const res = await requestWithBasicAuth(url);
            if (!res.ok) throw new Error("Error cargando dashboard de auditorías");
            const data = await res.json();
            // Descartar respuestas si el usuario ya cambió a otro año antes de que esta terminara
            if (reqId !== activeRequestId.current) return;
            setDashboard(data);
        } catch (err: any) {
            console.error(err);
        } finally {
            if (reqId === activeRequestId.current) {
                setLoading(false);
                setIsChangingYear(false);
            }
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
    };

    const resolveAlert = async (alertId: string) => {
        const note = prompt("¿Marcar esta alerta como revisada/resuelta? Ya no aparecerá en el buzón.\n\nIngresa una nota o justificación (opcional, máx 500 caracteres):");
        if (note === null) return; // User cancelled

        try {
            const res = await requestWithBasicAuth(`${API}/audits/alerts/${alertId}/resolve`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ resolution_note: note })
            });
            if (!res.ok) throw new Error("Error resolviendo alerta");
            // Refrescar lista visualmente sin recargar todo el servidor si es posible, o recargar full
            fetchDashboard();
        } catch (err) {
            console.error(err);
            alert("No se pudo resolver la alerta");
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center p-8 bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                    <p className="text-slate-500 font-medium">Analizando gastos de la flota...</p>
                </div>
            </div>
        );
    }

    if (!dashboard) return null;

    const activeAlertsCount = dashboard.summary.active_alerts_count ?? dashboard.active_alerts.length;
    const periodLabel = selectedYear === "last12" ? "Últimos 12 meses" : `Año ${selectedYear}`;
    const historyPeriodLabel = selectedYear === "last12" ? "Últimos 12 meses" : `Meses de ${selectedYear}`;

    return (
        <div className="min-h-full bg-slate-50 p-4 md:p-8 space-y-8 animate-in fade-in zoom-in-95 duration-500 relative">
            {/* ENCABEZADO */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                        <ShieldAlert className="w-8 h-8 text-emerald-600" />
                        Monitoreo de Gastos
                    </h1>
                    <p className="text-slate-500 mt-2 font-medium max-w-2xl">
                        Tablero gerencial inteligente. Monitorea la distribución de tu presupuesto, detecta variaciones de precios y analiza el ROI de tus vehículos.
                    </p>
                </div>

                {/* Acciones principales: Buzón de Alertas y Reglas */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Botón para alternar visibilidad del Buzón de Alertas */}
                    <button
                        onClick={() => {
                            const next = !showAlerts;
                            setShowAlerts(next);
                            try { localStorage.setItem("audits_show_alerts", String(next)); } catch {}
                        }}
                        className={`flex items-center gap-2 border px-4 py-2 rounded-xl transition-all shadow-sm font-semibold text-sm ${
                            showAlerts
                                ? "bg-slate-900 text-white border-slate-800 hover:bg-slate-800"
                                : "bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                        title={showAlerts ? "Ocultar panel lateral de alertas" : "Mostrar panel lateral de alertas"}
                    >
                        <BellIcon className={`w-4 h-4 ${activeAlertsCount > 0 ? "text-amber-400" : "text-slate-400"}`} />
                        <span>{showAlerts ? "Ocultar Buzón" : "Buzón de Alertas"}</span>
                        <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${
                            activeAlertsCount > 0
                                ? "bg-red-500 text-white shadow-sm"
                                : "bg-emerald-100 text-emerald-700"
                        }`}>
                            {activeAlertsCount}
                        </span>
                    </button>

                    {/* Botón hacia las configuraciones de auditoría (Reglas) */}
                    <button
                        onClick={() => setRulesModalOpen(true)}
                        className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-600 hover:text-emerald-700 hover:border-emerald-300 transition-colors shadow-sm font-semibold text-sm"
                    >
                        <Settings className="w-4 h-4" />
                        Reglas y Precios
                    </button>
                </div>
            </div>

            <RulesModal isOpen={isRulesModalOpen} onClose={() => setRulesModalOpen(false)} />

            {/* MATRIZ DE GASTOS DIARIOS (GITHUB HEATMAP) */}
            <ExpenseHeatmap
                dailyExpenses={dashboard.daily_expenses || []}
                selectedYear={selectedYear}
                onSelectYear={(yr) => setSelectedYear(yr)}
                isLoading={isChangingYear}
            />

            {/* SECCIÓN 1: KPI GLOBAL Y ALERTAS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* COLUMNA IZQUIERDA: Distribución del Gasto, Histórico y Vehículos Críticos */}
                <div className={`${showAlerts ? "lg:col-span-2" : "lg:col-span-3"} space-y-6 transition-all duration-300`}>

                    {/* TOP INSUMOS */}
                    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 translate-x-1/2" />
                        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <TrendingDown className="w-6 h-6 text-slate-400" />
                            Distribución del Gasto
                            <span className="text-xs font-normal bg-slate-100 text-slate-500 px-2 py-1 rounded-full ml-auto">{periodLabel}</span>
                        </h2>

                        <div className="space-y-4">
                            {dashboard.top_expense_items.length === 0 ? (
                                <p className="text-slate-500 text-center py-6">No hay datos suficientes para graficar</p>
                            ) : (
                                dashboard.top_expense_items.map((item, idx) => (
                                    <div key={item.name} className="flex items-end gap-4 group">
                                        <div className="w-6 text-right text-xs font-bold text-slate-300 group-hover:text-emerald-400 transition-colors">
                                            #{idx + 1}
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="font-semibold text-slate-700">{item.name}</span>
                                                <span className="text-slate-500 font-medium">{formatCurrency(item.amount)}</span>
                                            </div>
                                            {/* Barra de progreso */}
                                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                                <div
                                                    className="bg-emerald-500 h-2.5 rounded-full"
                                                    style={{ width: `${item.percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div className="w-12 text-xs font-bold text-slate-400 text-right">
                                            {item.percentage}%
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* HISTÓRICO DE GASTOS CON SCROLL Y VALORES VISIBLES */}
                    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-100 relative">
                        <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-100 rounded-full blur-3xl opacity-50 -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
                        <div className="flex items-center justify-between gap-4 mb-1">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <TrendingDown className="w-6 h-6 text-indigo-400" />
                                Histórico de Gastos
                            </h2>
                            <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-3 py-1 rounded-full">{historyPeriodLabel}</span>
                        </div>
                        <p className="text-xs text-slate-400 mb-6">
                            Evolución mensual de egresos. Desplaza horizontalmente para comparar todos los meses o posa el cursor para ver el monto exacto.
                        </p>

                        <div className="overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200 hover:scrollbar-thumb-slate-300">
                            <div className="min-w-[650px] sm:min-w-[740px] h-72 flex items-end gap-2.5 sm:gap-3.5 pt-12 pb-4 border-b border-slate-100">
                                {(() => {
                                    const history = dashboard.expenses_history || [];
                                    if (history.length === 0) return <p className="text-slate-500 text-center w-full pb-10">No hay datos suficientes para graficar</p>;
                                    
                                    const maxTotal = Math.max(...history.map(h => h.total));
                                    
                                    return history.map(item => {
                                        const pct = maxTotal > 0 ? Math.max((item.total / maxTotal) * 100, 3) : 0;
                                        return (
                                            <div key={item.month} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                                                {/* Tooltip / Valor completo en Hover */}
                                                <div className="absolute -top-10 bg-slate-900 text-white text-[11px] font-bold py-1.5 px-3 rounded-xl opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap pointer-events-none z-30 shadow-xl border border-slate-700">
                                                    <div className="text-slate-300 font-medium">{item.month}</div>
                                                    <div className="text-emerald-400 font-black">{formatCurrency(item.total)}</div>
                                                </div>

                                                {/* Valor compacto SIEMPRE visible arriba de la barra */}
                                                <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 mb-1.5 text-center truncate w-full group-hover:text-indigo-600 transition-colors">
                                                    {formatCompactCurrency(item.total)}
                                                </div>
                                                
                                                {/* Barra contenedor (fondo claro) */}
                                                <div className="w-full max-w-[48px] bg-slate-50 rounded-t-xl h-full relative flex items-end justify-center transition-all group-hover:bg-slate-100">
                                                    <div 
                                                        className="w-full bg-slate-800 rounded-t-xl transition-all duration-500 ease-out group-hover:bg-indigo-600 shadow-sm"
                                                        style={{ height: `${pct}%` }}
                                                    />
                                                </div>
                                                
                                                {/* Etiqueta del Mes */}
                                                <div className="mt-3 text-xs font-semibold text-slate-500 text-center whitespace-nowrap group-hover:text-indigo-600 transition-colors">
                                                    {item.month}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* VEHÍCULOS HOYO NEGRO */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <AlertTriangle className="w-6 h-6 text-amber-500" />
                            Top Vehículos Más Costosos
                        </h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-slate-100 text-slate-400 text-xs uppercase tracking-wider">
                                        <th className="py-3 px-2 font-bold w-12">Rank</th>
                                        <th className="py-3 px-2 font-bold">Placa</th>
                                        <th className="py-3 px-2 font-bold text-right">Gastos Acumulados</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dashboard.worst_roi_vehicles.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="text-center py-8 text-slate-500">Ningún vehículo registrado</td>
                                        </tr>
                                    ) : (
                                        dashboard.worst_roi_vehicles.map((v, i) => (
                                            <tr key={v.plate} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                                                <td className="py-3 px-2">
                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-red-100 text-red-600' : i === 1 ? 'bg-orange-100 text-orange-600' : i === 2 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                                                        {i + 1}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-2 font-bold text-slate-700 text-lg">{v.plate}</td>
                                                <td className="py-3 px-2 text-right font-medium text-slate-600">{formatCurrency(v.total_expenses)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                {/* COLUMNA DERECHA: BUZÓN DE ALERTAS (COLAPSABLE) */}
                {showAlerts && (
                    <div className="lg:col-span-1 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-slate-900 rounded-3xl p-6 md:p-8 shadow-xl shadow-slate-900/10 sticky top-6">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <BellIcon className="w-6 h-6 text-red-400" />
                                    Buzón de Alertas
                                    <span className="bg-red-500 text-white text-xs font-black px-2 py-0.5 rounded-full ml-1 shadow-sm">
                                        {activeAlertsCount}
                                    </span>
                                </h2>
                                <button
                                    onClick={() => {
                                        setShowAlerts(false);
                                        try { localStorage.setItem("audits_show_alerts", "false"); } catch {}
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors text-xs flex items-center gap-1 font-semibold"
                                    title="Ocultar buzón"
                                >
                                    <X className="w-4 h-4" />
                                    <span>Ocultar</span>
                                </button>
                            </div>
                            <p className="text-slate-400 text-sm mb-6">
                                Notificaciones automáticas sobre variaciones de precios o frecuencias inusuales detectadas en los repuestos.
                            </p>

                            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
                                {dashboard.active_alerts.length === 0 ? (
                                    <div className="bg-slate-800/50 rounded-2xl p-6 text-center border border-slate-700/50">
                                        <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <CheckCircle className="w-6 h-6" />
                                        </div>
                                        <p className="text-slate-300 font-medium">Buzón vacío</p>
                                        <p className="text-slate-500 text-xs mt-1">Todo parece estar en orden esta semana.</p>
                                    </div>
                                ) : (
                                    <>
                                        {dashboard.active_alerts.map(alert => (
                                            <div key={alert.id} className="bg-white rounded-2xl p-4 shadow-sm relative group">

                                                {/* Cabecera de Alerta */}
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        {alert.alert_type === 'PRICE_HIGH' ? (
                                                            <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide flex items-center gap-1">
                                                                <TrendingDown className="w-3 h-3" /> Precio Elevado
                                                            </span>
                                                        ) : (
                                                            <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide flex items-center gap-1">
                                                                <AlertCircle className="w-3 h-3" /> Frecuencia Anormal
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-slate-400 font-medium">
                                                        {new Date(alert.created_at).toLocaleDateString()}
                                                    </span>
                                                </div>

                                                {/* Info de la alerta */}
                                                <p className="font-bold text-slate-800 text-lg mb-1">{alert.vehicle_plate}</p>
                                                <p className="text-sm text-slate-600 leading-snug">
                                                    {alert.message}
                                                </p>

                                                {/* Valores de comparación */}
                                                <div className="mt-3 p-3 bg-slate-50 rounded-xl flex justify-between items-center border border-slate-100">
                                                    <div className="text-center">
                                                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Registrado</p>
                                                        <p className="font-semibold text-slate-700">
                                                            {alert.alert_type === 'PRICE_HIGH' ? formatCurrency(alert.actual_value) : `${alert.actual_value} días`}
                                                        </p>
                                                    </div>
                                                    <div className="h-6 w-px bg-slate-200" />
                                                    <div className="text-center">
                                                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Esperado</p>
                                                        <p className="font-semibold text-emerald-600">
                                                            {alert.alert_type === 'PRICE_HIGH' ? formatCurrency(alert.expected_value) : `${alert.expected_value} días mín.`}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Acción */}
                                                <button
                                                    onClick={() => resolveAlert(alert.id)}
                                                    className="mt-3 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-xl transition-colors"
                                                >
                                                    Marcar Revisado
                                                </button>
                                            </div>
                                        ))}

                                        {dashboard.active_alerts.length < activeAlertsCount && (
                                            <p className="text-[11px] text-slate-400 text-center pt-2">
                                                Mostrando las {dashboard.active_alerts.length} alertas más recientes de {activeAlertsCount} activas.
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* Botón flotante para reabrir alertas cuando el buzón está colapsado */}
            {!showAlerts && activeAlertsCount > 0 && (
                <div className="fixed bottom-6 right-6 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <button
                        onClick={() => {
                            setShowAlerts(true);
                            try { localStorage.setItem("audits_show_alerts", "true"); } catch {}
                        }}
                        className="flex items-center gap-2.5 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 hover:bg-slate-800 hover:scale-105 transition-all group"
                    >
                        <div className="relative">
                            <BellIcon className="w-5 h-5 text-amber-400" />
                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
                        </div>
                        <span className="text-sm font-bold">Ver {activeAlertsCount} {activeAlertsCount === 1 ? "alerta pendiente" : "alertas pendientes"}</span>
                    </button>
                </div>
            )}
        </div>
    );
}
