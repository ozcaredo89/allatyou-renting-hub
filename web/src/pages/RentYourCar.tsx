import { useState, useRef } from "react";
import { UploadCloud, CheckCircle, Car, DollarSign, Camera, MapPin, X, Image as ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

export default function RentYourCar() {
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // --- ESTADOS PARA CÁMARA Y MENÚ ---
  const [activeField, setActiveField] = useState<string | null>(null); // Qué campo estamos editando
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado del formulario
  const [form, setForm] = useState({
    owner_name: "",
    owner_phone: "",
    owner_email: "",
    owner_city: "Cali",
    brand: "",
    model: "",
    year: new Date().getFullYear(),
    transmission: "Automática",
    fuel_type: "Gasolina",
    plate: "",
    price_per_day: "",
    photo_exterior_url: "",
    photo_interior_url: ""
  });

  // --- LÓGICA DE SUBIDA (GENÉRICA) ---
  const uploadFile = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/uploads`, { method: "POST", body: fd });
    if (!res.ok) throw new Error("Error subiendo imagen");
    const data = await res.json();
    return data.url;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !activeField) return;
    setLoading(true);
    try {
        const url = await uploadFile(e.target.files[0]);
        setForm(prev => ({ ...prev, [activeField]: url }));
        setActiveField(null); // Cerrar menú
    } catch (error) {
        alert("Error al subir archivo.");
    } finally {
        setLoading(false);
    }
  };

  // --- LÓGICA DE CÁMARA (WEBRTC) ---
  const startCamera = async () => {
    setActiveField(null); // Cerrar sheet, dejar solo activeField en memoria si fuera necesario, pero aqui usamos el state
    // Nota: Necesitamos mantener el activeField en un ref o state temporal si el sheet lo cierra. 
    // En este flujo: activeField ya tiene el valor (ej: 'photo_exterior_url').
    // Al cerrar el sheet (setActiveField(null)) perdemos la referencia. 
    // TRUCO: Usaremos un estado intermedio 'cameraTarget' o simplemente no cerramos 'activeField' hasta terminar.
    // Vamos a usar una variable auxiliar: 'showCamera' es true, 'activeField' sigue siendo el campo.
    
    setShowCamera(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment" } // Cámara trasera preferiblemente para carros
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
    // No limpiamos activeField aún para poder guardar la foto
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
      canvas.toBlob(async (blob) => {
        if (blob) {
          const file = new File([blob], `car_${Date.now()}.jpg`, { type: "image/jpeg" });
          stopCamera(); // Cerramos cámara visualmente
          setLoading(true);
          try {
             const url = await uploadFile(file);
             setForm(prev => ({ ...prev, [activeField]: url }));
          } catch (e) {
             alert("Error guardando la foto");
          } finally {
             setLoading(false);
             setActiveField(null); // Ahora sí limpiamos el campo activo
          }
        }
      }, 'image/jpeg', 0.8);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${API}/marketplace/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al enviar");
      }

      setSuccess(true);
      window.scrollTo(0, 0);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white max-w-lg w-full p-8 rounded-3xl shadow-xl text-center">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10" />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-4">¡Solicitud Recibida!</h2>
          <p className="text-slate-600 mb-8 text-lg">
            Gracias por confiar en <strong>AllAtYou</strong>. Nuestro equipo de expertos revisará la información.
            <br/><br/>
            Te contactaremos al <strong>{form.owner_phone}</strong> en las próximas 24 horas.
          </p>
          <Link to="/" className="block w-full py-4 bg-black text-white font-bold rounded-xl hover:bg-slate-800 transition-colors">
            Volver al Inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Pon tu carro a trabajar 💸</h1>
          <p className="text-lg text-slate-600 max-w-xl mx-auto">
            Convierte tu vehículo en un activo que genera ingresos pasivos.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          
          {/* SECCIÓN 1: EL DUEÑO */}
          <div className="p-8 border-b border-slate-100">
            <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-6 flex items-center gap-2">
              <UserIcon /> 1. Datos del Propietario
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-sm font-bold text-slate-700 mb-2">Nombre Completo</label>
                <input required type="text" placeholder="Ej: Juan Pérez" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.owner_name} onChange={e => setForm({...form, owner_name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">WhatsApp / Celular</label>
                <input required type="tel" placeholder="300 123 4567" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.owner_phone} onChange={e => setForm({...form, owner_phone: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Ciudad</label>
                <div className="relative">
                    <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                    <select className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
                      value={form.owner_city} onChange={e => setForm({...form, owner_city: e.target.value})}
                    >
                      <option value="Cali">Cali, Valle</option>
                      <option value="Bogotá">Bogotá D.C.</option>
                      <option value="Medellín">Medellín</option>
                      <option value="Palmira">Palmira</option>
                    </select>
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: EL CARRO */}
          <div className="p-8 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-6 flex items-center gap-2">
              <Car className="w-4 h-4" /> 2. Datos del Vehículo
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Marca</label>
                <input required type="text" placeholder="Ej: Mazda" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.brand} onChange={e => setForm({...form, brand: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Modelo / Línea</label>
                <input required type="text" placeholder="Ej: 2 Touring" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.model} onChange={e => setForm({...form, model: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Año</label>
                <input required type="number" placeholder="2023" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.year} onChange={e => setForm({...form, year: parseInt(e.target.value) || 2024})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Transmisión</label>
                <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  value={form.transmission} onChange={e => setForm({...form, transmission: e.target.value})}
                >
                  <option value="Automática">Automática</option>
                  <option value="Mecánica">Mecánica</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Placa (Privado)</label>
                <input required type="text" placeholder="ABC-123" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500 uppercase"
                  value={form.plate} onChange={e => setForm({...form, plate: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Precio Esperado</label>
                <div className="relative">
                    <DollarSign className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                    <input type="number" placeholder="120000" className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-3 font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                      value={form.price_per_day} onChange={e => setForm({...form, price_per_day: e.target.value})}
                    />
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: FOTOS (MODIFICADA CON SHEET) */}
          <div className="p-8">
            <h3 className="text-sm font-bold text-emerald-600 uppercase tracking-wider mb-6 flex items-center gap-2">
              <Camera className="w-4 h-4" /> 3. Fotos del Vehículo
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               
               {/* FOTO EXTERIOR */}
               <div 
                  onClick={() => setActiveField('photo_exterior_url')}
                  className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-colors cursor-pointer active:scale-95 ${form.photo_exterior_url ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50'}`}
               >
                  {form.photo_exterior_url ? (
                      <div className="text-center">
                          <img src={form.photo_exterior_url} alt="Exterior" className="h-32 w-auto object-cover rounded-lg mb-2 shadow-sm mx-auto" />
                          <span className="text-xs text-emerald-700 font-bold">¡Cambiar Foto!</span>
                      </div>
                  ) : (
                      <>
                        <UploadCloud className="w-10 h-10 text-slate-300 mb-3" />
                        <span className="text-sm font-bold text-slate-600">Foto Exterior</span>
                        <span className="text-xs text-slate-400 mt-1">Frente o Lateral</span>
                      </>
                  )}
               </div>

               {/* FOTO INTERIOR */}
               <div 
                  onClick={() => setActiveField('photo_interior_url')}
                  className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-colors cursor-pointer active:scale-95 ${form.photo_interior_url ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50'}`}
               >
                  {form.photo_interior_url ? (
                      <div className="text-center">
                          <img src={form.photo_interior_url} alt="Interior" className="h-32 w-auto object-cover rounded-lg mb-2 shadow-sm mx-auto" />
                          <span className="text-xs text-emerald-700 font-bold">¡Cambiar Foto!</span>
                      </div>
                  ) : (
                      <>
                        <UploadCloud className="w-10 h-10 text-slate-300 mb-3" />
                        <span className="text-sm font-bold text-slate-600">Foto Interior</span>
                        <span className="text-xs text-slate-400 mt-1">Tablero o Sillas</span>
                      </>
                  )}
               </div>
            </div>
          </div>

          {/* FOOTER */}
          <div className="p-8 bg-slate-50 border-t border-slate-100">
             <button disabled={loading} type="submit" className="w-full bg-slate-900 text-white font-bold text-lg py-4 rounded-xl shadow-lg hover:bg-black hover:scale-[1.01] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? "Enviando Solicitud..." : "Enviar Solicitud de Registro 🚀"}
             </button>
             <p className="text-center text-xs text-slate-400 mt-4">
               Al enviar, aceptas nuestros términos de servicio.
             </p>
          </div>

        </form>
      </div>

      {/* --- ACTION SHEET (MENÚ) --- */}
      {activeField && !showCamera && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 space-y-4 animate-in slide-in-from-bottom duration-300">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-slate-800">Seleccionar Imagen</h3>
                    <button onClick={() => setActiveField(null)} className="p-1 bg-slate-100 rounded-full text-slate-500"><X className="w-5 h-5"/></button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={startCamera} className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors">
                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                            <Camera className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-bold text-slate-700">Usar Cámara</span>
                    </button>

                    <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                            <ImageIcon className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-bold text-slate-700">Subir Archivo</span>
                    </button>
                </div>
            </div>
            <div className="absolute inset-0 -z-10" onClick={() => setActiveField(null)} />
        </div>
      )}

      {/* INPUT OCULTO PARA SUBIDA DE ARCHIVOS */}
      <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef}
          className="hidden" 
          onChange={handleFileSelect}
      />

      {/* --- MODAL DE CÁMARA FULLSCREEN --- */}
      {showCamera && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col animate-in fade-in duration-300">
            <div className="p-4 flex justify-between items-center bg-black/50 absolute top-0 w-full z-10 backdrop-blur-sm">
                <span className="text-white font-bold text-sm">Tomar Foto</span>
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

    </div>
  );
}

function UserIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}