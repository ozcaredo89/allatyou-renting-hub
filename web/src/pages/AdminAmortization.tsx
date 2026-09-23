import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import {
  Calculator, Save, X, Calendar as CalendarIcon, Loader2, Info,
  ChevronDown, ChevronUp, Download, Rocket, Trash2, ClipboardList,
  AlertTriangle, CheckCircle2, FileCheck, Phone, Search, RefreshCw
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
  driver?: { id: number; full_name: string; phone?: string; document_number?: string } | null;
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

type PendingContract = {
  id: number;
  plate: string;
  driver_id: number;
  purchase_price: number;
  down_payment: number;
  financed_capital: number;
  monthly_rate_pct: number;
  daily_maintenance: number;
  daily_admin: number;
  daily_capital_interest: number;
  start_date: string;
  original_start_date?: string | null;
  status: string;
  created_at: string;
  signed_contract_url?: string | null;
  driver?: {
    id: number;
    full_name: string;
    phone?: string;
    document_number?: string;
  } | null;
  vehicle?: {
    plate: string;
    brand?: string;
    line?: string;
    model_year?: number;
  } | null;
  [key: string]: any;
};

const fmtCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function getTodayColombia(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function getTomorrowColombia(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

function formatDaysDiff(dateStr: string) {
  if (!dateStr) return "";
  const todayStr = getTodayColombia();
  if (dateStr === todayStr) return "Inicia hoy";
  const target = new Date(dateStr + "T12:00:00");
  const today = new Date(todayStr + "T12:00:00");
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 0) return `Inicia en ${diffDays} día${diffDays > 1 ? "s" : ""}`;
  const pastDays = Math.abs(diffDays);
  return `Vencida hace ${pastDays} día${pastDays > 1 ? "s" : ""}`;
}

function formatCreatedAgo(isoDate: string) {
  if (!isoDate) return "";
  const created = new Date(isoDate);
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
  if (diffHours < 1) return "Hace un momento";
  if (diffHours < 24) return `Hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays}d`;
}

export default function AdminAmortization() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [authHeader, setAuthHeader] = useState("");

  // Tabs navigation
  const [activeTab, setActiveTab] = useState<"simulation" | "pending">("simulation");
  const [pendingFilterPlate, setPendingFilterPlate] = useState<string>("");
  const [pendingContracts, setPendingContracts] = useState<PendingContract[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingTotal, setPendingTotal] = useState(0);

  // Active modal for activation (unified)
  const [activeModalContractId, setActiveModalContractId] = useState<number | null>(null);

  const filteredPending = useMemo(() => {
    if (!pendingFilterPlate.trim()) return pendingContracts;
    const q = pendingFilterPlate.trim().toUpperCase();
    return pendingContracts.filter((c) =>
      c.plate.toUpperCase().includes(q) ||
      (c.driver?.full_name && c.driver.full_name.toUpperCase().includes(q)) ||
      (c.driver?.document_number && c.driver.document_number.includes(q))
    );
  }, [pendingContracts, pendingFilterPlate]);

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
  const tomorrowStr = getTomorrowColombia();
  const [startDate, setStartDate] = useState<string>(tomorrowStr);

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

  // Generate Contract modal
  const [showContractModal, setShowContractModal] = useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [contractResult, setContractResult] = useState<any>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const [contractModalData, setContractModalData] = useState({
    driver_id: "",
    down_payment: "0",
    taller_autorizado: "Taller AllAtYou, Cali",
    geocerca_descripcion: "área metropolitana de Cali y municipios aledaños autorizados",
    limite_velocidad_kmh: "100",
    valor_garantia: "",
    valor_clausula_penal: "",
    mora_pct: "",
    vehiculo_cilindraje: "",
    vehiculo_combustible: "GASOLINA",
    vehiculo_color: "",
    vehiculo_carroceria: "",
    medio_pago: "transferencia electrónica o consignación en la cuenta designada por EL VENDEDOR",
  });

  // URL searchParams sync
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "pending") {
      setActiveTab("pending");
    } else if (tabParam === "simulation") {
      setActiveTab("simulation");
    }
    const plateParam = searchParams.get("plate");
    if (plateParam) {
      setPendingFilterPlate(plateParam.toUpperCase());
    }
  }, [searchParams]);

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
    loadPendingContracts(auth);
  }, []);

  async function loadPendingContracts(auth?: string) {
    const hdr = auth || authHeader;
    setLoadingPending(true);
    try {
      const rs = await fetch(`${API}/leasing/contracts?status=pending&expand=1`, {
        headers: { Authorization: hdr },
      });
      if (!rs.ok) return;
      const data = await rs.json();
      setPendingContracts(data.items || []);
      setPendingTotal(data.total || 0);
    } catch (err) {
      console.error("Error loading pending contracts:", err);
    } finally {
      setLoadingPending(false);
    }
  }

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
    const today = getTodayColombia();
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
    setStartDate(tomorrowStr);
    setSchedule([]);

    // Auto-simulate immediately using the sim's values directly (bypasses async state)
    handleSimulate({
      cap:   sim.purchase_price,
      rate:  sim.monthly_rate_pct,
      quota: sim.daily_quota,
      date:  today,
      plate: sim.plate,
    });
  };

  // ── CANCEL PENDING CONTRACT ──
  const handleCancelPending = async (contractId: number, plate: string) => {
    if (!confirm(`¿Estás seguro de cancelar el contrato borrador #${contractId} para el vehículo ${plate}?\n\nEl vehículo volverá a estar disponible en la flota.`)) {
      return;
    }
    try {
      const rs = await fetch(`${API}/leasing/contracts/${contractId}/cancel-pending`, {
        method: "POST",
        headers: { Authorization: authHeader },
      });
      const data = await rs.json();
      if (!rs.ok) throw new Error(data.error || "Error al cancelar el contrato");
      alert("✅ Contrato cancelado y vehículo liberado.");
      await loadPendingContracts();
      // Refresh vehicles
      const vRs = await fetch(`${API}/vehicles?status=all`, { headers: { Authorization: authHeader } });
      if (vRs.ok) {
        const vData = await vRs.json();
        setVehicles(Array.isArray(vData) ? vData : []);
      }
    } catch (err: any) {
      alert(err.message || "Error al cancelar el contrato");
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

  // ── Generar Contrato Oficial (PDF + DOCX) vía backend ────────────────────
  const handleGenerateContract = async () => {
    if (!selectedPlate) {
      setContractError("Selecciona una placa primero.");
      return;
    }
    if (!contractModalData.driver_id) {
      setContractError("Debes seleccionar un conductor.");
      return;
    }
    if (!contractModalData.mora_pct) {
      setContractError("La tasa de mora mensual (%) es requerida.");
      return;
    }

    setGeneratingContract(true);
    setContractError(null);
    try {
      const payload = {
        plate: selectedPlate,
        driver_id: contractModalData.driver_id,
        purchase_price: parseFloat(capital),
        down_payment: parseFloat(contractModalData.down_payment) || 0,
        monthly_rate_pct: parseFloat(monthlyRate),
        daily_maintenance: parseFloat(maintenanceFund),
        daily_admin: parseFloat(adminExpenses),
        start_date: startDate,

        daily_capital_interest: parseFloat(dailyQuota),
        mora_pct: parseFloat(contractModalData.mora_pct),
        taller_autorizado: contractModalData.taller_autorizado,
        geocerca_descripcion: contractModalData.geocerca_descripcion,
        limite_velocidad_kmh: contractModalData.limite_velocidad_kmh,
        valor_garantia: parseFloat(contractModalData.valor_garantia) || 0,
        valor_clausula_penal: parseFloat(contractModalData.valor_clausula_penal) || 0,
        vehiculo_cilindraje: contractModalData.vehiculo_cilindraje,
        vehiculo_combustible: contractModalData.vehiculo_combustible,
        vehiculo_color: contractModalData.vehiculo_color,
        vehiculo_carroceria: contractModalData.vehiculo_carroceria,
        medio_pago: contractModalData.medio_pago,
      };

      const rs = await fetch(`${API}/leasing/contracts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify(payload),
      });
      const data = await rs.json();
      if (!rs.ok) {
        setContractError(data.error || "Error generando el contrato");
        return;
      }
      setContractResult(data);
    } catch (e: any) {
      setContractError(e.message || "Error de conexión");
    } finally {
      setGeneratingContract(false);
    }
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
                disabled={savingSimulation || !canSaveSimulation || !!changedField}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 shadow-sm transition-all disabled:opacity-40"
                title={changedField ? "Debes regenerar la simulación antes de guardar" : ""}
              >
                {savingSimulation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar Simulación
              </button>

              {/* Generar Contrato Oficial (PDF+DOCX) */}
              <button
                type="button"
                onClick={() => { 
                  const v = vehicles.find(x => x.plate === selectedPlate);
                  const dId = v?.driver?.id ? String(v.driver.id) : "";
                  setContractModalData(p => ({ ...p, driver_id: dId }));
                  setShowContractModal(true); 
                  setContractResult(null); 
                  setContractError(null); 
                }}
                disabled={!canActivateLeasing || !!changedField}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-all disabled:opacity-40"
                title={changedField ? "Debes regenerar la simulación" : ""}
              >
                <Download className="h-4 w-4" />
                Generar Contrato (Borrador)
              </button>

              {/* Activar leasing */}
              <button
                type="button"
                onClick={() => {
                  if (contractResult?.contract_id) {
                    setActiveModalContractId(contractResult.contract_id);
                  }
                }}
                disabled={!contractResult?.contract_id || !!changedField}
                className="flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-40"
                title={!contractResult?.contract_id ? "Primero genera el contrato borrador" : (changedField ? "Debes regenerar la simulación antes de activar" : "")}
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

        {/* TABS NAVEGACIÓN */}
        <div className="mt-8 border-b border-slate-200">
          <div className="flex space-x-8">
            <button
              onClick={() => {
                setActiveTab("simulation");
                setSearchParams((prev) => {
                  const n = new URLSearchParams(prev);
                  n.delete("tab");
                  return n;
                });
              }}
              className={`pb-4 px-1 text-sm font-bold flex items-center gap-2 border-b-2 transition-all ${
                activeTab === "simulation"
                  ? "border-black text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              <Calculator className="h-4 w-4" />
              Simulación de Cuotas
              {schedule.length > 0 && (
                <span className="ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {schedule.length}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                setActiveTab("pending");
                setSearchParams((prev) => {
                  const n = new URLSearchParams(prev);
                  n.set("tab", "pending");
                  return n;
                });
              }}
              className={`pb-4 px-1 text-sm font-bold flex items-center gap-2 border-b-2 transition-all relative ${
                activeTab === "pending"
                  ? "border-black text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              <Rocket className="h-4 w-4" />
              Contratos Pendientes
              {pendingTotal > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-xs font-bold">
                  {pendingTotal}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* TAB 1: RESULTADOS DE SIMULACIÓN */}
        {activeTab === "simulation" && (
          schedule.length > 0 ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-6">
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
          ) : (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
              <Calculator className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-700">Sin simulación proyectada</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Ajusta el capital, interés y cuota en el formulario superior y presiona <strong>Simular</strong> para visualizar la gráfica de amortización y el desglose de cuotas.
              </p>
            </div>
          )
        )}

        {/* TAB 2: CONTRATOS PENDIENTES */}
        {activeTab === "pending" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-6 space-y-4">
            {/* Header del tab con buscador y refresh */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex-1 relative max-w-md">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar por placa o conductor..."
                  value={pendingFilterPlate}
                  onChange={(e) => setPendingFilterPlate(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-black/60"
                />
                {pendingFilterPlate && (
                  <button
                    onClick={() => {
                      setPendingFilterPlate("");
                      setSearchParams((prev) => {
                        const n = new URLSearchParams(prev);
                        n.delete("plate");
                        return n;
                      });
                    }}
                    className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5"
                    title="Limpiar búsqueda"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 justify-between sm:justify-end">
                <span className="text-xs text-slate-500 font-medium">
                  {filteredPending.length} {filteredPending.length === 1 ? "contrato pendiente" : "contratos pendientes"}
                </span>
                <button
                  onClick={() => loadPendingContracts()}
                  disabled={loadingPending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingPending ? "animate-spin" : ""}`} />
                  Actualizar
                </button>
              </div>
            </div>

            {/* Listado de contratos pendientes */}
            {loadingPending ? (
              <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-slate-400" />
                <p className="text-sm font-medium">Cargando contratos pendientes...</p>
              </div>
            ) : filteredPending.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800">
                  {pendingFilterPlate ? "No se encontraron contratos para el filtro aplicado" : "No hay contratos de leasing pendientes"}
                </h3>
                <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                  {pendingFilterPlate
                    ? "Prueba buscando con otra placa o limpiando el filtro de búsqueda."
                    : "Todos los contratos generados han sido activados formalmente o cancelados."}
                </p>
                {pendingFilterPlate && (
                  <button
                    onClick={() => {
                      setPendingFilterPlate("");
                      setSearchParams((prev) => {
                        const n = new URLSearchParams(prev);
                        n.delete("plate");
                        return n;
                      });
                    }}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    Limpiar Filtro
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* ── Vista Escritorio: Tabla completa (>= md) ── */}
                <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3.5">Contrato</th>
                        <th className="px-5 py-3.5">Vehículo</th>
                        <th className="px-5 py-3.5">Conductor</th>
                        <th className="px-5 py-3.5">Condiciones Financieras</th>
                        <th className="px-5 py-3.5">Inicio Programado</th>
                        <th className="px-5 py-3.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPending.map((c) => {
                        const todayStr = getTodayColombia();
                        const isPast = c.start_date < todayStr;
                        const totalDaily = Number(c.daily_capital_interest) + Number(c.daily_maintenance || 10000) + Number(c.daily_admin || 11000);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Contrato ID + creación */}
                            <td className="px-5 py-4">
                              <span className="font-mono font-bold text-slate-900 block">#{c.id}</span>
                              <span className="text-[11px] text-slate-400 block" title={c.created_at}>
                                {formatCreatedAgo(c.created_at)}
                              </span>
                            </td>

                            {/* Vehículo */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-slate-900 px-2 py-0.5 bg-slate-100 rounded border border-slate-200 text-xs">
                                  {c.plate}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500 block mt-0.5">
                                {c.vehicle?.brand} {c.vehicle?.line} {c.vehicle?.model_year ? `(${c.vehicle.model_year})` : ""}
                              </span>
                            </td>

                            {/* Conductor */}
                            <td className="px-5 py-4">
                              <span className="font-semibold text-slate-800 block text-xs">
                                {c.driver?.full_name || `Conductor #${c.driver_id}`}
                              </span>
                              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                                {c.driver?.document_number && <span>CC: {c.driver.document_number}</span>}
                                {c.driver?.phone && (
                                  <a href={`tel:${c.driver.phone}`} className="text-blue-600 hover:underline flex items-center gap-0.5 font-medium">
                                    <Phone className="h-2.5 w-2.5" /> {c.driver.phone}
                                  </a>
                                )}
                              </div>
                            </td>

                            {/* Condiciones */}
                            <td className="px-5 py-4">
                              <div className="text-xs space-y-0.5">
                                <div>
                                  <span className="text-slate-400 text-[10px] uppercase font-semibold mr-1">Capital:</span>
                                  <span className="font-semibold text-slate-800">{fmtCOP.format(Number(c.financed_capital || c.purchase_price))}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 text-[10px] uppercase font-semibold mr-1">Cuota Diaria:</span>
                                  <span className="font-bold text-blue-700">{fmtCOP.format(totalDaily)}</span>
                                  <span className="text-[10px] text-slate-400 ml-1">({c.monthly_rate_pct}%/m)</span>
                                </div>
                              </div>
                            </td>

                            {/* Inicio Programado */}
                            <td className="px-5 py-4">
                              <span className="font-medium text-slate-800 text-xs block">{c.start_date}</span>
                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border mt-1 ${
                                isPast
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : "bg-emerald-50 text-emerald-800 border-emerald-200"
                              }`}>
                                {formatDaysDiff(c.start_date)}
                              </span>
                            </td>

                            {/* Acciones */}
                            <td className="px-5 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActiveModalContractId(c.id)}
                                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all"
                                >
                                  <Rocket className="h-3.5 w-3.5" />
                                  Activar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancelPending(c.id, c.plate)}
                                  className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl text-xs font-medium transition-colors"
                                  title="Cancelar contrato borrador y liberar vehículo"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Vista Móvil: Tarjetas táctiles (< md) ── */}
                <div className="block md:hidden space-y-3">
                  {filteredPending.map((c) => {
                    const todayStr = getTodayColombia();
                    const isPast = c.start_date < todayStr;
                    const totalDaily = Number(c.daily_capital_interest) + Number(c.daily_maintenance || 10000) + Number(c.daily_admin || 11000);
                    return (
                      <div key={c.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                        {/* Cabecera Tarjeta */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-slate-900 px-2 py-0.5 bg-slate-100 rounded border border-slate-200">
                              {c.plate}
                            </span>
                            <span className="text-xs text-slate-400 font-mono">#{c.id}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            isPast
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-emerald-50 text-emerald-800 border-emerald-200"
                          }`}>
                            {formatDaysDiff(c.start_date)}
                          </span>
                        </div>

                        {/* Vehículo y Conductor */}
                        <div className="text-xs space-y-1">
                          <p className="text-slate-600 font-medium">
                            {c.vehicle?.brand} {c.vehicle?.line} {c.vehicle?.model_year ? `(${c.vehicle.model_year})` : ""}
                          </p>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <span className="font-semibold text-slate-800">
                              {c.driver?.full_name || `Conductor #${c.driver_id}`}
                            </span>
                            {c.driver?.phone && (
                              <a href={`tel:${c.driver.phone}`} className="text-blue-600 font-semibold flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {c.driver.phone}
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Finanzas en Grid 2x2 */}
                        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl text-xs border border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase font-semibold">Capital</span>
                            <span className="font-bold text-slate-800">{fmtCOP.format(Number(c.financed_capital || c.purchase_price))}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block uppercase font-semibold">Cuota Diaria Total</span>
                            <span className="font-bold text-blue-700">{fmtCOP.format(totalDaily)}</span>
                          </div>
                        </div>

                        {/* Fecha de inicio */}
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Inicio: <strong className="text-slate-700">{c.start_date}</strong></span>
                          <span className="text-[11px] text-slate-400">{formatCreatedAgo(c.created_at)}</span>
                        </div>

                        {/* Botones de acción móvil (touch target >= 44px) */}
                        <div className="pt-1 space-y-2">
                          <button
                            type="button"
                            onClick={() => setActiveModalContractId(c.id)}
                            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors text-sm"
                          >
                            <Rocket className="h-4 w-4" />
                            Activar Contrato
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelPending(c.id, c.plate)}
                            className="w-full py-2 text-center text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
                          >
                            Cancelar Contrato Borrador
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
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

      {/* ── MODAL ACTIVAR LEASING (UNIFICADO) ── */}
      {activeModalContractId !== null && (
        <LeasingActivationModal
          contractId={activeModalContractId}
          authHeader={authHeader}
          onClose={() => setActiveModalContractId(null)}
          onSuccess={() => {
            loadPendingContracts();
            fetch(`${API}/vehicles?status=all`, { headers: { Authorization: authHeader } })
              .then((r) => r.json())
              .then((data) => Array.isArray(data) && setVehicles(data))
              .catch(() => {});
          }}
        />
      )}

      {/* ══ MODAL GENERAR CONTRATO OFICIAL ══ */}
      {showContractModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowContractModal(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Generar Contrato Oficial</h2>
                <p className="text-sm text-slate-500 mt-0.5">Se generará el PDF y DOCX con la amortización completa</p>
              </div>
              <button onClick={() => setShowContractModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">×</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* ── Conductor y Cuota Inicial ── */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Conductor Titular</label>
                  {(() => {
                    const v = vehicles.find((x) => x.plate === selectedPlate);
                    if (v?.driver && contractModalData.driver_id === String(v.driver.id)) {
                      return (
                        <div className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm flex justify-between items-center shadow-sm">
                          <span className="font-semibold text-slate-800">{v.driver.full_name}</span>
                          <button 
                            type="button"
                            className="text-[10px] text-blue-600 underline font-semibold bg-blue-50 px-2 py-0.5 rounded-md hover:bg-blue-100" 
                            onClick={() => setContractModalData(p => ({ ...p, driver_id: "" }))}
                          >
                            Cambiar
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div>
                        <input type="number" value={contractModalData.driver_id}
                          onChange={(e) => setContractModalData((p) => ({ ...p, driver_id: e.target.value }))}
                          placeholder="ID del conductor (Ej: 42)"
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40" />
                        {v?.driver && (
                          <p className="text-[10px] text-slate-500 mt-1">
                            El titular asignado al vehículo es <strong>{v.driver.full_name}</strong>
                            <button type="button" className="ml-2 text-blue-600 underline" onClick={() => setContractModalData((p) => ({ ...p, driver_id: String(v.driver!.id) }))}>Usar original</button>
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Cuota Inicial (Enganche)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500">$</span>
                    <input type="number" value={contractModalData.down_payment}
                      onChange={(e) => setContractModalData((p) => ({ ...p, down_payment: e.target.value }))}
                      placeholder="0"
                      className="w-full rounded-lg border border-slate-200 bg-white pl-7 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40" />
                  </div>
                </div>
              </div>

              {/* ── Datos de la cotización (solo lectura — ya están fijos) ── */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                  Datos tomados de la cotización (no modificables)
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {[
                    { label: "Vehículo", value: `${selectedPlate || "—"}` },
                    { label: "Capital Financiado", value: capital ? `$${Number(capital).toLocaleString("es-CO")}` : "—" },
                    { label: "Tasa Remuneratoria", value: monthlyRate ? `${monthlyRate}% M.V.` : "—" },
                    { label: "Cuota Diaria (cap. + int.)", value: dailyQuota ? `$${Number(dailyQuota).toLocaleString("es-CO")}` : "—" },
                    { label: "Fondo Mantenimiento", value: maintenanceFund ? `$${Number(maintenanceFund).toLocaleString("es-CO")}/día` : "—" },
                    { label: "Gastos Admin.", value: adminExpenses ? `$${Number(adminExpenses).toLocaleString("es-CO")}/día` : "—" },
                    { label: "Fecha de Inicio", value: startDate || "—" },
                    { label: "Total Cuotas (días)", value: totalTerm ? `${totalTerm} días` : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex flex-col">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
                      <span className="font-semibold text-slate-800">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Tasa de mora (único dato financiero nuevo) ── */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Tasa de Mora <span className="normal-case font-normal text-slate-400">(diferente a la tasa remuneratoria)</span>
                </p>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tasa de mora mensual (%)</label>
                    <input
                      value={contractModalData.mora_pct}
                      onChange={(e) => setContractModalData(p => ({ ...p, mora_pct: e.target.value }))}
                      type="number" step="0.01" placeholder="ej: 2.9"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                  <p className="text-xs text-slate-400 pb-2.5 max-w-[200px]">
                    Se aplica solo en caso de incumplimiento. Validada contra el IBC vigente (máx. 1.5× IBC).
                  </p>
                </div>
              </div>

              {/* ── Datos físicos del vehículo ── */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Datos Físicos del Vehículo</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Cilindraje (cc)", key: "vehiculo_cilindraje", placeholder: "ej: 995" },
                    { label: "Color", key: "vehiculo_color", placeholder: "ej: Blanco" },
                    { label: "Carrocería", key: "vehiculo_carroceria", placeholder: "ej: Hatchback" },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                      <input
                        value={(contractModalData as any)[key]}
                        onChange={(e) => setContractModalData(p => ({ ...p, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Combustible</label>
                    <select
                      value={contractModalData.vehiculo_combustible}
                      onChange={(e) => setContractModalData(p => ({ ...p, vehiculo_combustible: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 bg-white"
                    >
                      <option>GASOLINA</option>
                      <option>DIESEL</option>
                      <option>ELÉCTRICO</option>
                      <option>HÍBRIDO</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* ── Condiciones de operación ── */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Condiciones de Operación</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Taller Autorizado</label>
                    <input
                      value={contractModalData.taller_autorizado}
                      onChange={(e) => setContractModalData(p => ({ ...p, taller_autorizado: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Geocerca / Zona de Operación Autorizada</label>
                    <input
                      value={contractModalData.geocerca_descripcion}
                      onChange={(e) => setContractModalData(p => ({ ...p, geocerca_descripcion: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Límite de Velocidad (km/h)</label>
                    <input
                      value={contractModalData.limite_velocidad_kmh}
                      onChange={(e) => setContractModalData(p => ({ ...p, limite_velocidad_kmh: e.target.value }))}
                      type="number" min="60" max="200"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                </div>
              </div>

              {/* ── Garantías ── */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Garantías</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Depósito de Garantía ($)</label>
                    <input
                      value={contractModalData.valor_garantia}
                      onChange={(e) => setContractModalData(p => ({ ...p, valor_garantia: e.target.value }))}
                      type="number" placeholder="ej: 300000"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cláusula Penal ($)</label>
                    <input
                      value={contractModalData.valor_clausula_penal}
                      onChange={(e) => setContractModalData(p => ({ ...p, valor_clausula_penal: e.target.value }))}
                      type="number" placeholder="ej: 1000000"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                </div>
              </div>

              {/* ── Errores ── */}
              {contractError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                  ❌ {contractError}
                </div>
              )}

              {/* ── Resultado con links de descarga ── */}
              {contractResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-emerald-800">✅ Contrato generado exitosamente</p>
                  <div className="text-xs text-emerald-700 space-y-1">
                    <p>No. Contrato: <strong>{contractResult.numero_contrato}</strong></p>
                    <p>No. Pagaré: <strong>{contractResult.numero_pagare}</strong></p>
                    <p className="text-amber-700 font-semibold">⏰ Los links expiran en 30 minutos — descarga los archivos ahora</p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a href={contractResult.pdf_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-700 transition-colors">
                      <Download className="h-4 w-4" /> Descargar PDF
                    </a>
                    <a href={contractResult.docx_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                      <Download className="h-4 w-4" /> Descargar DOCX
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        const cid = contractResult.contract_id;
                        setShowContractModal(false);
                        setActiveModalContractId(cid);
                      }}
                      className="flex items-center gap-2 bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
                    >
                      <Rocket className="h-4 w-4" /> Proceder a Activar Contrato
                    </button>
                  </div>
                </div>
              )}
            </div>


            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
              <button
                onClick={() => setShowContractModal(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Cerrar
              </button>
              {!contractResult && (
                <button
                  onClick={handleGenerateContract}
                  disabled={generatingContract}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-40"
                >
                  {generatingContract ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {generatingContract ? "Generando…" : "Generar Contrato"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MODAL UNIFICADO DE ACTIVACIÓN DE LEASING
// Carga el contrato pendiente por ID, permite ajustar y confirmar la fecha de inicio,
// y exige la subida del contrato firmado/autenticado a Cloudflare R2 antes de activar.
// ══════════════════════════════════════════════════════════════════════════════
type LeasingActivationModalProps = {
  contractId: number;
  authHeader: string;
  onClose: () => void;
  onSuccess: () => void;
};

function LeasingActivationModal({ contractId, authHeader, onClose, onSuccess }: LeasingActivationModalProps) {
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [startDateConfirmed, setStartDateConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signedDocUrl, setSignedDocUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [activationResult, setActivationResult] = useState<any>(null);

  const todayStr = getTodayColombia();

  useEffect(() => {
    async function fetchContract() {
      setLoading(true);
      setError(null);
      try {
        const rs = await fetch(`${API}/leasing/contracts/${contractId}?expand=1`, {
          headers: { Authorization: authHeader },
        });
        if (!rs.ok) {
          const errData = await rs.json().catch(() => ({}));
          throw new Error(errData.error || "Error al cargar información del contrato");
        }
        const data = await rs.json();
        setContract(data);
        setStartDate(data.start_date || todayStr);
      } catch (e: any) {
        setError(e.message || "Error al conectar con el servidor");
      } finally {
        setLoading(false);
      }
    }
    fetchContract();
  }, [contractId, authHeader, todayStr]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "contracts");

      const upRes = await fetch(`${API}/uploads`, {
        method: "POST",
        headers: { Authorization: authHeader },
        body: fd,
      });

      const upData = await upRes.json();
      if (!upRes.ok) {
        throw new Error(upData.error || "Error al subir el archivo");
      }
      setSignedDocUrl(upData.url);
    } catch (err: any) {
      setUploadError(err.message || "Error al subir documento autenticado");
    } finally {
      setUploading(false);
    }
  };

  const handleActivate = async () => {
    if (!signedDocUrl) {
      setError("El documento autenticado en PDF o imagen es obligatorio para activar.");
      return;
    }
    if (!startDateConfirmed) {
      setError("Debes confirmar que la fecha de inicio coincide con la del contrato firmado.");
      return;
    }
    if (!startDate) {
      setError("La fecha de inicio es requerida.");
      return;
    }

    setActivating(true);
    setError(null);
    try {
      const rs = await fetch(`${API}/leasing/contracts/${contractId}/activate`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          start_date: startDate,
          start_date_confirmed: true,
          signed_contract_url: signedDocUrl,
        }),
      });

      const data = await rs.json();
      if (!rs.ok) {
        throw new Error(data.error || "Error al activar el contrato");
      }

      setActivationResult(data);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Error inesperado al activar el contrato");
    } finally {
      setActivating(false);
    }
  };

  const isPastDate = !!startDate && startDate < todayStr;
  const originalDate = contract?.original_start_date || contract?.start_date;
  const isChangedDate = !!contract && !!startDate && startDate !== originalDate;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden my-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
              <Rocket className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">Activar Contrato de Leasing</h3>
              <p className="text-xs text-slate-500">
                Contrato #{contractId} {contract?.plate ? `· Placa: ${contract.plate}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 bg-slate-50 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-slate-400" />
            <p className="text-sm font-medium">Cargando detalles del contrato #{contractId}...</p>
          </div>
        ) : activationResult ? (
          <div className="p-8 text-center space-y-4">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2">
              <span className="text-3xl">🎉</span>
            </div>
            <h4 className="text-xl font-black text-slate-900">¡Contrato Activado con Éxito!</h4>
            <p className="text-slate-600 text-sm">
              El contrato #{contractId} para el vehículo <strong className="text-slate-900">{contract?.plate}</strong> está formalmente activo.
            </p>
            <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600 space-y-1 text-left">
              <p>Cuotas generadas en el cronograma: <strong className="text-emerald-600 text-sm">{activationResult.schedule_rows}</strong></p>
              <p>Fecha de inicio formal: <strong className="text-slate-800">{startDate}</strong></p>
              <p className="text-[11px] text-slate-400 mt-2">El vehículo ha cambiado a estado "En Leasing" y sus cuotas ya pueden recaudarse.</p>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-black text-white rounded-xl py-3 font-semibold hover:bg-slate-800 transition-colors shadow-sm"
            >
              Cerrar y Actualizar
            </button>
          </div>
        ) : !contract ? (
          <div className="p-8 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-rose-500 mx-auto" />
            <p className="text-sm text-slate-700 font-semibold">{error || "No se pudo cargar el contrato."}</p>
            <button
              onClick={onClose}
              className="bg-slate-100 text-slate-700 px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-200"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
            {/* Info Resumen: Conductor y Vehículo */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2.5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-slate-400 font-medium block">Vehículo</span>
                  <span className="font-bold text-sm text-slate-900 font-mono">{contract.plate}</span>
                  <span className="text-slate-600 ml-2">
                    {contract.vehicle?.brand} {contract.vehicle?.line} {contract.vehicle?.model_year ? `(${contract.vehicle.model_year})` : ""}
                  </span>
                </div>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  {contract.status}
                </span>
              </div>

              <div className="border-t border-slate-200/60 pt-2 flex justify-between items-start">
                <div>
                  <span className="text-slate-400 font-medium block">Conductor</span>
                  <span className="font-bold text-slate-800">{contract.driver?.full_name || `ID #${contract.driver_id}`}</span>
                  {contract.driver?.document_number && (
                    <span className="text-slate-500 ml-1.5 font-mono">CC: {contract.driver.document_number}</span>
                  )}
                </div>
                {contract.driver?.phone && (
                  <a
                    href={`tel:${contract.driver.phone}`}
                    className="flex items-center gap-1 text-blue-600 font-semibold hover:underline"
                  >
                    <Phone className="h-3 w-3" />
                    {contract.driver.phone}
                  </a>
                )}
              </div>

              {/* Finanzas */}
              <div className="border-t border-slate-200/60 pt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Capital Financiado</span>
                  <span className="font-bold text-slate-800">{fmtCOP.format(Number(contract.financed_capital || contract.purchase_price))}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Tasa Mensual</span>
                  <span className="font-bold text-slate-800">{contract.monthly_rate_pct}% M.V.</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Cuota Cap.+Int.</span>
                  <span className="font-bold text-slate-800">{fmtCOP.format(Number(contract.daily_capital_interest))}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Cuota Total Diaria</span>
                  <span className="font-bold text-blue-700">
                    {fmtCOP.format(Number(contract.daily_capital_interest) + Number(contract.daily_maintenance || 10000) + Number(contract.daily_admin || 11000))}
                  </span>
                </div>
              </div>
            </div>

            {/* Error general si hubo */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            {/* Fecha de Inicio */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Fecha de Inicio Efectiva
              </label>
              <div className="relative">
                <CalendarIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium outline-none focus:ring-2 focus:ring-black/60 bg-white"
                />
              </div>

              {/* Advertencia si la fecha es pasada */}
              {isPastDate && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2.5 animate-in fade-in">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <strong className="font-bold">Advertencia:</strong> La fecha seleccionada ({startDate}) ya transcurrió. Las cuotas de días previos se generarán en el cronograma como vencidas/pendientes de cobro.
                  </div>
                </div>
              )}

              {/* Aviso si la fecha difiere del borrador original */}
              {isChangedDate && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex items-start gap-2.5 animate-in fade-in">
                  <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                  <div>
                    <strong className="font-bold">Fecha modificada:</strong> La fecha original del borrador era <strong>{originalDate}</strong>. El cronograma y las restricciones de Pico y Placa se recalcularán automáticamente a partir de la nueva fecha.
                  </div>
                </div>
              )}
            </div>

            {/* Checkbox obligatorio de confirmación */}
            <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={startDateConfirmed}
                onChange={(e) => setStartDateConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-xs font-semibold text-slate-700 leading-relaxed">
                Confirmo que la fecha de inicio coincide exactamente con la indicada en el contrato firmado y autenticado ante notaría.
              </span>
            </label>

            {/* Subir Documento Autenticado */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Documento Firmado y Autenticado <span className="text-red-500">* (Obligatorio)</span>
              </label>
              <p className="text-[11px] text-slate-500">
                Sube el archivo escaneado (PDF o imagen) con sellos notariales legibles. Se almacenará de forma segura en Cloudflare R2.
              </p>

              {signedDocUrl ? (
                <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="font-medium">Documento cargado correctamente en R2</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={signedDocUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-700 underline font-semibold hover:text-emerald-900"
                    >
                      Ver archivo
                    </a>
                    <label className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer">
                      Reemplazar
                      <input
                        type="file"
                        accept="application/pdf,image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer disabled:opacity-50"
                  />
                  {uploading && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                      <span>Subiendo documento a Cloudflare R2...</span>
                    </div>
                  )}
                  {uploadError && (
                    <p className="text-xs text-red-600 mt-1">❌ {uploadError}</p>
                  )}
                </div>
              )}
            </div>

            {/* Botones de acción */}
            <div className="flex gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={activating}
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleActivate}
                disabled={activating || uploading || !signedDocUrl || !startDateConfirmed || !startDate}
                className="flex-1 flex justify-center items-center gap-2 bg-emerald-600 text-white rounded-xl py-3 font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-40 shadow-sm"
              >
                {activating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
                {activating ? "Activando…" : "Confirmar y Activar"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
