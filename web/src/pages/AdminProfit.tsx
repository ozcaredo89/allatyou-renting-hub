import { useEffect, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";
import CompanyLock from "../components/CompanyLock"; // <--- 1. IMPORTAR

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const fmtCOP = new Intl.NumberFormat("es-CO");

type ProfitRow = {
  plate: string;
  month: string;
  income: number;
  expense: number;
  adjustments: number;
  profit: number;
  cum_profit: number;
  investment_total: number | null;
  remaining: number | null;
  pct_recovered: number | null;
  is_released: boolean;
};

type ProfitResp = {
  month: string;
  items: ProfitRow[];
  totals: {
    income: number;
    expense: number;
    adjustments: number;
    profit: number;
    investment_total: number;
    remaining: number;
  };
};

type PaymentDetail = {
  id: number;
  payer_name: string;
  plate: string;
  payment_date: string;
  amount: number;
  installment_number: number | null;
  proof_url: string | null;
  status: "pending" | "confirmed" | "rejected";
};

type ExpenseDetail = {
  id: number;
  date: string;
  item: string;
  description: string | null;
  attachment_url: string | null;
  share_amount: number;
};

type LedgerRow = {
  id: number;
  plate: string;
  date: string; // YYYY-MM-DD
  type: "opening_balance" | "extra_income" | "extra_expense" | "correction";
  amount: number;
  description: string | null;
  attachment_url: string | null;
};

export default function AdminProfit() {
  const todayYm = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(todayYm);
  const [plate, setPlate] = useState("");
  const [data, setData] = useState<ProfitResp | null>(null);
  const [loading, setLoading] = useState(false);

  // Income/expense detail modal
  const [detailType, setDetailType] = useState<"income" | "expense" | null>(null);
  const [detailPlate, setDetailPlate] = useState<string>("");
  const [detailItems, setDetailItems] = useState<(PaymentDetail | ExpenseDetail)[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Ledger side-panel
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerPlate, setLedgerPlate] = useState<string>("");
  const [ledgerItems, setLedgerItems] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Ledger form (create/edit)
  const emptyLedger: Partial<LedgerRow> = {
    date: new Date().toISOString().slice(0, 10),
    type: "extra_expense",
    amount: 0,
    description: "",
    attachment_url: "",
  };
  const [editRow, setEditRow] = useState<Partial<LedgerRow>>(emptyLedger);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const auth = ensureBasicAuth();
      const params = new URLSearchParams({ month });
      if (plate) params.set("plate", plate.trim().toUpperCase());

      const rs = await fetch(`${API}/reports/profit?` + params.toString(), {
        headers: { Authorization: auth },
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      if (!rs.ok) throw new Error(await rs.text());
      const json: ProfitResp = await rs.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  // ===== Income/Expense detail =====
  async function openDetail(kind: "income" | "expense", p: string) {
    setDetailType(kind);
    setDetailPlate(p);
    setDetailItems([]);
    setDetailLoading(true);
    try {
      const auth = ensureBasicAuth();
      const params = new URLSearchParams({ plate: p, month });
      const endpoint = kind === "income" ? "income-detail" : "expense-detail";

      const rs = await fetch(`${API}/reports/${endpoint}?` + params.toString(), {
        headers: { Authorization: auth },
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      if (!rs.ok) throw new Error(await rs.text());
      const json = await rs.json();
      setDetailItems(json.items || []);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setDetailType(null);
    setDetailPlate("");
    setDetailItems([]);
  }

  // ===== Ledger panel =====
  async function openLedger(p: string) {
    setLedgerPlate(p);
    setShowLedger(true);
    setLedgerItems([]);
    setEditingId(null);
    setEditRow({ ...emptyLedger, date: new Date().toISOString().slice(0, 10) });
    await loadLedger(p);
  }

  async function loadLedger(p: string) {
    setLedgerLoading(true);
    try {
      const auth = ensureBasicAuth();
      const params = new URLSearchParams({ plate: p, month });

      const rs = await fetch(`${API}/ledger?` + params.toString(), {
        headers: { Authorization: auth },
      });

      if (rs.status === 401 || rs.status === 403) {
        clearBasicAuth();
        throw new Error("Unauthorized");
      }

      if (!rs.ok) throw new Error(await rs.text());
      const json = await rs.json();
      setLedgerItems(json.items || []);
    } finally {
      setLedgerLoading(false);
    }
  }

  async function saveLedger() {
    const body = {
      plate: ledgerPlate,
      date: editRow.date,
      type: editRow.type,
      amount: Number(editRow.amount || 0),
      description: (editRow.description || "").toString().trim() || null,
      attachment_url: (editRow.attachment_url || "").toString().trim() || null,
    };
    const isEdit = !!editingId;

    const auth = ensureBasicAuth();

    const rs = await fetch(`${API}/ledger` + (isEdit ? `/${editingId}` : ""), {
      method: isEdit ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(body),
    });

    if (rs.status === 401 || rs.status === 403) {
      clearBasicAuth();
      throw new Error("Unauthorized");
    }

    if (!rs.ok) throw new Error(await rs.text());
    await loadLedger(ledgerPlate);
    await load(); // refresca totales
    setEditingId(null);
    setEditRow({ ...emptyLedger, date: new Date().toISOString().slice(0, 10) });
  }

  async function deleteLedger(id: number) {
    if (!confirm("¿Eliminar este ajuste?")) return;

    const auth = ensureBasicAuth();

    const rs = await fetch(`${API}/ledger/${id}`, {
      method: "DELETE",
      headers: { Authorization: auth },
    });

    if (rs.status === 401 || rs.status === 403) {
      clearBasicAuth();
      throw new Error("Unauthorized");
    }

    if (!rs.ok) throw new Error(await rs.text());
    await loadLedger(ledgerPlate);
    await load();
  }

  const items = data?.items || [];
  const totals = data?.totals;

  // 2. ENVOLVER EL RETURN COMPLETO CON <CompanyLock>
  return (
    <CompanyLock>
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="mb-6 text-3xl font-bold tracking-tight">Utilidad mensual — Admin</h1>

          <form onSubmit={onSearch} className="mb-4 flex flex-wrap gap-2">
            <input
              className="rounded-xl border px-3 py-2"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              required
            />
            <input
              className="rounded-xl border px-3 py-2"
              placeholder="Filtrar por placa (opcional)"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
            />
            <button className="rounded-xl bg-black px-4 py-2 text-white">
              {loading ? "Cargando..." : "Buscar"}
            </button>
          </form>

          <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Placa</th>
                  <th className="px-4 py-3 font-semibold">Ingresos</th>
                  <th className="px-4 py-3 font-semibold">Gastos</th>
                  <th className="px-4 py-3 font-semibold">Ajustes</th>
                  <th className="px-4 py-3 font-semibold">Utilidad</th>
                  <th className="px-4 py-3 font-semibold">Acum.</th>
                  <th className="px-4 py-3 font-semibold">Inversión</th>
                  <th className="px-4 py-3 font-semibold">Restante</th>
                  <th className="px-4 py-3 font-semibold">Liberado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.plate} className="border-t">
                    <td className="px-4 py-3 font-medium">{r.plate}</td>

                    {/* Income: valor como link */}
                    <td className="px-4 py-3">
                      {r.income > 0 ? (
                        <button
                          type="button"
                          onClick={() => openDetail("income", r.plate)}
                          className="underline"
                          title="Ver ingresos del mes"
                        >
                          ${fmtCOP.format(r.income)}
                        </button>
                      ) : (
                        <>${fmtCOP.format(0)}</>
                      )}
                    </td>

                    {/* Expense: valor como link */}
                    <td className="px-4 py-3">
                      {r.expense > 0 ? (
                        <button
                          type="button"
                          onClick={() => openDetail("expense", r.plate)}
                          className="underline"
                          title="Ver gastos del mes"
                        >
                          ${fmtCOP.format(r.expense)}
                        </button>
                      ) : (
                        <>${fmtCOP.format(0)}</>
                      )}
                    </td>

                    <td className="px-4 py-3">${fmtCOP.format(r.adjustments)}</td>
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(r.profit)}</td>
                    <td className="px-4 py-3">${fmtCOP.format(r.cum_profit)}</td>
                    <td className="px-4 py-3">
                      {r.investment_total != null ? `$${fmtCOP.format(r.investment_total)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.remaining != null ? `$${fmtCOP.format(r.remaining)}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.is_released ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Sí</span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">No</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openLedger(r.plate)}
                        className="rounded-lg border px-3 py-1 text-xs"
                        title="Ver/editar ajustes del mes"
                      >
                        Ajustes
                      </button>
                    </td>
                  </tr>
                ))}

                {items.length === 0 && !loading && (
                  <tr>
                    <td className="px-4 py-6 text-gray-500" colSpan={10}>
                      Sin datos.
                    </td>
                  </tr>
                )}
              </tbody>

              {totals && (
                <tfoot>
                  <tr className="border-t bg-gray-50">
                    <td className="px-4 py-3 font-semibold">TOTAL</td>
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.income)}</td>
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.expense)}</td>
                    <td className="px-4 py-3 font-semibold">—</td>
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.profit)}</td>
                    <td className="px-4 py-3 font-semibold">—</td>
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.investment_total)}</td>
                    <td className="px-4 py-3 font-semibold">${fmtCOP.format(totals.remaining)}</td>
                    <td className="px-4 py-3 font-semibold">—</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Income/Expense detail modal */}
        {detailType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {detailType === "income" ? "Detalle de Ingresos" : "Detalle de Gastos"} — {detailPlate} — {month}
                </h2>
                <button onClick={closeDetail} className="rounded-xl border px-3 py-1 text-sm">
                  Cerrar
                </button>
              </div>

              {detailLoading ? (
                <div className="text-sm text-gray-600">Cargando…</div>
              ) : detailItems.length === 0 ? (
                <div className="text-sm text-gray-600">Sin items.</div>
              ) : detailType === "income" ? (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {(detailItems as PaymentDetail[]).map((p) => (
                    <div key={p.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{p.payment_date}</div>
                        <div className="font-semibold">${fmtCOP.format(p.amount)}</div>
                      </div>
                      <div className="text-sm text-gray-600">
                        {p.payer_name} {p.installment_number ? `· Cuota ${p.installment_number}` : ""} · {p.status}
                      </div>
                      {p.proof_url && (
                        <a href={p.proof_url} target="_blank" rel="noreferrer" className="text-xs underline">
                          Ver comprobante
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {(detailItems as ExpenseDetail[]).map((e) => (
                    <div key={e.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {e.date} — {e.item}
                        </div>
                        <div className="font-semibold">${fmtCOP.format(e.share_amount)}</div>
                      </div>
                      <div className="text-sm text-gray-600">{e.description || "—"}</div>
                      {e.attachment_url && (
                        <a href={e.attachment_url} target="_blank" rel="noreferrer" className="text-xs underline">
                          Ver soporte
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ledger side panel */}
        {showLedger && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
            <div className="h-full w-full max-w-xl bg-white p-5 shadow-xl overflow-y-auto">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  Ajustes — {ledgerPlate} — {month}
                </h2>
                <button
                  onClick={() => setShowLedger(false)}
                  className="rounded-xl border px-3 py-1 text-sm"
                >
                  Cerrar
                </button>
              </div>

              {/* Formulario crear/editar */}
              <div className="mb-4 rounded-2xl border p-4">
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Fecha</label>
                    <input
                      className="w-full rounded-xl border px-3 py-2"
                      type="date"
                      value={editRow.date || ""}
                      onChange={(e) => setEditRow({ ...editRow, date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Tipo</label>
                    <select
                      className="w-full rounded-xl border px-3 py-2"
                      value={editRow.type || "extra_expense"}
                      onChange={(e) =>
                        setEditRow({ ...editRow, type: e.target.value as LedgerRow["type"] })
                      }
                    >
                      <option value="opening_balance">Saldo inicial</option>
                      <option value="extra_income">Ingreso extra</option>
                      <option value="extra_expense">Gasto extra</option>
                      <option value="correction">Corrección</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Monto (COP)</label>
                    <input
                      className="w-full rounded-xl border px-3 py-2"
                      inputMode="numeric"
                      placeholder="65.000"
                      value={editRow.amount ?? 0}
                      onChange={(e) =>
                        setEditRow({
                          ...editRow,
                          amount: Number((e.target.value || "0").replace(/[^\d-]/g, "")),
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Adjunto (URL)</label>
                    <input
                      className="w-full rounded-xl border px-3 py-2"
                      value={editRow.attachment_url || ""}
                      onChange={(e) =>
                        setEditRow({ ...editRow, attachment_url: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Descripción</label>
                  <input
                    className="w-full rounded-xl border px-3 py-2"
                    value={editRow.description || ""}
                    onChange={(e) =>
                      setEditRow({ ...editRow, description: e.target.value })
                    }
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditRow({
                          ...emptyLedger,
                          date: new Date().toISOString().slice(0, 10),
                        });
                      }}
                      className="rounded-xl border px-3 py-2 text-sm"
                    >
                      Cancelar edición
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={saveLedger}
                    className="rounded-xl bg-black px-4 py-2 text-white"
                  >
                    {editingId ? "Guardar cambios" : "Agregar ajuste"}
                  </button>
                </div>
              </div>

              {/* Lista de ajustes */}
              <div className="space-y-2">
                {ledgerLoading ? (
                  <div className="text-sm text-gray-600">Cargando ajustes…</div>
                ) : ledgerItems.length === 0 ? (
                  <div className="text-sm text-gray-600">Sin ajustes para este mes.</div>
                ) : (
                  ledgerItems.map((l) => (
                    <div key={l.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {l.date} — {labelType(l.type)} — ${fmtCOP.format(l.amount)}
                        </div>
                        <div className="flex gap-2">
                          <button
                            className="text-xs underline"
                            onClick={() => {
                              setEditingId(l.id);
                              setEditRow(l);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="text-xs underline text-red-600"
                            onClick={() => deleteLedger(l.id)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600">
                        {l.description || "—"}
                        {l.attachment_url && (
                          <>
                            {" · "}
                            <a
                              className="underline"
                              href={l.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Ver adjunto
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </CompanyLock>
  );
}

function labelType(t: LedgerRow["type"]) {
  switch (t) {
    case "opening_balance":
      return "Saldo inicial";
    case "extra_income":
      return "Ingreso extra";
    case "extra_expense":
      return "Gasto extra";
    case "correction":
      return "Corrección";
    default:
      return t;
  }
}