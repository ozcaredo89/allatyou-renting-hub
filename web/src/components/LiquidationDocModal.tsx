import { useState } from "react";
import { X, FileText, Download, Printer, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { ensureBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

interface Props {
  isOpen: boolean;
  onClose: () => void;
  liquidationId: string;
  driver: {
    id: number;
    full_name: string;
    document_number?: string;
    phone?: string;
    email?: string;
  };
  plate: string | null;
  vehicle?: {
    brand?: string;
    line?: string;
    model_year?: number;
    status?: string;
  } | null;
  incomes: Array<{ id: string; concept: string; amount: number }>;
  deductions: Array<{ id: string; concept: string; amount: number }>;
  totalIncomes: number;
  totalDeductions: number;
  finalBalance: number;
  savingsStartDate?: string | null;
  savingsEndDate?: string | null;
  repairs?: Array<{ date: string; category: string; item?: string; total_amount: number }>;
}

function formatFormalDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T12:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];
  return `${d.getDate()} de ${meses[d.getMonth()]} del ${d.getFullYear()}`;
}

export function LiquidationDocModal({
  isOpen,
  onClose,
  liquidationId,
  driver,
  plate,
  vehicle,
  incomes,
  deductions,
  totalIncomes,
  totalDeductions,
  finalBalance,
  savingsStartDate,
  savingsEndDate,
  repairs = [],
}: Props) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayFormal = formatFormalDate(todayStr);

  // Inicializar observaciones de revisión con daños conocidos si existen
  const defaultObservaciones = repairs && repairs.length > 0
    ? `SE EVIDENCIAN REPARACIONES/NOVEDADES: ${repairs.map(r => `${r.category || 'Mantenimiento'}: $${Number(r.total_amount || 0).toLocaleString('es-CO')}`).join(", ")}`
    : "VEHÍCULO RECIBIDO A SATISFACCIÓN SIN NOVEDADES ESTRUCTURALES NI MECÁNICAS";

  const [ciudad, setCiudad] = useState("Cali");
  const [fechaDocumento, setFechaDocumento] = useState(todayFormal);
  const [fechaDevolucion, setFechaDevolucion] = useState(todayFormal);
  const [fechaInicioAhorro, setFechaInicioAhorro] = useState(
    savingsStartDate ? formatFormalDate(savingsStartDate) : "fecha de inicio de contrato"
  );
  const [fechaFinAhorro, setFechaFinAhorro] = useState(
    savingsEndDate ? formatFormalDate(savingsEndDate) : todayFormal
  );
  const [metodoDevolucion, setMetodoDevolucion] = useState<"transferencia" | "efectivo">("transferencia");
  const [observaciones, setObservaciones] = useState(defaultObservaciones);

  // Parámetros técnicos del vehículo
  const [vehiculoMarca, setVehiculoMarca] = useState(vehicle?.brand || "CHEVROLET");
  const [vehiculoLinea, setVehiculoLinea] = useState(vehicle?.line || "SPARK");
  const [vehiculoModelo, setVehiculoModelo] = useState(vehicle?.model_year ? String(vehicle.model_year) : "2016");
  const [vehiculoCilindraje, setVehiculoCilindraje] = useState("995");
  const [vehiculoCombustible, setVehiculoCombustible] = useState("GASOLINA");
  const [vehiculoCarroceria, setVehiculoCarroceria] = useState("HATCHBACK");
  const [vehiculoServicio, setVehiculoServicio] = useState("Particular");
  const [vehiculoClase, setVehiculoClase] = useState("AUTOMÓVIL");

  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [docUrls, setDocUrls] = useState<{ pdf_url: string; docx_url: string } | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setGenerating(true);
    setErrorMsg(null);

    try {
      const auth = ensureBasicAuth();
      const payload = {
        ciudad,
        fecha_documento: fechaDocumento,
        fecha_devolucion: fechaDevolucion,
        fecha_inicio_ahorro: fechaInicioAhorro,
        fecha_fin_ahorro: fechaFinAhorro,
        metodo_devolucion: metodoDevolucion,
        observaciones_revision: observaciones,
        vehiculo_marca: vehiculoMarca,
        vehiculo_linea: vehiculoLinea,
        vehiculo_modelo: vehiculoModelo,
        vehiculo_cilindraje: vehiculoCilindraje,
        vehiculo_combustible: vehiculoCombustible,
        vehiculo_carroceria: vehiculoCarroceria,
        vehiculo_servicio: vehiculoServicio,
        vehiculo_clase: vehiculoClase,
        generated_by: "Admin",
      };

      const res = await fetch(`${API}/liquidations/${liquidationId}/generate-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Error al generar el documento");
      }

      const data = await res.json();
      setDocUrls({ pdf_url: data.pdf_url, docx_url: data.docx_url });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "No se pudo generar el documento.");
    } finally {
      setGenerating(false);
    }
  };

  const depositoItem = incomes.find(i => i.id === "deposito");
  const ahorroItem = incomes.find(i => i.id === "ahorro");
  const depositoVal = depositoItem ? Number(depositoItem.amount) : 300000;
  const ahorroVal = ahorroItem ? Number(ahorroItem.amount) : (totalIncomes - depositoVal);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                Paz y Salvo & Acta de Devolución de Garantía
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {driver.full_name} • CC: {driver.document_number || "Sin cédula"} • Placa: {plate || "Sin asignar"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-slate-700 text-sm">

          {/* Resumen Inmutable de Cifras Guardadas */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Resumen de Cifras Oficiales (Guardadas en BD)
              </span>
              <span className="bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Liquidación Guardada
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500">Garantía Total Entregada</div>
                <div className="text-base font-bold text-slate-800">${totalIncomes.toLocaleString("es-CO")}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Depósito: ${depositoVal.toLocaleString("es-CO")} | Ahorro: ${ahorroVal.toLocaleString("es-CO")}
                </div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500">Total Deducciones</div>
                <div className="text-base font-bold text-red-600">-${totalDeductions.toLocaleString("es-CO")}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {deductions.filter(d => Number(d.amount) > 0).length} ítems descontados
                </div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-500">Total a Devolver</div>
                <div className={`text-base font-bold ${finalBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  ${finalBalance.toLocaleString("es-CO")}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Saldo neto final</div>
              </div>
            </div>
          </div>

          {/* Estado de Descarga Tras Generación */}
          {docUrls && (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Documento oficial generado con éxito y respaldado en Cloudflare R2</span>
              </div>
              <p className="text-xs text-emerald-700">
                El acta de 4 páginas ha sido compilada con formato legal y firma digital de archivo. Puedes descargar el PDF oficial, el editable de Word (.docx) o imprimirlo:
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <a
                  href={docUrls.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-medium text-xs flex items-center gap-2 shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4" /> Descargar PDF Oficial
                </a>
                <a
                  href={docUrls.docx_url}
                  download={`Paz_y_Salvo_${driver.full_name.replace(/\s+/g, '_')}.docx`}
                  className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-medium text-xs flex items-center gap-2 shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4" /> Descargar Word (.docx)
                </a>
                <a
                  href={docUrls.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 rounded-lg font-medium text-xs flex items-center gap-2 transition-colors"
                >
                  <Printer className="w-4 h-4" /> Imprimir / Ver PDF
                </a>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Formulario de Parámetros del Acta */}
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 text-sm border-b pb-1">
              Parámetros y Cláusulas del Documento
            </h3>

            {/* Fechas de Ahorro y Documento */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Fecha de Inicio de Ahorro (Cláusula 1ª)
                </label>
                <input
                  type="text"
                  value={fechaInicioAhorro}
                  onChange={(e) => setFechaInicioAhorro(e.target.value)}
                  placeholder="ej: 16 de febrero de 2026"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Fecha de Fin de Ahorro (Cláusula 1ª)
                </label>
                <input
                  type="text"
                  value={fechaFinAhorro}
                  onChange={(e) => setFechaFinAhorro(e.target.value)}
                  placeholder="ej: 8 de agosto de 2026"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Ciudad y Fecha del Acta
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
                    placeholder="Cali"
                    className="w-1/3 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="text"
                    value={fechaDocumento}
                    onChange={(e) => setFechaDocumento(e.target.value)}
                    placeholder="Fecha del acta"
                    className="w-2/3 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Medio y Fecha de Devolución (Cláusula 4ª)
                </label>
                <div className="flex flex-col gap-2 pt-0.5">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="radio"
                        name="metodo_devolucion"
                        checked={metodoDevolucion === "transferencia"}
                        onChange={() => setMetodoDevolucion("transferencia")}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      Transferencia bancaria
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="radio"
                        name="metodo_devolucion"
                        checked={metodoDevolucion === "efectivo"}
                        onChange={() => setMetodoDevolucion("efectivo")}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      Efectivo
                    </label>
                  </div>
                  <input
                    type="text"
                    value={fechaDevolucion}
                    onChange={(e) => setFechaDevolucion(e.target.value)}
                    placeholder="Fecha de devolución (ej: 11 de septiembre de 2026)"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Observaciones de Revisión */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Observaciones de la Revisión del Vehículo (Cláusula 3ª)
              </label>
              <textarea
                rows={2}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Indicar si hubo daños de chasis, latonería o si fue recibido a satisfacción..."
                className="w-full rounded-lg border border-slate-200 p-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
              />
            </div>

            {/* Datos Técnicos del Vehículo (Patrón Leasing) */}
            <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                Datos Técnicos del Vehículo en el Acta
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">Marca</label>
                  <input
                    value={vehiculoMarca}
                    onChange={(e) => setVehiculoMarca(e.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">Línea</label>
                  <input
                    value={vehiculoLinea}
                    onChange={(e) => setVehiculoLinea(e.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">Modelo (Año)</label>
                  <input
                    value={vehiculoModelo}
                    onChange={(e) => setVehiculoModelo(e.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">Cilindraje</label>
                  <input
                    value={vehiculoCilindraje}
                    onChange={(e) => setVehiculoCilindraje(e.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">Combustible</label>
                  <select
                    value={vehiculoCombustible}
                    onChange={(e) => setVehiculoCombustible(e.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs bg-white"
                  >
                    <option>GASOLINA</option>
                    <option>DIESEL</option>
                    <option>GAS / GASOLINA</option>
                    <option>HÍBRIDO</option>
                    <option>ELÉCTRICO</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">Carrocería</label>
                  <input
                    value={vehiculoCarroceria}
                    onChange={(e) => setVehiculoCarroceria(e.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">Servicio</label>
                  <input
                    value={vehiculoServicio}
                    onChange={(e) => setVehiculoServicio(e.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500">Clase</label>
                  <input
                    value={vehiculoClase}
                    onChange={(e) => setVehiculoClase(e.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs bg-white"
                  />
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-5 py-2 text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-medium transition-colors"
          >
            Cerrar
          </button>

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-60"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Compilando en Backend (Puppeteer)...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" /> {docUrls ? "Regenerar Documento" : "Generar Documento Oficial"}
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
