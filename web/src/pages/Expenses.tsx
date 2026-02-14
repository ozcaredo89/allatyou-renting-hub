import { useMemo, useState, useEffect } from "react";
import { BillGeneratorModal } from "../components/BillGeneratorModal"; // <--- IMPORT DEL MODAL

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

const SUPPORT_WA_NUMBER = "573113738912";

type DriverFlat = {
  plate: string;
  driver_name: string;
  has_credit: boolean;
  default_amount: number | null;
  default_installment: number | null;
};
type DriverResp = { found: false } | { found: true; driver: DriverFlat } | DriverFlat;

type SavedExpensePreview = {
  date: string;
  item: string;
  description: string;
  total: number;
  plates: string[];
  perVehicle: number;
};

type ExpenseAttachment = {
  kind: "evidence" | "invoice" | "legacy";
  url: string;
};

type ExpenseRow = {
  id: number;
  date: string;
  item: string;
  description: string;
  total_amount: number;
  attachment_url: string | null;
  expense_attachments?: { kind: "evidence" | "invoice"; url: string }[];
  expense_vehicles: { plate: string; share_amount: number }[];
};

export default function Expenses() {

  const [recent, setRecent] = useState<ExpenseRow[]>([]);
  async function loadRecent() {
    const rs = await fetch(`${API}/expenses?limit=20`); // Traemos un poco más
    if (!rs.ok) return;
    const json = await rs.json();
    setRecent(json.items);
  }
  useEffect(() => { loadRecent(); }, []);

  // --- ESTADOS DE SELECCIÓN DE GASTOS ---
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBillModal, setShowBillModal] = useState(false);

  const toggleSelect = (id: number) => {
     setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectedTotal = useMemo(() => {
     return recent
        .filter(r => selectedIds.includes(r.id))
        .reduce((sum, r) => sum + Number(r.total_amount), 0);
  }, [selectedIds, recent]);
  // --------------------------------------

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState(""); 
  const [plates, setPlates] = useState<string[]>([]);
  const [plateInput, setPlateInput] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [editEvidenceFiles, setEditEvidenceFiles] = useState<File[]>([]);
  const [editInvoiceFiles, setEditInvoiceFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  const normalizedPlate = useMemo(
    () => plateInput.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    [plateInput]
  );
  const plateFormatValid = useMemo(() => PLATE_RE.test(normalizedPlate), [normalizedPlate]);
  const [checking, setChecking] = useState<"idle" | "checking" | "ok" | "missing">("idle");
  const [driverName, setDriverName] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    async function run() {
      setDriverName(null);
      if (!plateFormatValid) { setChecking("idle"); return; }
      setChecking("checking");
      try {
        const rs = await fetch(`${API}/drivers/${normalizedPlate}`);
        if (cancel) return;
        if (!rs.ok) { setChecking("missing"); return; }
        const raw: DriverResp = await rs.json();
        let exists = false;
        let d: DriverFlat | null = null;
        if ("found" in raw) { exists = raw.found === true; d = (raw as any).driver ?? null; } 
        else if ("plate" in raw) { exists = true; d = raw as DriverFlat; }
        setChecking(exists ? "ok" : "missing");
        setDriverName(d?.driver_name ?? null);
      } catch { setChecking("missing"); }
    }
    (normalizedPlate.length >= 3) ? run() : setChecking("idle");
    return () => { cancel = true; };
  }, [normalizedPlate, plateFormatValid]);

  const total = useMemo(() => Number((amountStr || "").replace(/[^\d]/g, "")) || 0, [amountStr]);
  const share = useMemo(() => (plates.length ? Math.floor(total / plates.length) : 0), [total, plates.length]);

  function addPlate() {
    const next = normalizedPlate;
    if (!PLATE_RE.test(next)) return;
    if (checking !== "ok") return;
    if (plates.includes(next)) return;
    setPlates([...plates, next]);
    setPlateInput("");
    setChecking("idle");
    setDriverName(null);
  }
  function removePlate(p: string) { setPlates(plates.filter((x) => x !== p)); }

  async function uploadMany(files: File[]): Promise<string[]> {
    const urls: string[] = [];
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      const rs = await fetch(`${API}/uploads`, { method: "POST", body: fd });
      if (!rs.ok) throw new Error("upload failed");
      const json = await rs.json();
      urls.push(json.url as string);
    }
    return urls;
  }

  const [saved, setSaved] = useState<SavedExpensePreview | null>(null);
  const [showModal, setShowModal] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item.trim()) return alert("Item requerido");
    if (!plates.length) return alert("Agrega al menos una placa");
    setLoading(true);
    try {
      const evidenceUrls = await uploadMany(evidenceFiles);
      const invoiceUrls  = await uploadMany(invoiceFiles);
      const attachments = [
        ...evidenceUrls.map((url) => ({ kind: "evidence" as const, url })),
        ...invoiceUrls.map((url) => ({ kind: "invoice" as const, url })),
      ];
      const body = {
        date, item: item.trim(), description: description.trim() || null,
        total_amount:total, plates, attachments,
      };
      const rs = await fetch(`${API}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!rs.ok) throw new Error(await rs.text());
      const preview: SavedExpensePreview = {
        date, item: item.trim(), description: description.trim(),
        total, plates: [...plates],
        perVehicle: plates.length ? Math.floor(total / plates.length) : 0,
      };
      setSaved(preview);
      setShowModal(true);
      await loadRecent();
      setAmountStr(""); setPlates([]); setEvidenceFiles([]); setInvoiceFiles([]);
    } catch { alert("Error creando gasto"); } 
    finally { setLoading(false); }
  }

  function sendWhatsapp() {
    if (!saved) return;
    const msg = `Gasto: ${saved.item} - $${fmtCOP.format(saved.total)}`;
    const url = `https://wa.me/${SUPPORT_WA_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="min-h-screen p-6 pb-32"> {/* Padding extra abajo para la barra flotante */}
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Registrar gasto</h1>

        <form onSubmit={onSubmit} className="rounded-2xl border bg-white p-5 shadow-sm grid gap-4 md:grid-cols-3">
          {/* ... Inputs de Fecha, Item, Descripción ... */}
          <div>
            <label className="mb-1 block text-sm font-medium">Fecha</label>
            <input className="w-full rounded-xl border px-3 py-2" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Item</label>
            <input className="w-full rounded-xl border px-3 py-2" placeholder="Seguro / Mantenimiento..." value={item} onChange={(e) => setItem(e.target.value)} required />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-sm font-medium">Descripción</label>
            <input className="w-full rounded-xl border px-3 py-2" placeholder="Detalle corto" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Monto total (COP)</label>
            <input className="w-full rounded-xl border px-3 py-2" inputMode="numeric" placeholder="150.000" value={fmtCOP.format(total)} 
                   onChange={(e) => setAmountStr(e.target.value.replace(/[^\d]/g, ""))} required />
          </div>

          {/* Placas */}
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Placas (múltiples)</label>
            <div className="flex gap-2">
              <input className={`flex-1 rounded-xl border px-3 py-2 ${normalizedPlate && !plateFormatValid ? "border-red-500" : "border-gray-300"}`}
                     placeholder="ABC123" value={plateInput} onChange={(e) => setPlateInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={6} />
              <button type="button" onClick={addPlate} disabled={!plateFormatValid || checking !== "ok"} className="rounded-xl border px-3 disabled:opacity-50">Agregar</button>
            </div>
            {/* Etiquetas de placas seleccionadas */}
            <div className="mt-2 flex flex-wrap gap-2">
              {plates.map((p) => (
                <span key={p} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                  {p} <button type="button" onClick={() => removePlate(p)} className="text-gray-500">×</button>
                </span>
              ))}
            </div>
          </div>

          {/* Adjuntos (Simplificado visualmente, lógica igual) */}
          <div className="md:col-span-3 grid md:grid-cols-2 gap-4">
             <div>
                <label className="text-sm font-medium">Evidencias (Fotos)</label>
                <input type="file" multiple className="w-full text-sm mt-1" onChange={e => setEvidenceFiles(Array.from(e.target.files || []))} />
             </div>
             <div>
                <label className="text-sm font-medium">Facturas</label>
                <input type="file" multiple className="w-full text-sm mt-1" onChange={e => setInvoiceFiles(Array.from(e.target.files || []))} />
             </div>
          </div>

          <div className="md:col-span-3 flex justify-end gap-2 pt-2">
            <button disabled={loading || !plates.length} className="rounded-xl bg-black px-5 py-2.5 text-white disabled:opacity-50">
              {loading ? "Guardando..." : "Guardar gasto"}
            </button>
          </div>
        </form>

        {/* LISTADO DE GASTOS CON CHECKBOXES */}
        <h2 className="mt-8 mb-3 text-xl font-semibold flex justify-between items-center">
          <span>Últimos gastos</span>
          {selectedIds.length > 0 && <span className="text-sm text-emerald-600 font-bold">{selectedIds.length} seleccionados</span>}
        </h2>
        
        <div className="space-y-3">
          {recent.map((e) => {
            const isSelected = selectedIds.includes(e.id);
            const plates = e.expense_vehicles?.map((v) => v.plate) ?? [];
            return (
              <div key={e.id} className={`rounded-2xl border p-4 shadow-sm transition-colors ${isSelected ? 'bg-emerald-50 border-emerald-300' : 'bg-white'}`}>
                <div className="flex gap-4">
                  
                  {/* CHECKBOX GRANDE */}
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      className="w-6 h-6 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      checked={isSelected}
                      onChange={() => toggleSelect(e.id)}
                    />
                  </div>

                  <div className="flex-1">
                    <div className="flex justify-between">
                       <div className="font-semibold text-slate-800">{e.item}</div>
                       <div className="font-bold">${fmtCOP.format(Number(e.total_amount))}</div>
                    </div>
                    <div className="text-sm text-gray-500">{e.date} — {e.description || "Sin descripción"}</div>
                    <div className="text-xs mt-1 text-slate-400">Placas: {plates.join(", ")}</div>
                  </div>

                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* --- BARRA FLOTANTE (ACTION BAR) --- */}
      {selectedIds.length > 0 && (
         <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 z-40 animate-in slide-in-from-bottom duration-300">
            <div className="text-sm">
               <span className="font-bold block text-emerald-400">{selectedIds.length} Items</span>
               <span className="text-slate-300">Total: ${fmtCOP.format(selectedTotal)}</span>
            </div>
            <button 
              onClick={() => setShowBillModal(true)}
              className="bg-white text-slate-900 px-5 py-2 rounded-full font-bold hover:bg-emerald-50 transition-colors shadow-lg"
            >
              Generar Cuenta de Cobro
            </button>
            <button onClick={() => setSelectedIds([])} className="text-slate-400 hover:text-white p-1 rounded-full"><span className="sr-only">Cancelar</span>×</button>
         </div>
      )}

      {/* --- MODAL DE CUENTA DE COBRO --- */}
      <BillGeneratorModal 
         isOpen={showBillModal} 
         onClose={() => setShowBillModal(false)} 
         selectedExpenses={recent.filter(r => selectedIds.includes(r.id))}
      />

      {/* Modal Confirmación WhatsApp (Existente) */}
      {showModal && saved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
             <h2 className="mb-3 text-xl font-semibold">Gasto Guardado</h2>
             <p className="mb-4">¿Deseas enviar el reporte por WhatsApp?</p>
             <div className="flex justify-end gap-2">
                <button onClick={() => setShowModal(false)} className="rounded-xl border px-4 py-2">Cerrar</button>
                <button onClick={sendWhatsapp} className="rounded-xl bg-green-600 px-4 py-2 text-white">WhatsApp</button>
             </div>
          </div>
        </div>
      )}

    </div>
  );
}