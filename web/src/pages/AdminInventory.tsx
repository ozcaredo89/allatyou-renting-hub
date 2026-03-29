import { useEffect, useState, useCallback } from "react";
import { ensureBasicAuth, requestWithBasicAuth } from "../lib/auth";
import { X, Plus, Package, ArrowUpCircle, ArrowDownCircle, ShoppingCart, Loader2 } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type InventoryItem = {
  id: number;
  category: string;
  name: string;
  unit_cost: number;
  sale_price: number;
  current_stock: number;
  created_at: string;
};

type MovementType = "IN" | "OUT_FLOTA" | "OUT_SALE";

type InventoryMovement = {
  id: number;
  item_id: number;
  movement_type: MovementType;
  quantity: number;
  vehicle_plate: string | null;
  total_value: number;
  created_at: string;
  inventory_items: { name: string; category: string; unit_cost: number } | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const MOVEMENT_LABELS: Record<MovementType, { label: string; color: string; icon: React.ReactNode }> = {
  IN: {
    label: "Entrada (Compra)",
    color: "bg-emerald-100 text-emerald-700",
    icon: <ArrowUpCircle className="w-4 h-4" />,
  },
  OUT_FLOTA: {
    label: "Salida a Flota",
    color: "bg-blue-100 text-blue-700",
    icon: <ArrowDownCircle className="w-4 h-4" />,
  },
  OUT_SALE: {
    label: "Venta Externa",
    color: "bg-amber-100 text-amber-700",
    icon: <ShoppingCart className="w-4 h-4" />,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: CREAR NUEVO ÍTEM
// ─────────────────────────────────────────────────────────────────────────────

type ItemModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function ItemModal({ isOpen, onClose, onSaved }: ItemModalProps) {
  const [form, setForm] = useState({ category: "", name: "", unit_cost: "", sale_price: "", current_stock: "0" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await requestWithBasicAuth(`${API}/inventory/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          name: form.name,
          unit_cost: parseFloat(form.unit_cost) || 0,
          sale_price: parseFloat(form.sale_price) || 0,
          current_stock: parseInt(form.current_stock) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error creando ítem");
      setForm({ category: "", name: "", unit_cost: "", sale_price: "", current_stock: "0" });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-600" />
              Nuevo Ítem de Inventario
            </h2>
            <p className="text-sm text-slate-500 mt-1">Agrega un producto al catálogo del almacén.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-white rounded-full shadow-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Categoría *</label>
              <input
                required
                type="text"
                placeholder="Ej: Aceites, Repuestos Spark GT..."
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Nombre del Producto *</label>
              <input
                required
                type="text"
                placeholder="Ej: Aceite Mobil 10W-40 1L"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Costo Unitario *</label>
              <input
                required
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={form.unit_cost}
                onChange={e => setForm({ ...form, unit_cost: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Precio de Venta</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={form.sale_price}
                onChange={e => setForm({ ...form, sale_price: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Stock Inicial</label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={form.current_stock}
                onChange={e => setForm({ ...form, current_stock: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? "Guardando..." : "Crear Ítem"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODAL: REGISTRAR MOVIMIENTO
// ─────────────────────────────────────────────────────────────────────────────

type MovementModalProps = {
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: () => void;
};

function MovementModal({ item, onClose, onSaved }: MovementModalProps) {
  const [movementType, setMovementType] = useState<MovementType>("IN");
  const [quantity, setQuantity] = useState("1");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!item) return null;

  const unitPrice = movementType === "OUT_SALE" ? item.sale_price : item.unit_cost;
  const qty = Math.max(0, parseInt(quantity) || 0);
  const totalEstimated = unitPrice * qty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      const res = await requestWithBasicAuth(`${API}/inventory/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          movement_type: movementType,
          quantity: qty,
          vehicle_plate: movementType === "OUT_FLOTA" ? vehiclePlate.toUpperCase().trim() : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error registrando movimiento");
      }

      if (data.warning) {
        setSuccessMsg(`✅ Movimiento registrado. ⚠️ Aviso: ${data.warning}`);
      } else if (data.expense) {
        setSuccessMsg(`✅ Movimiento registrado y gasto automático creado (ID #${data.expense.id}) para la placa ${vehiclePlate.toUpperCase()}.`);
      } else {
        setSuccessMsg("✅ Movimiento registrado correctamente.");
      }

      setTimeout(() => {
        onSaved();
        onClose();
      }, 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Registrar Movimiento</h2>
            <p className="text-sm text-emerald-600 font-semibold mt-0.5">{item.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">Stock actual: <span className="font-bold text-slate-600">{item.current_stock}</span> unidades</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 bg-white rounded-full shadow-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm font-medium leading-snug">
              {successMsg}
            </div>
          )}

          {/* TIPO DE MOVIMIENTO */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipo de Movimiento *</label>
            <div className="grid grid-cols-3 gap-2">
              {(["IN", "OUT_FLOTA", "OUT_SALE"] as MovementType[]).map(type => {
                const info = MOVEMENT_LABELS[type];
                const isActive = movementType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setMovementType(type)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                      isActive ? "border-slate-900 bg-slate-900 text-white shadow-lg" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {info.icon}
                    <span className="text-center leading-tight">{type === "IN" ? "Entrada (Compra)" : type === "OUT_FLOTA" ? "Salida a Flota" : "Venta Externa"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CANTIDAD */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cantidad *</label>
            <input
              required
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
          </div>

          {/* PLACA (solo OUT_FLOTA) */}
          {movementType === "OUT_FLOTA" && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Placa del Vehículo *
                <span className="ml-2 text-blue-500 normal-case font-normal">Se creará un gasto automáticamente</span>
              </label>
              <input
                required={movementType === "OUT_FLOTA"}
                type="text"
                placeholder="Ej: ABC123"
                maxLength={6}
                value={vehiclePlate}
                onChange={e => setVehiclePlate(e.target.value.toUpperCase())}
                className="w-full px-4 py-2.5 border border-blue-300 rounded-xl text-sm text-slate-700 font-bold tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
              <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                🔗 Se registrará automáticamente un gasto en el módulo financiero asociado a esta placa.
              </p>
            </div>
          )}

          {/* RESUMEN */}
          {qty > 0 && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Resumen de la Transacción</p>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">{qty} ud × {formatCurrency(unitPrice)}</span>
                <span className="font-bold text-slate-800 text-lg">{formatCurrency(totalEstimated)}</span>
              </div>
              {movementType !== "IN" && item.current_stock < qty && (
                <p className="text-red-600 text-xs font-semibold mt-2">
                  ⚠️ Stock insuficiente ({item.current_stock} disponibles)
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !!successMsg}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? "Guardando..." : "Registrar Movimiento"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "catalog" | "movements";

export default function AdminInventory() {
  const [tab, setTab] = useState<Tab>("catalog");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [movementTarget, setMovementTarget] = useState<InventoryItem | null>(null);

  const fetchItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const res = await requestWithBasicAuth(`${API}/inventory/items`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const fetchMovements = useCallback(async () => {
    setLoadingMovements(true);
    try {
      const res = await requestWithBasicAuth(`${API}/inventory/movements?limit=100`);
      const data = await res.json();
      setMovements(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMovements(false);
    }
  }, []);

  useEffect(() => {
    ensureBasicAuth();
    fetchItems();
    fetchMovements();
  }, [fetchItems, fetchMovements]);

  // Group items by category for a better UX
  const itemsByCategory = items.reduce<Record<string, InventoryItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const totalItems = items.length;
  const totalValue = items.reduce((sum, i) => sum + i.unit_cost * i.current_stock, 0);
  const lowStockCount = items.filter(i => i.current_stock <= 2).length;

  return (
    <div className="min-h-full bg-slate-50 p-4 md:p-8 space-y-6">

      {/* MODALES */}
      <ItemModal isOpen={itemModalOpen} onClose={() => setItemModalOpen(false)} onSaved={fetchItems} />
      <MovementModal item={movementTarget} onClose={() => setMovementTarget(null)} onSaved={() => { fetchItems(); fetchMovements(); }} />

      {/* ENCABEZADO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <span className="text-4xl">📦</span>
            Inventario y Taller
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Gestiona el almacén de repuestos y registra las salidas a flota con integración financiera automática.
          </p>
        </div>
        <button
          onClick={() => setItemModalOpen(true)}
          className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nuevo Ítem
        </button>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Productos en Catálogo</p>
          <p className="text-3xl font-black text-slate-800 mt-1">{totalItems}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Valor en Almacén</p>
          <p className="text-2xl font-black text-emerald-600 mt-1">{formatCurrency(totalValue)}</p>
        </div>
        <div className={`col-span-2 md:col-span-1 rounded-2xl p-5 shadow-sm border ${lowStockCount > 0 ? "bg-red-50 border-red-100" : "bg-white border-slate-100"}`}>
          <p className={`text-xs font-bold uppercase tracking-wider ${lowStockCount > 0 ? "text-red-400" : "text-slate-400"}`}>Stock Crítico (≤2)</p>
          <p className={`text-3xl font-black mt-1 ${lowStockCount > 0 ? "text-red-600" : "text-slate-800"}`}>{lowStockCount}</p>
        </div>
      </div>

      {/* TABS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="flex border-b border-slate-100">
          {([
            { id: "catalog", label: "📋 Catálogo y Stock" },
            { id: "movements", label: "🔄 Movimientos" },
          ] as { id: Tab; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 px-6 py-4 text-sm font-bold transition-colors ${
                tab === t.id
                  ? "border-b-2 border-emerald-500 text-emerald-700 bg-emerald-50/50"
                  : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── TAB: CATÁLOGO Y STOCK ──────────────────────────────────────── */}
        {tab === "catalog" && (
          <div className="p-4 md:p-6">
            {loadingItems ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Package className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-semibold">Sin ítems en el catálogo</p>
                <p className="text-sm mt-1">Crea tu primer producto con el botón "Nuevo Ítem".</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(itemsByCategory).map(([category, catItems]) => (
                  <div key={category}>
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{category}</h3>
                      <div className="flex-1 h-px bg-slate-100" />
                      <span className="text-xs text-slate-400">{catItems.length} producto{catItems.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-100">
                      <table className="w-full text-left border-collapse min-w-[640px]">
                        <thead>
                          <tr className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                            <th className="px-4 py-3 font-bold">Producto</th>
                            <th className="px-4 py-3 font-bold text-right">Costo Unit.</th>
                            <th className="px-4 py-3 font-bold text-right">Precio Venta</th>
                            <th className="px-4 py-3 font-bold text-center">Stock</th>
                            <th className="px-4 py-3 font-bold text-right">Valor Total</th>
                            <th className="px-4 py-3 font-bold text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catItems.map(item => {
                            const isLow = item.current_stock <= 2;
                            return (
                              <tr key={item.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-slate-700 text-sm">{item.name}</p>
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-slate-600 font-medium">
                                  {formatCurrency(item.unit_cost)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-slate-500">
                                  {formatCurrency(item.sale_price)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center justify-center w-10 h-7 rounded-lg text-sm font-bold ${
                                    isLow ? "bg-red-100 text-red-600" : item.current_stock > 10 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                  }`}>
                                    {item.current_stock}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                                  {formatCurrency(item.unit_cost * item.current_stock)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    onClick={() => setMovementTarget(item)}
                                    className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                                  >
                                    + Mov.
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: MOVIMIENTOS ──────────────────────────────────────────── */}
        {tab === "movements" && (
          <div className="p-4 md:p-6">
            {loadingMovements ? (
              <div className="flex justify-center py-16">
                <div className="w-8 h-8 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
              </div>
            ) : movements.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <p className="text-lg font-semibold">Sin movimientos registrados</p>
                <p className="text-sm mt-1">Los movimientos aparecerán aquí tras registrarlos desde el catálogo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                      <th className="px-4 py-3 font-bold">Fecha</th>
                      <th className="px-4 py-3 font-bold">Producto</th>
                      <th className="px-4 py-3 font-bold">Tipo</th>
                      <th className="px-4 py-3 font-bold text-center">Cantidad</th>
                      <th className="px-4 py-3 font-bold">Placa</th>
                      <th className="px-4 py-3 font-bold text-right">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => {
                      const info = MOVEMENT_LABELS[m.movement_type];
                      return (
                        <tr key={m.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(m.created_at)}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-700 text-sm">{m.inventory_items?.name ?? `Item #${m.item_id}`}</p>
                            <p className="text-xs text-slate-400">{m.inventory_items?.category}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${info.color}`}>
                              {info.icon}
                              {info.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-bold text-slate-700">{m.quantity}</span>
                          </td>
                          <td className="px-4 py-3">
                            {m.vehicle_plate ? (
                              <span className="bg-blue-50 text-blue-700 font-bold text-xs px-2.5 py-1 rounded-lg tracking-widest">
                                {m.vehicle_plate}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-800">
                            {formatCurrency(m.total_value)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
