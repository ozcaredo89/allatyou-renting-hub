import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import { StatusBadge } from "../components/StatusBadge";
import { WhatsAppBtn, EmailBtn } from "../components/ContactButtons";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

export default function AdminRecruitment() {
  const [tab, setTab] = useState<"drivers" | "vehicles">("drivers");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const endpoint = tab === "drivers" ? "/driver-applications" : "/vehicle-applications";
      const rs = await fetch(`${API}${endpoint}?limit=100`, {
        headers: { Authorization: ensureBasicAuth() },
      });

      if (rs.status === 401) {
        clearBasicAuth();
        window.location.reload();
        return;
      }

      const json = await rs.json();
      setItems(Array.isArray(json) ? json : []);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setSelected(null);
    setRejecting(false);
    setRejectReason("");
    setRejectError(null);
  }, [tab]);

  const changeStatus = async (id: number, newStatus: string, reason?: string) => {
    if (newStatus !== "rejected" && !confirm(`¿Estás seguro de marcar esto como ${newStatus.toUpperCase()}?`)) return;
    
    setActionLoading(true);
    const endpoint = tab === "drivers" ? "/driver-applications" : "/vehicle-applications";
    try {
      const rs = await fetch(`${API}${endpoint}/${id}`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: ensureBasicAuth() 
        },
        body: JSON.stringify({ 
          status: newStatus,
          status_reason: reason || null
        })
      });

      if (!rs.ok) {
        const err = await rs.json().catch(() => ({}));
        alert(err.error || "Error actualizando estado");
        return;
      }
      
      setSelected(null);
      setRejecting(false);
      setRejectReason("");
      setRejectError(null);
      loadData();
    } catch (error) {
      alert("Error actualizando estado");
    } finally {
      setActionLoading(false);
    }
  };

  const [uploadingDocKind, setUploadingDocKind] = useState<string | null>(null);

  const handleAdminDocUpload = async (appId: number, kind: string, file: File) => {
    setUploadingDocKind(kind);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "documents");
      const upRs = await fetch(`${API}/uploads`, {
        method: "POST",
        body: fd
      });
      if (!upRs.ok) throw new Error("Error al subir archivo");
      const { url } = await upRs.json();

      const docRs = await fetch(`${API}/driver-applications/${appId}/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ensureBasicAuth()
        },
        body: JSON.stringify({ kind, url })
      });
      if (!docRs.ok) throw new Error("Error asociando documento a la postulación");
      const docData = await docRs.json();

      setSelected((prev: any) => {
        if (!prev) return null;
        const currentDocs = (prev.driver_application_documents || []).filter((d: any) => d.kind !== kind);
        return {
          ...prev,
          driver_application_documents: [...currentDocs, docData.document]
        };
      });
      loadData();
    } catch (err: any) {
      alert(err.message || "Error cargando documento");
    } finally {
      setUploadingDocKind(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Reclutamiento</h1>
            <p className="text-slate-500 text-sm mt-1">Gestiona postulaciones de conductores y vehículos.</p>
          </div>
          <button 
            onClick={loadData} 
            className="self-start md:self-auto px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm"
          >
            🔄 Refrescar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-white rounded-2xl border border-slate-200 w-fit mb-6 shadow-sm">
          <button
            onClick={() => setTab("drivers")}
            className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all ${
              tab === "drivers" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Conductores
          </button>
          <button
            onClick={() => setTab("vehicles")}
            className={`px-6 py-2.5 text-sm font-bold rounded-xl transition-all ${
              tab === "vehicles" ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            Vehículos
          </button>
        </div>

        {/* Tabla Listado */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400 animate-pulse">Cargando datos...</div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-slate-500">No hay registros para mostrar.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Nombre / Contacto</th>
                    <th className="px-6 py-4">{tab === "drivers" ? "Perfil" : "Vehículo"}</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const name = item.full_name || item.owner_name;
                    const phone = item.phone_mobile || item.owner_phone;
                    const email = item.email || item.owner_email;
                    
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="px-6 py-4 text-slate-500 whitespace-nowrap">
                          {new Date(item.created_at).toLocaleDateString()}
                          <div className="text-xs text-slate-400">
                            {new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{name}</div>
                          <div className="flex gap-2 mt-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                            <WhatsAppBtn value={phone} contextMsg={`Hola ${name}, te escribo de AllAtYou sobre tu proceso.`} />
                            <EmailBtn value={email} contextMsg="Actualización proceso AllAtYou" />
                          </div>
                        </td>

                        <td className="px-6 py-4 text-slate-600">
                          {tab === "drivers" ? (
                            <div className="space-y-1">
                              <div className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded w-fit">{item.document_number}</div>
                              <div className="text-xs">
                                {item.has_valid_license ? `Licencia: ${item.license_number_cat}` : <span className="text-red-500">Sin licencia vigente</span>}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded w-fit">{item.plate}</div>
                              <div className="text-xs">{item.brand} {item.line} ({item.model_year})</div>
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4">
                          <StatusBadge status={item.status} />
                          {item.status === "rejected" && item.status_reason && (
                            <div className="text-[11px] text-red-600 font-medium mt-1 max-w-[200px] truncate" title={item.status_reason}>
                              {item.status_reason}
                            </div>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => setSelected(item)}
                            className="text-slate-600 hover:text-slate-900 font-bold hover:underline decoration-2 underline-offset-2"
                          >
                            Ver Detalle →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DETALLE */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            
            {/* Header Modal */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{selected.full_name || selected.owner_name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <span className="text-sm text-slate-500 self-center">
                    Registrado el {new Date(selected.created_at).toLocaleDateString()}
                  </span>
                </div>
                {selected.status_reason && (
                  <div className="mt-2.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                    <span className="font-bold">Motivo:</span> {selected.status_reason}
                  </div>
                )}
              </div>
              <button 
                onClick={() => {
                  setSelected(null);
                  setRejecting(false);
                  setRejectReason("");
                  setRejectError(null);
                }} 
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                ✕
              </button>
            </div>
            
            {/* Body Modal */}
            <div className="p-8 space-y-8">
              
              {/* Sección Contacto */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Teléfono</label>
                  <p className="font-mono font-medium text-slate-700">{selected.phone_mobile || selected.owner_phone}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Email</label>
                  <p className="font-medium text-slate-700 break-words">{selected.email || selected.owner_email}</p>
                </div>
                {/* Botones de acción rápida dentro del modal */}
                <div className="col-span-2 flex gap-3 pt-2">
                   <WhatsAppBtn value={selected.phone_mobile || selected.owner_phone} contextMsg={`Hola ${selected.full_name || selected.owner_name}, revisando tu proceso...`} />
                   <EmailBtn value={selected.email || selected.owner_email} contextMsg="Actualización proceso AllAtYou" />
                </div>
                
                {tab === "vehicles" && (
                  <div className="col-span-2 pt-2 border-t border-slate-200 mt-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ciudad</label>
                    <p className="font-medium text-slate-700">{selected.owner_city}</p>
                  </div>
                )}
              </div>

              {/* Data Específica */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 border-b pb-2">Información del {tab === "drivers" ? "Candidato" : "Vehículo"}</h3>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6 text-sm">
                  {tab === "drivers" ? (
                    <>
                      <div><dt className="text-slate-500">Cédula</dt><dd className="font-medium">{selected.document_number}</dd></div>
                      <div><dt className="text-slate-500">Fecha Nacimiento</dt><dd className="font-medium">{selected.date_of_birth}</dd></div>
                      <div><dt className="text-slate-500">Dirección</dt><dd className="font-medium">{selected.address}</dd></div>
                      <div><dt className="text-slate-500">Licencia</dt><dd className="font-medium">{selected.has_valid_license ? `Sí (${selected.license_number_cat})` : "No"}</dd></div>
                      <div><dt className="text-slate-500">Años Conduciendo</dt><dd className="font-medium">{selected.driving_exp_time || "No indicado"}</dd></div>
                      <div><dt className="text-slate-500">Compromiso Semanal</dt><dd className="font-medium">{selected.weekly_delivery_commitment ? "✅ Aceptado" : "❌ Rechazado"}</dd></div>
                      <div><dt className="text-slate-500">Test Toxicología</dt><dd className="font-medium">{selected.toxicology_test_consent ? "✅ Aceptado" : "❌ Rechazado"}</dd></div>
                      <div className="sm:col-span-2"><dt className="text-slate-500">Experiencia previa</dt><dd className="font-medium mt-1 p-2 bg-slate-50 rounded-lg">{selected.similar_job_exp || "No especificada"}</dd></div>
                    </>
                  ) : (
                    <>
                      <div><dt className="text-slate-500">Placa</dt><dd className="font-mono font-bold text-lg">{selected.plate}</dd></div>
                      <div><dt className="text-slate-500">Vehículo</dt><dd className="font-medium">{selected.brand} {selected.line}</dd></div>
                      <div><dt className="text-slate-500">Modelo</dt><dd className="font-medium">{selected.model_year}</dd></div>
                      <div><dt className="text-slate-500">Combustible</dt><dd className="font-medium">{selected.fuel_type}</dd></div>
                      <div><dt className="text-slate-500">Color</dt><dd className="font-medium">{selected.color}</dd></div>
                      <div><dt className="text-slate-500">Kilometraje</dt><dd className="font-medium">{selected.mileage ? selected.mileage.toLocaleString() : "N/A"}</dd></div>
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 sm:col-span-2">
                        <dt className="text-emerald-800 text-xs font-bold uppercase">Expectativa de Renta</dt>
                        <dd className="font-bold text-emerald-700 text-lg">${new Intl.NumberFormat('es-CO').format(selected.expected_daily_rent)} / día</dd>
                        <dd className="text-xs text-emerald-600 mt-1">Disponibilidad: {selected.availability_type}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>

              {/* Sección Referencias Personales (Solo Conductores) */}
              {tab === "drivers" && (
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-3 border-b pb-2">Referencias Personales</h3>
                  {((selected.driver_application_references && selected.driver_application_references.length > 0) || (selected.references && selected.references.length > 0)) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(selected.driver_application_references || selected.references || []).map((ref: any, idx: number) => {
                        const refName = ref.ref_name || ref.name || "Sin nombre";
                        const refPhone = ref.ref_phone || ref.phone || "";
                        return (
                          <div key={ref.id || idx} className="p-4 bg-slate-50 border border-slate-200/70 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                Referencia {ref.position || idx + 1}
                              </span>
                              {refPhone && (
                                <WhatsAppBtn 
                                  value={refPhone} 
                                  contextMsg={`Hola ${refName}, te contacto de AllAtYou respecto a la postulación de ${selected.full_name}.`} 
                                />
                              )}
                            </div>
                            <p className="font-bold text-slate-800 text-sm">{refName}</p>
                            <p className="font-mono text-xs text-slate-600 flex items-center gap-1.5">
                              <span className="text-slate-400">Tel:</span>
                              {refPhone ? (
                                <a href={`tel:${refPhone}`} className="hover:underline font-semibold text-slate-700">
                                  {refPhone}
                                </a>
                              ) : (
                                <span className="text-slate-400 italic">No registrado</span>
                              )}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl">No hay referencias registradas para esta postulación.</p>
                  )}
                </div>
              )}

              {/* Sección Documentos (Solo Conductores) */}
              {tab === "drivers" && (
                <div>
                  <div className="flex items-center justify-between mb-3 border-b pb-2">
                    <h3 className="text-lg font-bold text-slate-900">Documentos y Firma Digital</h3>
                    <span className="text-xs text-slate-500 font-medium">Cédula, Licencia y Firma</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { kind: "id_document_photo", label: "Cédula de Ciudadanía", icon: "🪪" },
                      { kind: "driver_license_photo", label: "Licencia de Conducción", icon: "🚗" },
                      { kind: "digital_signature", label: "Firma Digital", icon: "✍️" },
                    ].map(slot => {
                      const allDocs = (selected.driver_application_documents || selected.documents || []);
                      const doc = allDocs.find((d: any) => d.kind === slot.kind && d.url && !d.url.includes("placeholder"));
                      const isUploading = uploadingDocKind === slot.kind;

                      return (
                        <div key={slot.kind} className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-2">
                              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <span>{slot.icon}</span> {slot.label}
                              </span>
                              {doc ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  ✓ Adjuntado
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                  ⚠️ Pendiente
                                </span>
                              )}
                            </div>

                            {doc ? (
                              <div className="my-2">
                                <a 
                                  href={doc.url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="block relative group overflow-hidden rounded-xl border border-slate-200 bg-white"
                                >
                                  {doc.url.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i) || !doc.url.toLowerCase().includes(".pdf") ? (
                                    <img 
                                      src={doc.url} 
                                      alt={slot.label} 
                                      className="w-full h-28 object-contain bg-slate-900/5 group-hover:scale-105 transition-transform duration-200" 
                                    />
                                  ) : (
                                    <div className="w-full h-28 flex flex-col items-center justify-center bg-slate-100 text-slate-600 gap-1">
                                      <span className="text-2xl">📄</span>
                                      <span className="text-[11px] font-semibold">Documento PDF</span>
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                                    <span>Ver original ↗</span>
                                  </div>
                                </a>
                              </div>
                            ) : (
                              <div className="my-2 h-28 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center p-3 text-center bg-white/50">
                                <span className="text-xl text-slate-300 mb-1">{slot.icon}</span>
                                <span className="text-[11px] text-slate-400">Sin documento registrado</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2">
                            {doc && (
                              <a
                                href={doc.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-bold text-emerald-600 hover:underline inline-flex items-center gap-0.5"
                              >
                                Abrir ↗
                              </a>
                            )}
                            <label className={`text-[11px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-colors shadow-sm ${
                              doc 
                                ? "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 ml-auto" 
                                : "w-full text-center bg-emerald-600 text-white hover:bg-emerald-700"
                            } ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
                              {isUploading ? "Subiendo..." : doc ? "Cambiar" : "📷 Adjuntar"}
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                className="hidden"
                                disabled={isUploading}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleAdminDocUpload(selected.id, slot.kind, file);
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Acciones de Gestión */}
              <div className="pt-6 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Gestionar Estado</h4>
                
                {rejecting ? (
                  <div className="p-5 bg-red-50/90 border border-red-200 rounded-2xl space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-red-900 uppercase tracking-wider">
                        Motivo del Rechazo * (Obligatorio)
                      </label>
                      <span className="text-[11px] text-red-600 font-semibold">Quedará registrado en la postulación</span>
                    </div>
                    <textarea
                      rows={3}
                      className="w-full rounded-xl border border-red-300 bg-white p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 shadow-sm"
                      placeholder="Indica la razón por la cual se rechaza la solicitud (ej. no cumple con el perfil, edad menor a la requerida, documentación inválida, vehículo no apto, etc.)..."
                      value={rejectReason}
                      onChange={e => {
                        setRejectReason(e.target.value);
                        if (rejectError) setRejectError(null);
                      }}
                      autoFocus
                    />
                    {rejectError && (
                      <p className="text-xs font-semibold text-red-600">{rejectError}</p>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <button 
                        type="button"
                        disabled={actionLoading}
                        onClick={() => {
                          setRejecting(false);
                          setRejectReason("");
                          setRejectError(null);
                        }}
                        className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        Cancelar
                      </button>
                      <button 
                        type="button"
                        disabled={actionLoading || !rejectReason.trim()}
                        onClick={() => {
                          if (!rejectReason.trim() || rejectReason.trim().length < 3) {
                            setRejectError("Por favor ingresa un motivo de rechazo claro (mínimo 3 caracteres).");
                            return;
                          }
                          changeStatus(selected.id, "rejected", rejectReason.trim());
                        }}
                        className="px-5 py-2.5 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-red-200"
                      >
                        {actionLoading ? "Guardando..." : "Confirmar Rechazo"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-4">
                    <button 
                      disabled={actionLoading}
                      onClick={() => changeStatus(selected.id, "approved")}
                      className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {actionLoading ? "Procesando..." : "Aprobar / Contactado"}
                    </button>
                    {selected.status !== "rejected" && (
                      <button 
                        disabled={actionLoading}
                        onClick={() => {
                          setRejecting(true);
                          setRejectReason("");
                          setRejectError(null);
                        }}
                        className="px-6 py-3 border border-red-200 text-red-600 bg-red-50 rounded-xl font-bold hover:bg-red-100 transition-colors active:scale-95 disabled:opacity-50"
                      >
                        Rechazar
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}