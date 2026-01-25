import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type Driver = {
  id: number;
  full_name: string;
  document_number: string;
  phone: string;
  email: string | null;
  address: string | null;
  status: "active" | "inactive" | "suspended";
  notes: string | null;
  date_of_birth: string | null;
  created_at: string;
  // Archivos
  cv_url: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  license_front_url: string | null;
  license_back_url: string | null;
  contract_url: string | null;
};

const EMPTY_DRIVER: Omit<Driver, "id" | "created_at"> = {
  full_name: "",
  document_number: "",
  phone: "",
  email: "",
  address: "",
  status: "active",
  notes: "",
  date_of_birth: null,
  cv_url: null,
  id_front_url: null,
  id_back_url: null,
  license_front_url: null,
  license_back_url: null,
  contract_url: null,
};

export default function AdminDrivers() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Modal State
  const [editing, setEditing] = useState<Partial<Driver> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/drivers?all=true`, { 
        headers: { Authorization: auth } 
      });
      
      if (res.status === 401) {
        clearBasicAuth();
        window.location.reload();
        return;
      }
      const json = await res.json();
      setDrivers(Array.isArray(json) ? json : []);
    } catch (e) {
      console.error(e);
      alert("Error cargando conductores.");
    } finally {
      setLoading(false);
    }
  }

  function handleCreate() {
    setEditing({ ...EMPTY_DRIVER });
    setIsCreating(true);
  }

  function handleEdit(d: Driver) {
    setEditing({ ...d });
    setIsCreating(false);
  }

  async function saveChanges(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;

    try {
      const auth = ensureBasicAuth();
      const headers = { "Content-Type": "application/json", Authorization: auth };
      
      let res;
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

      await loadData();
      setEditing(null);
      setIsCreating(false);
    } catch (error: any) {
      alert(error.message);
    }
  }

  // --- Helper para subir archivos ---
  const uploadFile = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    // Nota: El endpoint /uploads es público según tu configuración, 
    // pero si requiere auth en el futuro, agrégalo aquí.
    const res = await fetch(`${API}/uploads`, { method: "POST", body: fd });
    if (!res.ok) throw new Error("Error subiendo archivo");
    const data = await res.json();
    return data.url;
  };

  // --- Componente interno para inputs de archivo ---
  const FileField = ({ 
    label, 
    value, 
    onChange 
  }: { 
    label: string; 
    value: string | null | undefined; 
    onChange: (url: string) => void;
  }) => {
    const [uploading, setUploading] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        setUploading(true);
        try {
          const url = await uploadFile(e.target.files[0]);
          onChange(url);
        } catch (error) {
          alert("Error subiendo el archivo. Intenta de nuevo.");
        } finally {
          setUploading(false);
        }
      }
    };

    return (
      <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
        <label className="block text-xs font-bold text-slate-700 mb-2">{label}</label>
        
        {/* Si ya tiene valor, mostrar link y botón de reemplazar */}
        {value ? (
          <div className="flex items-center justify-between gap-2">
            <a 
              href={value} 
              target="_blank" 
              rel="noreferrer" 
              className="text-xs text-blue-600 underline truncate max-w-[150px]"
              title="Ver archivo actual"
            >
              Ver Archivo Cargado
            </a>
            <label className="cursor-pointer text-[10px] bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded text-slate-700 font-medium">
              Reemplazar
              <input type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" />
            </label>
          </div>
        ) : (
          /* Si no tiene valor, mostrar input */
          <div className="relative">
            <input 
              type="file" 
              className="block w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
              onChange={handleFileChange}
              accept="image/*,.pdf"
              disabled={uploading}
            />
            {uploading && <span className="absolute right-0 top-0 text-xs text-emerald-600 font-bold animate-pulse">Subiendo...</span>}
          </div>
        )}
      </div>
    );
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "active": return <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">Activo</span>;
      case "suspended": return <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase">Suspendido</span>;
      case "inactive": return <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase">Inactivo</span>;
      default: return status;
    }
  };

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="mx-auto max-w-[1400px]">
        
        {/* Header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Directorio de Conductores</h1>
            <p className="text-sm text-slate-500">Gestión de personal, contactos y expediente digital.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={loadData} className="text-sm text-emerald-600 hover:underline px-3 font-medium">Refrescar</button>
            <button onClick={handleCreate} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-black transition-all">
              <span>+</span> Nuevo Conductor
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Nombre Completo</th>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Documentación</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={6} className="p-10 text-center text-slate-400">Cargando...</td></tr>
                ) : drivers.length === 0 ? (
                  <tr><td colSpan={6} className="p-10 text-center text-slate-400">No hay conductores registrados.</td></tr>
                ) : (
                  drivers.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-700">{d.full_name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{d.document_number}</td>
                      <td className="px-4 py-3 text-slate-600">
                        <div className="flex flex-col">
                          <span className="font-medium">{d.phone}</span>
                          <span className="text-[10px] text-slate-400">{d.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{statusBadge(d.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {d.cv_url && <span title="Hoja de Vida" className="cursor-help text-xs">📄</span>}
                          {d.contract_url && <span title="Contrato" className="cursor-help text-xs">📝</span>}
                          {(d.license_front_url || d.license_back_url) && <span title="Licencia" className="cursor-help text-xs">🚗</span>}
                          {!d.cv_url && !d.contract_url && <span className="text-slate-300 text-[10px] italic">Pendiente</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleEdit(d)} className="text-emerald-600 hover:text-emerald-800 font-medium">Editar</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-0 shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <div>
                <h2 className="text-xl font-bold text-slate-800">{isCreating ? "Crear Conductor" : "Editar Conductor"}</h2>
                <p className="text-xs text-slate-500">Expediente digital y datos personales.</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
            </div>

            <div className="p-6 overflow-y-auto">
              <form id="driverForm" onSubmit={saveChanges} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* COLUMNA IZQUIERDA: DATOS */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-emerald-100 pb-2">Información Personal</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Completo</label>
                      <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase" 
                        value={editing.full_name || ""} 
                        onChange={e => setEditing({...editing, full_name: e.target.value})} 
                        required />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Documento (CC)</label>
                      <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" 
                        value={editing.document_number || ""} 
                        onChange={e => setEditing({...editing, document_number: e.target.value})} 
                        required />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Fecha Nacimiento</label>
                      <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" 
                        value={editing.date_of_birth || ""} 
                        onChange={e => setEditing({...editing, date_of_birth: e.target.value})} />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Celular</label>
                      <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" 
                        value={editing.phone || ""} 
                        onChange={e => setEditing({...editing, phone: e.target.value})} 
                        required />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                      <input type="email" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" 
                        value={editing.email || ""} 
                        onChange={e => setEditing({...editing, email: e.target.value})} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Dirección</label>
                    <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" 
                      value={editing.address || ""} 
                      onChange={e => setEditing({...editing, address: e.target.value})} />
                  </div>

                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-emerald-100 pb-2 pt-4">Estado y Notas</h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Estado Operativo</label>
                    <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" 
                      value={editing.status || "active"} 
                      onChange={e => setEditing({...editing, status: e.target.value as any})} >
                      <option value="active">Activo (Disponible)</option>
                      <option value="inactive">Inactivo</option>
                      <option value="suspended">Suspendido (Mora/Sanción)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Notas Internas</label>
                    <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm h-20 resize-none" 
                      placeholder="Antecedentes, referencias, etc..."
                      value={editing.notes || ""} 
                      onChange={e => setEditing({...editing, notes: e.target.value})} />
                  </div>
                </div>

                {/* COLUMNA DERECHA: ARCHIVOS */}
                <div className="space-y-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                  
                  {/* Grupo 1: Identidad y CV */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Documentos Personales</h3>
                    <FileField 
                      label="Hoja de Vida (PDF)" 
                      value={editing.cv_url} 
                      onChange={(url) => setEditing(prev => ({...prev!, cv_url: url}))} 
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <FileField 
                        label="Cédula (Frontal)" 
                        value={editing.id_front_url} 
                        onChange={(url) => setEditing(prev => ({...prev!, id_front_url: url}))} 
                      />
                      <FileField 
                        label="Cédula (Trasera)" 
                        value={editing.id_back_url} 
                        onChange={(url) => setEditing(prev => ({...prev!, id_back_url: url}))} 
                      />
                    </div>
                  </div>

                  {/* Grupo 2: Licencia */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Licencia de Conducción</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <FileField 
                        label="Licencia (Frontal)" 
                        value={editing.license_front_url} 
                        onChange={(url) => setEditing(prev => ({...prev!, license_front_url: url}))} 
                      />
                      <FileField 
                        label="Licencia (Trasera)" 
                        value={editing.license_back_url} 
                        onChange={(url) => setEditing(prev => ({...prev!, license_back_url: url}))} 
                      />
                    </div>
                  </div>

                  {/* Grupo 3: Legal */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Legal</h3>
                    <FileField 
                      label="Contrato Firmado (PDF)" 
                      value={editing.contract_url} 
                      onChange={(url) => setEditing(prev => ({...prev!, contract_url: url}))} 
                    />
                  </div>

                </div>

              </form>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
              <button type="button" onClick={() => setEditing(null)} className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-white">Cancelar</button>
              <button form="driverForm" type="submit" className="px-5 py-2.5 rounded-xl bg-slate-900 text-sm font-bold text-white shadow-lg hover:bg-black transition-all">
                {isCreating ? "Crear Conductor" : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}