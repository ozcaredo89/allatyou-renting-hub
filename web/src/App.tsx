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

const API = import.meta.env.VITE_API_URL as string;

export default function App() {
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({
    payer_name: "",
    plate: "",
    payment_date: new Date().toISOString().slice(0, 10),
    amount: "",
    installment_number: "",
    proof_url: "",
    status: "pending",
  });

  async function load() {
    const rs = await fetch(`${API}/payments`);
    setItems(await rs.json());
  }
  useEffect(() => { load(); }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body = {
        payer_name: f.payer_name.trim(),
        plate: f.plate.trim().toUpperCase(),
        payment_date: f.payment_date,
        amount: Number(f.amount),
        installment_number: f.installment_number ? Number(f.installment_number) : null,
        proof_url: f.proof_url || null,
        status: f.status as Payment["status"],
      };
      const rs = await fetch(`${API}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!rs.ok) throw new Error(await rs.text());
      setF({ ...f, amount: "", installment_number: "", proof_url: "" });
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
              {input("payer_name", { placeholder: "Gabriela Hincapie", required: true })}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Placa</label>
              {input("plate", { placeholder: "ABC123", required: true })}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Fecha</label>
              {input("payment_date", { type: "date", required: true })}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Monto</label>
              {input("amount", { type: "number", step: "1", required: true })}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Cuota #</label>
              {input("installment_number", { type: "number", step: "1" })}
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Comprobante URL</label>
              {input("proof_url", { placeholder: "https://..." })}
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
                  {p.payment_date} · ${p.amount.toLocaleString()}
                  {p.installment_number ? <> · Cuota {p.installment_number}</> : null}
                </div>
                {p.proof_url ? (
                  <a className="text-xs underline" href={p.proof_url} target="_blank" rel="noreferrer">
                    Ver comprobante
                  </a>
                ) : null}
              </div>
              <span className="rounded-full border px-3 py-1 text-xs">
                {p.status}
              </span>
            </div>
          ))}
          {items.length === 0 && <div className="text-gray-500">Sin pagos aún.</div>}
        </div>
      </div>
    </div>
  );
}
