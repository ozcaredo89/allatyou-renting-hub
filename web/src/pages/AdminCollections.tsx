import { useEffect, useState } from "react";
import { ensureBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

// --- TIPOS ---
type AppUser = {
  id: number;
  full_name: string;
};

type Company = {
  id: number;
  name: string;
};

type PendingItem = {
  plate: string;
  owner_name: string | null;
  days_overdue: number;
  amount: number | null;
  driver_id: number | null;
  contact_phone: string | null;
};

type HistoryItem = {
  id: number;
  vehicle_plate: string;
  sent_at: string;
  resend_count: number;
  message_snapshot: string;
  sender: { full_name: string };
  vehicle: { owner_name: string; owner_whatsapp?: string };
  driver: { phone: string };
};

type Template = {
  id: number;
  message_body: string;
};

// --- COMPONENTE PRINCIPAL ---
export default function AdminCollections() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [template, setTemplate] = useState<string>("");
  
  // Estado para modal de crear usuario
  const [showCreateUser, setShowCreateUser] = useState(false);

  useEffect(() => {
    loadCompanies();
    loadUsers();
    loadTemplate();
  }, []);

  async function loadCompanies() {
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/companies`, { headers: { Authorization: auth } });
      const json = await res.json();
      setCompanies(json);
      if (json.length > 0) setSelectedCompanyId(String(json[0].id));
    } catch (e) { console.error(e); }
  }

  async function loadUsers() {
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/app-users`, { headers: { Authorization: auth } });
      const json = await res.json();
      setUsers(json);
    } catch (e) { console.error(e); }
  }

  async function loadTemplate() {
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/collections/templates`, { headers: { Authorization: auth } });
      const json: Template = await res.json();
      if (json) setTemplate(json.message_body);
    } catch (e) { console.error(e); }
  }

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="mx-auto max-w-6xl">
        
        {/* HEADER */}
        <div className="mb-6 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Gestión de Cobranza</h1>
            <p className="text-sm text-slate-500">Notificaciones de mora y seguimiento diario.</p>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            {/* Selector Empresa */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500 uppercase">Empresa</span>
              <select 
                className="bg-slate-100 border border-slate-200 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500 min-w-[150px]"
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
              >
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Selector Usuario + Botón Crear */}
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase mr-1">¿Quién gestiona?</span>
              <select 
                className="bg-slate-100 border border-slate-200 text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500 min-w-[150px]"
                value={currentUser?.id || ""}
                onChange={(e) => {
                  const u = users.find(x => x.id === Number(e.target.value));
                  setCurrentUser(u || null);
                }}
              >
                <option value="">-- Seleccionar --</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
              
              {/* BOTÓN NUEVO USUARIO */}
              <button 
                onClick={() => setShowCreateUser(true)}
                className="bg-black text-white h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-800 transition-colors shadow-sm"
                title="Registrar nuevo usuario operativo"
              >
                +
              </button>

              {!currentUser && <span className="text-xs text-red-500 font-medium animate-pulse ml-1">Requerido</span>}
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="flex gap-2 mb-6 border-b border-slate-200">
          <button
            onClick={() => setTab("pending")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "pending" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Pendientes por Notificar
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "history" ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Historial de Envíos
          </button>
        </div>

        {/* CONTENIDO */}
        {tab === "pending" ? (
          <PendingView 
            currentUser={currentUser} 
            template={template} 
            companyId={selectedCompanyId}
            onSent={() => {}} 
          />
        ) : (
          <HistoryView companyId={selectedCompanyId} />
        )}

        {/* MODAL CREAR USUARIO */}
        {showCreateUser && (
          <CreateUserModal 
            onClose={() => setShowCreateUser(false)} 
            onSuccess={() => {
              setShowCreateUser(false);
              loadUsers(); 
            }} 
          />
        )}

      </div>
    </div>
  );
}

// --- PENDING VIEW (MODIFICADO PARA IGNORAR BLOQUEO) ---
function PendingView({ currentUser, template, companyId, onSent }: { currentUser: AppUser | null, template: string, companyId: string, onSent: () => void }) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lockedData, setLockedData] = useState<{ locked: boolean; message?: string; serverTime?: string } | null>(null);
  const [phoneEdit, setPhoneEdit] = useState<{ driverId: number; name: string } | null>(null);

  useEffect(() => { if (companyId) loadPending(); }, [companyId]);

  async function loadPending() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/collections/pending?companyId=${companyId}`, { headers: { Authorization: auth } });
      const json = await res.json();
      
      // --- MODIFICACIÓN: SUSPENDER BLOQUEO ---
      // Ignoramos json.locked y forzamos la carga de items siempre.
      // Si quieres volver a activar el bloqueo, descomenta el bloque IF original abajo.
      
      /* LÓGICA ORIGINAL (BLOQUEADA):
      if (json.locked) { setLockedData(json); setItems([]); } 
      else { setLockedData(null); setItems(json.items || []); }
      */

      // NUEVA LÓGICA (DESBLOQUEADA):
      setLockedData(null); 
      // Nota: Si el backend no envía 'items' cuando está bloqueado, esto saldrá vacío, 
      // pero ya no mostrará la pantalla de bloqueo.
      setItems(json.items || []); 

    } catch (e) { alert("Error cargando pendientes"); } 
    finally { setLoading(false); }
  }

  const buildMessage = (item: PendingItem) => {
    let msg = template;
    msg = msg.replace("{NOMBRE}", item.owner_name || "CONDUCTOR");
    msg = msg.replace("{PLACA}", item.plate);
    msg = msg.replace("{DIAS}", String(item.days_overdue));
    return msg;
  };

  async function handleSend(item: PendingItem) {
    if (!currentUser) return alert("Debes seleccionar quién gestiona arriba a la derecha.");
    if (!item.contact_phone) return alert("Este conductor no tiene teléfono. Agrégalo primero.");

    const message = buildMessage(item);
    const whatsappUrl = `https://wa.me/${item.contact_phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");

    try {
      const auth = ensureBasicAuth();
      await fetch(`${API}/collections/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({
          vehicle_plate: item.plate,
          driver_id: item.driver_id,
          sent_by_user_id: currentUser.id,
          days_overdue: item.days_overdue,
          message_snapshot: message
        }),
      });
      loadPending();
      onSent(); 
    } catch (e) { console.error(e); }
  }

  if (lockedData?.locked) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
        <div className="text-6xl mb-4">⏳</div>
        <h2 className="text-xl font-bold text-slate-800">Módulo en Espera</h2>
        <p className="text-slate-500 mt-2">{lockedData.message}</p>
        <p className="text-xs text-slate-400 mt-1">Hora servidor: {lockedData.serverTime}</p>
        <button onClick={loadPending} className="mt-6 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium transition-colors">Probar de nuevo</button>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-700">Placa</th>
                <th className="px-4 py-3 font-semibold text-slate-700">Conductor</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-center">Días Mora</th>
                <th className="px-4 py-3 font-semibold text-slate-700 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-400">Cargando...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-slate-500">🎉 Todo al día.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.plate} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">{item.plate}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{item.owner_name || "Sin asignar"}</div>
                      {item.contact_phone ? (
                        <div className="text-xs text-slate-500 flex items-center gap-1">📱 {item.contact_phone} <button onClick={() => item.driver_id && setPhoneEdit({ driverId: item.driver_id, name: item.owner_name || "" })} className="text-blue-500 hover:underline ml-2">(Editar)</button></div>
                      ) : (
                        <button onClick={() => item.driver_id && setPhoneEdit({ driverId: item.driver_id, name: item.owner_name || "" })} className="text-xs text-red-500 font-bold hover:underline">🚫 Falta teléfono</button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{item.days_overdue} días</span></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleSend(item)} disabled={!currentUser || !item.contact_phone} className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold text-xs transition-all shadow-sm">
                        <span>WhatsApp</span>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.008-.57-.008-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {phoneEdit && <PhoneEditModal driverId={phoneEdit.driverId} driverName={phoneEdit.name} onClose={() => setPhoneEdit(null)} onSuccess={() => { setPhoneEdit(null); loadPending(); }} />}
    </>
  );
}

// --- HISTORY VIEW (Sin cambios) ---
function HistoryView({ companyId }: { companyId: string }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  });

  useEffect(() => { 
    if (companyId) loadHistory(); 
  }, [companyId, selectedDate]);

  async function loadHistory() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/collections/history?companyId=${companyId}&date=${selectedDate}`, { headers: { Authorization: auth } });
      const json = await res.json();
      setItems(json || []);
    } catch { alert("Error cargando historial"); } finally { setLoading(false); }
  }

  async function handleResend(item: HistoryItem) {
    const phone = item.driver?.phone || item.vehicle?.owner_whatsapp;

    if (!phone) {
      return alert("No se encontró un número de teléfono para reenviar este mensaje.");
    }

    const whatsappUrl = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(item.message_snapshot)}`;
    window.open(whatsappUrl, "_blank");

    try {
      const auth = ensureBasicAuth();
      await fetch(`${API}/collections/resend/${item.id}`, { method: "POST", headers: { Authorization: auth } });
      loadHistory(); 
    } catch (e) { console.error(e); }
  }

  return (
    <div className="space-y-4">
      
      {/* FILTRO DE FECHA */}
      <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm w-fit">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Fecha:</span>
        <input 
          type="date" 
          className="text-sm font-medium text-slate-700 bg-transparent outline-none cursor-pointer"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold text-slate-700">Hora</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Placa</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Conductor</th>
              <th className="px-4 py-3 font-semibold text-slate-700">Enviado por</th>
              <th className="px-4 py-3 font-semibold text-slate-700 text-center">Reenvíos</th>
              <th className="px-4 py-3 font-semibold text-slate-700 text-right">Mensaje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-400">Cargando...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">No hay envíos registrados en esta fecha.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{new Date(item.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-800">{item.vehicle_plate}</td>
                  <td className="px-4 py-3">{item.vehicle?.owner_name || "—"}</td>
                  <td className="px-4 py-3"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-medium">{item.sender?.full_name || "Sistema"}</span></td>
                  <td className="px-4 py-3 text-center font-mono text-slate-500">{item.resend_count}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleResend(item)} className="text-blue-600 hover:underline text-xs" title={item.message_snapshot}>Ver / Reenviar</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- MODALS (Sin cambios) ---
function CreateUserModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [form, setForm] = useState({ full_name: "", document_number: "", phone: "" });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/app-users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      onSuccess();
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
        <h3 className="text-lg font-bold mb-4">Registrar Nuevo Usuario</h3>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nombre Completo</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" required value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Documento (CC)</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" required value={form.document_number} onChange={e => setForm({...form, document_number: e.target.value})} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Celular (WhatsApp)</label>
            <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black" required value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-black text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
              {saving ? "Guardando..." : "Crear Usuario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PhoneEditModal({ driverId, driverName, onClose, onSuccess }: { driverId: number, driverName: string, onClose: () => void, onSuccess: () => void }) {
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!phone) return alert("Escribe un número");
    setSaving(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/drivers/${driverId}/contact`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) throw new Error();
      onSuccess();
    } catch { alert("Error guardando teléfono"); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <h3 className="text-lg font-bold mb-2">Actualizar Contacto</h3>
        <p className="text-sm text-slate-500 mb-4">Ingresa el WhatsApp para <b>{driverName}</b>:</p>
        <input autoFocus className="w-full border border-slate-300 rounded-xl px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-emerald-500 mb-4" placeholder="Ej: 311..." value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={save} disabled={saving || !phone} className="px-4 py-2 bg-black text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50">{saving ? "Guardando..." : "Guardar y Continuar"}</button>
        </div>
      </div>
    </div>
  );
}