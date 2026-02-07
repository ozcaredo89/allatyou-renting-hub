import { useEffect, useState, useRef } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import { Camera, Image as ImageIcon, X, UploadCloud } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type DriverSimple = { id: number; full_name: string };

type Vehicle = {
  plate: string;
  brand: string | null;
  line: string | null;
  model_year: number | null;
  current_driver_id: number | null;
  driver?: DriverSimple;
  soat_expires_at: string | null;
  tecno_expires_at: string | null;
  alarm_code: string | null;
  gps_renewal_date: string | null;
  timing_belt_last_date: string | null;
  extinguisher_expiry: string | null;
  battery_install_date: string | null;
  tires_notes: string | null;
  
  // CAMPOS DE DOCUMENTOS
  ownership_card_front: string | null;
  ownership_card_back: string | null;

  // CAMPOS DE INVERSIÓN
  purchase_price?: string; 
  purchase_date?: string;
  vehicle_investments?: any[];
};

const EMPTY_VEHICLE: Vehicle = {
  plate: "",
  brand: "",
  line: "",
  model_year: new Date().getFullYear(),
  current_driver_id: null,
  soat_expires_at: null,
  tecno_expires_at: null,
  gps_renewal_date: null,
  alarm_code: "",
  timing_belt_last_date: null,
  extinguisher_expiry: null,
  battery_install_date: null,
  tires_notes: "",
  ownership_card_front: null,
  ownership_card_back: null,
  purchase_price: "",
  purchase_date: new Date().toISOString().slice(0, 10)
};

const formatMoneyInput = (value: string | undefined) => {
  if (!value) return "";
  const clean = value.replace(/\D/g, "");
  if (!clean) return "";
  return new Intl.NumberFormat("es-CO").format(Number(clean));
};

export default function AdminVehicles() {
  const [items, setItems] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<DriverSimple[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Estado del Modal y Edición
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // --- ESTADOS PARA CÁMARA (NUEVO) ---
  const [activeField, setActiveField] = useState<'ownership_card_front' | 'ownership_card_back' | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const headers = { Authorization: auth };

      const rsV = await fetch(`${API}/vehicles`, { headers });
      if (rsV.status === 401) {
        clearBasicAuth();
        window.location.reload();
        return;
      }
      const rawVehicles = await rsV.json();
      const rsD = await fetch(`${API}/drivers`, { headers }); 
      const jsonD = await rsD.json();

      const processedVehicles = Array.isArray(rawVehicles) ? rawVehicles.map((v: any) => {
        let price = "";
        let date = "";
        if (v.vehicle_investments && Array.isArray(v.vehicle_investments)) {
            const initial = v.vehicle_investments.find((inv: any) => inv.concept === 'Inicial');
            if (initial) {
                price = String(initial.amount);
                date = initial.date;
            }
        }
        return {
            ...v,
            purchase_price: price,
            purchase_date: date || new Date().toISOString().slice(0, 10)
        };
      }) : [];

      setItems(processedVehicles);
      setDrivers(Array.isArray(jsonD) ? jsonD : []);
    } catch (e) {
      console.error(e);
      alert("Error cargando datos.");
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    setEditing({ ...EMPTY_VEHICLE });
    setIsCreating(true);
  }

  function handleEdit(v: Vehicle) {
    setEditing({ ...v });
    setIsCreating(false);
  }

  // --- LÓGICA DE SUBIDA UNIFICADA ---
  async function performUpload(file: File, field: 'ownership_card_front' | 'ownership_card_back') {
    if (!editing) return;
    setUploading(true);
    try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`${API}/uploads`, { method: "POST", body: fd });
        if (!res.ok) throw new Error("Error subiendo imagen");
        const data = await res.json();
        
        setEditing(prev => prev ? ({ ...prev, [field]: data.url }) : null);
    } catch (error) {
        console.error(error);
        alert("No se pudo subir la imagen.");
    } finally {
        setUploading(false);
        setActiveField(null); // Cerrar menú
    }
  }

  // --- LÓGICA DE CÁMARA ---
  const startCamera = async () => {
    // No cerramos activeField aún porque lo necesitamos para saber dónde guardar
    setShowCamera(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error(err);
      alert("No pudimos acceder a la cámara.");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !activeField) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `tp_${activeField}_${Date.now()}.jpg`, { type: "image/jpeg" });
          stopCamera();
          performUpload(file, activeField);
        }
      }, 'image/jpeg', 0.8);
    }
  };

  // Manejador del input de archivo oculto
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0] && activeField) {
        performUpload(e.target.files[0], activeField);
    }
  };

  async function saveChanges(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;

    try {
      const auth = ensureBasicAuth();
      const headers = { "Content-Type": "application/json", Authorization: auth };
      const { vehicle_investments, ...bodyToSend } = editing;

      let res;
      if (isCreating) {
        res = await fetch(`${API}/vehicles`, {
          method: "POST",
          headers,
          body: JSON.stringify(bodyToSend),
        });
      } else {
        res = await fetch(`${API}/vehicles/${editing.plate}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(bodyToSend),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error guardando cambios");
      }

      await loadData(); 
      setEditing(null); 
      setIsCreating(false);
    } catch (error: any) {
      alert(error.message);
    }
  }

  const dateCellClass = (dateStr: string | null) => {
    if (!dateStr) return "text-gray-300";
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return "bg-red-100 text-red-700 font-bold";
    if (diffDays < 30) return "bg-amber-100 text-amber-700 font-medium";
    return "text-gray-700";
  };

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="mx-auto max-w-[1400px]">
        {/* HEADER */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Gestión de Flota</h1>
            <p className="text-sm text-slate-500">Hoja de vida, mantenimientos y asignación.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={loadData} className="text-sm text-emerald-600 hover:underline font-medium px-3">Refrescar</button>
            <button onClick={handleCreate} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-black transition-all">
              <span>+</span> Registrar Vehículo
            </button>
          </div>
        </div>

        {/* TABLA */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Vehículo</th>
                  <th className="px-4 py-3">Placa</th>
                  <th className="px-4 py-3">Conductor Actual</th>
                  <th className="px-4 py-3 text-center">SOAT</th>
                  <th className="px-4 py-3 text-center">Tecno</th>
                  <th className="px-4 py-3">Docs</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="p-10 text-center text-slate-400">Cargando flota...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={7} className="p-10 text-center text-slate-400">No hay vehículos registrados.</td></tr>
                ) : (
                  items.map((v) => (
                    <tr key={v.plate} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {v.brand || "Generico"} {v.line || ""} 
                        {v.model_year && <span className="text-slate-400 text-[10px] ml-1">({v.model_year})</span>}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">{v.plate}</td>
                      <td className="px-4 py-3">
                        {v.driver ? (
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">
                              {v.driver.full_name.charAt(0)}
                            </div>
                            <span className="text-slate-700 truncate max-w-[150px]" title={v.driver.full_name}>
                              {v.driver.full_name}
                            </span>
                          </div>
                        ) : <span className="text-slate-400 italic text-[11px]">Sin asignar</span>}
                      </td>
                      <td className={`px-4 py-3 text-center font-mono ${dateCellClass(v.soat_expires_at)}`}>{v.soat_expires_at || "—"}</td>
                      <td className={`px-4 py-3 text-center font-mono ${dateCellClass(v.tecno_expires_at)}`}>{v.tecno_expires_at || "—"}</td>
                      <td className="px-4 py-3 text-slate-500 space-y-1">
                          {v.ownership_card_front ? <span className="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px] border border-emerald-100">TP OK</span> : <span className="text-[10px] text-slate-300">Sin TP</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleEdit(v)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-100 font-medium">Editar</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* --- MODAL EDICIÓN --- */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-0 shadow-2xl max-h-[90vh] flex flex-col">
            
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  {isCreating ? "Nuevo Vehículo" : <>Editar Vehículo <span className="font-mono text-emerald-600">{editing.plate}</span></>}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {isCreating ? "Ingresa los datos para registrar un activo." : "Actualiza información técnica y operativa."}
                </p>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>

            <div className="p-6 overflow-y-auto">
              <form id="vehicleForm" onSubmit={saveChanges} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                <div className="md:col-span-2 space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-emerald-100 pb-2">Identificación y Documentos</h3>
                  
                  {isCreating && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                        <label className="block text-xs font-bold text-slate-900 mb-1">PLACA (Obligatorio)</label>
                        <input 
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-lg font-bold font-mono focus:ring-2 focus:ring-emerald-500 outline-none uppercase placeholder:normal-case"
                          placeholder="Ej: ABC123"
                          value={editing.plate}
                          onChange={e => setEditing({...editing, plate: e.target.value.toUpperCase().replace(/\s/g, '')})}
                          required
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Debe ser única.</p>
                    </div>
                  )}

                  {/* --- TARJETAS DE PROPIEDAD CON SELECTOR INTELIGENTE --- */}
                  <div className="grid grid-cols-2 gap-4">
                      
                      {/* FRENTE */}
                      <div className="relative group">
                          <p className="text-xs font-bold text-slate-600 mb-2 uppercase">Tarjeta Propiedad (Frente)</p>
                          <div 
                             onClick={() => setActiveField('ownership_card_front')}
                             className="rounded-xl border border-dashed border-slate-300 p-1 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-slate-100 transition-colors cursor-pointer h-32 overflow-hidden"
                          >
                             {editing.ownership_card_front ? (
                                <img src={editing.ownership_card_front} alt="TP Frente" className="w-full h-full object-cover rounded-lg" />
                             ) : (
                                <div className="text-center">
                                    <UploadCloud className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                                    <span className="text-[10px] text-slate-500 font-bold">Tocar para subir</span>
                                </div>
                             )}
                          </div>
                          {editing.ownership_card_front && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); setEditing({...editing, ownership_card_front: null}); }} className="absolute top-8 right-1 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600 text-xs z-10">✕</button>
                          )}
                      </div>

                      {/* REVERSO */}
                      <div className="relative group">
                          <p className="text-xs font-bold text-slate-600 mb-2 uppercase">Tarjeta Propiedad (Reverso)</p>
                          <div 
                             onClick={() => setActiveField('ownership_card_back')}
                             className="rounded-xl border border-dashed border-slate-300 p-1 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-slate-100 transition-colors cursor-pointer h-32 overflow-hidden"
                          >
                             {editing.ownership_card_back ? (
                                <img src={editing.ownership_card_back} alt="TP Reverso" className="w-full h-full object-cover rounded-lg" />
                             ) : (
                                <div className="text-center">
                                    <UploadCloud className="w-8 h-8 text-slate-300 mx-auto mb-1" />
                                    <span className="text-[10px] text-slate-500 font-bold">Tocar para subir</span>
                                </div>
                             )}
                          </div>
                          {editing.ownership_card_back && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); setEditing({...editing, ownership_card_back: null}); }} className="absolute top-8 right-1 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600 text-xs z-10">✕</button>
                          )}
                      </div>
                  </div>
                  {/* ------------------------------------------------ */}

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200 bg-slate-50/50 p-3 rounded-lg">
                      <div className="col-span-2">
                        <p className="text-xs font-bold text-slate-500 uppercase">Datos de Inversión (Inicial)</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Precio Compra</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-400">$</span>
                            <input
                                type="text"
                                className="w-full pl-6 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                placeholder="0"
                                value={formatMoneyInput(editing.purchase_price)} 
                                onChange={e => setEditing({...editing, purchase_price: e.target.value.replace(/\D/g, "")})}
                            />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Fecha Compra</label>
                        <input
                            type="date"
                            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            value={editing.purchase_date}
                            onChange={e => setEditing({...editing, purchase_date: e.target.value})}
                        />
                      </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Marca</label>
                      <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ej: Kia" value={editing.brand || ""} onChange={e => setEditing({...editing, brand: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Línea</label>
                      <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Ej: Picanto" value={editing.line || ""} onChange={e => setEditing({...editing, line: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Modelo (Año)</label>
                      <input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="2024" value={editing.model_year || ""} onChange={e => setEditing({...editing, model_year: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Clave Alarma</label>
                      <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono" placeholder="****" value={editing.alarm_code || ""} onChange={e => setEditing({...editing, alarm_code: e.target.value})} />
                    </div>
                  </div>

                  <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                    <label className="block text-xs font-bold text-emerald-800 mb-2">Conductor Asignado</label>
                    <div className="relative">
                      <select className="w-full appearance-none rounded-lg border border-emerald-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none" value={editing.current_driver_id || ""} onChange={e => setEditing({...editing, current_driver_id: Number(e.target.value) || null})}>
                        <option value="">-- Vehículo sin asignar --</option>
                        {drivers.map(d => (<option key={d.id} value={d.id}>{d.full_name}</option>))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-emerald-600">▼</div>
                    </div>
                  </div>
                </div>

                {/* SECCIÓN 2 y 3 (Legal y Mantenimiento) */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">Documentación</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Vencimiento SOAT</label>
                    <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editing.soat_expires_at || ""} onChange={e => setEditing({...editing, soat_expires_at: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Vencimiento Tecno</label>
                    <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editing.tecno_expires_at || ""} onChange={e => setEditing({...editing, tecno_expires_at: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Renovación GPS</label>
                    <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editing.gps_renewal_date || ""} onChange={e => setEditing({...editing, gps_renewal_date: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2">Mantenimiento</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Cambio Correa</label>
                    <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editing.timing_belt_last_date || ""} onChange={e => setEditing({...editing, timing_belt_last_date: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Vencimiento Extintor</label>
                    <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editing.extinguisher_expiry || ""} onChange={e => setEditing({...editing, extinguisher_expiry: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Instalación Batería</label>
                    <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={editing.battery_install_date || ""} onChange={e => setEditing({...editing, battery_install_date: e.target.value})} />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Notas Llantas / Observaciones</label>
                  <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm h-20 resize-none" placeholder="Estado de las llantas..." value={editing.tires_notes || ""} onChange={e => setEditing({...editing, tires_notes: e.target.value})} />
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={() => setEditing(null)} className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white transition-all">Cancelar</button>
              <button form="vehicleForm" type="submit" disabled={uploading} className="px-5 py-2.5 rounded-xl bg-slate-900 text-sm font-bold text-white shadow-lg hover:bg-black transition-all">
                {uploading ? "Subiendo..." : (isCreating ? "Registrar Vehículo" : "Guardar Cambios")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- SELECTOR (ACTION SHEET / MODAL) --- */}
      {activeField && !showCamera && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 pb-10 sm:pb-6 space-y-4 animate-in slide-in-from-bottom sm:slide-in-from-bottom-10 duration-300 shadow-2xl">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-slate-800">Seleccionar Imagen</h3>
                    <button onClick={() => setActiveField(null)} className="p-1 bg-slate-100 rounded-full text-slate-500"><X className="w-5 h-5"/></button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={startCamera} className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-colors group">
                        <div className="w-12 h-12 bg-white text-emerald-600 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                            <Camera className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-bold text-emerald-800">Usar Cámara</span>
                    </button>

                    <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-100 transition-colors group">
                        <div className="w-12 h-12 bg-white text-blue-600 rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                            <ImageIcon className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-bold text-blue-800">Galería / Archivo</span>
                    </button>
                </div>
            </div>
            <div className="absolute inset-0 -z-10" onClick={() => setActiveField(null)} />
        </div>
      )}

      {/* INPUT OCULTO */}
      <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />

      {/* --- MODAL DE CÁMARA FULLSCREEN (Z-70 para tapar todo) --- */}
      {showCamera && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col animate-in fade-in duration-300">
            <div className="p-4 flex justify-between items-center bg-black/50 absolute top-0 w-full z-10 backdrop-blur-sm">
                <span className="text-white font-bold text-sm">Tomar Foto</span>
                <button onClick={stopCamera} className="text-white bg-white/20 p-2 rounded-full"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-1 relative flex items-center justify-center bg-black">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
                <canvas ref={canvasRef} className="hidden" />
            </div>
            <div className="p-8 bg-black flex justify-center pb-12">
                <button onClick={capturePhoto} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:bg-white active:scale-95 transition-all">
                    <div className="w-16 h-16 bg-white rounded-full" />
                </button>
            </div>
        </div>
      )}

    </div>
  );
}