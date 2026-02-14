import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  AlignmentType, // <--- Importante para alineaciones
  HeadingLevel 
} from "docx";
import { saveAs } from "file-saver";
import { X, Plus, FileText, Download, Check, ChevronRight, ChevronLeft } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

interface BillGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedExpenses: any[];
}

export function BillGeneratorModal({ isOpen, onClose, selectedExpenses }: BillGeneratorModalProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // --- DATA STATES ---
  const [providers, setProviders] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  
  // --- SELECCIONES ---
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [billItems, setBillItems] = useState<any[]>([]);

  // --- NUEVO PROVEEDOR FORM ---
  const [isCreatingProvider, setIsCreatingProvider] = useState(false);
  const [newProv, setNewProv] = useState({ name: "", nit_cc: "", contact_phone: "", bank_name: "", account_type: "Ahorros", account_number: "" });

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      fetch(`${API}/providers`).then(r => r.json()).then(setProviders).catch(console.error);
      fetch(`${API}/companies`).then(r => r.json()).then(setCompanies).catch(console.error);
      
      setBillItems(selectedExpenses.map(e => ({
        ...e,
        displayDescription: e.description || e.item 
      })));
    }
  }, [isOpen, selectedExpenses]);

  const handleCreateProvider = async () => {
    if (!newProv.name || !newProv.nit_cc) return alert("Nombre y NIT requeridos");
    setLoading(true);
    try {
      const res = await fetch(`${API}/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProv)
      });
      if(!res.ok) throw new Error("Error creando proveedor");
      const data = await res.json();
      setProviders([...providers, data]);
      setSelectedProviderId(data.id);
      setIsCreatingProvider(false);
    } catch (e) { alert("Error al guardar proveedor"); }
    finally { setLoading(false); }
  };

  const getDocData = () => {
    const provider = providers.find(p => p.id === selectedProviderId);
    const company = companies.find(c => c.id === selectedCompanyId);
    const total = billItems.reduce((sum, item) => sum + Number(item.total_amount), 0);
    return { provider, company, total };
  };

  // --- PDF GENERATOR (Sin cambios, funciona bien) ---
  const generatePDF = () => {
    const { provider, company, total } = getDocData();
    if (!provider || !company) return;

    const doc = new jsPDF();
    
    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(provider.name.toUpperCase(), 105, 20, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "normal");
    doc.text(`NIT/CC: ${provider.nit_cc}`, 105, 26, { align: "center" });
    if(provider.contact_phone) doc.text(`Tel: ${provider.contact_phone}`, 105, 31, { align: "center" });

    doc.setLineWidth(0.5); doc.line(20, 35, 190, 35);
    doc.setFontSize(14); doc.setFont("helvetica", "bold");
    doc.text("CUENTA DE COBRO", 105, 45, { align: "center" });
    
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("CLIENTE:", 20, 55);
    doc.setFont("helvetica", "normal");
    doc.text(company.name, 20, 60);
    doc.text(`NIT: ${company.nit || "---"}`, 20, 65);
    doc.text(`Dirección: ${company.address || "---"}`, 20, 70);
    
    doc.text(`Fecha de expedición: ${new Date().toLocaleDateString()}`, 130, 60);

    autoTable(doc, {
      startY: 80,
      head: [['Fecha Gasto', 'Descripción / Concepto', 'Placas', 'Valor']],
      body: billItems.map(item => [
        item.date,
        item.displayDescription,
        item.expense_vehicles?.map((v:any) => v.plate).join(", ") || "---",
        `$ ${fmtCOP.format(item.total_amount)}`
      ]),
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 20] },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text(`TOTAL A PAGAR: $ ${fmtCOP.format(total)}`, 190, finalY, { align: "right" });

    if (provider.bank_name) {
      doc.setFontSize(10); doc.setFont("helvetica", "normal");
      doc.text("Favor consignar a:", 20, finalY + 10);
      doc.text(`${provider.bank_name} - ${provider.account_type || "Cuenta"}`, 20, finalY + 15);
      doc.text(`N°: ${provider.account_number}`, 20, finalY + 20);
    }

    doc.text("_______________________________", 20, finalY + 40);
    doc.setFont("helvetica", "bold");
    doc.text(provider.name, 20, finalY + 45);
    doc.setFont("helvetica", "normal");
    doc.text(`C.C. / NIT: ${provider.nit_cc}`, 20, finalY + 50);

    doc.save(`Cuenta_Cobro_${provider.name.split(" ")[0]}_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  // --- WORD GENERATOR (CORREGIDO) ---
  const generateWord = async () => {
    const { provider, company, total } = getDocData();
    if (!provider || !company) return;

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          // Encabezado Proveedor
          new Paragraph({ 
            heading: HeadingLevel.HEADING_1, 
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: provider.name.toUpperCase(), bold: true })]
          }),
          new Paragraph({ 
            alignment: AlignmentType.CENTER,
            children: [new TextRun(`NIT/CC: ${provider.nit_cc}`)]
          }),
          new Paragraph({ 
            alignment: AlignmentType.CENTER,
            children: [new TextRun(`Tel: ${provider.contact_phone || ""}`)]
          }),
          new Paragraph({ text: "" }), 

          // Título
          new Paragraph({ 
            heading: HeadingLevel.HEADING_2, 
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "CUENTA DE COBRO", bold: true })]
          }),
          new Paragraph({ text: "" }),
          
          // Cliente (Aquí estaba el error: usamos TextRun para bold)
          new Paragraph({ 
             children: [new TextRun({ text: "CLIENTE:", bold: true })] 
          }),
          new Paragraph({ text: company.name }),
          new Paragraph({ text: `NIT: ${company.nit || "---"}` }),
          new Paragraph({ text: `Dirección: ${company.address || "---"}` }),
          new Paragraph({ text: "" }),

          // Tabla
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({ 
                  children: ["Fecha", "Descripción", "Valor"].map(t => 
                    new TableCell({ 
                      children: [new Paragraph({ 
                        children: [new TextRun({ text: t, bold: true })] 
                      })] 
                    })
                  ) 
                }),
                ...billItems.map(item => new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph(item.date)] }),
                        new TableCell({ children: [new Paragraph(item.displayDescription)] }),
                        new TableCell({ children: [new Paragraph(`$ ${fmtCOP.format(item.total_amount)}`)] }),
                    ]
                }))
            ]
          }),

          new Paragraph({ text: "" }),
          
          // Total a Pagar
          new Paragraph({ 
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: `TOTAL A PAGAR: $ ${fmtCOP.format(total)}`, bold: true })
            ]
          }),
          new Paragraph({ text: "" }),
          
          // Datos Bancarios
          new Paragraph({ 
             children: [new TextRun({ text: "Datos Bancarios:", bold: true })]
          }),
          new Paragraph({ text: `${provider.bank_name || ""} - ${provider.account_type || ""} - ${provider.account_number || ""}` }),
          
          new Paragraph({ text: "" }), new Paragraph({ text: "" }),
          
          // Firma
          new Paragraph({ text: "_______________________________" }),
          new Paragraph({ 
             children: [new TextRun({ text: provider.name, bold: true })]
          }),
          new Paragraph({ text: `NIT/CC: ${provider.nit_cc}` }),
        ]
      }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Cuenta_Cobro_${provider.name}_${Date.now()}.docx`);
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
          <div>
            <h2 className="text-xl font-bold">Generador de Cuentas de Cobro</h2>
            <p className="text-xs text-slate-400">Paso {step} de 3</p>
          </div>
          <button onClick={onClose}><X /></button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          
          {/* PASO 1: PROVEEDOR */}
          {step === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right">
              <h3 className="text-lg font-bold text-slate-800">1. ¿Quién cobra? (Proveedor)</h3>
              
              {!isCreatingProvider ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Seleccionar Proveedor Existente</label>
                    <select 
                      className="w-full p-3 border rounded-xl bg-slate-50"
                      value={selectedProviderId}
                      onChange={e => setSelectedProviderId(e.target.value)}
                    >
                      <option value="">-- Selecciona --</option>
                      {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="text-center">
                    <span className="text-xs text-slate-400">¿No está en la lista?</span><br/>
                    <button onClick={() => setIsCreatingProvider(true)} className="mt-2 text-sm text-emerald-600 font-bold hover:underline flex items-center justify-center gap-1 w-full">
                       <Plus className="w-4 h-4"/> Crear Nuevo Proveedor
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 p-4 rounded-xl border space-y-3">
                   <h4 className="font-bold text-sm">Nuevo Proveedor</h4>
                   <div className="grid grid-cols-2 gap-3">
                      <input placeholder="Nombre / Razón Social" className="p-2 border rounded-lg w-full" value={newProv.name} onChange={e => setNewProv({...newProv, name: e.target.value})} />
                      <input placeholder="NIT / Cédula" className="p-2 border rounded-lg w-full" value={newProv.nit_cc} onChange={e => setNewProv({...newProv, nit_cc: e.target.value})} />
                      <input placeholder="Teléfono" className="p-2 border rounded-lg w-full" value={newProv.contact_phone} onChange={e => setNewProv({...newProv, contact_phone: e.target.value})} />
                      <input placeholder="Banco (Ej: Nequi)" className="p-2 border rounded-lg w-full" value={newProv.bank_name} onChange={e => setNewProv({...newProv, bank_name: e.target.value})} />
                      <select className="p-2 border rounded-lg w-full" value={newProv.account_type} onChange={e => setNewProv({...newProv, account_type: e.target.value})}>
                        <option>Ahorros</option><option>Corriente</option>
                      </select>
                      <input placeholder="Número de Cuenta" className="p-2 border rounded-lg w-full" value={newProv.account_number} onChange={e => setNewProv({...newProv, account_number: e.target.value})} />
                   </div>
                   <div className="flex justify-end gap-2 pt-2">
                     <button onClick={() => setIsCreatingProvider(false)} className="text-xs underline text-slate-500">Cancelar</button>
                     <button onClick={handleCreateProvider} disabled={loading} className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-sm font-bold">Guardar</button>
                   </div>
                </div>
              )}
            </div>
          )}

          {/* PASO 2: CLIENTE */}
          {step === 2 && (
             <div className="space-y-6 animate-in slide-in-from-right">
                <h3 className="text-lg font-bold text-slate-800">2. ¿A quién se le cobra? (Cliente)</h3>
                <div>
                    <label className="block text-sm font-medium mb-2">Empresa Pagadora</label>
                    <select 
                      className="w-full p-3 border rounded-xl bg-slate-50"
                      value={selectedCompanyId}
                      onChange={e => setSelectedCompanyId(e.target.value)}
                    >
                      <option value="">-- Selecciona --</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name} (NIT: {c.nit})</option>)}
                    </select>
                    {selectedCompanyId && (
                      <div className="mt-4 p-4 bg-blue-50 text-blue-800 text-sm rounded-xl">
                        <strong>Datos cargados:</strong><br/>
                        {companies.find(c => c.id === selectedCompanyId)?.address}<br/>
                        NIT: {companies.find(c => c.id === selectedCompanyId)?.nit}
                      </div>
                    )}
                  </div>
             </div>
          )}

          {/* PASO 3: DETALLES */}
          {step === 3 && (
            <div className="space-y-4 animate-in slide-in-from-right">
               <h3 className="text-lg font-bold text-slate-800">3. Revisión de Items</h3>
               <p className="text-xs text-slate-500">Puedes editar la descripción para que quede mejor en el documento.</p>
               
               <div className="max-h-60 overflow-y-auto border rounded-xl divide-y">
                 {billItems.map((item, idx) => (
                   <div key={idx} className="p-3 bg-white text-sm grid gap-2">
                      <div className="flex justify-between font-bold text-slate-700">
                        <span>{item.date} - ${fmtCOP.format(item.total_amount)}</span>
                      </div>
                      <input 
                        className="w-full p-2 border rounded bg-slate-50 text-slate-600 focus:bg-white transition-colors"
                        value={item.displayDescription}
                        onChange={(e) => {
                          const newItems = [...billItems];
                          newItems[idx].displayDescription = e.target.value;
                          setBillItems(newItems);
                        }}
                      />
                   </div>
                 ))}
               </div>

               <div className="flex justify-end pt-4 font-black text-xl text-slate-900 border-t">
                  Total: $ {fmtCOP.format(billItems.reduce((acc, i) => acc + Number(i.total_amount), 0))}
               </div>
            </div>
          )}

        </div>

        {/* Footer Buttons */}
        <div className="p-6 border-t bg-slate-50 flex justify-between">
          {step > 1 ? (
             <button onClick={() => setStep(s => s - 1)} className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-white hover:bg-slate-100 font-bold text-slate-600">
               <ChevronLeft className="w-4 h-4" /> Atrás
             </button>
          ) : <div></div>}

          {step < 3 ? (
             <button 
               onClick={() => setStep(s => s + 1)} 
               disabled={step === 1 && !selectedProviderId || step === 2 && !selectedCompanyId}
               className="flex items-center gap-2 px-6 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-black disabled:opacity-50 transition-all"
             >
               Siguiente <ChevronRight className="w-4 h-4" />
             </button>
          ) : (
             <div className="flex gap-2">
               <button onClick={generateWord} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700">
                 <FileText className="w-4 h-4" /> Word
               </button>
               <button onClick={generatePDF} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700">
                 <Download className="w-4 h-4" /> PDF
               </button>
             </div>
          )}
        </div>

      </div>
    </div>
  );
}