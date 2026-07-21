import { useEffect, useState, useMemo } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import {
  Calculator, Save, X, Calendar as CalendarIcon, Loader2, Info,
  ChevronDown, ChevronUp, Download, Rocket, Trash2, ClipboardList
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type Vehicle = {
  plate: string;
  brand: string | null;
  line: string | null;
  model_year?: number | null;
  current_driver_id?: number | null;
  driver?: { id: number; full_name: string } | null;
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

type Simulation = {
  id: number;
  plate: string;
  purchase_price: number;
  down_payment: number;
  monthly_rate_pct: number;
  daily_quota: number;
  daily_maintenance: number;
  daily_admin: number;
  start_date: string;
  notes: string | null;
  created_at: string;
};

const fmtCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export default function AdminAmortization() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [authHeader, setAuthHeader] = useState("");

  // Simulation inputs
  const [selectedPlate, setSelectedPlate] = useState<string>("");
  const [capital, setCapital] = useState<string>("30000000");
  const [displayCapital, setDisplayCapital] = useState<string>("30.000.000");
  const [monthlyRate, setMonthlyRate] = useState<string>("3.5");
  const [dailyQuota, setDailyQuota] = useState<string>("70000");
  const [displayDailyQuota, setDisplayDailyQuota] = useState<string>("70.000");
  const [adminExpenses, setAdminExpenses] = useState<string>("11000");
  const [displayAdminExpenses, setDisplayAdminExpenses] = useState<string>("11.000");
  const [maintenanceFund, setMaintenanceFund] = useState<string>("10000");
  const [displayMaintenanceFund, setDisplayMaintenanceFund] = useState<string>("10.000");
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Price modal
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  // Simulation results
  const [schedule, setSchedule] = useState<AmortizationRow[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRows, setShowRows] = useState(false);
  const [lastSimulatedParams, setLastSimulatedParams] = useState<any>(null);

  // Saved simulations panel
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loadingSimulations, setLoadingSimulations] = useState(false);
  const [savingSimulation, setSavingSimulation] = useState(false);
  const [showSimulations, setShowSimulations] = useState(true);

  // Activate Leasing modal
  const [showLeasingModal, setShowLeasingModal] = useState(false);
  const [activatingLeasing, setActivatingLeasing] = useState(false);
  const [leasingModalData, setLeasingModalData] = useState({
    driver_id: "",
    start_date: new Date().toISOString().slice(0, 10),
    down_payment: "0",
    notes: "",
  });
  const [leasingSuccess, setLeasingSuccess] = useState<any>(null);

  useEffect(() => {
    let auth = ensureBasicAuth();
    setAuthHeader(auth);

    async function loadVehicles() {
      setLoadingVehicles(true);
      try {
        let rs = await fetch(`${API}/vehicles?status=all`, { headers: { Authorization: auth } });
        if (rs.status === 401 || rs.status === 403) {
          clearBasicAuth();
          auth = ensureBasicAuth();
          setAuthHeader(auth);
          rs = await fetch(`${API}/vehicles?status=all`, { headers: { Authorization: auth } });
        }
        if (!rs.ok) throw new Error("Error cargando vehículos");
        const data = await rs.json();
        setVehicles(Array.isArray(data) ? data : []);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoadingVehicles(false);
      }
    }

    loadVehicles();
    loadSimulations(auth);
  }, []);

  async function loadSimulations(auth?: string) {
    const hdr = auth || authHeader;
    setLoadingSimulations(true);
    try {
      const rs = await fetch(`${API}/leasing/simulations`, { headers: { Authorization: hdr } });
      if (!rs.ok) return;
      const data = await rs.json();
      setSimulations(data.items || []);
    } catch {
      // silent
    } finally {
      setLoadingSimulations(false);
    }
  }

  const handleVehicleSelect = (plate: string) => {
    setSelectedPlate(plate);
    setSchedule([]);
    if (!plate) { setCapital(""); setDisplayCapital(""); return; }
    const v = vehicles.find((x) => x.plate === plate);
    if (v) {
      if (v.precio_venta) {
        setCapital(String(v.precio_venta));
        setDisplayCapital(new Intl.NumberFormat("es-CO").format(v.precio_venta));
      } else {
        setCapital(""); setDisplayCapital("");
        setShowPriceModal(true);
      }
    }
  };

  const handleCurrencyChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setRaw: (v: string) => void,
    setDisplay: (v: string) => void,
  ) => {
    const rawValue = e.target.value.replace(/\D/g, "");
    if (rawValue === "") { setRaw(""); setDisplay(""); return; }
    const numericValue = parseInt(rawValue, 10);
    setRaw(String(numericValue));
    setDisplay(new Intl.NumberFormat("es-CO").format(numericValue));
  };

  const handleSavePrice = async () => {
    const val = Number(newPrice);
    if (!val || val <= 0) { alert("Ingrese un precio válido mayor a 0"); return; }
    setSavingPrice(true);
    try {
      const rs = await fetch(`${API}/vehicles/${selectedPlate}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ precio_venta: val }),
      });
      if (!rs.ok) throw new Error(await rs.text());
      setVehicles((prev) => prev.map((v) => v.plate === selectedPlate ? { ...v, precio_venta: val } : v));
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

  type SimParams = {
    cap: number;
    rate: number;
    quota: number;
    date: string;
    plate: string;
  };

  const handleSimulate = async (overrides?: SimParams) => {
    setErrorMsg(null);
    const cap   = overrides?.cap   ?? parseFloat(capital);
    const rate  = overrides?.rate  ?? parseFloat(monthlyRate);
    const quota = overrides?.quota ?? parseFloat(dailyQuota);
    const date  = overrides?.date  ?? startDate;
    const plate = overrides?.plate ?? selectedPlate;

    if (isNaN(cap) || cap <= 0)   return setErrorMsg("Capital inválido.");
    if (isNaN(rate) || rate < 0)  return setErrorMsg("Tasa inválida.");
    if (isNaN(quota) || quota <= 0) return setErrorMsg("Cuota inválida.");
    if (!date) return setErrorMsg("Fecha de inicio inválida.");

    setIsSimulating(true);
    try {
      let validPaymentDates = new Set<string>();
      if (plate) {
        const q = new URLSearchParams({ plate, start: date, days: "1500" });
        const rs = await fetch(`${API}/no-pay/amortization-dates?` + q.toString(), {
          headers: { Authorization: authHeader },
        });
        if (!rs.ok) throw new Error("Error obteniendo calendario de pagos");
        const json = await rs.json();
        validPaymentDates = new Set(json.dates || []);
      }

      let currentBalance = cap;
      const dailyRate = (rate * 12) / 365 / 100;
      let currentDate = new Date(date + "T00:00:00Z");
      const newSchedule: AmortizationRow[] = [];
      let dayCount = 0;
      const MAX_DAYS = 365 * 15;

      while (currentBalance > 0 && dayCount < MAX_DAYS) {
        const iso = currentDate.toISOString().slice(0, 10);
        const dailyInterest = currentBalance * dailyRate;
        const isPaymentDay = plate ? validPaymentDates.has(iso) : true;
        let paymentToApply = 0;
        let principalPaid = 0;

        if (isPaymentDay) {
          paymentToApply = Math.min(quota, currentBalance + dailyInterest);
          principalPaid = paymentToApply - dailyInterest;
          currentBalance -= principalPaid;
        } else {
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
          isPaymentDay,
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
        setLastSimulatedParams({ capital: cap, monthlyRate: rate, dailyQuota: quota, startDate: date, selectedPlate: plate });
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Error en la simulación");
    } finally {
      setIsSimulating(false);
    }
  };

  // ── SAVE SIMULATION ──
  const handleSaveSimulation = async () => {
    const cap = parseFloat(capital);
    const rate = parseFloat(monthlyRate);
    const quota = parseFloat(dailyQuota);
    const maint = parseFloat(maintenanceFund);
    const admin = parseFloat(adminExpenses);

    if (!selectedPlate) return alert("Selecciona un vehículo para guardar la simulación.");
    if (!cap || !rate || !quota || !startDate) return alert("Completa todos los campos antes de guardar.");

    setSavingSimulation(true);
    try {
      const rs = await fetch(`${API}/leasing/simulations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({
          plate: selectedPlate,
          purchase_price: cap,
          down_payment: 0,
          monthly_rate_pct: rate,
          daily_quota: quota,
          daily_maintenance: maint,
          daily_admin: admin,
          start_date: startDate,
        }),
      });
      if (!rs.ok) throw new Error((await rs.json()).error || "Error guardando");
      await loadSimulations();
      alert(`✅ Simulación para ${selectedPlate} guardada correctamente.`);
    } catch (err: any) {
      alert(err.message || "Error guardando simulación");
    } finally {
      setSavingSimulation(false);
    }
  };

  // ── DELETE SIMULATION ──
  const handleDeleteSimulation = async (id: number) => {
    if (!confirm("¿Eliminar esta simulación guardada?")) return;
    try {
      await fetch(`${API}/leasing/simulations/${id}`, {
        method: "DELETE",
        headers: { Authorization: authHeader },
      });
      await loadSimulations();
    } catch {
      alert("Error eliminando simulación.");
    }
  };

  // ── LOAD SIMULATION INTO FORM + AUTO-SIMULATE ──
  const handleLoadSimulation = (sim: Simulation) => {
    const today = new Date().toISOString().slice(0, 10);
    // Update all state
    setSelectedPlate(sim.plate);
    setCapital(String(sim.purchase_price));
    setDisplayCapital(new Intl.NumberFormat("es-CO").format(sim.purchase_price));
    setMonthlyRate(String(sim.monthly_rate_pct));
    setDailyQuota(String(sim.daily_quota));
    setDisplayDailyQuota(new Intl.NumberFormat("es-CO").format(sim.daily_quota));
    setMaintenanceFund(String(sim.daily_maintenance));
    setDisplayMaintenanceFund(new Intl.NumberFormat("es-CO").format(sim.daily_maintenance));
    setAdminExpenses(String(sim.daily_admin));
    setDisplayAdminExpenses(new Intl.NumberFormat("es-CO").format(sim.daily_admin));
    setStartDate(today);
    setSchedule([]);
    setLeasingModalData((prev) => ({ ...prev, start_date: today }));

    // Auto-simulate immediately using the sim's values directly (bypasses async state)
    handleSimulate({
      cap:   sim.purchase_price,
      rate:  sim.monthly_rate_pct,
      quota: sim.daily_quota,
      date:  today,
      plate: sim.plate,
    });
  };

  // ── ACTIVATE LEASING ──
  const handleActivateLeasing = async () => {
    if (!selectedPlate) return alert("Selecciona una placa primero.");
    const cap = parseFloat(capital);
    const rate = parseFloat(monthlyRate);
    const quota = parseFloat(dailyQuota);
    if (!cap || !rate || !quota) return alert("Completa Capital, Tasa y Cuota.");

    setActivatingLeasing(true);
    try {
      const rs = await fetch(`${API}/leasing/contracts`, {
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
      });
      if (!rs.ok) {
        const err = await rs.json();
        throw new Error(err.error || "Error activando leasing");
      }
      const data = await rs.json();
      setLeasingSuccess(data);
    } catch (err: any) {
      alert(err.message || "Error activando leasing");
    } finally {
      setActivatingLeasing(false);
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Amortización de Vehículo: ${selectedPlate || "Manual"}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Capital: ${fmtCOP.format(parseFloat(capital))}`, 14, 30);
    doc.text(`Cuota Diaria Estimada: ${fmtCOP.format(parseFloat(dailyQuota))}`, 14, 36);
    doc.text(`Gastos Administrativos: ${fmtCOP.format(parseFloat(adminExpenses))}`, 14, 42);
    doc.text(`Fondo de Mantenimiento: ${fmtCOP.format(parseFloat(maintenanceFund))}`, 14, 48);
    const finalD = schedule.length > 0 ? schedule[schedule.length - 1].date : "-";
    doc.text(`Plazo Total (pagos): ${schedule.filter((s) => s.isPaymentDay).length}`, 110, 30);
    doc.text(`Fecha Final: ${finalD}`, 110, 36);
    const tableData = schedule.map((row) => [
      row.dayNumber, row.date,
      row.isPaymentDay ? "Sí" : "No",
      row.isPaymentDay ? fmtCOP.format(row.quotaPaid) : "-",
      fmtCOP.format(row.interestAccrued),
      row.isPaymentDay ? fmtCOP.format(row.principalPaid) : "-",
      fmtCOP.format(row.balance),
    ]);
    autoTable(doc, {
      startY: 55,
      head: [["Día", "Fecha", "Pago", "Cuota", "Interés", "Abono", "Saldo"]],
      body: tableData,
      theme: "grid",
      styles: { fontSize: 8 },
    });
    doc.save(`Amortizacion_${selectedPlate || "Simulacion"}.pdf`);
  };

  const totalTerm = useMemo(() => schedule.filter((s) => s.isPaymentDay).length, [schedule]);
  const totalDays = schedule.length;
  const finalDate = schedule.length > 0 ? schedule[schedule.length - 1].date : "-";
  const totalDailyPayment =
    parseFloat(dailyQuota || "0") + parseFloat(adminExpenses || "0") + parseFloat(maintenanceFund || "0");

  let changedField = null;
  if (lastSimulatedParams && schedule.length > 0) {
    if (lastSimulatedParams.capital !== parseFloat(capital)) changedField = "Capital a Financiar";
    else if (lastSimulatedParams.monthlyRate !== parseFloat(monthlyRate)) changedField = "Interés Mensual";
    else if (lastSimulatedParams.dailyQuota !== parseFloat(dailyQuota)) changedField = "Cuota Diaria";
    else if (lastSimulatedParams.startDate !== startDate) changedField = "Fecha de Inicio";
    else if (lastSimulatedParams.selectedPlate !== selectedPlate) changedField = "Vehículo";
  }

  const canSaveSimulation = !!selectedPlate && !!capital && !!monthlyRate && !!dailyQuota;
  const canActivateLeasing = canSaveSimulation && !!startDate;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">

        {/* HEADER */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Simulador de Amortización</h1>
            <p className="mt-2 text-slate-600">Proyecta el plan de pagos y activa un contrato de leasing.</p>
          </div>
          <Calculator className="h-10 w-10 text-slate-400" />
        </div>

        {errorMsg && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm flex items-start gap-3">
            <Info className="h-5 w-5 shrink-0 mt-0.5" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* LAYOUT: Controles + Panel Simulaciones */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* CONTROLES — 2/3 */}
          <div className="lg:col-span-2 space-y-6">
            <div className="grid gap-5 sm:grid-cols-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">

              {/* Vehículo */}
              <div className="space-y-2 sm:col-span-2">
                <label className="block text-sm font-semibold text-slate-700">Vehículo</label>
                <select
                  value={selectedPlate}
                  onChange={(e) => handleVehicleSelect(e.target.value)}
                  disabled={loadingVehicles}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60 disabled:opacity-50"
                >
                  <option value="">-- Sin Vehículo (Manual) --</option>
                  {vehicles.map((v) => (
                    <option key={v.plate} value={v.plate}>
                      {v.plate} — {v.brand} {v.line}
                      {v.status === "leasing" ? " 🔒 EN LEASING" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Capital */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Capital a Financiar</label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-slate-500">$</span>
                  <input type="text" value={displayCapital}
                    onChange={(e) => handleCurrencyChange(e, setCapital, setDisplayCapital)}
                    placeholder="0" className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60" />
                </div>
              </div>

              {/* Tasa */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Interés Mensual (%)</label>
                <div className="relative">
                  <input type="number" step="0.1" value={monthlyRate}
                    onChange={(e) => setMonthlyRate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-4 pr-8 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60" />
                  <span className="absolute right-4 top-2.5 text-slate-500">%</span>
                </div>
              </div>

              {/* Cuota */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Cuota Diaria (Capital + Interés)</label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-slate-500">$</span>
                  <input type="text" value={displayDailyQuota}
                    onChange={(e) => handleCurrencyChange(e, setDailyQuota, setDisplayDailyQuota)}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60" />
                </div>
              </div>

              {/* Admin */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Gastos Administrativos</label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-slate-500">$</span>
                  <input type="text" value={displayAdminExpenses}
                    onChange={(e) => handleCurrencyChange(e, setAdminExpenses, setDisplayAdminExpenses)}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60" />
                </div>
              </div>

              {/* Mantenimiento */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Fondo de Mantenimiento</label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-slate-500">$</span>
                  <input type="text" value={displayMaintenanceFund}
                    onChange={(e) => handleCurrencyChange(e, setMaintenanceFund, setDisplayMaintenanceFund)}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60" />
                </div>
              </div>

              {/* Fecha */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Fecha de Inicio</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-4 top-2.5 h-4 w-4 text-slate-400" />
                  <input type="date" value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60" />
                </div>
              </div>

              {/* Cuota total informativa */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">Cuota Diaria Total</label>
                <div className="flex items-center h-10 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-blue-700">
                  {fmtCOP.format(totalDailyPayment)}
                  <span className="ml-2 text-[10px] font-normal text-slate-500">Amortización + Admin + Mtto</span>
                </div>
              </div>
            </div>

            {/* Botones acción */}
            {changedField && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-3 rounded-xl border border-amber-200">
                <Info className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">Cambiaste <strong>{changedField}</strong>. Regenera la simulación.</p>
              </div>
            )}

            <div className="flex flex-wrap gap-3 justify-end">
              {/* Guardar simulación */}
              <button
                type="button"
                onClick={handleSaveSimulation}
                disabled={savingSimulation || !canSaveSimulation}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 shadow-sm transition-all disabled:opacity-40"
              >
                {savingSimulation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar Simulación
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
              </button>

              {/* Simular */}
              <button
                onClick={() => handleSimulate()}
                disabled={isSimulating || !capital || !dailyQuota}
                className={`flex items-center gap-2 rounded-xl px-6 py-2.5 font-semibold text-white shadow-lg transition-all disabled:opacity-50 ${changedField ? "bg-amber-500 hover:bg-amber-600 shadow-amber-500/20 animate-pulse" : "bg-black hover:bg-slate-800 shadow-black/20"}`}
              >
                {isSimulating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Calculator className="h-5 w-5" />}
                {changedField ? "Regenerar" : "Simular"}
              </button>
            </div>
          </div>

          {/* PANEL SIMULACIONES GUARDADAS — 1/3 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <button
              onClick={() => setShowSimulations((p) => !p)}
              className="flex items-center justify-between px-5 py-4 border-b border-slate-100 w-full text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-bold text-slate-800">
                  Simulaciones Guardadas ({simulations.length})
                </span>
              </div>
              {showSimulations ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </button>

            {showSimulations && (
              <div className="flex-1 overflow-y-auto max-h-[520px] divide-y divide-slate-50">
                {loadingSimulations ? (
                  <div className="p-8 text-center text-slate-400 text-sm"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />Cargando...</div>
                ) : simulations.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Aún no hay simulaciones guardadas.
                  </div>
                ) : simulations.map((sim) => (
                  <div key={sim.id} className="px-4 py-3 hover:bg-slate-50 transition-colors group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-slate-800 text-sm">{sim.plate}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Capital: {fmtCOP.format(sim.purchase_price)}
                        </p>
                        <p className="text-xs text-slate-400">
                          Cuota: {fmtCOP.format(sim.daily_quota)} · {sim.monthly_rate_pct}%/mes
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {new Date(sim.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleLoadSimulation(sim)}
                          title="Cargar en el simulador"
                          className="text-[10px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded-lg whitespace-nowrap"
                        >
                          Cargar
                        </button>
                        <button
                          onClick={() => handleDeleteSimulation(sim.id)}
                          title="Eliminar simulación"
                          className="text-[10px] font-medium text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded-lg"
                        >
                          <Trash2 className="h-3 w-3 mx-auto" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RESULTADOS DE SIMULACIÓN */}
        {schedule.length > 0 && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8">
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Cuotas a Pagar</p>
                <p className="text-3xl font-black text-slate-900">{totalTerm}</p>
                <p className="text-xs text-slate-500 mt-1">({totalDays} días calendario)</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cuota Diaria Total</p>
                <p className="text-3xl font-black text-blue-600">{fmtCOP.format(totalDailyPayment)}</p>
                <p className="text-xs text-slate-500 mt-1">Capital + Interés + Gastos</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-center">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha de Finalización</p>
                <p className="text-3xl font-black text-emerald-600">{finalDate}</p>
                <p className="text-xs text-slate-500 mt-1">Estimada</p>
              </div>
            </div>

            {/* Gráfica */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-8 h-96">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Proyección de Amortización</h3>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={schedule}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} tickMargin={10} minTickGap={30} />
                  <YAxis yAxisId="left" tickFormatter={(val) => `$${(val / 1000000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
                  <RechartsTooltip formatter={(val: any) => fmtCOP.format(val)} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="balance" name="Saldo Deuda" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="interestAccrued" name="Interés Diario" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Tabla desplegable */}
            <div className="flex items-center justify-between mb-4 px-2">
              <button onClick={() => setShowRows(!showRows)} className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-black transition-colors">
                {showRows ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                {showRows ? "Ocultar Detalles" : "Ver Detalle de Cuotas"}
              </button>
              <button onClick={exportPDF} className="flex items-center gap-2 text-sm font-semibold bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors">
                <Download className="w-4 h-4" /> Imprimir PDF
              </button>
            </div>

            {showRows && (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm animate-in fade-in">
                <div className="max-h-[600px] overflow-y-auto">
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
                          <td className="px-6 py-3 text-slate-500 font-mono">{row.dayNumber} {!row.isPaymentDay && "(P&P)"}</td>
                          <td className="px-6 py-3 font-medium text-slate-900">{row.date}</td>
                          <td className="px-6 py-3 font-medium text-emerald-600">{row.isPaymentDay ? fmtCOP.format(row.quotaPaid) : "—"}</td>
                          <td className="px-6 py-3 text-red-600">{fmtCOP.format(row.interestAccrued)}</td>
                          <td className="px-6 py-3 text-blue-600">{row.isPaymentDay ? fmtCOP.format(row.principalPaid) : "—"}</td>
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

      {/* ── MODAL PRECIO VENTA ── */}
      {showPriceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-lg">Registrar Precio de Venta</h3>
              <button onClick={() => setShowPriceModal(false)} className="text-slate-400 hover:text-slate-600 rounded-lg p-1 bg-slate-50 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">El vehículo <strong className="text-black">{selectedPlate}</strong> no tiene precio de venta. Ingrésalo para continuar.</p>
              <div className="mb-6 relative">
                <span className="absolute left-4 top-3.5 text-slate-500 font-medium">$</span>
                <input type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} autoFocus placeholder="Ej: 45000000"
                  className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-black outline-none font-medium" />
              </div>
              <button onClick={handleSavePrice} disabled={savingPrice || !newPrice}
                className="w-full flex justify-center items-center gap-2 bg-black text-white rounded-xl py-3 font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50">
                {savingPrice ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Guardar Precio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ACTIVAR LEASING ── */}
      {showLeasingModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <Rocket className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">Activar Contrato de Leasing</h3>
                  <p className="text-xs text-slate-500">Placa: <span className="font-mono font-bold">{selectedPlate}</span></p>
                </div>
              </div>
              <button onClick={() => { setShowLeasingModal(false); setLeasingSuccess(null); }}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 bg-slate-50 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>

            {leasingSuccess ? (
              <div className="p-8 text-center">
                <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🎉</span>
                </div>
                <h4 className="text-xl font-black text-slate-900 mb-2">¡Leasing Activado!</h4>
                <p className="text-slate-600 text-sm mb-1">Contrato ID: <span className="font-mono font-bold">{leasingSuccess.contract?.id}</span></p>
                <p className="text-slate-600 text-sm mb-4">
                  Se generaron <span className="font-bold text-emerald-600">{leasingSuccess.schedule_rows_generated}</span> cuotas en el cronograma.
                </p>
                <p className="text-xs text-slate-400 mb-6">El vehículo ahora aparece en estado "En Leasing" en el módulo de flota.</p>
                <button onClick={() => { setShowLeasingModal(false); setLeasingSuccess(null); }}
                  className="bg-black text-white rounded-xl px-6 py-3 font-semibold hover:bg-slate-800 transition-colors">
                  Cerrar
                </button>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {/* Resumen */}
                <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-500 text-xs block">Capital</span><span className="font-bold">{fmtCOP.format(parseFloat(capital) || 0)}</span></div>
                  <div><span className="text-slate-500 text-xs block">Tasa Mensual</span><span className="font-bold">{monthlyRate}%</span></div>
                  <div><span className="text-slate-500 text-xs block">Cuota Amortización</span><span className="font-bold">{fmtCOP.format(parseFloat(dailyQuota) || 0)}</span></div>
                  <div><span className="text-slate-500 text-xs block">Cuota Total Diaria</span><span className="font-bold text-blue-600">{fmtCOP.format(totalDailyPayment)}</span></div>
                </div>

                {/* Fecha de inicio */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Fecha de Inicio del Contrato</label>
                  <input type="date" value={leasingModalData.start_date}
                    onChange={(e) => setLeasingModalData((p) => ({ ...p, start_date: e.target.value }))}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60" />
                </div>

                {/* Cuota inicial */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Cuota Inicial (Enganche)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-2.5 text-slate-500">$</span>
                    <input type="number" value={leasingModalData.down_payment}
                      onChange={(e) => setLeasingModalData((p) => ({ ...p, down_payment: e.target.value }))}
                      placeholder="0"
                      className="w-full rounded-xl border border-slate-300 bg-white pl-8 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60" />
                  </div>
                </div>

                {/* ID Conductor */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">ID del Conductor (opcional)</label>
                  <input type="number" value={leasingModalData.driver_id}
                    onChange={(e) => setLeasingModalData((p) => ({ ...p, driver_id: e.target.value }))}
                    placeholder="Ej: 42"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60" />
                  {(() => {
                    const v = vehicles.find((x) => x.plate === selectedPlate);
                    if (v?.driver) return (
                      <p className="text-xs text-slate-500 mt-1">
                        Conductor asignado: <strong>{v.driver.full_name}</strong> (ID {v.driver.id})
                        <button className="ml-2 text-blue-600 underline" onClick={() => setLeasingModalData((p) => ({ ...p, driver_id: String(v.driver!.id) }))}>Usar este</button>
                      </p>
                    );
                  })()}
                </div>

                {/* Notas */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Notas (opcional)</label>
                  <textarea value={leasingModalData.notes}
                    onChange={(e) => setLeasingModalData((p) => ({ ...p, notes: e.target.value }))}
                    rows={2} placeholder="Ej: Contrato firmado el 20/07/2026..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/60 resize-none" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowLeasingModal(false)}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleActivateLeasing} disabled={activatingLeasing}
                    className="flex-1 flex justify-center items-center gap-2 bg-emerald-600 text-white rounded-xl py-3 font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                    {activatingLeasing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
                    Confirmar y Activar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
