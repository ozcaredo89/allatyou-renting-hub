const fs = require('fs');

let code = fs.readFileSync('c:/dev/allatyou-renting-hub/web/src/pages/AdminAmortization.tsx', 'utf8');

const s1 = 'const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));';
const r1 = `const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState<string>(tomorrowStr);`;
code = code.replace(s1, r1);

const s2 = `const [leasingModalData, setLeasingModalData] = useState({
    driver_id: "",
    start_date: new Date().toISOString().slice(0, 10),
    down_payment: "0",
    notes: "",
  });`;
const r2 = `const [leasingModalData, setLeasingModalData] = useState({
    driver_id: "",
    start_date: tomorrowStr,
    down_payment: "0",
    notes: "",
  });
  const [leasingFile, setLeasingFile] = useState<File | null>(null);
  const [attachLater, setAttachLater] = useState(false);`;
code = code.replace(s2, r2);

const s3 = `setStartDate(today);
    setSchedule([]);
    setLeasingModalData((prev) => ({ ...prev, start_date: today }));`;
const r3 = `setStartDate(tomorrowStr);
    setSchedule([]);
    setLeasingModalData((prev) => ({ ...prev, start_date: tomorrowStr }));`;
code = code.replace(s3, r3);

const s4 = `  const handleActivateLeasing = async () => {
    if (!selectedPlate) return alert("Selecciona una placa primero.");
    const cap = parseFloat(capital);
    const rate = parseFloat(monthlyRate);
    const quota = parseFloat(dailyQuota);
    if (!cap || !rate || !quota) return alert("Completa Capital, Tasa y Cuota.");

    setActivatingLeasing(true);
    try {
      const rs = await fetch(\`\${API}/leasing/contracts\`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          plate: selectedPlate,
          driver_id: leasingModalData.driver_id ? Number(leasingModalData.driver_id) : null,
          purchase_price: cap,
          down_payment: parseFloat(leasingModalData.down_payment) || 0,
          monthly_rate_pct: rate,
          daily_maintenance: parseFloat(maintenanceFund),
          daily_admin: parseFloat(adminExpenses),
          start_date: leasingModalData.start_date,
          notes: leasingModalData.notes || null,
          generate_schedule: true,
        }),
      });`;
const r4 = `  const handleActivateLeasing = async () => {
    if (!selectedPlate) return alert("Selecciona una placa primero.");
    const cap = parseFloat(capital);
    const rate = parseFloat(monthlyRate);
    const quota = parseFloat(dailyQuota);
    if (!cap || !rate || !quota) return alert("Completa Capital, Tasa y Cuota.");

    if (!attachLater && !leasingFile) {
      return alert("Por favor adjunta el contrato firmado, o marca la opción 'Adjuntar después'.");
    }

    setActivatingLeasing(true);
    try {
      let contractPdfUrl = null;

      // Subir archivo primero si aplica
      if (!attachLater && leasingFile) {
        const fd = new FormData();
        fd.append("file", leasingFile);
        const upRes = await fetch(\`\${API}/uploads\`, {
          method: "POST",
          headers: { Authorization: authHeader },
          body: fd,
        });
        if (!upRes.ok) throw new Error("Error subiendo el archivo del contrato");
        const upData = await upRes.json();
        contractPdfUrl = upData.url;
      }

      const rs = await fetch(\`\${API}/leasing/contracts\`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          plate: selectedPlate,
          driver_id: leasingModalData.driver_id ? Number(leasingModalData.driver_id) : null,
          purchase_price: cap,
          down_payment: parseFloat(leasingModalData.down_payment) || 0,
          monthly_rate_pct: rate,
          daily_maintenance: parseFloat(maintenanceFund),
          daily_admin: parseFloat(adminExpenses),
          start_date: leasingModalData.start_date,
          notes: leasingModalData.notes || null,
          generate_schedule: true,
          contract_pdf_url: contractPdfUrl,
        }),
      });`;
code = code.replace(s4, r4);

const s5 = `              {/* Activar leasing */}
              <button
                type="button"
                onClick={() => { setShowLeasingModal(true); setLeasingSuccess(null); }}
                disabled={!canActivateLeasing}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-40"
              >
                <Rocket className="h-4 w-4" />
                Activar Leasing
              </button>`;
const r5 = `              {/* Imprimir PDF */}
              <button
                type="button"
                onClick={exportPDF}
                disabled={schedule.length === 0}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-all disabled:opacity-40"
              >
                <Download className="h-4 w-4" />
                Generar Contrato (PDF)
              </button>

              {/* Activar leasing */}
              <button
                type="button"
                onClick={() => { setShowLeasingModal(true); setLeasingSuccess(null); }}
                disabled={!canActivateLeasing}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-40"
              >
                <Rocket className="h-4 w-4" />
                Activar Leasing
              </button>`;
code = code.replace(s5, r5);

const s6 = `                {/* Notas */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Notas (opcional)</label>
                  <textarea value={leasingModalData.notes}
                    onChange={(e) => setLeasingModalData((p) => ({ ...p, notes: e.target.value }))}
                    rows={2} placeholder="Ej: Contrato firmado el 20/07/2026..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60 resize-none" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowLeasingModal(false)}`;
const r6 = `                {/* Notas */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Notas (opcional)</label>
                  <textarea value={leasingModalData.notes}
                    onChange={(e) => setLeasingModalData((p) => ({ ...p, notes: e.target.value }))}
                    rows={2} placeholder="Ej: Contrato firmado el 20/07/2026..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60 resize-none" />
                </div>

                {/* Subir Contrato */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-bold text-slate-700">Contrato Firmado</label>
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={attachLater}
                        onChange={(e) => setAttachLater(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Adjuntar después
                    </label>
                  </div>
                  
                  {!attachLater ? (
                    <div>
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={(e) => setLeasingFile(e.target.files?.[0] || null)}
                        className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                      />
                      {leasingFile && <p className="text-xs text-slate-500 mt-2">Archivo: {leasingFile.name}</p>}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      El vehículo quedará con la marca <strong>Pendiente Contrato</strong> en la pantalla de Flota.
                    </p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowLeasingModal(false)}`;
code = code.replace(s6, r6);

fs.writeFileSync('c:/dev/allatyou-renting-hub/web/src/pages/AdminAmortization_new.tsx', code, 'utf8');
try {
  fs.renameSync('c:/dev/allatyou-renting-hub/web/src/pages/AdminAmortization_new.tsx', 'c:/dev/allatyou-renting-hub/web/src/pages/AdminAmortization.tsx');
} catch (e) {
  console.log("Could not rename, printing error:", e);
}
