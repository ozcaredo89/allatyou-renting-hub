import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import { Eye, X, User, FileText, Truck, Edit, Save, History, Trash2, Gauge, Fuel, Share2 } from "lucide-react";
import { ImageViewer } from "../components/ImageViewer";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

const PHOTO_LABELS: Record<string, string> = {
    front: "Frente",
    back: "Atrás",
    left: "Lado Izquierdo",
    right: "Lado Derecho",
    engine: "Motor",
    interior_dash: "Tablero",
    interior_front: "Sillas Delanteras",
    interior_back: "Sillas Traseras",
    tires_front_left: "Llanta Del. Izq.",
    tires_front_right: "Llanta Del. Der.",
    tires_back_left: "Llanta Tras. Izq.",
    tires_back_right: "Llanta Tras. Der."
};

const FUEL_OPTIONS = [
    { value: "empty", label: "Vacío", short: "E", color: "text-rose-600 bg-rose-50 border-rose-200" },
    { value: "1/4", label: "1/4", short: "1/4", color: "text-amber-600 bg-amber-50 border-amber-200" },
    { value: "1/2", label: "1/2", short: "1/2", color: "text-yellow-700 bg-yellow-50 border-yellow-200" },
    { value: "3/4", label: "3/4", short: "3/4", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    { value: "full", label: "Lleno", short: "F", color: "text-emerald-700 bg-emerald-100 border-emerald-300" },
];

type InspectionLog = {
    id: number;
    actor_name: string;
    change_summary: string;
    created_at: string;
};

type Inspection = {
    id: number;
    vehicle_plate: string;
    driver_id: number;
    driver?: { id?: number; full_name?: string; phone?: string };
    created_at: string;
    type: string;
    mileage?: number | null;
    fuel_level?: string | null;
    photos: Record<string, string>;
    comments: string;
    inspector_name: string;
};

export default function AdminInspections() {
    const [inspections, setInspections] = useState<Inspection[]>([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState<Inspection | null>(null);

    // Estados de Edición y Logs
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Inspection>>({});
    const [logs, setLogs] = useState<InspectionLog[]>([]);
    const [showLogs, setShowLogs] = useState(false);
    const [saving, setSaving] = useState(false);
    const [viewingImages, setViewingImages] = useState<{ urls: { url: string; title?: string }[]; startingIndex: number } | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    // Cargar logs cuando se selecciona una inspección
    useEffect(() => {
        if (selected?.id) {
            fetch(`${API}/inspections/${selected.id}/logs`)
                .then(res => res.json())
                .then(data => setLogs(Array.isArray(data) ? data : []))
                .catch(console.error);
        }
    }, [selected]);

    const loadData = async () => {
        setLoading(true);
        try {
            const auth = ensureBasicAuth();
            const res = await fetch(`${API}/inspections`, { headers: { Authorization: auth } });

            if (res.status === 401) {
                clearBasicAuth();
                window.location.reload();
                return;
            }

            const data = await res.json();
            setInspections(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString("es-CO", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
        });
    };

    // --- HANDLERS DE EDICIÓN ---

    const handleEditClick = () => {
        setEditForm({ ...selected }); // Copiar datos al form temporal
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditForm({});
    };

    const removePhoto = (photoKey: string) => {
        if (!editForm.photos) return;
        const newPhotos = { ...editForm.photos };
        delete newPhotos[photoKey];
        setEditForm({ ...editForm, photos: newPhotos });
    };

    const handleSaveChanges = async () => {
        if (!selected) return;

        const reason = prompt("Por favor ingresa el motivo del cambio (Obligatorio para auditoría):");
        if (!reason) return; // Obligar a poner motivo

        setSaving(true);
        try {
            const auth = ensureBasicAuth();
            const res = await fetch(`${API}/inspections/${selected.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", Authorization: auth },
                body: JSON.stringify({
                    ...editForm,
                    editor_name: "Admin",
                    change_summary: reason
                })
            });

            if (!res.ok) throw new Error("Error actualizando");

            alert("✅ Cambios guardados correctamente");
            setIsEditing(false);
            loadData(); // Recargar tabla principal

            // Actualizar el seleccionado en caliente
            const updated = await res.json();
            setSelected(updated.inspection);

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Error al actualizar";
            alert(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleShareWhatsApp = (insp: Inspection) => {
        const viewUrl = `${window.location.origin}/inspection/${insp.id}`;
        const kmText = insp.mileage ? `${Number(insp.mileage).toLocaleString("es-CO")} km` : "No registrado";
        const fuelText = insp.fuel_level ? insp.fuel_level : "No registrado";
        const typeLabel = insp.type === "entrega" ? "Entrega" : insp.type === "recepcion" ? "Recepción" : "Control General";

        const text = `📋 *ACTA DE INSPECCIÓN VEHICULAR*\n🚗 *Vehículo:* ${insp.vehicle_plate}\n📅 *Fecha:* ${formatDate(insp.created_at)}\n🔍 *Tipo:* ${typeLabel}\n👤 *Inspector:* ${insp.inspector_name || "N/A"}\n🛣️ *Kilometraje:* ${kmText}\n⛽ *Combustible:* ${fuelText}\n\n📸 *Ver reporte y fotos:* ${viewUrl}`;

        const cleanPhone = (insp.driver?.phone || "").replace(/\D/g, "");
        const waUrl = cleanPhone
            ? `https://wa.me/57${cleanPhone.startsWith("57") ? cleanPhone.slice(2) : cleanPhone}?text=${encodeURIComponent(text)}`
            : `https://wa.me/?text=${encodeURIComponent(text)}`;

        window.open(waUrl, "_blank");
    };

    const TypeBadge = ({ type }: { type: string }) => {
        const styles = {
            entrega: "bg-emerald-100 text-emerald-700",
            recepcion: "bg-blue-100 text-blue-700",
            general: "bg-slate-100 text-slate-600"
        };
        const color = styles[type as keyof typeof styles] || styles.general;
        return <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${color}`}>{type}</span>;
    };

    const FuelBadge = ({ level }: { level?: string | null }) => {
        if (!level) return <span className="text-slate-400 text-xs">-</span>;
        const opt = FUEL_OPTIONS.find(f => f.value === level);
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${opt?.color || "text-slate-600 bg-slate-100 border-slate-200"}`}>
                <Fuel className="w-3 h-3" /> {opt?.label || level}
            </span>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* HEADER */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Auditoría de Inspecciones</h1>
                        <p className="text-slate-500 text-sm">Registro histórico de revisiones de flota, odómetro y estado de combustible</p>
                    </div>
                    <button onClick={loadData} className="text-sm text-emerald-600 font-bold hover:underline">
                        Refrescar Lista
                    </button>
                </div>

                {/* TABLA PRINCIPAL */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4">Fecha</th>
                                    <th className="px-6 py-4">Vehículo</th>
                                    <th className="px-6 py-4">Conductor</th>
                                    <th className="px-6 py-4">Tipo</th>
                                    <th className="px-6 py-4">Kilometraje</th>
                                    <th className="px-6 py-4">Combustible</th>
                                    <th className="px-6 py-4">Inspector</th>
                                    <th className="px-6 py-4 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {loading ? (
                                    <tr><td colSpan={8} className="p-8 text-center text-slate-400">Cargando...</td></tr>
                                ) : inspections.length === 0 ? (
                                    <tr><td colSpan={8} className="p-8 text-center text-slate-400">No hay registros aún.</td></tr>
                                ) : (
                                    inspections.map(i => (
                                        <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-mono text-slate-600 whitespace-nowrap">{formatDate(i.created_at)}</td>
                                            <td className="px-6 py-4 font-black">{i.vehicle_plate}</td>
                                            <td className="px-6 py-4 text-slate-600">{i.driver?.full_name || "N/A"}</td>
                                            <td className="px-6 py-4"><TypeBadge type={i.type} /></td>
                                            <td className="px-6 py-4 font-mono font-bold text-slate-700">
                                                {i.mileage ? `${Number(i.mileage).toLocaleString("es-CO")} km` : "-"}
                                            </td>
                                            <td className="px-6 py-4"><FuelBadge level={i.fuel_level} /></td>
                                            <td className="px-6 py-4 text-slate-500 text-xs uppercase">{i.inspector_name || "-"}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => handleShareWhatsApp(i)}
                                                        className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-full transition-colors"
                                                        title="Compartir por WhatsApp"
                                                    >
                                                        <Share2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => { setSelected(i); setIsEditing(false); setShowLogs(false); }}
                                                        className="text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors"
                                                        title="Ver Detalle"
                                                    >
                                                        <Eye className="w-4 h-4" />
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
            </div>

            {/* MODAL / VISOR DE DETALLE */}
            {selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden relative">

                        {/* HEADER DEL MODAL */}
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div className="flex items-center gap-4">
                                <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                                    <span className="block text-xs text-slate-400 font-bold uppercase">Placa</span>
                                    <span className="text-xl font-black text-slate-800">{selected.vehicle_plate}</span>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        {isEditing ? (
                                            <select
                                                className="p-1 border border-slate-300 rounded text-xs bg-white"
                                                value={editForm.type}
                                                onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                                            >
                                                <option value="general">General</option>
                                                <option value="entrega">Entrega</option>
                                                <option value="recepcion">Recepción</option>
                                            </select>
                                        ) : (
                                            <TypeBadge type={selected.type} />
                                        )}
                                        <span className="text-xs text-slate-400 font-mono">{formatDate(selected.created_at)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-slate-600">
                                        <User className="w-4 h-4" />
                                        <span className="font-bold">{selected.driver?.full_name || "Sin conductor"}</span>
                                        {selected.driver?.phone && (
                                            <span className="text-xs text-slate-400 font-mono">({selected.driver.phone})</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {/* BOTONES DE ACCIÓN */}
                                {!isEditing && (
                                    <>
                                        <button
                                            onClick={() => handleShareWhatsApp(selected)}
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold transition-colors"
                                            title="Compartir por WhatsApp"
                                        >
                                            <Share2 className="w-3.5 h-3.5" /> WhatsApp
                                        </button>
                                        <button
                                            onClick={() => setShowLogs(!showLogs)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${showLogs ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            <History className="w-3.5 h-3.5" /> Logs
                                        </button>
                                        <button
                                            onClick={handleEditClick}
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold transition-colors"
                                        >
                                            <Edit className="w-3.5 h-3.5" /> Editar
                                        </button>
                                    </>
                                )}

                                {isEditing && (
                                    <>
                                        <button
                                            onClick={handleCancelEdit}
                                            disabled={saving}
                                            className="px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleSaveChanges}
                                            disabled={saving}
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-bold shadow-lg"
                                        >
                                            <Save className="w-3.5 h-3.5" /> {saving ? "Guardando..." : "Guardar"}
                                        </button>
                                    </>
                                )}

                                <div className="w-px h-6 bg-slate-200 mx-2"></div>
                                <button onClick={() => setSelected(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                                    <X className="w-6 h-6 text-slate-500" />
                                </button>
                            </div>
                        </div>

                        {/* CONTENIDO SCROLLABLE */}
                        <div className="flex-1 overflow-y-auto p-6 bg-slate-100 relative space-y-6">

                            {/* OVERLAY DE LOGS */}
                            {showLogs && (
                                <div className="absolute top-0 right-0 w-80 h-full bg-white border-l border-slate-200 shadow-xl z-20 overflow-y-auto p-4 animate-in slide-in-from-right duration-200">
                                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2">
                                        <History className="w-4 h-4" /> Historial de Cambios
                                    </h3>
                                    <div className="space-y-4">
                                        {logs.length === 0 ? <p className="text-xs text-slate-400">Sin cambios registrados.</p> : logs.map(log => (
                                            <div key={log.id} className="border-b border-slate-100 pb-2">
                                                <p className="text-xs font-bold text-slate-700">{log.actor_name}</p>
                                                <p className="text-[10px] text-slate-500 mb-1">{formatDate(log.created_at)}</p>
                                                <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded italic">"{log.change_summary}"</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* TARJETAS DE ODÓMETRO Y COMBUSTIBLE */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Odómetro */}
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                            <Gauge className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Odómetro</span>
                                            {isEditing ? (
                                                <input
                                                    type="number"
                                                    value={editForm.mileage ?? ""}
                                                    onChange={e => setEditForm({ ...editForm, mileage: e.target.value ? Number(e.target.value) : null })}
                                                    placeholder="Kilometraje"
                                                    className="w-32 p-1 text-sm border border-slate-300 rounded font-bold"
                                                />
                                            ) : (
                                                <p className="text-lg font-black text-slate-800">
                                                    {selected.mileage ? `${Number(selected.mileage).toLocaleString("es-CO")} km` : "No registrado"}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Combustible */}
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                            <Fuel className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Combustible</span>
                                            {isEditing ? (
                                                <select
                                                    value={editForm.fuel_level || ""}
                                                    onChange={e => setEditForm({ ...editForm, fuel_level: e.target.value || null })}
                                                    className="p-1 text-xs border border-slate-300 rounded font-bold bg-white"
                                                >
                                                    <option value="">-- Sin registrar --</option>
                                                    {FUEL_OPTIONS.map(f => (
                                                        <option key={f.value} value={f.value}>{f.label}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <p className="text-lg font-black text-slate-800">
                                                    {FUEL_OPTIONS.find(f => f.value === selected.fuel_level)?.label || selected.fuel_level || "No registrado"}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* REPORTE ESCRITO */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                                <div className="flex items-center gap-2 mb-3 text-emerald-700">
                                    <FileText className="w-5 h-5" />
                                    <h3 className="font-bold uppercase tracking-wider text-sm">Reporte / Observaciones</h3>
                                </div>
                                {isEditing ? (
                                    <textarea
                                        className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none h-32"
                                        value={editForm.comments || ""}
                                        onChange={e => setEditForm({ ...editForm, comments: e.target.value })}
                                    />
                                ) : (
                                    <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                                        {selected.comments || "Sin observaciones registradas."}
                                    </p>
                                )}
                            </div>

                            {/* GALERÍA DE FOTOS */}
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-slate-700 uppercase text-xs tracking-wider">Evidencia Fotográfica</h3>
                                    {isEditing && (
                                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200">
                                            ⚠️ Nota: Para agregar fotos nuevas, usa la App móvil. Aquí solo puedes eliminar erróneas.
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {Object.entries(isEditing ? (editForm.photos || {}) : selected.photos).map(([key, url], idx, arr) => {
                                        const allPhotos = arr.map(([k, u]) => ({ url: u as string, title: PHOTO_LABELS[k] || k }));
                                        return (
                                            <div key={key} className="group relative bg-white p-2 rounded-xl shadow-sm border border-slate-200 break-inside-avoid">
                                                <div className="mb-2 px-1 flex justify-between items-center">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate max-w-[80%]">
                                                        {PHOTO_LABELS[key] || key}
                                                    </span>
                                                    {isEditing && (
                                                        <button onClick={() => removePhoto(key)} className="text-red-400 hover:text-red-600" title="Eliminar Foto">
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-100 cursor-zoom-in relative">
                                                    <img
                                                        src={url as string}
                                                        alt={key}
                                                        className={`h-full w-full object-cover ${!isEditing && 'transition-transform duration-500 group-hover:scale-110'}`}
                                                        onClick={() => !isEditing && setViewingImages({ urls: allPhotos, startingIndex: idx })}
                                                    />
                                                    {!isEditing && <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" onClick={() => !isEditing && setViewingImages({ urls: allPhotos, startingIndex: idx })} />}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {Object.keys(selected.photos).length === 0 && (
                                    <div className="text-center py-10 text-slate-400">
                                        <Truck className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                        <p>No se adjuntaron fotografías en esta inspección.</p>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {/* VISOR GLOBAL DE IMÁGENES */}
            {viewingImages && (
                <ImageViewer
                    images={viewingImages.urls}
                    initialIndex={viewingImages.startingIndex}
                    onClose={() => setViewingImages(null)}
                />
            )}

        </div>
    );
}
