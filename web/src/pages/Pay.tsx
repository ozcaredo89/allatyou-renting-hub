// web/src/pages/Pay.tsx
import { useEffect, useMemo, useState } from "react";

type InstallmentStatus = "paid" | "pending" | null;

type Payment = {
  id: number;
  payer_name: string;
  plate: string;
  payment_date: string;
  amount: number;
  installment_number?: number | null;
  proof_url?: string | null;
  status: "pending" | "confirmed" | "rejected";

  // NUEVO (Fase 2)
  insurance_amount?: number | null;
  delivery_amount?: number | null;
  credit_installment_amount?: number | null;
  installment_status?: InstallmentStatus;
  installment_shortfall?: number | null;
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

type LastAmountResp = {
  plate: string;
  last_payment_date: string;
  last_amount: number;
  last_status: "pending" | "confirmed" | "rejected";
  last_installment_number: number | null;
};

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");
const PLATE_RE = /^[A-Z]{3}\d{3}$/;
const INSTALLMENT_STATUS_LABEL: Record<Exclude<InstallmentStatus, null>, string> = {
  paid: "Pagada",
  pending: "Pendiente",
};


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

// ---------- Helpers (split / parse) ----------
function parseCOP(s: string) {
  return Number((s || "").replace(/[^\d]/g, "")) || 0;
}

function clampNonNeg(n: number) {
  return Math.max(0, Math.round(Number(n) || 0));
}

function computeBaseSplit(amount: number) {
  const a = clampNonNeg(amount);
  const insurance = a >= 5000 ? 5000 : 0;
  const delivery = a > insurance ? Math.min(65000, a - insurance) : 0;
  const credit = Math.max(0, a - insurance - delivery);
  return { insurance, delivery, credit };
}

function computeInstallmentSplit(amount: number) {
  const a = clampNonNeg(amount);

  if (a < 70000) {
    if (a > 5000) {
      const insurance = 5000;
      const delivery = a - 5000;
      return { insurance, delivery, credit: 0, shortfall: 70000 - a, installmentStatus: "pending" as const };
    }
    return { insurance: 0, delivery: 0, credit: 0, shortfall: 70000 - a, installmentStatus: "pending" as const };
  }

  const base = computeBaseSplit(a);
  const installmentStatus = base.credit > 0 ? ("paid" as const) : ("pending" as const);
  return { ...base, shortfall: 0, installmentStatus };
}

// Tooltip simple sin librerías
function InfoTooltip({
  lines,
  className = "",
}: {
  lines: string[];
  className?: string;
}) {
  return (
    <div className={`relative inline-block ${className}`}>
      <span className="group inline-flex items-center">
        <span
          className="ml-2 inline-flex h-6 w-6 cursor-default select-none items-center justify-center rounded-full border text-xs font-semibold text-gray-700"
          aria-label="info"
          title="" // evitamos tooltip nativo
        >
          i
        </span>

        <div className="pointer-events-none absolute left-0 top-7 z-20 hidden w-[260px] rounded-xl border bg-white p-3 text-xs text-gray-700 shadow-lg group-hover:block">
          <div className="space-y-1">
            {lines.map((t, idx) => (
              <div key={idx} className="leading-snug">
                {t}
              </div>
            ))}
          </div>
        </div>
      </span>
    </div>
  );
}

export default function App() {
  const [items, setItems] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [noPayHint, setNoPayHint] = useState<{ noPay: boolean; reason?: string; suggestedDate?: string } | null>(null);
  const [lastSuggestion, setLastSuggestion] = useState<LastAmountResp | null>(null);

  const [f, setF] = useState({
    payer_name: "",
    plate: "",
    payment_date: new Date().toISOString().slice(0, 10),
    amountStr: "",
    installment_number: "",
    status: "pending",
  });

  // Fase 2: override
  const [editSplit, setEditSplit] = useState(false);
  const [split, setSplit] = useState({
    insurance_amount: "",
    delivery_amount: "",
    credit_installment_amount: "",
  });

  const [file, setFile] = useState<File | null>(null);
  const [plateExists, setPlateExists] = useState(true);
  const plateValid = useMemo(() => PLATE_RE.test(f.plate), [f.plate]);

  const amountN = useMemo(() => parseCOP(f.amountStr), [f.amountStr]);
  const installmentN = useMemo(() => {
    const x = Number(f.installment_number);
    return Number.isFinite(x) && x > 0 ? x : null;
  }, [f.installment_number]);

  async function checkNoPay(plate: string, date: string) {
    try {
      const q = new URLSearchParams({ plate: plate.toUpperCase(), date });
      const rs = await fetch(`${API}/no-pay/check?` + q.toString());
      if (!rs.ok) return null;
      return (await rs.json()) as { noPay: boolean; reason?: string; suggestedDate?: string };
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async function run() {
      if (plateValid && plateExists && f.plate && f.payment_date) {
        const ans = await checkNoPay(f.plate, f.payment_date);
        if (!cancelled) setNoPayHint(ans);
      } else {
        setNoPayHint(null);
      }
    }, 250);

    return () => { cancelled = true; clearTimeout(t); };
  }, [f.plate, f.payment_date, plateValid, plateExists]);

  async function uploadProofIfNeeded(): Promise<string | null> {
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file);
    const rs = await fetch(`${API}/uploads`, { method: "POST", body: fd });
    if (!rs.ok) throw new Error("upload failed");
    const { url } = await rs.json();
    return url as string;
  }

  // ---------- Auto-split: recalcular por defecto cuando cambia amount o installment_number, si NO está editando ----------
  useEffect(() => {
    if (editSplit) return;

    // Regla: siempre desglosa incluso sin installment_number
    const auto =
      installmentN != null ? computeInstallmentSplit(amountN) : { ...computeBaseSplit(amountN), shortfall: 0, installmentStatus: null as any };

    setSplit({
      insurance_amount: auto.insurance ? String(auto.insurance) : "",
      delivery_amount: auto.delivery ? String(auto.delivery) : "",
      credit_installment_amount: auto.credit ? String(auto.credit) : "",
    });
  }, [amountN, installmentN, editSplit]);

  // ---------- Autocompletar / validar placa ----------
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

  async function fetchLastSuggestion(plate: string) {
    try {
      const q = new URLSearchParams({ plate: plate.toUpperCase() });
      const rs = await fetch(`${API}/payments/last-amount?` + q.toString());
      if (!rs.ok) {
        setLastSuggestion(null);
        return;
      }
      const json: LastAmountResp = await rs.json();
      setLastSuggestion(json);
    } catch {
      setLastSuggestion(null);
    }
  }

  async function loadRecentByPlate(plate: string) {
    try {
      const q = new URLSearchParams({
        plate: plate.toUpperCase(),
        limit: "10",
      });
      const rs = await fetch(`${API}/payments?` + q.toString());
      if (!rs.ok) {
        const rsAll = await fetch(`${API}/payments`);
        const all = (await rsAll.json()) as any;
        const list = Array.isArray(all) ? all : all.items ?? [];
        setItems(list.filter((p: Payment) => p.plate.toUpperCase() === plate.toUpperCase()).slice(0, 10));
        return;
      }
      const rows = (await rs.json()) as Payment[] | { items: Payment[] };
      const list = Array.isArray(rows) ? rows : rows.items ?? [];
      setItems(list);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    if (plateValid && plateExists && f.plate) {
      loadRecentByPlate(f.plate);
      fetchLastSuggestion(f.plate);
    } else {
      setItems([]);
      setLastSuggestion(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.plate, plateValid, plateExists]);

  useEffect(() => {
    if (!lastSuggestion) return;
    setF((prev) => {
      let changed = false;
      const next = { ...prev };

      if (!prev.amountStr && lastSuggestion.last_amount > 0) {
        next.amountStr = fmtCOP.format(lastSuggestion.last_amount);
        changed = true;
      }

      if (!prev.installment_number && lastSuggestion.last_installment_number != null) {
        const nextInstallment = lastSuggestion.last_installment_number + 1;
        if (nextInstallment > 0) {
          next.installment_number = String(nextInstallment);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [lastSuggestion]);

  // ---------- UI warnings ----------
  const splitN = useMemo(() => {
    const i = clampNonNeg(parseCOP(split.insurance_amount));
    const d = clampNonNeg(parseCOP(split.delivery_amount));
    const c = clampNonNeg(parseCOP(split.credit_installment_amount));
    return { i, d, c, sum: i + d + c };
  }, [split]);

  const installmentAutoInfo = useMemo(() => {
    if (installmentN == null) return null;
    const auto = computeInstallmentSplit(amountN);
    return auto;
  }, [installmentN, amountN]);

  const showInstallmentLt70kNotice = installmentN != null && amountN > 0 && amountN < 70000;

  const mismatch = useMemo(() => {
    if (!editSplit) return false;
    if (!amountN) return false;
    return splitN.sum !== amountN;
  }, [editSplit, splitN.sum, amountN]);

  const tooltipLinesForCurrent = useMemo(() => {
    const auto =
      installmentN != null
        ? computeInstallmentSplit(amountN)
        : { ...computeBaseSplit(amountN), shortfall: 0, installmentStatus: null as any };

    // Si editSplit, mostramos lo que el usuario puso; si no, mostramos auto
    const insurance = editSplit ? splitN.i : auto.insurance;
    const delivery = editSplit ? splitN.d : auto.delivery;
    const credit = editSplit ? splitN.c : auto.credit;
    const shortfall = installmentN != null ? (editSplit ? Math.max(0, 70000 - amountN) : auto.shortfall) : 0;

    const lines = [
      `Seguro: $${fmtCOP.format(insurance)}`,
      `Entrega: $${fmtCOP.format(delivery)}`,
      `Cuota anticipo: $${fmtCOP.format(credit)}`,
    ];

    if (installmentN != null && shortfall > 0) {
      lines.push(`Diferencia/pendiente: $${fmtCOP.format(shortfall)}`);
    }

    lines.push(`Fórmula: total = seguro + entrega + cuota`);
    return lines;
  }, [amountN, installmentN, editSplit, splitN.i, splitN.d, splitN.c]);

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
      const check = await checkNoPay(f.plate, f.payment_date);
      if (check?.noPay) {
        const msg = [
          `Atención: la placa ${f.plate.toUpperCase()} tiene pico y placa el ${f.payment_date}.`,
          check.suggestedDate ? `Sugerido: ${check.suggestedDate}.` : "",
          "¿Guardar de todas formas?",
        ]
          .filter(Boolean)
          .join(" ");
        const proceed = window.confirm(msg);
        if (!proceed) { setLoading(false); return; }
      }

      const proof_url = await uploadProofIfNeeded();

      const body: any = {
        payer_name: f.payer_name.trim(),
        plate: f.plate.trim().toUpperCase(),
        payment_date: f.payment_date,
        amount: amountN,
        installment_number: f.installment_number ? Number(f.installment_number) : null,
        proof_url,
        status: f.status as Payment["status"],
      };

      // Fase 2: enviamos override si el usuario lo activó
      if (editSplit) {
        body.force_override = true;
        body.insurance_amount = splitN.i;
        body.delivery_amount = splitN.d;
        body.credit_installment_amount = splitN.c;
      }

      const rs = await fetch(`${API}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!rs.ok) throw new Error(await rs.text());

      // Limpiar campos variables y recargar lista
      setF((prev) => ({ ...prev, amountStr: "", installment_number: "" }));
      setFile(null);
      setEditSplit(false);
      setSplit({ insurance_amount: "", delivery_amount: "", credit_installment_amount: "" });

      await loadRecentByPlate(body.plate);
      await fetchLastSuggestion(body.plate);
    } catch (err: any) {
      // Si el backend rechaza por múltiples advances, mostrará tu mensaje
      const msg = String(err?.message || "Error creando pago");
      alert(msg.includes("No puede haber más de un préstamo activo") ? msg : "Error creando pago");
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
              {noPayHint?.noPay ? (
                <div className="mt-1 text-xs text-amber-700">
                  ⚠️ No paga hoy (pico y placa).{" "}
                  {noPayHint.suggestedDate ? `Sugerido: ${noPayHint.suggestedDate}` : ""}
                </div>
              ) : (
                f.payment_date &&
                plateValid &&
                plateExists && (
                  <div className="mt-1 text-xs text-green-700">✔️ Fecha válida para registrar.</div>
                )
              )}
            </div>

            {/* Monto (COP) + tooltip */}
            <div>
              <label className="mb-1 block text-sm font-medium">
                Monto (COP)
                <InfoTooltip lines={tooltipLinesForCurrent} />
              </label>

              <input
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
                inputMode="numeric"
                placeholder="70.000"
                value={f.amountStr}
                onChange={(e) => {
                  const onlyDigits = e.target.value.replace(/[^\d]/g, "");
                  const n = Number(onlyDigits || "0");
                  setF({ ...f, amountStr: n ? fmtCOP.format(n) : "" });
                }}
                required
              />

              {lastSuggestion && lastSuggestion.last_amount > 0 && (
                <div className="mt-1 text-xs text-gray-500">
                  Sugerido según último pago: ${fmtCOP.format(lastSuggestion.last_amount)} (puedes editarlo).
                </div>
              )}

              {showInstallmentLt70kNotice && (
                <div className="mt-1 text-xs text-amber-700">
                  ⚠️ Monto &lt; 70.000: la cuota quedará <b>pendiente</b>.
                </div>
              )}
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
              {lastSuggestion?.last_installment_number != null && (
                <div className="mt-1 text-xs text-gray-500">
                  Último pago: cuota {lastSuggestion.last_installment_number}. Sugerida ahora: cuota{" "}
                  {lastSuggestion.last_installment_number + 1} (puedes editarla).
                </div>
              )}
              {installmentAutoInfo && (
                <div className="mt-1 text-xs text-gray-500">
                  Estado esperado:{" "}
                  <span className="font-medium">
                    {INSTALLMENT_STATUS_LABEL[installmentAutoInfo.installmentStatus] ?? installmentAutoInfo.installmentStatus}
                  </span>
                  {installmentAutoInfo.shortfall > 0 ? (
                    <> · Diferencia: ${fmtCOP.format(installmentAutoInfo.shortfall)}</>
                  ) : null}
                </div>
              )}
            </div>

            {/* Checkbox Editar desglose */}
            <div className="md:col-span-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editSplit}
                  onChange={(e) => setEditSplit(e.target.checked)}
                />
                Editar desglose
              </label>

              {editSplit && mismatch && (
                <div className="mt-1 text-xs text-amber-700">
                  ⚠️ La suma no coincide con el total; el backend recalculará / ajustará y guardará log si aplica.
                </div>
              )}
            </div>

            {/* Inputs override */}
            {editSplit && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium">Anticipo/seguro (COP)</label>
                  <input
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
                    inputMode="numeric"
                    placeholder="5000"
                    value={split.insurance_amount}
                    onChange={(e) => setSplit({ ...split, insurance_amount: e.target.value.replace(/[^\d]/g, "") })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Entrega (COP)</label>
                  <input
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
                    inputMode="numeric"
                    placeholder="65000"
                    value={split.delivery_amount}
                    onChange={(e) => setSplit({ ...split, delivery_amount: e.target.value.replace(/[^\d]/g, "") })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Cuota crédito (COP)</label>
                  <input
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-black/60"
                    inputMode="numeric"
                    placeholder="0"
                    value={split.credit_installment_amount}
                    onChange={(e) => setSplit({ ...split, credit_installment_amount: e.target.value.replace(/[^\d]/g, "") })}
                  />
                </div>

                <div className="md:col-span-3 text-xs text-gray-500">
                  Total: ${fmtCOP.format(amountN)} · Suma desglose: ${fmtCOP.format(splitN.sum)}
                </div>
              </>
            )}

            {/* Comprobante */}
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

            <div className="rounded-xl border p-4">
              <div className="mb-2 text-sm font-medium text-gray-700">Soporte en vía (llamar):</div>
              <a className="underline text-sm" href="tel:+573238035356">
                323 8035356
              </a>
              <div className="mt-2 text-xs text-gray-500">Asistencia operativa en carretera.</div>
            </div>

            <SupportWhatsAppCard name={f.payer_name} plate={f.plate} />
          </div>
        </div>

        {/* Card: List */}
        {showRecent && (
          <>
            <h2 className="mt-8 mb-3 text-xl font-semibold">Últimos pagos — {f.plate.toUpperCase()}</h2>
            <div className="space-y-3">
              {items.map((p) => {
                const hasInst = p.installment_number != null;
                const ins = p.insurance_amount ?? null;
                const del = p.delivery_amount ?? null;
                const cre = p.credit_installment_amount ?? null;
                const short = p.installment_shortfall ?? null;

                const lines = [
                  `Anticipo/seguro: $${fmtCOP.format(Number(ins || 0))}`,
                  `Entrega: $${fmtCOP.format(Number(del || 0))}`,
                  `Cuota crédito: $${fmtCOP.format(Number(cre || 0))}`,
                  ...(short && Number(short) > 0 ? [`Diferencia/pendiente: $${fmtCOP.format(Number(short))}`] : []),
                  `Fórmula: total = seguro + entrega + cuota`,
                ];

                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-2xl border bg-white p-4 shadow-sm"
                  >
                    <div>
                      <div className="font-semibold">
                        {p.payer_name} — {p.plate}
                      </div>

                      <div className="text-sm text-gray-600 flex items-center gap-2">
                        <span>
                          {p.payment_date} · ${fmtCOP.format(p.amount)}
                          {hasInst ? <> · Cuota {p.installment_number}</> : null}
                        </span>

                        <InfoTooltip lines={lines} />
                      </div>

                      {hasInst && (
                        <div className="mt-1 text-xs text-gray-500">
                          Estado cuota:{" "}
                          <span className="font-medium">
                            {p.installment_status
                              ? (INSTALLMENT_STATUS_LABEL[p.installment_status] ?? p.installment_status)
                              : "—"}
                          </span>
                        </div>
                      )}


                      {p.proof_url ? (
                        <a className="text-xs underline" href={p.proof_url} target="_blank" rel="noreferrer">
                          Ver comprobante
                        </a>
                      ) : null}
                    </div>

                    <span className="rounded-full border px-3 py-1 text-xs">{p.status}</span>
                  </div>
                );
              })}

              {items.length === 0 && <div className="text-gray-500">Sin pagos recientes para esta placa.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
