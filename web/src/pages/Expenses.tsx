import { useMemo, useState, useEffect } from "react";
import { BillGeneratorModal } from "../components/BillGeneratorModal"; 
import { Pencil, X, AlertCircle, ChevronDown, CheckCircle2 } from "lucide-react"; 

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

const SUPPORT_WA_NUMBER = "573113738912";

// Tipos
type SavedExpensePreview = {
  date: string;
  item: string;
  description: string;
  total: number;
  plates: string[];
  perVehicle: number;
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
  
  // --- ESTADO DE CARGA Y PAGINACIÓN ---
  const [limit, setLimit] = useState(20);
  const [recent, setRecent] = useState<ExpenseRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  async function loadRecent(currentLimit: number) {
    setLoadingList(true);
    try {
      const rs = await fetch(`${API}/expenses?limit=${currentLimit}`); 
      if (!rs.ok) return;
      const json = await rs.json();
      setRecent(json.items);
    } finally {
      setLoadingList(false);
    }
  }

  // Cargar al inicio y cuando cambie el límite
  useEffect(() => { loadRecent(limit); }, [limit]);

  const handleLoadMore = () => {
    setLimit(prev => prev + 20);
  };

  // --- SELECCIÓN MÚLTIPLE ---
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

  // --- FORMULARIO CREAR ---
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState(""); 
  const [plates, setPlates] = useState<string[]>([]);
  const [plateInput, setPlateInput] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  // --- FORMULARIO EDITAR ---
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  // Estados temporales para el modal de edición
  const [editDate, setEditDate] = useState("");
  const [editItem, setEditItem] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editAmountStr, setEditAmountStr] = useState("");
  const [editEvidenceFiles, setEditEvidenceFiles] = useState<File[]>([]);
  const [editInvoiceFiles, setEditInvoiceFiles] = useState<File[]>([]);

  // Abrir modal de edición y poblar datos
  const openEditModal = (e: ExpenseRow) => {
    setEditingExpense(e);
    setEditDate(e.date);
    setEditItem(e.item);
    setEditDesc(e.description || "");
    setEditAmountStr(String(e.total_amount));
    setEditEvidenceFiles([]);
    setEditInvoiceFiles([]);
  };

  // Lógica de Placas (Igual que antes)
  const normalizedPlate = useMemo(() => plateInput.toUpperCase().replace(/[^A-Z0-9]/g, ""), [plateInput]);
  const plateFormatValid = useMemo(() => PLATE_RE.test(normalizedPlate), [normalizedPlate]);
  const [checking, setChecking] = useState<"idle" | "checking" | "ok" | "missing">("idle");
  
  useEffect(() => {
    let cancel = false;
    async function run() {
      if (!plateFormatValid) { setChecking("idle"); return; }
      setChecking("checking");
      try {
        const rs = await fetch(`${API}/drivers/${normalizedPlate}`);
        if (cancel) return;
        if (!rs.ok) { setChecking("missing"); return; }
        const raw = await rs.json();
        const exists = "found" in raw ? raw.found : "plate" in raw;
        setChecking(exists ? "ok" : "missing");
      } catch { setChecking("missing"); }
    }
    (normalizedPlate.length >= 3) ? run() : setChecking("idle");
    return () => { cancel = true; };
  }, [normalizedPlate, plateFormatValid]);

  const total = useMemo(() => Number((amountStr || "").replace(/[^\d]/g, "")) || 0, [amountStr]);

  function addPlate() {
    if (!plateFormatValid || checking !== "ok" || plates.includes(normalizedPlate)) return;
    setPlates([...plates, normalizedPlate]);
    setPlateInput("");
    setChecking("idle");
  }

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

  // SUBMIT NUEVO GASTO
  const [saved, setSaved] = useState<SavedExpensePreview | null>(null);
  const [showModal, setShowModal] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item.trim() || !plates.length) return alert("Faltan datos");
    setLoading(true);
    try {
      const evUrls = await uploadMany(evidenceFiles);
      const invUrls = await uploadMany(invoiceFiles);
      const attachments = [
        ...evUrls.map(u => ({ kind: "evidence" as const, url: u })),
        ...invUrls.map(u => ({ kind: "invoice" as const, url: u })),
      ];
      const body = { date, item, description: description || null, total_amount: total, plates, attachments };
      const rs = await fetch(`${API}/expenses`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!rs.ok) throw new Error(await rs.text());
      
      setSaved({ date, item, description, total, plates: [...plates], perVehicle: Math.floor(total / plates.length) });
      setShowModal(true);
      await loadRecent(limit);
      
      // Reset form
      setItem(""); setDescription(""); setAmountStr(""); setPlates([]); setEvidenceFiles([]); setInvoiceFiles([]);
    } catch { alert("Error creando gasto"); } 
    finally { setLoading(false); }
  }

  // SUBMIT EDICIÓN
  async function onSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingExpense) return;
    setLoading(true);
    try {
      // 1. Actualizar datos básicos
      const updateBody = {
        date: editDate,
        item: editItem,
        description: editDesc,
        total_amount: Number(editAmountStr.replace(/[^\d]/g, ""))
      };
      
      const updateRs = await fetch(`${API}/expenses/${editingExpense.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updateBody)
      });
      if (!updateRs.ok) throw new Error("Error actualizando datos");

      // 2. Subir nuevos adjuntos si los hay
      if (editEvidenceFiles.length > 0 || editInvoiceFiles.length > 0) {
        const evUrls = await uploadMany(editEvidenceFiles);
        const invUrls = await uploadMany(editInvoiceFiles);
        const attachments = [
            ...evUrls.map(u => ({ kind: "evidence" as const, url: u })),
            ...invUrls.map(u => ({ kind: "invoice" as const, url: u })),
        ];
        await fetch(`${API}/expenses/${editingExpense.id}/attachments`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attachments }),
        });
      }

      await loadRecent(limit);
      setEditingExpense(null); // Cerrar modal
    } catch (err) { alert("Error al actualizar"); console.error(err); }
    finally { setLoading(false); }
  }

  // UTILIDADES
  function sendWhatsapp() {
    if (!saved) return;
    const msg = `Gasto: ${saved.item} - $${fmtCOP.format(saved.total)}`;
    window.open(`https://wa.me/${SUPPORT_WA_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function copyMessage() {
    if (!saved) return;
    navigator.clipboard.writeText(`Gasto: ${saved.item} - $${fmtCOP.format(saved.total)}`).then(() => alert("Copiado!"));
  }

  return (
    <div className="min-h-screen p-6 pb-32">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Registrar gasto</h1>

        {/* FORMULARIO PRINCIPAL */}
        <form onSubmit={onSubmit} className="rounded-2xl border bg-white p-5 shadow-sm grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Fecha</label>
            <input className="w-full rounded-xl border px-3 py-2" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Item</label>
            <input className="w-full rounded-xl border px-3 py-2" placeholder="Ej: Aceite" value={item} onChange={e => setItem(e.target.value)} required />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-sm font-medium">Descripción</label>
            <input className="w-full rounded-xl border px-3 py-2" placeholder="Detalle opcional" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Monto</label>
            <input className="w-full rounded-xl border px-3 py-2" inputMode="numeric" placeholder="0" value={fmtCOP.format(total)} 
                   onChange={e => setAmountStr(e.target.value.replace(/[^\d]/g, ""))} required />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Placas</label>
            <div className="flex gap-2">
              <input className={`flex-1 rounded-xl border px-3 py-2 ${normalizedPlate && !plateFormatValid ? "border-red-500" : "border-gray-300"}`}
                     placeholder="ABC123" value={plateInput} onChange={e => setPlateInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={6} />
              <button type="button" onClick={addPlate} disabled={!plateFormatValid || checking !== "ok"} className="rounded-xl border px-3 disabled:opacity-50">Agregar</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {plates.map(p => (
                <span key={p} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">{p} <button type="button" onClick={() => setPlates(plates.filter(x => x !== p))} className="text-gray-500">×</button></span>
              ))}
            </div>
          </div>

          <div className="md:col-span-3 grid md:grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl">
             <div>
                <label className="text-sm font-bold text-slate-700">Evidencias 📷</label>
                <input type="file" multiple className="w-full text-xs mt-1" onChange={e => setEvidenceFiles(Array.from(e.target.files || []))} />
             </div>
             <div>
                <label className="text-sm font-bold text-slate-700">Facturas 📄</label>
                <input type="file" multiple className="w-full text-xs mt-1" onChange={e => setInvoiceFiles(Array.from(e.target.files || []))} />
             </div>
          </div>

          <div className="md:col-span-3 flex justify-end gap-2 pt-2">
            <button disabled={loading || !plates.length} className="rounded-xl bg-black px-5 py-2.5 text-white disabled:opacity-50 font-medium shadow-lg hover:bg-slate-800 transition-all">
              {loading ? "Guardando..." : "Guardar Gasto"}
            </button>
          </div>
        </form>

        {/* LISTADO DE GASTOS */}
        <h2 className="mt-10 mb-4 text-xl font-bold flex justify-between items-center text-slate-800">
          <span>Historial de Gastos</span>
          {selectedIds.length > 0 && <span className="text-sm bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">{selectedIds.length} seleccionados</span>}
        </h2>
        
        <div className="space-y-4">
          {recent.map((e) => {
            const isSelected = selectedIds.includes(e.id);
            const plates = e.expense_vehicles?.map((v) => v.plate) ?? [];
            
            // Lógica de Documentos Faltantes
            const hasEvidence = e.expense_attachments?.some(a => a.kind === "evidence") || (e.attachment_url && !e.expense_attachments?.length); // Legacy support
            const hasInvoice = e.expense_attachments?.some(a => a.kind === "invoice");

            return (
              <div key={e.id} className={`group relative rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${isSelected ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300' : 'bg-white'}`}>
                
                <div className="flex gap-4 items-start">
                  {/* CHECKBOX */}
                  <div className="pt-1">
                    <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      checked={isSelected} onChange={() => toggleSelect(e.id)} />
                  </div>

                  {/* INFO PRINCIPAL */}
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                       <div>
                          <div className="font-bold text-lg text-slate-900">{e.item}</div>
                          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{e.date}</div>
                       </div>
                       <div className="text-right">
                          <div className="font-black text-lg text-slate-800">${fmtCOP.format(Number(e.total_amount))}</div>
                       </div>
                    </div>
                    
                    <div className="text-sm text-slate-600 mb-2">{e.description || <span className="italic text-slate-400">Sin descripción</span>}</div>
                    
                    {/* PLACAS Y ALERTAS */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Placas */}
                        <div className="flex gap-1">
                           {plates.map(p => <span key={p} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">{p}</span>)}
                        </div>

                        {/* Alertas de Faltantes */}
                        {!hasEvidence && (
                           <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
                              <AlertCircle className="w-3 h-3" /> Falta Foto
                           </span>
                        )}
                        {!hasInvoice && (
                           <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                              <AlertCircle className="w-3 h-3" /> Falta Factura
                           </span>
                        )}
                    </div>

                    {/* LISTA DE ADJUNTOS EXISTENTES */}
                    {e.expense_attachments && e.expense_attachments.length > 0 && (
                      <div className="mt-3 flex gap-2 flex-wrap pt-3 border-t border-slate-100 border-dashed">
                        {e.expense_attachments.map((a, idx) => (
                           <a key={idx} href={a.url} target="_blank" rel="noreferrer" 
                              className={`text-xs px-2 py-1 rounded border flex items-center gap-1 hover:brightness-95 ${a.kind === "invoice" ? "bg-purple-50 text-purple-700 border-purple-100" : "bg-blue-50 text-blue-700 border-blue-100"}`}>
                             {a.kind === "evidence" ? "📷 Foto" : "📄 Factura"}
                           </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* BOTÓN EDITAR */}
                  <button onClick={() => openEditModal(e)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors" title="Editar gasto">
                    <Pencil className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* BOTÓN CARGAR MÁS */}
        <div className="mt-8 text-center">
            <button 
              onClick={handleLoadMore}
              disabled={loadingList}
              className="inline-flex items-center gap-2 px-6 py-2 bg-white border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all font-medium text-sm shadow-sm"
            >
               {loadingList ? "Cargando..." : <>Cargar más antiguos <ChevronDown className="w-4 h-4" /></>}
            </button>
        </div>
      </div>

      {/* --- BARRA FLOTANTE (GENERAR COBRO) --- */}
      {selectedIds.length > 0 && (
         <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 z-40 animate-in slide-in-from-bottom duration-300">
            <div className="text-sm">
               <span className="font-bold block text-emerald-400">{selectedIds.length} Items</span>
               <span className="text-slate-300">Total: ${fmtCOP.format(selectedTotal)}</span>
            </div>
            <button onClick={() => setShowBillModal(true)} className="bg-white text-slate-900 px-5 py-2 rounded-full font-bold hover:bg-emerald-50 transition-colors shadow-lg">Generar Cuenta de Cobro</button>
            <button onClick={() => setSelectedIds([])} className="text-slate-400 hover:text-white p-1 rounded-full"><X className="w-5 h-5" /></button>
         </div>
      )}

      {/* --- MODALES --- */}
      <BillGeneratorModal isOpen={showBillModal} onClose={() => setShowBillModal(false)} selectedExpenses={recent.filter(r => selectedIds.includes(r.id))} />

      {/* MODAL NOTIFICACIÓN WHATSAPP */}
      {showModal && saved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
             <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4 text-green-600"><CheckCircle2 className="w-8 h-8"/></div>
             <h2 className="text-xl font-bold text-center mb-1">¡Gasto Guardado!</h2>
             <p className="text-slate-500 text-center text-sm mb-6">¿Deseas enviar el reporte al grupo de WhatsApp?</p>
             <div className="flex gap-2">
                <button onClick={() => setShowModal(false)} className="flex-1 rounded-xl border px-4 py-3 font-medium hover:bg-slate-50">Cerrar</button>
                <button onClick={copyMessage} className="flex-1 rounded-xl border px-4 py-3 font-medium hover:bg-slate-50">Copiar Texto</button>
                <button onClick={sendWhatsapp} className="flex-1 rounded-xl bg-green-600 text-white px-4 py-3 font-bold hover:bg-green-700 shadow-lg shadow-green-200">WhatsApp</button>
             </div>
          </div>
        </div>
      )}

      {/* MODAL EDICIÓN COMPLETO */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setEditingExpense(null)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-800 bg-slate-100 rounded-full p-1"><X className="w-5 h-5" /></button>

            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
               <span className="bg-blue-100 text-blue-600 p-2 rounded-lg"><Pencil className="w-5 h-5" /></span>
               Editar Gasto #{editingExpense.id}
            </h2>

            <form onSubmit={onSubmitEdit} className="space-y-4">
               {/* Campos Básicos */}
               <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Fecha</label>
                    <input type="date" className="w-full p-3 bg-slate-50 border rounded-xl font-medium" value={editDate} onChange={e => setEditDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Monto</label>
                    <input className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-slate-900" value={fmtCOP.format(Number(editAmountStr.replace(/[^\d]/g, "")))} onChange={e => setEditAmountStr(e.target.value.replace(/[^\d]/g, ""))} />
                  </div>
               </div>
               
               <div>
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Item</label>
                  <input className="w-full p-3 bg-slate-50 border rounded-xl font-medium" value={editItem} onChange={e => setEditItem(e.target.value)} />
               </div>

               <div>
                  <label className="text-xs font-bold text-slate-500 uppercase ml-1">Descripción</label>
                  <textarea className="w-full p-3 bg-slate-50 border rounded-xl text-sm" rows={2} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
               </div>

               {/* Sección Adjuntos */}
               <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mt-4">
                  <h3 className="font-bold text-sm text-slate-700 mb-3">Agregar nuevos soportes</h3>
                  <div className="space-y-3">
                     <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Evidencias (Fotos) 📷</label>
                        <input type="file" multiple className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200"
                           onChange={e => setEditEvidenceFiles(Array.from(e.target.files || []))} />
                     </div>
                     <div>
                        <label className="text-xs font-medium text-slate-500 mb-1 block">Facturas (Imágenes) 📄</label>
                        <input type="file" multiple className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200"
                           onChange={e => setEditInvoiceFiles(Array.from(e.target.files || []))} />
                     </div>
                  </div>
               </div>

               <div className="flex gap-3 pt-4">
                 <button type="button" onClick={() => setEditingExpense(null)} className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
                 <button type="submit" disabled={loading} className="flex-1 py-3 bg-black text-white rounded-xl font-bold shadow-lg hover:bg-slate-800 disabled:opacity-50">
                    {loading ? "Guardando..." : "Guardar Cambios"}
                 </button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}