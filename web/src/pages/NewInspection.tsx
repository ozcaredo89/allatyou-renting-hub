import { useState, useEffect, useRef } from "react";
import { ensureBasicAuth } from "../lib/auth";
import { Camera, X, Check, Plus, Image as ImageIcon } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

const PHOTO_FIELDS = [
  { key: "front", label: "Frente (Exterior)", section: "Exterior" },
  { key: "back", label: "Atrás (Exterior)", section: "Exterior" },
  { key: "left", label: "Lado Izquierdo", section: "Exterior" },
  { key: "right", label: "Lado Derecho", section: "Exterior" },
  { key: "engine", label: "Motor", section: "Mecánica" },
  { key: "interior_dash", label: "Tablero / Consola", section: "Interior" },
  { key: "interior_front", label: "Sillas Delanteras", section: "Interior" },
  { key: "interior_back", label: "Sillas Traseras", section: "Interior" },
  { key: "tires_front_left", label: "Llanta Delantera Izq.", section: "Llantas" },
  { key: "tires_front_right", label: "Llanta Delantera Der.", section: "Llantas" },
  { key: "tires_back_left", label: "Llanta Trasera Izq.", section: "Llantas" },
  { key: "tires_back_right", label: "Llanta Trasera Der.", section: "Llantas" },
];

export default function NewInspection() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Estado del formulario
  const [form, setForm] = useState({
    vehicle_plate: "",
    driver_id: "",
    type: "general", 
    comments: "",
    inspector_name: "",
    photos: {} as Record<string, string> 
  });

  // Estado para el Action Sheet (Menú Inferior)
  const [actionSheetField, setActionSheetField] = useState<{ key: string, label: string } | null>(null);

  // --- LOGICA DE CÁMARA WEBRTC ---
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Referencia oculta para abrir el selector de archivos nativo
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const auth = ensureBasicAuth();
    fetch(`${API}/vehicles`, { headers: { Authorization: auth } })
      .then(res => res.json())
      .then(data => setVehicles(Array.isArray(data) ? data : []));
  }, []);

  // --- 1. ACCIONES DEL MENÚ ---
  const openActionSheet = (key: string, label: string) => {
    setActionSheetField({ key, label });
  };

  const closeActionSheet = () => {
    setActionSheetField(null);
  };

  const handleChooseCamera = () => {
    if (actionSheetField) {
        startCamera();
        // Cerramos el sheet pero mantenemos el key en activeFieldKey implicito por el estado de cámara
    }
    // No cerramos actionSheetField aun para saber cual es, o usamos una ref
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
    closeActionSheet();
  };

  // --- 2. LOGICA CÁMARA ---
  const startCamera = async () => {
    setIsCameraOpen(true);
    // Cerramos el sheet visualmente pero ya sabemos qué campo es (actionSheetField.key)
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
      console.error("Error accessing camera:", err);
      alert("No pudimos acceder a la cámara.");
      setIsCameraOpen(false);
      closeActionSheet();
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
    closeActionSheet(); // Limpiamos selección al final
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !actionSheetField) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `${actionSheetField.key}_${Date.now()}.jpg`, { type: "image/jpeg" });
          handleUpload(file, actionSheetField.key);
          stopCamera(); 
        }
      }, 'image/jpeg', 0.8);
    }
  };

  // --- 3. SUBIDA ---
  const handleUpload = async (file: File, key: string) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/uploads`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Error subiendo");
      const data = await res.json();
      
      setForm(prev => ({
        ...prev,
        photos: { ...prev.photos, [key]: data.url }
      }));
    } catch (e) {
      alert("Error al subir imagen");
    } finally {
      setUploading(false);
    }
  };

  // --- 4. GUARDAR ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicle_plate) return alert("Selecciona un vehículo");
    setLoading(true);
    try {
       const auth = ensureBasicAuth();
       const selectedVehicle = vehicles.find(v => v.plate === form.vehicle_plate);
       const driverId = selectedVehicle?.driver?.id || null;
       const payload = { ...form, driver_id: driverId };
       const res = await fetch(`${API}/inspections`, {
         method: "POST",
         headers: { "Content-Type": "application/json", Authorization: auth },
         body: JSON.stringify(payload)
       });
       if (!res.ok) throw new Error("Error guardando");
       alert("✅ Revisión guardada con éxito!");
       window.location.reload(); 
    } catch (e: any) {
        alert(e.message);
    } finally {
        setLoading(false);
    }
  };

  const groupedFields = PHOTO_FIELDS.reduce((acc, field) => {
    if (!acc[field.section]) acc[field.section] = [];
    acc[field.section].push(field);
    return acc;
  }, {} as Record<string, typeof PHOTO_FIELDS>);

  return (
    <div className="min-h-screen bg-slate-50 p-6 relative">
      
      {/* INPUT FILE OCULTO (Global) */}
      <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef}
          className="hidden" 
          onChange={(e) => {
              if (e.target.files?.[0] && actionSheetField) {
                  handleUpload(e.target.files[0], actionSheetField.key);
                  closeActionSheet();
              }
          }}
      />

      <div className="mx-auto max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 p-6 text-white">
          <h1 className="text-2xl font-bold">Nueva Inspección</h1>
          <p className="text-slate-400 text-sm">Registro de estado del vehículo</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          
          {/* DATOS GENERALES */}
          <div className="grid grid-cols-2 gap-4">
             <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Vehículo</label>
                <select 
                  className="w-full p-3 rounded-lg border border-slate-300 font-bold uppercase"
                  value={form.vehicle_plate}
                  onChange={e => setForm({...form, vehicle_plate: e.target.value})}
                  required
                >
                    <option value="">-- Seleccionar --</option>
                    {vehicles.map(v => (
                        <option key={v.plate} value={v.plate}>
                            {v.driver?.full_name || "LIBRE"} - {v.plate}
                        </option>
                    ))}
                </select>
             </div>
             <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tipo</label>
                <select 
                  className="w-full p-2 rounded-lg border border-slate-300"
                  value={form.type}
                  onChange={e => setForm({...form, type: e.target.value})}
                >
                    <option value="general">Control General</option>
                    <option value="entrega">Entrega</option>
                    <option value="recepcion">Recepción</option>
                </select>
             </div>
             <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Inspector</label>
                <input 
                  className="w-full p-2 rounded-lg border border-slate-300"
                  placeholder="Tu nombre"
                  value={form.inspector_name}
                  onChange={e => setForm({...form, inspector_name: e.target.value})}
                />
             </div>
          </div>

          {/* FOTOS (GRID DE BOTONES SIMPLES) */}
          {Object.entries(groupedFields).map(([section, fields]) => (
            <div key={section} className="border-t border-slate-100 pt-4">
               <h3 className="text-emerald-600 font-bold uppercase text-xs mb-4 tracking-wider">{section}</h3>
               <div className="grid grid-cols-2 gap-4">
                  {fields.map(field => (
                    <div key={field.key} className="relative">
                       <label className="block text-[10px] font-bold text-slate-500 mb-1">{field.label}</label>
                       
                       {form.photos[field.key] ? (
                         // FOTO YA CARGADA
                         <div className="relative h-28 w-full rounded-xl overflow-hidden border border-emerald-200 bg-emerald-50 shadow-sm group">
                            <img src={form.photos[field.key]} alt={field.label} className="h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        const newPhotos = {...form.photos};
                                        delete newPhotos[field.key];
                                        setForm({...form, photos: newPhotos});
                                    }}
                                    className="bg-red-500 text-white rounded-full p-2 shadow-lg hover:bg-red-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[9px] font-bold text-center py-1 flex items-center justify-center gap-1">
                                <Check className="w-3 h-3" /> LISTO
                            </div>
                         </div>
                       ) : (
                         // BOTÓN VACÍO (TRIGGER DEL MENU)
                         <button 
                            type="button"
                            onClick={() => openActionSheet(field.key, field.label)}
                            className="w-full h-28 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-emerald-400 hover:text-emerald-500 text-slate-400 flex flex-col items-center justify-center gap-2 transition-all active:scale-95"
                         >
                             <div className="p-3 bg-white rounded-full shadow-sm">
                                <Plus className="w-6 h-6" />
                             </div>
                             <span className="text-[10px] font-medium">Agregar Foto</span>
                         </button>
                       )}
                    </div>
                  ))}
               </div>
            </div>
          ))}

          {/* OBSERVACIONES */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Reporte / Observaciones</label>
            <textarea 
                className="w-full p-3 rounded-lg border border-slate-300 h-32 resize-none focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Detalles..."
                value={form.comments}
                onChange={e => setForm({...form, comments: e.target.value})}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading || uploading}
            className="w-full py-4 rounded-xl bg-emerald-600 text-white font-bold text-lg shadow-lg hover:bg-emerald-500 disabled:opacity-50 transition-all"
          >
            {loading ? "Guardando..." : "Guardar Revisión"}
          </button>

        </form>
      </div>

      {/* --- ACTION SHEET (MENÚ INFERIOR) --- */}
      {actionSheetField && !isCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 space-y-4 animate-in slide-in-from-bottom duration-300">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-slate-800">{actionSheetField.label}</h3>
                    <button onClick={closeActionSheet} className="p-1 bg-slate-100 rounded-full text-slate-500"><X className="w-5 h-5"/></button>
                </div>
                
                <p className="text-xs text-slate-500 mb-4">Selecciona una opción para adjuntar la evidencia.</p>

                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={handleChooseCamera}
                        className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                    >
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                            <Camera className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-bold text-slate-700">Usar Cámara</span>
                    </button>

                    <button 
                        onClick={handleChooseFile}
                        className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                    >
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                            <ImageIcon className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-bold text-slate-700">Subir Archivo</span>
                    </button>
                </div>
            </div>
            {/* Click outside to close */}
            <div className="absolute inset-0 -z-10" onClick={closeActionSheet} />
        </div>
      )}

      {/* --- MODAL DE CÁMARA (WEBRTC) --- */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-in fade-in duration-300">
            <div className="p-4 flex justify-between items-center bg-black/50 absolute top-0 w-full z-10 backdrop-blur-sm">
                <span className="text-white font-bold text-sm">{actionSheetField?.label}</span>
                <button onClick={stopCamera} className="text-white bg-white/20 p-2 rounded-full">
                    <X className="w-6 h-6" />
                </button>
            </div>

            <div className="flex-1 relative flex items-center justify-center bg-black">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
                <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="p-8 bg-black flex justify-center pb-12">
                <button 
                    onClick={capturePhoto}
                    className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:bg-white active:scale-95 transition-all"
                >
                    <div className="w-16 h-16 bg-white rounded-full" />
                </button>
            </div>
        </div>
      )}

      {/* LOADING OVERLAY */}
      {uploading && (
         <div className="fixed inset-0 z-[70] bg-black/70 flex flex-col items-center justify-center text-white backdrop-blur-sm">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mb-4"></div>
            <p className="font-bold">Subiendo imagen...</p>
         </div>
      )}

    </div>
  );
}