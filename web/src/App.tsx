import { useEffect, useState } from "react";

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

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

export default function App() {
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);

  // campos del form
  const [f, setF] = useState({
    payer_name: "",
    plate: "",
    payment_date: new Date().toISOString().slice(0, 10),
    amountStr: "",               // <- string formateado (COP)
    installment_number: "",
    status: "pending",
  });
  const [file, setFile] = useState<File | null>(null);   // <- comprobante

  async function load() {
    const rs = await fetch(`${API}/payments`);
    setItems(await rs.json());
  }
  useEffect(() => { load(); }, []);

  // convierte "65.000" o "65,000" o "65000" -> 65000 (number)
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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

      // reset de campos de monto/cuota/archivo
      setF({ ...f, amountStr: "", installment_number: "" });
      setFile(null);
      await load();
    } catch (err) {
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
            <div>
              <label className="mb-1 block text-sm font-medium">Placa</label>
              {input("plate", { placeholder: "ABC123", required: true })}
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
                placeholder="150.000"
                value={f.amountStr}
                onChange={(e) => {
                  const onlyDigits = e.target.value.replace(/[^\d]/g, "");
                  const n = Number(onlyDigits || "0");
                  setF({ ...f, amountStr: n ? fmtCOP.format(n) : "" });
                }}
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
              />
              {file ? <div className="mt-1 text-xs text-gray-600">{file.name}</div> : null}
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
                disabled={loading}
                className="rounded-xl bg-black px-5 py-2.5 font-medium text-white shadow hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Guardando..." : "Guardar pago"}
              </button>
            </div>
          </form>
        </div>

        {/* Card: List */}
        <h2 className="mt-8 mb-3 text-xl font-semibold">Últimos pagos</h2>
        <div className="space-y-3">
          {items.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm">
              <div>
                <div className="font-semibold">{p.payer_name} — {p.plate}</div>
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
          {items.length === 0 && <div className="text-gray-500">Sin pagos aún.</div>}
        </div>
      </div>
    </div>
  );
}
