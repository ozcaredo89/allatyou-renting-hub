import { useEffect, useState, useMemo } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import { Calculator, Save, X, Calendar as CalendarIcon, Loader2, Info, ChevronDown, ChevronUp, Download } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type Vehicle = {
  plate: string;
  brand: string | null;
  line: string | null;
  precio_venta?: number | null;
  [key: string]: any;
};

type AmortizationRow = {
  dayNumber: number;
  date: string;
  daysElapsed: number;
  interestAccrued: number;
  principalPaid: number;
  quotaPaid: number;
  balance: number;
  isPaymentDay: boolean;
};

export default function AdminAmortization() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [authHeader, setAuthHeader] = useState("");

  const [selectedPlate, setSelectedPlate] = useState<string>("");
  const [capital, setCapital] = useState<string>("30000000");
  const [displayCapital, setDisplayCapital] = useState<string>("30.000.000");
  const [monthlyRate, setMonthlyRate] = useState<string>("3.5");
  const [dailyQuota, setDailyQuota] = useState<string>("70000");
  const [adminExpenses, setAdminExpenses] = useState<string>("11000");
  
  // Format YYYY-MM-DD
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Modal State
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  // Simulation State
  const [schedule, setSchedule] = useState<AmortizationRow[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRows, setShowRows] = useState(false);
  const [lastSimulatedParams, setLastSimulatedParams] = useState<any>(null);

  useEffect(() => {
    let auth = ensureBasicAuth();
    setAuthHeader(auth);

    async function loadVehicles() {
      setLoadingVehicles(true);
      try {
        let rs = await fetch(`${API}/vehicles`, { headers: { Authorization: auth } });
        if (rs.status === 401 || rs.status === 403) {
          clearBasicAuth();
          auth = ensureBasicAuth();
          setAuthHeader(auth);
          rs = await fetch(`${API}/vehicles`, { headers: { Authorization: auth } });
        }
        if (!rs.ok) throw new Error("Error cargando vehículos");
        const data = await rs.json();
        setVehicles(data);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoadingVehicles(false);
      }
    }
    loadVehicles();
  }, []);

  const handleVehicleSelect = (plate: string) => {
    setSelectedPlate(plate);
    setSchedule([]); // reset
    if (!plate) {
      setCapital("");
      setDisplayCapital("");
      return;
    }
    const v = vehicles.find((x) => x.plate === plate);
    if (v) {
      if (v.precio_venta) {
        setCapital(String(v.precio_venta));
        setDisplayCapital(new Intl.NumberFormat("es-CO").format(v.precio_venta));
      } else {
        setCapital("");
        setDisplayCapital("");
        setShowPriceModal(true);
      }
    }
  };

  const handleCapitalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\D/g, "");
    if (rawValue === "") {
      setCapital("");
      setDisplayCapital("");
      return;
    }
    const numericValue = parseInt(rawValue, 10);
    setCapital(String(numericValue));
    setDisplayCapital(new Intl.NumberFormat("es-CO").format(numericValue));
  };

  const handleSavePrice = async () => {
    const val = Number(newPrice);
    if (!val || val <= 0) {
      alert("Ingrese un precio válido mayor a 0");
      return;
    }
    setSavingPrice(true);
    try {
      const rs = await fetch(`${API}/vehicles/${selectedPlate}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ precio_venta: val }),
      });
      if (!rs.ok) throw new Error(await rs.text());

      // Update local state
      setVehicles((prev) =>
        prev.map((v) => (v.plate === selectedPlate ? { ...v, precio_venta: val } : v))
      );
      setCapital(String(val));
      setDisplayCapital(new Intl.NumberFormat("es-CO").format(val));
      setShowPriceModal(false);
      setNewPrice("");
    } catch (err: any) {
      alert(err.message || "Error al guardar el precio");
    } finally {
      setSavingPrice(false);
    }
  };

  const handleSimulate = async () => {
    setErrorMsg(null);
    const cap = parseFloat(capital);
    const rate = parseFloat(monthlyRate);
    const quota = parseFloat(dailyQuota);
    
    if (isNaN(cap) || cap <= 0) return setErrorMsg("Capital inválido.");
    if (isNaN(rate) || rate < 0) return setErrorMsg("Tasa inválida.");
    if (isNaN(quota) || quota <= 0) return setErrorMsg("Cuota inválida.");
    if (!startDate) return setErrorMsg("Fecha de inicio inválida.");

    setIsSimulating(true);
    try {
      // 1. Obtener días válidos de pago (saltando pico y placa) si hay placa seleccionada
      let validPaymentDates = new Set<string>();
      
      if (selectedPlate) {
        // Pedimos suficientes días al backend (ej. 1500 días = ~4 años)
        const q = new URLSearchParams({ plate: selectedPlate, start: startDate, days: "1500" });
        const rs = await fetch(`${API}/no-pay/amortization-dates?` + q.toString(), {
          headers: { Authorization: authHeader }
        });
        if (!rs.ok) throw new Error("Error obteniendo calendario de pagos");
        const json = await rs.json();
        validPaymentDates = new Set(json.dates || []);
      }

      // 2. Simular día a día
      let currentBalance = cap;
      const dailyRate = (rate * 12) / 365 / 100; // Tasa diaria aproximada
      let currentDate = new Date(startDate + "T00:00:00Z");
      
      const newSchedule: AmortizationRow[] = [];
      let dayCount = 0;
      
      // Límite de seguridad para evitar loops infinitos (máx 15 años)
      const MAX_DAYS = 365 * 15;
      
      while (currentBalance > 0 && dayCount < MAX_DAYS) {
        const iso = currentDate.toISOString().slice(0, 10);
        
        // 2.a Interés causado el día de hoy
        const dailyInterest = currentBalance * dailyRate;
        
        // 2.b Es día de pago?
        // Si no hay placa seleccionada, asumimos que todos los días son de pago
        const isPaymentDay = selectedPlate ? validPaymentDates.has(iso) : true;
        
        let paymentToApply = 0;
        let principalPaid = 0;

        if (isPaymentDay) {
          // Si el balance + interés es menor que la cuota, la cuota es solo lo que falta
          paymentToApply = Math.min(quota, currentBalance + dailyInterest);
          
          principalPaid = paymentToApply - dailyInterest;
          // Si la cuota no alcanza a cubrir el interés, el principal negativo capitaliza (no deseable, pero matemático)
          
          currentBalance -= principalPaid;
        } else {
          // Si no hay pago, el interés se capitaliza (se suma a la deuda)
          currentBalance += dailyInterest;
        }

        newSchedule.push({
          dayNumber: dayCount + 1,
          date: iso,
          daysElapsed: 1,
          interestAccrued: dailyInterest,
          principalPaid: isPaymentDay ? principalPaid : 0,
          quotaPaid: paymentToApply,
          balance: currentBalance > 0 ? currentBalance : 0,
          isPaymentDay
        });

        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        dayCount++;
      }

      if (currentBalance > 0) {
         setErrorMsg("La cuota no es suficiente para cubrir los intereses. La deuda crece infinitamente.");
         setSchedule([]);
         setLastSimulatedParams(null);
      } else {
         setSchedule(newSchedule);
         setLastSimulatedParams({
            capital: cap,
            monthlyRate: rate,
            dailyQuota: quota,
            startDate,
            selectedPlate
         });
      }

    } catch (err: any) {
      setErrorMsg(err.message || "Error en la simulación");
    } finally {
      setIsSimulating(false);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(`Amortización de Vehículo: ${selectedPlate || 'Manual'}`, 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Capital: ${fmtCOP.format(parseFloat(capital))}`, 14, 30);
    doc.text(`Cuota Diaria Estimada: ${fmtCOP.format(parseFloat(dailyQuota))}`, 14, 36);
    doc.text(`Gastos Administrativos: ${fmtCOP.format(parseFloat(adminExpenses))}`, 14, 42);
    
    const finalD = schedule.length > 0 ? schedule[schedule.length - 1].date : "-";
    doc.text(`Plazo Total (pagos): ${schedule.filter(s => s.isPaymentDay).length}`, 100, 30);
    doc.text(`Fecha Final: ${finalD}`, 100, 36);

    const tableData = schedule.map(row => [
      row.dayNumber,
      row.date,
      row.isPaymentDay ? "Sí" : "No",
      row.isPaymentDay ? fmtCOP.format(row.quotaPaid) : "-",
      fmtCOP.format(row.interestAccrued),
      row.isPaymentDay ? fmtCOP.format(row.principalPaid) : "-",
      fmtCOP.format(row.balance)
    ]);

    autoTable(doc, {
      startY: 50,
      head: [['Día', 'Fecha', 'Pago', 'Cuota', 'Interés', 'Abono', 'Saldo']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8 }
    });

    doc.save(`Amortizacion_${selectedPlate || 'Simulacion'}.pdf`);
  };

  const fmtCOP = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

  const totalTerm = useMemo(() => schedule.filter(s => s.isPaymentDay).length, [schedule]);
  const totalDays = schedule.length;
  
  const finalDate = schedule.length > 0 ? schedule[schedule.length - 1].date : "-";
  const totalDailyPayment = parseFloat(dailyQuota || "0") + parseFloat(adminExpenses || "0");

  let changedField = null;
  if (lastSimulatedParams && schedule.length > 0) {
    if (lastSimulatedParams.capital !== parseFloat(capital)) changedField = "Capital a Financiar";
    else if (lastSimulatedParams.monthlyRate !== parseFloat(monthlyRate)) changedField = "Interés Mensual";
    else if (lastSimulatedParams.dailyQuota !== parseFloat(dailyQuota)) changedField = "Cuota Diaria Estimada";
    else if (lastSimulatedParams.startDate !== startDate) changedField = "Fecha de Inicio";
    else if (lastSimulatedParams.selectedPlate !== selectedPlate) changedField = "Vehículo Seleccionado";
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Simulador de Amortización</h1>
            <p className="mt-2 text-slate-600">Proyecta el plan de pagos (Sistema Francés adaptado a diario) saltando días de Pico y Placa.</p>
          </div>
          <Calculator className="h-10 w-10 text-slate-400" />
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm flex items-start gap-3">
            <Info className="h-5 w-5 shrink-0 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* CONTROLES */}
        <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Vehículo (Opcional)</label>
            <select
              value={selectedPlate}
              onChange={(e) => handleVehicleSelect(e.target.value)}
              disabled={loadingVehicles}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60 disabled:opacity-50"
            >
              <option value="">-- Sin Vehículo (Manual) --</option>
              {vehicles.map((v) => (
                <option key={v.plate} value={v.plate}>
                  {v.plate} - {v.brand} {v.line}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Capital a Financiar</label>
            <div className="relative">
              <span className="absolute left-4 top-2.5 text-slate-500">$</span>
              <input
                type="text"
                value={displayCapital}
                onChange={handleCapitalChange}
                placeholder="0"
                className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Interés Mensual (%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                value={monthlyRate}
                onChange={(e) => setMonthlyRate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white pl-4 pr-8 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60"
              />
              <span className="absolute right-4 top-2.5 text-slate-500">%</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Cuota Diaria Estimada (Amortización)</label>
            <div className="relative">
              <span className="absolute left-4 top-2.5 text-slate-500">$</span>
              <input
                type="number"
                value={dailyQuota}
                onChange={(e) => setDailyQuota(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Gastos Administrativos (Depósito + Admin)</label>
            <div className="relative">
              <span className="absolute left-4 top-2.5 text-slate-500">$</span>
              <input
                type="number"
                value={adminExpenses}
                onChange={(e) => setAdminExpenses(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Fecha de Inicio</label>
            <div className="relative">
               <CalendarIcon className="absolute left-4 top-2.5 h-4 w-4 text-slate-400" />
               <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60"
              />
            </div>
          </div>

        </div>

        {changedField && (
          <div className="mb-4 flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-3 rounded-xl border border-amber-200">
            <Info className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              Cambiaste el valor de <strong>{changedField}</strong>. Genera de nuevo la simulación para actualizar los resultados.
            </p>
          </div>
        )}

        <div className="flex justify-end mb-8">
           <button
              onClick={handleSimulate}
              disabled={isSimulating || !capital || !dailyQuota}
              className={`flex items-center gap-2 rounded-xl px-6 py-3 font-semibold text-white shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                changedField ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20" : "bg-black hover:bg-slate-800 shadow-black/20"
              }`}
            >
              {isSimulating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Calculator className="h-5 w-5" />}
              {changedField ? "Generar de Nuevo" : "Generar Simulación"}
            </button>
        </div>

        {/* RESULTADOS Y TABLA */}
        {schedule.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
               <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Cuotas a Pagar</p>
                  <p className="text-3xl font-black text-slate-900">{totalTerm}</p>
                  <p className="text-xs text-slate-500 mt-1">({totalDays} días calendario)</p>
               </div>
               <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cuota Diaria a Pagar</p>
                  <p className="text-3xl font-black text-blue-600">{fmtCOP.format(totalDailyPayment)}</p>
                  <p className="text-xs text-slate-500 mt-1">Amortización + Gastos</p>
               </div>
               <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha de Finalización</p>
                  <p className="text-3xl font-black text-emerald-600">{finalDate}</p>
                  <p className="text-xs text-slate-500 mt-1">Estimada</p>
               </div>
            </div>

            {/* GRÁFICA */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-8 h-96">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Proyección de Amortización</h3>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={schedule}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} minTickGap={30} />
                  <YAxis yAxisId="left" tickFormatter={(val) => `$${(val/1000000).toFixed(1)}M`} tick={{fontSize: 12}} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => `$${(val/1000).toFixed(0)}k`} tick={{fontSize: 12}} />
                  <RechartsTooltip formatter={(val: any) => fmtCOP.format(val)} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="balance" name="Saldo Deuda" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="interestAccrued" name="Interés Diario" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between mb-4 px-2">
               <button onClick={() => setShowRows(!showRows)} className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-black transition-colors">
                  {showRows ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
                  {showRows ? "Ocultar Detalles de Cuotas" : "Mostrar Detalles de Cuotas"}
               </button>
               <button onClick={exportPDF} className="flex items-center gap-2 text-sm font-semibold bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors">
                  <Download className="w-4 h-4"/>
                  Imprimir PDF
               </button>
            </div>

            {showRows && (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm animate-in fade-in slide-in-from-top-4">
                <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-sm text-left">
                  <thead className="sticky top-0 bg-slate-100 z-10 shadow-sm">
                    <tr>
                      <th className="px-6 py-4 font-bold text-slate-700"># Día</th>
                      <th className="px-6 py-4 font-bold text-slate-700">Fecha</th>
                      <th className="px-6 py-4 font-bold text-slate-700">Cuota</th>
                      <th className="px-6 py-4 font-bold text-slate-700">Interés</th>
                      <th className="px-6 py-4 font-bold text-slate-700">Abono Capital</th>
                      <th className="px-6 py-4 font-bold text-slate-700">Saldo Final</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {schedule.map((row) => (
                      <tr key={row.dayNumber} className={row.isPaymentDay ? "hover:bg-slate-50" : "bg-red-50/50 opacity-60"}>
                        <td className="px-6 py-3 text-slate-500 font-mono">
                          {row.dayNumber} {row.isPaymentDay ? "" : "(Pico/Placa)"}
                        </td>
                        <td className="px-6 py-3 font-medium text-slate-900">{row.date}</td>
                        <td className="px-6 py-3 font-medium text-emerald-600">
                          {row.isPaymentDay ? fmtCOP.format(row.quotaPaid) : "-"}
                        </td>
                        <td className="px-6 py-3 text-red-600">{fmtCOP.format(row.interestAccrued)}</td>
                        <td className="px-6 py-3 text-blue-600">
                           {row.isPaymentDay ? fmtCOP.format(row.principalPaid) : "-"}
                        </td>
                        <td className="px-6 py-3 font-bold text-slate-900">{fmtCOP.format(row.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </div>
        )}

      </div>

      {/* MODAL PRECIO VENTA */}
      {showPriceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
               <h3 className="font-bold text-slate-900 text-lg">Registrar Precio de Venta</h3>
               <button onClick={() => setShowPriceModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 bg-slate-50 hover:bg-slate-100">
                 <X className="w-5 h-5" />
               </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                El vehículo <strong className="text-black">{selectedPlate}</strong> no tiene un precio de venta configurado. Ingresa el valor para continuar con la simulación.
              </p>
              
              <div className="mb-6 relative">
                 <span className="absolute left-4 top-3.5 text-slate-500 font-medium">$</span>
                 <input 
                   type="number"
                   value={newPrice}
                   onChange={e => setNewPrice(e.target.value)}
                   autoFocus
                   placeholder="Ej: 45000000"
                   className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-black outline-none font-medium"
                 />
              </div>

              <button
                onClick={handleSavePrice}
                disabled={savingPrice || !newPrice}
                className="w-full flex justify-center items-center gap-2 bg-black text-white rounded-xl py-3 font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {savingPrice ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Guardar Precio
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
