import { useMemo, useState } from "react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

export default function Expenses() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [plates, setPlates] = useState<string[]>([]);
  const [plateInput, setPlateInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const total = useMemo(() => Number((amountStr || "").replace(/[^\d]/g, "")) || 0, [amountStr]);
  const share = useMemo(() => (plates.length ? Math.floor(total / plates.length) : 0), [total, plates.length]);

  function addPlate() {
    const p = plateInput.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!PLATE_RE.test(p)) return alert("Placa inválida (ABC123).");
    if (plates.includes(p)) return;
    setPlates([...plates, p]);
    setPlateInput("");
  }
  function removePlate(p: string) {
    setPlates(plates.filter(x => x !== p));
  }

  async function uploadIfAny(): Promise<string | null> {
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file);
    const rs = await fetch(`${API}/uploads`, { method: "POST", body: fd });
    if (!rs.ok) throw new Error("upload failed");
    const json = await rs.json();
    return json.url as string;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!item.trim()) return alert("Item requerido");
    if (!description.trim()) return alert("Descripción requerida");
    if (!plates.length) return alert("Agrega al menos una placa");
    const total_amount = Number(total) / 100; // total en pesos

    setLoading(true);
    try {
      const attachment_url = await uploadIfAny();
      const body = {
        date,
        item: item.trim(),
        description: description.trim(),
        total_amount,
        plates,
        attachment_url
      };
      const rs = await fetch(`${API}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!rs.ok) throw new Error(await rs.text());
      alert("Gasto registrado ✅");
      // reset mínimos
      setAmountStr("");
      setFile(null);
      setPlates([]);
    } catch (e) {
      alert("Error creando gasto");
    } finally {
      setLoading(false);
    }
  }

  function openWhatsapp() {
    if (!plates.length) return alert("Agrega placas");
    const perVeh = plates.length ? Math.floor(total / plates.length) : 0;
    const msg = `Gasto: ${item} - ${description}.
Placas: ${plates.join(", ")}.
Total: $${fmtCOP.format(total)}.
Por vehículo: $${fmtCOP.format(perVeh)}.`;
    const url = `https://wa.me/573113738912?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Registrar gasto</h1>

        <form onSubmit={onSubmit} className="rounded-2xl border bg-white p-5 shadow-sm grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Fecha</label>
            <input className="w-full rounded-xl border px-3 py-2" type="date" value={date} onChange={e => setDate(e.target.value)} required/>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Item</label>
            <input className="w-full rounded-xl border px-3 py-2" placeholder="Seguro / Mantenimiento / ..." value={item} onChange={e => setItem(e.target.value)} required/>
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-sm font-medium">Descripción</label>
            <input className="w-full rounded-xl border px-3 py-2" placeholder="Detalle corto del gasto" value={description} onChange={e => setDescription(e.target.value)} required/>
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

          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium">Placas (múltiples)</label>
            <div className="flex gap-2">
              <input className="flex-1 rounded-xl border px-3 py-2" placeholder="ABC123" value={plateInput} onChange={e => setPlateInput(e.target.value)} maxLength={6}/>
              <button type="button" onClick={addPlate} className="rounded-xl border px-3">Agregar</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {plates.map(p => (
                <span key={p} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                  {p}
                  <button type="button" onClick={() => removePlate(p)} className="text-gray-500">×</button>
                </span>
              ))}
            </div>
          </div>

          <div className="md:col-span-3">
            <label className="mb-1 block text-sm font-medium">Soporte (imagen, opcional)</label>
            <input className="w-full rounded-xl border px-3 py-2" type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
            {file && <div className="mt-1 text-xs text-gray-600">{file.name}</div>}
          </div>

          {/* Resumen prorrateo */}
          <div className="md:col-span-3 text-sm text-gray-700">
            {plates.length > 0 ? (
              <>Prorrateo estimado: {plates.map((p, i) => (
                <span key={p} className="mr-2">{p}: ${fmtCOP.format(share)}{i < plates.length - 1 ? "," : ""}</span>
              ))}</>
            ) : <span>Agrega placas para ver prorrateo.</span>}
          </div>

          <div className="md:col-span-3 flex justify-end gap-2">
            <button type="button" onClick={openWhatsapp} className="rounded-xl border px-4 py-2">Enviar por WhatsApp</button>
            <button disabled={loading || !plates.length} className="rounded-xl bg-black px-5 py-2.5 text-white disabled:opacity-50">
              {loading ? "Guardando..." : "Guardar gasto"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
