import { useMemo, useState, useEffect } from "react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

// Para el preview/WhatsApp usaremos el número fijo:
const SUPPORT_WA_NUMBER = "573113738912";

type DriverFlat = {
  plate: string;
  driver_name: string;
  has_credit: boolean;
  default_amount: number | null;
  default_installment: number | null;
};
type DriverResp = { found: false } | { found: true; driver: DriverFlat } | DriverFlat;

type SavedExpensePreview = {
  date: string;
  item: string;
  description: string;
  total: number;         // en pesos (int)
  plates: string[];
  perVehicle: number;    // estimado: total / plates.length
};

type ExpenseAttachment = {
  kind: "evidence" | "invoice" | "legacy";
  url: string;
};

type ExpenseRow = {
  id: number;
  date: string;
  item: string;
  description: string;
  total_amount: number;
  attachment_url: string | null; // legacy
  expense_attachments?: { kind: "evidence" | "invoice"; url: string }[];
  expense_vehicles: { plate: string; share_amount: number }[];
};


export default function Expenses() {

  const [recent, setRecent] = useState<ExpenseRow[]>([]);
  async function loadRecent() {
    const rs = await fetch(`${API}/expenses?limit=10`);
    if (!rs.ok) return;
    const json = await rs.json();
    setRecent(json.items);
  }
  useEffect(() => { loadRecent(); }, []);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState(""); // solo dígitos
  const [plates, setPlates] = useState<string[]>([]);
  const [plateInput, setPlateInput] = useState("");
  //const [file, setFile] = useState<File | null>(null);
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [invoiceFiles, setInvoiceFiles] = useState<File[]>([]);
  // Modal para agregar adjuntos a un gasto existente
  const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null);
  const [editEvidenceFiles, setEditEvidenceFiles] = useState<File[]>([]);
  const [editInvoiceFiles, setEditInvoiceFiles] = useState<File[]>([]);

  const [loading, setLoading] = useState(false);

  // === Validación placa que se está escribiendo ===
  const normalizedPlate = useMemo(
    () => plateInput.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    [plateInput]
  );
  const plateFormatValid = useMemo(() => PLATE_RE.test(normalizedPlate), [normalizedPlate]);

  const [checking, setChecking] = useState<"idle" | "checking" | "ok" | "missing">("idle");
  const [driverName, setDriverName] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    async function run() {
      setDriverName(null);
      if (!plateFormatValid) {
        setChecking("idle");
        return;
      }
      setChecking("checking");
      try {
        const rs = await fetch(`${API}/drivers/${normalizedPlate}`);
        if (cancel) return;
        if (!rs.ok) {
          setChecking("missing");
          return;
        }
        const raw: DriverResp = await rs.json();
        let exists = false;
        let d: DriverFlat | null = null;
        if ("found" in raw) {
          exists = raw.found === true;
          d = (raw as any).driver ?? null;
        } else if ("plate" in raw) {
          exists = true;
          d = raw as DriverFlat;
        }
        setChecking(exists ? "ok" : "missing");
        setDriverName(d?.driver_name ?? null);
      } catch {
        setChecking("missing");
      }
    }
   (normalizedPlate.length >= 3) ? run() : setChecking("idle");
    return () => { cancel = true; };
  }, [normalizedPlate, plateFormatValid, API]);

  // === Totales ===
  const total = useMemo(
    () => Number((amountStr || "").replace(/[^\d]/g, "")) || 0,
    [amountStr]
  );
  const share = useMemo(
    () => (plates.length ? Math.floor(total / plates.length) : 0),
    [total, plates.length]
  );

  function addPlate() {
    // uppercase + filtrado al teclear
    const next = normalizedPlate;
    if (!PLATE_RE.test(next)) return;
    if (checking !== "ok") return;
    if (plates.includes(next)) return;
    setPlates([...plates, next]);
    setPlateInput("");
    setChecking("idle");
    setDriverName(null);
  }

  function removePlate(p: string) {
    setPlates(plates.filter((x) => x !== p));
  }

  async function uploadMany(files: File[]): Promise<string[]> {
    const urls: string[] = [];
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      const rs = await fetch(`${API}/uploads`, { method: "POST", body: fd });
      if (!rs.ok) throw new Error("upload failed");
      const json = await rs.json();
      urls.push(json.url as string);
    }
    return urls;
  }


  // === Nuevo: estado del último gasto guardado y modal de confirmación ===
  const [saved, setSaved] = useState<SavedExpensePreview | null>(null);
  const [showModal, setShowModal] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item.trim()) return alert("Item requerido");
    if (!plates.length) return alert("Agrega al menos una placa");

    setLoading(true);
    try {
      const evidenceUrls = await uploadMany(evidenceFiles);
      const invoiceUrls  = await uploadMany(invoiceFiles);

      const attachments = [
        ...evidenceUrls.map((url) => ({ kind: "evidence" as const, url })),
        ...invoiceUrls.map((url) => ({ kind: "invoice" as const, url })),
      ];

      const body = {
        date,
        item: item.trim(),
        description: description.trim() || null,
        total_amount:total,
        plates,
        attachments,
      };

      const rs = await fetch(`${API}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!rs.ok) throw new Error(await rs.text());

      const preview: SavedExpensePreview = {
        date,
        item: item.trim(),
        description: description.trim(),
        total, // en pesos (int)
        plates: [...plates],
        perVehicle: plates.length ? Math.floor(total / plates.length) : 0,
      };
      setSaved(preview);
      setShowModal(true);
      await loadRecent();

      // Reset
      setAmountStr("");
      setPlates([]);
      setEvidenceFiles([]);
      setInvoiceFiles([]);
    } catch {
      alert("Error creando gasto");
    } finally {
      setLoading(false);
    }
  }

  function buildMessage(s: SavedExpensePreview): string {
    return `Gasto registrado:
• Fecha: ${s.date}
• Item: ${s.item}
• Descripción: ${s.description}
• Placas: ${s.plates.join(", ")}
• Total: $${fmtCOP.format(s.total)}
• Por vehículo: $${fmtCOP.format(s.perVehicle)}`;
  }

  function sendWhatsapp() {
    if (!saved) return;
    const msg = buildMessage(saved);
    const url = `https://wa.me/${SUPPORT_WA_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  function copyMessage() {
    if (!saved) return;
    const msg = buildMessage(saved);
    navigator.clipboard.writeText(msg).then(() => {
      alert("Mensaje copiado ✅");
    });
  }

  async function submitEditAttachments(e: React.FormEvent) {
    e.preventDefault();
    if (!editingExpenseId) return;

    const hasFiles = editEvidenceFiles.length || editInvoiceFiles.length;
    if (!hasFiles) {
      alert("Selecciona al menos un archivo.");
      return;
    }

    setLoading(true);
    try {
      const evidenceUrls = await uploadMany(editEvidenceFiles);
      const invoiceUrls  = await uploadMany(editInvoiceFiles);

      const attachments = [
        ...evidenceUrls.map((url) => ({ kind: "evidence" as const, url })),
        ...invoiceUrls.map((url) => ({ kind: "invoice" as const, url })),
      ];

      const rs = await fetch(`${API}/expenses/${editingExpenseId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachments }),
      });

      if (!rs.ok) throw new Error(await rs.text());

      await loadRecent();

      setEditingExpenseId(null);
      setEditEvidenceFiles([]);
      setEditInvoiceFiles([]);
    } catch (err) {
      console.error(err);
      alert("Error agregando soportes.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Registrar gasto</h1>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border bg-white p-5 shadow-sm grid gap-4 md:grid-cols-3"
        >
          <div>
            <label className="mb-1 block text-sm font-medium">Fecha</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Item</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Seguro / Mantenimiento / ..."
              value={item}
              onChange={(e) => setItem(e.target.value)}
              required
            />
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-sm font-medium">Descripción</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Detalle corto del gasto"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Monto total (COP)</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              inputMode="numeric"
              placeholder="150.000"
              value={fmtCOP.format(total)}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                setAmountStr(digits);
              }}
              required
            />
          </div>

          {/* Placas (múltiples) con validación de existencia */}
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Placas (múltiples)</label>
            <div className="flex gap-2">
              <input
                className={`flex-1 rounded-xl border px-3 py-2 ${
                  normalizedPlate && !plateFormatValid
                    ? "border-red-500"
                    : "border-gray-300"
                }`}
                placeholder="ABC123"
                value={plateInput}
                onChange={(e) => {
                  const next = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                  setPlateInput(next);
                }}
                maxLength={6}
                inputMode="text"
              />
              <button
                type="button"
                onClick={addPlate}
                disabled={!plateFormatValid || checking !== "ok"}
                className="rounded-xl border px-3 disabled:opacity-50"
                title={!plateFormatValid ? "Formato inválido" : checking !== "ok" ? "Verificando placa..." : ""}
              >
                {checking === "checking" ? "Verificando..." : "Agregar"}
              </button>
            </div>
            {/* Mensajes bajo el input */}
            {!plateFormatValid && normalizedPlate ? (
              <div className="mt-1 text-xs text-red-600">Formato válido: ABC123</div>
            ) : null}
            {plateFormatValid && checking === "missing" ? (
              <div className="mt-1 text-xs text-red-600">Placa no registrada</div>
            ) : null}
            {plateFormatValid && checking === "ok" && driverName ? (
              <div className="mt-1 text-xs text-gray-600">
                Conductor: {driverName}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-2">
              {plates.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                >
                  {p}
                  <button
                    type="button"
                    onClick={() => removePlate(p)}
                    className="text-gray-500"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Evidencias y facturas */}
          <div className="md:col-span-3 space-y-3">
            {/* Evidencias */}
            <div>
              <label className="mb-1 block text-sm font-medium">
                Evidencias (fotos, opcional)
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const selected = Array.from(e.target.files ?? []);
                  if (!selected.length) return;

                  setEvidenceFiles((prev) => {
                    const existing = new Set(prev.map((f) => f.name + "::" + f.size));
                    const merged = [...prev];

                    for (const f of selected) {
                      const key = f.name + "::" + f.size;
                      // Respetar máximo 5 archivos entre evidencias + facturas
                      if (merged.length + invoiceFiles.length >= 5) break;
                      if (!existing.has(key)) merged.push(f);
                    }

                    return merged;
                  });

                  // Permitir volver a seleccionar los mismos archivos si hace falta
                  e.target.value = "";
                }}
              />
              <div className="mt-1 text-xs text-gray-500">
                Puedes subir varias imágenes en varias tandas (máx. 5 entre evidencias y
                facturas).
              </div>
              {evidenceFiles.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-gray-700">
                  {evidenceFiles.map((f, idx) => (
                    <li
                      key={f.name + idx}
                      className="flex items-center justify-between rounded-lg border px-3 py-1"
                    >
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        className="text-red-500"
                        onClick={() =>
                          setEvidenceFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Facturas */}
            <div>
              <label className="mb-1 block text-sm font-medium">
                Facturas (imágenes, opcional)
              </label>
              <input
                className="w-full rounded-xl border px-3 py-2"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const selected = Array.from(e.target.files ?? []);
                  if (!selected.length) return;

                  setInvoiceFiles((prev) => {
                    const existing = new Set(prev.map((f) => f.name + "::" + f.size));
                    const merged = [...prev];

                    for (const f of selected) {
                      const key = f.name + "::" + f.size;
                      // Respetar máximo 5 archivos entre evidencias + facturas
                      if (merged.length + evidenceFiles.length >= 5) break;
                      if (!existing.has(key)) merged.push(f);
                    }

                    return merged;
                  });

                  e.target.value = "";
                }}
              />
              {invoiceFiles.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-gray-700">
                  {invoiceFiles.map((f, idx) => (
                    <li
                      key={f.name + idx}
                      className="flex items-center justify-between rounded-lg border px-3 py-1"
                    >
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        className="text-red-500"
                        onClick={() =>
                          setInvoiceFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Resumen prorrateo */}
          <div className="md:col-span-3 text-sm text-gray-700">
            {plates.length > 0 ? (
              <>
                Prorrateo estimado:{" "}
                {plates.map((p, i) => (
                  <span key={p} className="mr-2">
                    {p}: ${fmtCOP.format(share)}
                    {i < plates.length - 1 ? "," : ""}
                  </span>
                ))}
              </>
            ) : (
              <span>Agrega placas para ver prorrateo.</span>
            )}
          </div>

          <div className="md:col-span-3 flex justify-end gap-2">
            {/* Botón WhatsApp en pantalla principal: visible pero deshabilitado hasta guardar */}
            <button
              type="button"
              disabled={!saved}
              onClick={() => setShowModal(true)}
              className="rounded-xl border px-4 py-2 disabled:opacity-50"
              title={!saved ? "Disponible después de guardar" : ""}
            >
              Enviar por WhatsApp
            </button>

            <button
              disabled={loading || !plates.length}
              className="rounded-xl bg-black px-5 py-2.5 text-white disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar gasto"}
            </button>
          </div>
        </form>
      </div>

      {/* Últimos gastos */}
      <h2 className="mt-8 mb-3 text-xl font-semibold">Últimos gastos</h2>
      <div className="space-y-3">
        {recent.map((e) => {
          const plates = e.expense_vehicles?.map((v) => v.plate) ?? [];

          const attachments: ExpenseAttachment[] =
            e.expense_attachments && e.expense_attachments.length
              ? e.expense_attachments.map((a) => ({ ...a }))
              : e.attachment_url
              ? [{ kind: "legacy", url: e.attachment_url }]
              : [];
          return (
            <div key={e.id} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">{e.item} — {e.date}</div>
                  <div className="text-sm text-gray-600">
                    {e.description || "—"}
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="font-medium">Placas:</span> {plates.length ? plates.join(", ") : "—"}
                  </div>
                  {attachments.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs">
                    {attachments.map((a, idx) => (
                      <a
                        key={idx}
                        className="block underline text-blue-600"
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a.kind === "invoice"
                          ? `Factura ${idx + 1}`
                          : a.kind === "evidence"
                          ? `Evidencia ${idx + 1}`
                          : `Soporte ${idx + 1}`}
                      </a>
                    ))}
                  </div>
                )}
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Total</div>
                  <div className="text-base font-semibold">${fmtCOP.format(Number(e.total_amount))}</div>
                  {plates.length > 0 ? (
                    <div className="mt-1 text-xs text-gray-600">
                      Por vehículo: ${fmtCOP.format(
                        Math.floor(Number(e.total_amount) / plates.length)
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingExpenseId(e.id);
                  setEditEvidenceFiles([]);
                  setEditInvoiceFiles([]);
                }}
                className="mt-2 inline-flex items-center rounded-lg border px-3 py-1 text-xs hover:bg-gray-50"
              >
                Agregar evidencias / facturas
              </button>
            </div>
          );
        })}
        {recent.length === 0 && <div className="text-gray-500">Sin gastos aún.</div>}
      </div>


      {/* Modal de confirmación post-guardado */}
      {showModal && saved && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="mb-3 text-xl font-semibold">Enviar notificación por WhatsApp</h2>

            <div className="rounded-xl border bg-gray-50 p-3 text-sm">
              <div><span className="font-medium">Fecha:</span> {saved.date}</div>
              <div><span className="font-medium">Item:</span> {saved.item}</div>
              <div><span className="font-medium">Descripción:</span> {saved.description}</div>
              <div><span className="font-medium">Placas:</span> {saved.plates.join(", ")}</div>
              <div><span className="font-medium">Total:</span> ${fmtCOP.format(saved.total)}</div>
              <div><span className="font-medium">Por vehículo:</span> ${fmtCOP.format(saved.perVehicle)}</div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={copyMessage}
                className="rounded-xl border px-4 py-2"
              >
                Copiar mensaje
              </button>
              <button
                onClick={sendWhatsapp}
                className="rounded-xl bg-green-600 px-4 py-2 text-white"
              >
                Abrir WhatsApp
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-xl border px-4 py-2"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-2 text-xs text-gray-500">
              El mensaje se arma con los datos guardados. Si editas el gasto, guarda nuevamente para actualizar el resumen.
            </div>
          </div>
        </div>
      )}
    {editingExpenseId && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl text-sm">
        <h2 className="text-lg font-semibold">
          Agregar soportes al gasto #{editingExpenseId}
        </h2>

        <form onSubmit={submitEditAttachments} className="mt-4 space-y-4">

          {/* Evidencias */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Evidencias (fotos)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              className="w-full rounded-xl border px-3 py-2"
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                setEditEvidenceFiles(selected);
                e.target.value = "";
              }}
            />
          </div>

          {/* Facturas */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Facturas (imágenes)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              className="w-full rounded-xl border px-3 py-2"
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                setEditInvoiceFiles(selected);
                e.target.value = "";
              }}
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setEditingExpenseId(null);
                setEditEvidenceFiles([]);
                setEditInvoiceFiles([]);
              }}
              className="rounded-xl border px-4 py-2"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-black px-5 py-2 text-white disabled:opacity-50"
            >
              {loading ? "Guardando..." : "Guardar soportes"}
            </button>
          </div>

        </form>
      </div>
    </div>
  )}
    </div>
  );
}
