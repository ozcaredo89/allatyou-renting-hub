import { useState, useRef, useEffect } from "react";
import { ensureBasicAuth } from "../lib/auth";
import { Camera, X, Image as ImageIcon } from "lucide-react";
import type { Driver } from "../types/driver";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

// --- Helper genérico para subir archivos con barra de progreso real ---
function uploadDriverFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", "drivers");

    const auth = ensureBasicAuth();

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.open("POST", `${API}/uploads`);
    xhr.setRequestHeader("Authorization", auth);

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.url);
        } catch {
          reject(new Error("Respuesta inválida del servidor"));
        }
      } else {
        let errorMessage = `Error del servidor (${xhr.status})`;
        try {
          const json = JSON.parse(xhr.responseText);
          if (json.error) errorMessage = json.error;
        } catch {
          if (xhr.responseText.includes("File too large") || xhr.status === 413) {
            errorMessage = "El archivo supera el tamaño máximo permitido (máx 30MB).";
          }
        }
        reject(new Error(errorMessage));
      }
    };

    xhr.onerror = () => reject(new Error("Error de conexión al subir el archivo"));
    xhr.onabort = () => reject(new Error("Subida cancelada"));

    xhr.send(fd);
  });
}

// --- Componente externo para inputs de archivo (Documentos) ---
interface FileFieldProps {
  label: string;
  value: string | null | undefined;
  onChange: (url: string) => void;
  uploadFile: (file: File, onProgress?: (percent: number) => void) => Promise<string>;
}

function FileField({ label, value, onChange, uploadFile }: FileFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [justUploaded, setJustUploaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const MAX_BYTES = 30 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        setErrorMessage(`El archivo pesa ${sizeMB}MB (el límite máximo es 30MB). Por favor comprímelo.`);
        e.target.value = "";
        return;
      }

      setUploading(true);
      setUploadProgress(0);
      setJustUploaded(false);
      setErrorMessage(null);
      try {
        const url = await uploadFile(file, (percent) => {
          setUploadProgress(percent);
        });
        onChange(url);
        setJustUploaded(true);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Error subiendo el archivo.";
        setErrorMessage(msg);
      } finally {
        setUploading(false);
        setUploadProgress(0);
        e.target.value = "";
      }
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 transition-all">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-bold text-slate-700">{label}</label>
        {justUploaded && !uploading && (
          <span className="text-[10px] text-emerald-600 font-semibold animate-fade-in">
            ✓ Cargado (guardar para aplicar)
          </span>
        )}
      </div>

      {value ? (
        <div className="flex items-center justify-between gap-2">
          <a href={value} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline truncate max-w-[150px]">
            Ver Archivo
          </a>
          <label
            className={`text-[10px] px-2.5 py-1 rounded font-medium transition-colors ${
              uploading
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "cursor-pointer bg-slate-200 hover:bg-slate-300 text-slate-700"
            }`}
          >
            {uploading ? `Subiendo ${uploadProgress}%...` : "Reemplazar"}
            <input
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept="image/*,.pdf"
              disabled={uploading}
            />
          </label>
        </div>
      ) : (
        <div className="relative">
          <input
            type="file"
            className="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300"
            onChange={handleFileChange}
            accept="image/*,.pdf"
            disabled={uploading}
          />
        </div>
      )}

      {uploading && (
        <div className="mt-2.5 space-y-1">
          <div className="flex justify-between items-center text-[10px] text-slate-500 font-medium">
            <span>{uploadProgress === 100 ? "Procesando en almacenamiento..." : "Subiendo archivo..."}</span>
            <span className="font-bold text-emerald-700">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-200 ease-out"
              style={{ width: `${Math.max(uploadProgress, 5)}%` }}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="mt-2 text-[11px] text-red-600 font-medium bg-red-50 border border-red-200 rounded p-1.5 leading-tight">
          ⚠️ {errorMessage}
        </p>
      )}
    </div>
  );
}

interface DriverModalProps {
  driver: Partial<Driver>;
  isCreating?: boolean;
  onClose: () => void;
  onSaved: (savedDriver: Driver) => Promise<void> | void;
}

export function DriverModal({ driver, isCreating = false, onClose, onSaved }: DriverModalProps) {
  const [editing, setEditing] = useState<Partial<Driver>>({ ...driver });
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    setEditing({ ...driver });
  }, [driver]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  async function saveChanges(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;

    try {
      const auth = ensureBasicAuth();
      const headers = { "Content-Type": "application/json", Authorization: auth };

      let res: Response;
      if (isCreating) {
        res = await fetch(`${API}/drivers`, {
          method: "POST",
          headers,
          body: JSON.stringify(editing),
        });
      } else {
        res = await fetch(`${API}/drivers/${editing.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(editing),
        });
      }

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error guardando");
      }

      const savedDriver: Driver = await res.json();
      await onSaved(savedDriver);
      onClose();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : "Error guardando");
    }
  }

  // --- LÓGICA CÁMARA ---
  const startCamera = async () => {
    setProfileSheetOpen(false);
    setIsCameraOpen(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
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
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");

    if (context) {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const file = new File([blob], `profile_${Date.now()}.jpg`, { type: "image/jpeg" });
            handleProfileUpload(file);
            stopCamera();
          }
        },
        "image/jpeg",
        0.8
      );
    }
  };

  const handleProfileUpload = async (file: File) => {
    setUploadingPhoto(true);
    try {
      const url = await uploadDriverFile(file);
      setEditing((prev) => ({ ...prev, photo_url: url }));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error subiendo foto");
    } finally {
      setUploadingPhoto(false);
      setProfileSheetOpen(false);
    }
  };

  return (
    <>
      {/* --- MODAL DE EDICIÓN / FICHA (Z-INDEX 50) --- */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="w-full max-w-4xl rounded-2xl bg-white p-0 shadow-2xl max-h-[90vh] flex flex-col">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
            <div>
              <h2 className="text-xl font-bold text-slate-800">
                {isCreating ? "Nuevo Conductor" : "Ficha del Conductor"}
              </h2>
              <p className="text-xs text-slate-500">Expediente digital y datos personales.</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
              &times;
            </button>
          </div>

          <div className="p-6 overflow-y-auto">
            <form id="driverForm" onSubmit={saveChanges} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* COLUMNA IZQUIERDA: DATOS */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-emerald-100 pb-2">
                  Información Personal
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Completo</label>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                      value={editing.full_name || ""}
                      onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Documento (CC)</label>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                      value={editing.document_number || ""}
                      onChange={(e) => setEditing({ ...editing, document_number: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Fecha Nacimiento</label>
                    <input
                      type="date"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editing.date_of_birth || ""}
                      onChange={(e) => setEditing({ ...editing, date_of_birth: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Celular</label>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editing.phone || ""}
                      onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editing.email || ""}
                      onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Dirección</label>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      value={editing.address || ""}
                      onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                    />
                  </div>
                  <div className="col-span-1 border-l border-emerald-100 pl-4">
                    <label className="block text-xs font-bold text-emerald-700 mb-1">Depósito (COP)</label>
                    <input
                      type="number"
                      className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-900"
                      value={
                        editing.deposit_amount !== undefined && editing.deposit_amount !== null
                          ? editing.deposit_amount
                          : 300000
                      }
                      onChange={(e) =>
                        setEditing({ ...editing, deposit_amount: parseInt(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-emerald-100 pb-2 pt-4">
                  Estado y Notas
                </h3>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Estado Operativo</label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                    value={editing.status || "active"}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value as Driver["status"] })}
                  >
                    <option value="active">Activo (Disponible)</option>
                    <option value="inactive">Inactivo</option>
                    <option value="suspended">Suspendido (Mora/Sanción)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Notas Internas</label>
                  <textarea
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm h-20 resize-none"
                    placeholder="Antecedentes, referencias, etc..."
                    value={editing.notes || ""}
                    onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  />
                </div>
              </div>

              {/* COLUMNA DERECHA: ARCHIVOS */}
              <div className="space-y-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                {/* --- SECCIÓN FOTO DE PERFIL MEJORADA --- */}
                <div className="flex flex-col items-center justify-center p-4 border border-dashed border-emerald-200 bg-emerald-50/50 rounded-xl">
                  <div className="relative group cursor-pointer" onClick={() => setProfileSheetOpen(true)}>
                    {editing.photo_url ? (
                      <img
                        src={editing.photo_url}
                        alt="Profile"
                        className="h-24 w-24 rounded-full object-cover border-4 border-white shadow-md"
                      />
                    ) : (
                      <div className="h-24 w-24 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 font-bold text-3xl border-4 border-white shadow-md">
                        ?
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="text-white w-8 h-8" />
                    </div>
                    {uploadingPhoto && (
                      <div className="absolute inset-0 bg-white/80 rounded-full flex items-center justify-center animate-pulse text-xs font-bold text-emerald-600">
                        ...
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfileSheetOpen(true)}
                    className="mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-800"
                  >
                    {editing.photo_url ? "Cambiar Foto" : "Agregar Foto"}
                  </button>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Documentos</h3>
                  <FileField
                    label="Hoja de Vida (PDF)"
                    value={editing.cv_url}
                    onChange={(url) => setEditing((prev) => ({ ...prev, cv_url: url }))}
                    uploadFile={uploadDriverFile}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FileField
                      label="Cédula (Frontal)"
                      value={editing.id_front_url}
                      onChange={(url) => setEditing((prev) => ({ ...prev, id_front_url: url }))}
                      uploadFile={uploadDriverFile}
                    />
                    <FileField
                      label="Cédula (Trasera)"
                      value={editing.id_back_url}
                      onChange={(url) => setEditing((prev) => ({ ...prev, id_back_url: url }))}
                      uploadFile={uploadDriverFile}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Licencia</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <FileField
                      label="Licencia (Frontal)"
                      value={editing.license_front_url}
                      onChange={(url) => setEditing((prev) => ({ ...prev, license_front_url: url }))}
                      uploadFile={uploadDriverFile}
                    />
                    <FileField
                      label="Licencia (Trasera)"
                      value={editing.license_back_url}
                      onChange={(url) => setEditing((prev) => ({ ...prev, license_back_url: url }))}
                      uploadFile={uploadDriverFile}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Legal y Pagos</h3>
                  <FileField
                    label="Comprobante Depósito"
                    value={editing.deposit_receipt_url}
                    onChange={(url) => setEditing((prev) => ({ ...prev, deposit_receipt_url: url }))}
                    uploadFile={uploadDriverFile}
                  />
                  <FileField
                    label="Contrato Firmado"
                    value={editing.contract_url}
                    onChange={(url) => setEditing((prev) => ({ ...prev, contract_url: url }))}
                    uploadFile={uploadDriverFile}
                  />
                </div>
              </div>
            </form>
          </div>

          <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white"
            >
              Cancelar
            </button>
            <button
              form="driverForm"
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-sm font-bold text-white shadow-lg hover:bg-black transition-all"
            >
              {isCreating ? "Crear Conductor" : "Guardar Cambios"}
            </button>
          </div>
        </div>
      </div>

      {/* --- ACTION SHEET DE FOTO DE PERFIL (Z-INDEX 60) --- */}
      {profileSheetOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 space-y-4 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-bold text-slate-800">Foto de Perfil</h3>
              <button onClick={() => setProfileSheetOpen(false)} className="p-1 bg-slate-100 rounded-full text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={startCamera}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                  <Camera className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-slate-700">Usar Cámara</span>
              </button>

              <button
                onClick={() => {
                  profileInputRef.current?.click();
                  setProfileSheetOpen(false);
                }}
                className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-slate-700">Subir Archivo</span>
              </button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={() => setProfileSheetOpen(false)} />
        </div>
      )}

      {/* INPUT OCULTO PARA ACTION SHEET */}
      <input
        type="file"
        accept="image/*"
        ref={profileInputRef}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleProfileUpload(e.target.files[0])}
      />

      {/* --- MODAL DE CÁMARA (Z-INDEX 70) --- */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col animate-in fade-in duration-300">
          <div className="p-4 flex justify-between items-center bg-black/50 absolute top-0 w-full z-10 backdrop-blur-sm">
            <span className="text-white font-bold text-sm">Tomar Selfie</span>
            <button onClick={stopCamera} className="text-white bg-white/20 p-2 rounded-full">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 relative flex items-center justify-center bg-black">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain transform -scale-x-100" />
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
    </>
  );
}
