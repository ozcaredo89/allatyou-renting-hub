import { useMemo, useState, useEffect } from "react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

type DriverFlat = {
  plate: string;
  driver_name: string;
  has_credit: boolean;
  default_amount: number | null;
  default_installment: number | null;
};
type DriverResp = { found: false } | { found: true; driver: DriverFlat } | DriverFlat;

export default function Expenses() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [item, setItem] = useState("");
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [plates, setPlates] = useState<string[]>([]);
  const [plateInput, setPlateInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  // Validación de la placa que se está escribiendo
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
        // En error de red no bloqueamos, pero tampoco marcamos ok
        setChecking("missing");
      }
    }
    if (normalizedPlate.length >= 3) run();
    else {
      setChecking("idle");
    }
    return () => { cancel = true; };
  }, [normalizedPlate, plateFormatValid, API]);

  const total = useMemo(
    () => Number((amountStr || "").replace(/[^\d]/g, "")) || 0,
    [amountStr]
  );
  const share = useMemo(
    () => (plates.length ? Math.floor(total / plates.length) : 0),
    [total, plates.length]
  );

  function addPlate() {
    // Solo permite agregar si formato válido y existe
    if (!plateFormatValid) return;
    if (checking !== "ok") return;
    if (plates.includes(normalizedPlate)) return;
    setPlates([...plates, normalizedPlate]);
    setPlateInput("");
    setChecking("idle");
    setDriverName(null);
  }

  function removePlate(p: string) {
    setPlates(plates.filter((x) => x !== p));
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
        attachment_url,
      };
      const rs = await fetch(`${API}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!rs.ok) throw new Error(await rs.text());
      alert("Gasto registrado ✅");
      // reset mínimos
      setAmountStr("");
      setFile(null);
      setPlates([]);
    } catch {
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
              required
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
                  normalizedPlate && !plateFormatValid ? "border-red-500" : "border-gray-300"
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

          <div className="md:col-span-3">
            <label className="mb-1 block text-sm font-medium">Soporte (imagen, opcional)</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file && <div className="mt-1 text-xs text-gray-600">{file.name}</div>}
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
            <button
              type="button"
              onClick={openWhatsapp}
              className="rounded-xl border px-4 py-2"
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
    </div>
  );
}
