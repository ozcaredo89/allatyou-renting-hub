import { useEffect, useMemo, useState } from "react";

type Payment = {
  id: number;
  payer_name: string;
  plate: string;
  payment_date: string;
  amount: number;
  installment_number?: number | null;
  proof_url?: string | null;
  status: "pending" | "confirmed" | "rejected";
};

type DriverFlat = {
  plate: string;
  driver_name: string;
  has_credit: boolean;
  default_amount: number | null;
  default_installment: number | null;
};

type DriverResp =
  | { found: false }
  | { found: true; driver: DriverFlat }
  | DriverFlat;

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

// Componente pequeño para armar el link de WhatsApp con texto precargado
function SupportWhatsAppCard({ name, plate }: { name: string; plate: string }) {
  const displayName = (name || "NOMBRE").trim();
  const displayPlate = (plate || "PLACA").toUpperCase().trim();
  const msg = `Hola necesito soporte soy: ${displayName} conductor del vehiculo ${displayPlate}`;
  const wa = `https://wa.me/573238035356?text=${encodeURIComponent(msg)}`;

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-2 text-sm font-medium text-gray-700">Soporte en vía (WhatsApp):</div>
      <a
        className="inline-block rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"
        target="_blank"
        rel="noreferrer"
        href={wa}
      >
        Abrir WhatsApp
      </a>
      <div className="mt-2 text-xs text-gray-500">Se enviará tu nombre y placa en el mensaje.</div>
    </div>
  );
}

export default function App() {
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);

  const [f, setF] = useState({
    payer_name: "",
    plate: "",
    payment_date: new Date().toISOString().slice(0, 10),
    amountStr: "",
    installment_number: "",
    status: "pending",
  });
  const [file, setFile] = useState<File | null>(null); // comprobante
  const [plateExists, setPlateExists] = useState(true);
  const plateValid = useMemo(() => PLATE_RE.test(f.plate), [f.plate]);

  // "65.000" | "65,000" | "65000" -> 65000
  const parseCOP = (s: string) => Number((s || "").replace(/[^\d]/g, "")) || 0;

  async function uploadProofIfNeeded(): Promise<string | null> {
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file);
    const rs = await fetch(`${API}/uploads`, { method: "POST", body: fd });
    if (!rs.ok) throw new Error("upload failed");
    const { url } = await rs.json();
    return url as string;
  }

  // Autocompletar / validación de existencia de placa (acepta ambos formatos de respuesta del backend)
  useEffect(() => {
    let cancelled = false;

    async function fetchDriver() {
      if (!plateValid) {
        setPlateExists(true);
        return;
      }
      try {
        const rs = await fetch(`${API}/drivers/${f.plate}`);
        if (!rs.ok) {
          setPlateExists(false);
          return;
        }
        const raw: DriverResp = await rs.json();
        if (cancelled) return;

        // Normalizar
        let found = false;
        let d: DriverFlat | null = null;

        if ("found" in raw) {
          if (raw.found === true) {
            found = true;
            d = raw.driver;
          } else {
            found = false;
          }
        } else if ("plate" in raw) {
          found = true;
          d = raw as DriverFlat;
        }

        setPlateExists(found);

        if (found && d) {
          setF((prev) => ({
            ...prev,
            payer_name: d.driver_name || prev.payer_name,
            amountStr:
              d.has_credit && d.default_amount
                ? fmtCOP.format(d.default_amount)
                : prev.amountStr,
            installment_number:
              d.has_credit && d.default_installment
                ? String(d.default_installment)
                : prev.installment_number,
          }));
        }
      } catch {
        setPlateExists(true);
      }
    }

    fetchDriver();
    return () => {
      cancelled = true;
    };
  }, [f.plate, plateValid]);

  // === Nuevo: cargar “últimos pagos” SOLO cuando haya placa válida y existente, y filtrados por placa ===
  async function loadRecentByPlate(plate: string) {
    try {
      const q = new URLSearchParams({
        plate: plate.toUpperCase(),
        limit: "10",
      });
      const rs = await fetch(`${API}/payments?` + q.toString());
      if (!rs.ok) {
        // Fallback: si el backend no soporta ?plate, traemos todos y filtramos aquí
        const rsAll = await fetch(`${API}/payments`);
        const all = (await rsAll.json()) as Payment[];
        setItems(all.filter((p) => p.plate.toUpperCase() === plate.toUpperCase()).slice(0, 10));
        return;
      }
      const rows = (await rs.json()) as Payment[] | { items: Payment[] };
      // Soporta ambas respuestas: array directo o {items:[]}
      const list = Array.isArray(rows) ? rows : rows.items ?? [];
      setItems(list);
    } catch {
      setItems([]);
    }
  }

  // Cuando cambia la placa o su validez/existencia, decide si mostrar/ocultar y filtrar
  useEffect(() => {
    if (plateValid && plateExists && f.plate) {
      loadRecentByPlate(f.plate);
    } else {
      setItems([]); // ocultar lista si no hay placa válida/existente
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.plate, plateValid, plateExists]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!plateValid) {
      alert("Placa inválida. Formato: ABC123");
      return;
    }
    if (!file) {
      alert("Adjunta la imagen del comprobante antes de guardar.");
      return;
    }

    setLoading(true);
    try {
      const proof_url = await uploadProofIfNeeded();

      const body = {
        payer_name: f.payer_name.trim(),
        plate: f.plate.trim().toUpperCase(),
        payment_date: f.payment_date,
        amount: parseCOP(f.amountStr),
        installment_number: f.installment_number ? Number(f.installment_number) : null,
        proof_url,
        status: f.status as Payment["status"],
      };

      const rs = await fetch(`${API}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!rs.ok) throw new Error(await rs.text());

      // Limpiar campos variables y recargar lista filtrada por la placa actual
      setF((prev) => ({ ...prev, amountStr: "", installment_number: "" }));
      setFile(null);
      await loadRecentByPlate(body.plate);
    } catch {
      alert("Error creando pago");
    } finally {
      setLoading(false);
    }
  }

  const input = (name: keyof typeof f, props: any = {}) => (
    <input
      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
      value={(f as any)[name]}
      onChange={(e) => setF({ ...f, [name]: e.target.value })}
      {...props}
    />
  );

  const showRecent = plateValid && plateExists && !!f.plate;

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">AllAtYou — Pagos</h1>

        {/* Card: Form */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Nombre</label>
              {input("payer_name", { placeholder: "Nombre del Conductor", required: true })}
            </div>

            {/* Placa */}
            <div>
              <label className="mb-1 block text-sm font-medium">Placa</label>
              <input
                className={`w-full rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-black/60 ${
                  f.plate && !plateValid ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="ABC123"
                value={f.plate}
                onChange={(e) =>
                  setF({
                    ...f,
                    plate: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                  })
                }
                maxLength={6}
                inputMode="text"
                required
              />
              {!plateValid && f.plate ? (
                <div className="mt-1 text-xs text-red-600">Formato válido: ABC123</div>
              ) : null}
              {!plateExists && f.plate ? (
                <div className="mt-1 text-xs text-red-600">Placa no registrada</div>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Fecha</label>
              {input("payment_date", { type: "date", required: true })}
            </div>

            {/* Monto (COP) */}
            <div>
              <label className="mb-1 block text-sm font-medium">Monto (COP)</label>
              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
                inputMode="numeric"
                placeholder="65.000"
                value={f.amountStr}
                onChange={(e) => {
                  const onlyDigits = e.target.value.replace(/[^\d]/g, "");
                  const n = Number(onlyDigits || "0");
                  setF({ ...f, amountStr: n ? fmtCOP.format(n) : "" });
                }}
                required
              />
            </div>

            {/* Cuota */}
            <div>
              <label className="mb-1 block text-sm font-medium">Cuota #</label>
              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
                type="number"
                inputMode="numeric"
                step="1"
                min="1"
                placeholder="1"
                value={f.installment_number}
                onChange={(e) => setF({ ...f, installment_number: e.target.value })}
              />
            </div>

            {/* Comprobante (archivo) */}
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Comprobante (imagen)</label>
              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />
              {file ? (
                <div className="mt-1 text-xs text-gray-600">{file.name}</div>
              ) : (
                <div className="mt-1 text-xs text-gray-500">
                  Debes adjuntar una imagen (jpg/png) del comprobante para poder guardar.
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Estado</label>
              <select
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
                value={f.status}
                onChange={(e) => setF({ ...f, status: e.target.value })}
              >
                <option>pending</option>
                <option>confirmed</option>
                <option>rejected</option>
              </select>
            </div>

            <div className="md:col-span-3 flex justify-end">
              <button
                disabled={loading || !plateValid || !plateExists || !file}
                className="rounded-xl bg-black px-5 py-2.5 font-medium text-white shadow hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Guardando..." : "Guardar pago"}
              </button>
            </div>
          </form>
        </div>

        {/* Card: Soporte y emergencias */}
        <div id="soporte" className="mt-8 rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-xl font-semibold">Soporte y emergencias</h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Emergencias: hurto */}
            <div className="rounded-xl border p-4">
              <div className="mb-2 text-sm font-medium text-gray-700">En caso de hurto (llamar):</div>
              <div className="space-y-1 text-sm">
                <a className="underline" href="tel:+573234018471">
                  323 401 8471
                </a>
                <br />
                <a className="underline" href="tel:+573023909022">
                  302 390 9022
                </a>
              </div>
              <div className="mt-2 text-xs text-gray-500">Reporta inmediatamente para activar el grupo de reacción.</div>
            </div>

            {/* Soporte en vía (llamada) */}
            <div className="rounded-xl border p-4">
              <div className="mb-2 text-sm font-medium text-gray-700">Soporte en vía (llamar):</div>
              <a className="underline text-sm" href="tel:+573238035356">
                323 8035356
              </a>
              <div className="mt-2 text-xs text-gray-500">Asistencia operativa en carretera.</div>
            </div>

            {/* Soporte en vía (WhatsApp) */}
            <SupportWhatsAppCard name={f.payer_name} plate={f.plate} />
          </div>
        </div>

        {/* Card: List — solo si placa válida y existente */}
        {showRecent && (
          <>
            <h2 className="mt-8 mb-3 text-xl font-semibold">Últimos pagos — {f.plate.toUpperCase()}</h2>
            <div className="space-y-3">
              {items.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm"
                >
                  <div>
                    <div className="font-semibold">
                      {p.payer_name} — {p.plate}
                    </div>
                    <div className="text-sm text-gray-600">
                      {p.payment_date} · ${fmtCOP.format(p.amount)}
                      {p.installment_number ? <> · Cuota {p.installment_number}</> : null}
                    </div>
                    {p.proof_url ? (
                      <a className="text-xs underline" href={p.proof_url} target="_blank" rel="noreferrer">
                        Ver comprobante
                      </a>
                    ) : null}
                  </div>
                  <span className="rounded-full border px-3 py-1 text-xs">{p.status}</span>
                </div>
              ))}
              {items.length === 0 && <div className="text-gray-500">Sin pagos recientes para esta placa.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
