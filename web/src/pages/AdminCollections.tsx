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
  company_id: number;
  template_name: string;
  message_body: string;
  is_default: boolean;
};

// --- COMPONENTE PRINCIPAL ---
export default function AdminCollections() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lastUsedTemplateId, setLastUsedTemplateId] = useState<number | null>(null);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  
  // Estado para modal de crear usuario
  const [showCreateUser, setShowCreateUser] = useState(false);

  useEffect(() => {
    loadCompanies();
    loadUsers();
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      loadTemplates(selectedCompanyId);
    }
  }, [selectedCompanyId]);

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

  async function loadTemplates(cId: string) {
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/collections/templates?companyId=${cId}`, { headers: { Authorization: auth } });
      const json: Template[] = await res.json();
      setTemplates(json || []);
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

              <button 
                onClick={() => setShowTemplateManager(true)}
                className="ml-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm transition-colors flex items-center shadow-sm"
                title="Gestionar Plantillas"
              >
                ⚙️
              </button>
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
            templates={templates} 
            lastUsedTemplateId={lastUsedTemplateId}
            setLastUsedTemplateId={setLastUsedTemplateId}
            companyId={selectedCompanyId}
            onSent={() => {}} 
          />
        ) : (
          <HistoryView companyId={selectedCompanyId} />
        )}

        {showCreateUser && (
          <CreateUserModal 
            onClose={() => setShowCreateUser(false)} 
            onSuccess={() => {
              setShowCreateUser(false);
              loadUsers(); 
            }} 
          />
        )}

        {showTemplateManager && (
          <TemplateManagerModal 
            companyId={selectedCompanyId}
            onClose={() => setShowTemplateManager(false)}
            onSuccess={() => loadTemplates(selectedCompanyId)}
          />
        )}

      </div>
    </div>
  );
}

// --- PENDING VIEW ---
function PendingView({ 
  currentUser, 
  templates, 
  lastUsedTemplateId,
  setLastUsedTemplateId,
  companyId, 
  onSent 
}: { 
  currentUser: AppUser | null, 
  templates: Template[], 
  lastUsedTemplateId: number | null,
  setLastUsedTemplateId: (id: number) => void,
  companyId: string, 
  onSent: () => void 
}) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lockedData, setLockedData] = useState<{ locked: boolean; message?: string; serverTime?: string } | null>(null);
  const [phoneEdit, setPhoneEdit] = useState<{ driverId: number; name: string } | null>(null);
  const [reminderModalData, setReminderModalData] = useState<PendingItem | null>(null);

  useEffect(() => { if (companyId) loadPending(); }, [companyId]);

  async function loadPending() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/collections/pending?companyId=${companyId}`, { headers: { Authorization: auth } });
      const json = await res.json();
      
      setLockedData(null); 
      setItems(json.items || []); 

    } catch (e) { alert("Error cargando pendientes"); } 
    finally { setLoading(false); }
  }

  function handleSendClick(item: PendingItem) {
    if (!currentUser) return alert("Debes seleccionar quién gestiona arriba a la derecha.");
    if (!item.contact_phone) return alert("Este conductor no tiene teléfono. Agrégalo primero.");
    if (templates.length === 0) return alert("No hay plantillas configuradas para esta empresa. Por favor crea una primero haciendo clic en ⚙️ junto a la empresa.");
    
    setReminderModalData(item);
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
                      <button onClick={() => handleSendClick(item)} disabled={!currentUser || !item.contact_phone} className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-bold text-xs transition-all shadow-sm">
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
      {reminderModalData && currentUser && (
        <SendReminderModal 
          item={reminderModalData}
          templates={templates}
          currentUser={currentUser}
          lastUsedTemplateId={lastUsedTemplateId}
          setLastUsedTemplateId={setLastUsedTemplateId}
          onClose={() => setReminderModalData(null)}
          onSent={() => {
            setReminderModalData(null);
            loadPending();
            onSent();
          }}
        />
      )}
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

function SendReminderModal({ 
  item, 
  templates, 
  currentUser, 
  lastUsedTemplateId, 
  onClose, 
  onSent,
  setLastUsedTemplateId
}: { 
  item: PendingItem, 
  templates: Template[], 
  currentUser: AppUser, 
  lastUsedTemplateId: number | null, 
  onClose: () => void, 
  onSent: () => void,
  setLastUsedTemplateId: (id: number) => void
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(() => {
    if (lastUsedTemplateId && templates.find(t => t.id === lastUsedTemplateId)) {
      return lastUsedTemplateId;
    }
    const def = templates.find(t => t.is_default);
    if (def) return def.id;
    return templates[0]?.id || 0;
  });

  const [messagePreview, setMessagePreview] = useState("");

  useEffect(() => {
    const t = templates.find(x => x.id === selectedTemplateId);
    if (t) {
      let msg = t.message_body;
      msg = msg.replace(/{NOMBRE}/g, item.owner_name || "CONDUCTOR");
      msg = msg.replace(/{PLACA}/g, item.plate);
      msg = msg.replace(/{DIAS}/g, String(item.days_overdue));
      
      const formattedAmount = item.amount != null 
        ? new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(item.amount) 
        : "$0";
      msg = msg.replace(/{MONTO}/g, formattedAmount);
      
      setMessagePreview(msg);
    }
  }, [selectedTemplateId, templates, item]);

  async function handleConfirm() {
    setLastUsedTemplateId(selectedTemplateId);
    if (!item.contact_phone) return;
    const whatsappUrl = `https://wa.me/${item.contact_phone.replace(/\D/g, "")}?text=${encodeURIComponent(messagePreview)}`;
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
          message_snapshot: messagePreview
        }),
      });
      onSent();
    } catch (e) {
      console.error(e);
      alert("Error registrando envío");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
        <h3 className="text-lg font-bold mb-4 text-slate-800">Enviar Recordatorio ({item.plate})</h3>
        
        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-700 mb-1">Plantilla</label>
          <select 
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
            value={selectedTemplateId}
            onChange={e => setSelectedTemplateId(Number(e.target.value))}
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.template_name} {t.is_default ? "(Predeterminada)" : ""}</option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-slate-700 mb-1">Mensaje (Editable)</label>
          <textarea 
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 h-40 resize-none"
            value={messagePreview}
            onChange={e => setMessagePreview(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg font-medium text-sm">Cancelar</button>
          <button onClick={handleConfirm} className="px-4 py-2 bg-green-500 text-white rounded-lg font-bold text-sm hover:bg-green-600 transition-colors shadow-sm flex items-center gap-2">
            <span>Abrir WhatsApp</span>
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.008-.57-.008-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateManagerModal({ 
  companyId, 
  onClose, 
  onSuccess 
}: { 
  companyId: string, 
  onClose: () => void, 
  onSuccess: () => void 
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({ template_name: "", message_body: "", is_default: false });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { if (companyId) load() }, [companyId]);

  async function load() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const res = await fetch(`${API}/collections/templates?companyId=${companyId}`, { headers: { Authorization: auth } });
      setTemplates(await res.json());
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  function handleEdit(t: Template) {
    setEditingTemplate(t);
    setFormData({ template_name: t.template_name, message_body: t.message_body, is_default: t.is_default });
  }

  function handleNew() {
    setEditingTemplate({ id: 0 } as Template);
    setFormData({ template_name: "", message_body: "", is_default: false });
  }

  async function handleDelete(id: number) {
    if (!confirm("¿Eliminar plantilla?")) return;
    try {
      const auth = ensureBasicAuth();
      await fetch(`${API}/collections/templates/${id}`, { method: "DELETE", headers: { Authorization: auth } });
      load();
    } catch (e) { alert("Error eliminando") }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const auth = ensureBasicAuth();
      const method = editingTemplate?.id ? "PUT" : "POST";
      const url = editingTemplate?.id ? `${API}/collections/templates/${editingTemplate.id}` : `${API}/collections/templates`;
      
      const payload = { ...formData, company_id: Number(companyId) };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error();
      setEditingTemplate(null);
      load();
      onSuccess(); 
    } catch (e) {
      alert("Error guardando plantilla");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 md:p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800">Gestionar Plantillas</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-xl leading-none">&times;</button>
        </div>
        
        <div className="p-4 md:p-6 overflow-y-auto flex-1 flex flex-col md:flex-row gap-6">
          <div className="flex-1 md:border-r border-slate-200 md:pr-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold text-sm text-slate-700">Tus Plantillas</h4>
              <button onClick={handleNew} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-2 py-1 rounded"> + Nueva</button>
            </div>
            {loading ? <p className="text-sm text-slate-500">Cargando...</p> : (
              <div className="space-y-2">
                {templates.map(t => (
                  <div key={t.id} className="p-3 border border-slate-200 rounded-lg hover:border-emerald-300 transition-colors bg-white">
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <div className="font-bold text-sm text-slate-800 flex flex-wrap items-center gap-2">
                        {t.template_name}
                        {t.is_default && <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wide">Predeterminada</span>}
                      </div>
                      <div className="flex gap-2 text-xs shrink-0">
                        <button onClick={() => handleEdit(t)} className="text-blue-500 hover:underline">Editar</button>
                        <button onClick={() => handleDelete(t.id)} className="text-red-500 hover:underline">Borrar</button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">{t.message_body}</p>
                  </div>
                ))}
                {templates.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No hay plantillas creadas.</p>}
              </div>
            )}
          </div>
          
          {editingTemplate && (
            <div className="flex-1 bg-white">
              <h4 className="font-semibold text-sm text-slate-700 mb-4">{editingTemplate.id ? "Editar Plantilla" : "Nueva Plantilla"}</h4>
              <form onSubmit={save} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nombre referencial</label>
                  <input required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" value={formData.template_name} onChange={e => setFormData({...formData, template_name: e.target.value})} placeholder="Ej: Cobro Inicial" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mensaje para WhatsApp</label>
                  <textarea required className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 h-32 resize-none" value={formData.message_body} onChange={e => setFormData({...formData, message_body: e.target.value})} placeholder="Hola {NOMBRE}, debes {MONTO}..." />
                  <p className="text-[10.5px] text-slate-500 mt-1 leading-tight">Variables soportadas: <code className="bg-slate-100 text-slate-800 px-1 rounded">{'{NOMBRE}'}</code> <code className="bg-slate-100 text-slate-800 px-1 rounded">{'{PLACA}'}</code> <code className="bg-slate-100 text-slate-800 px-1 rounded">{'{DIAS}'}</code> <code className="bg-slate-100 text-slate-800 px-1 rounded">{'{MONTO}'}</code>.</p>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={formData.is_default} onChange={e => setFormData({...formData, is_default: e.target.checked})} className="rounded text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer" />
                  <span className="font-medium text-slate-700">Marcar como predeterminada</span>
                </label>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 mt-2">
                  <button type="button" onClick={() => setEditingTemplate(null)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancelar</button>
                  <button type="submit" disabled={isSaving} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50">
                    {isSaving ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}