// src/routes/expenses.ts
import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";

const PLATE_RE = /^[A-Z]{3}\d{3}$/;
const r = Router();

/** Util: prorrateo exacto en centavos */
function splitEven(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const rem  = totalCents % n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Tipo interno para adjuntos ya normalizados */
type NormalizedAttachment = {
  kind: "evidence" | "invoice";
  url: string;
};

/** POST /expenses
 * body: {
 *   date,
 *   item,
 *   description,
 *   total_amount,
 *   plates: string[],
 *   attachment_url?,                  // LEGACY
 *   attachments?: { kind, url }[]     // NUEVO
 * }
 */
r.post("/", async (req: Request, res: Response) => {
  try {
    const {
      date,
      item,
      description,
      total_amount,
      plates,
      attachment_url,     // legacy
      attachments         // nuevo
    } = req.body || {};

    // Validaciones básicas
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });

    if (typeof item !== "string" || !item.trim())
      return res.status(400).json({ error: "item required" });

    // description opcional
    let desc: string | null = null;
    if (typeof description === "string" && description.trim()) {
      desc = description.trim();
    }

    if (typeof total_amount !== "number" || !isFinite(total_amount) || total_amount <= 0)
      return res.status(400).json({ error: "total_amount must be > 0" });

    if (!Array.isArray(plates) || plates.length === 0)
      return res.status(400).json({ error: "plates must be non-empty array" });

    // Normaliza y valida formato de placas
    const normPlates = Array.from(
      new Set(plates.map((p: unknown) => String(p || "").toUpperCase().trim()))
    );
    if (normPlates.some((p) => !PLATE_RE.test(p)))
      return res.status(400).json({ error: "all plates must match ABC123 format" });

    // Verifica que existan en vehicles
    const { data: vdata, error: vErr } = await supabase
      .from("vehicles")
      .select("plate")
      .in("plate", normPlates);

    if (vErr) return res.status(500).json({ error: vErr.message });
    const found = new Set((vdata || []).map((r) => r.plate));
    const missing = normPlates.filter((p) => !found.has(p));
    if (missing.length) return res.status(400).json({ error: "unknown plates", missing });

    // Prorrateo
    const totalCents = Math.round(total_amount * 100);
    const cents      = splitEven(totalCents, normPlates.length);
    const shares     = cents.map((c) => Number((c / 100).toFixed(2))); // COP con 2 decimales

    // === Normalizar attachments (nuevo) ===
    const normAttachments: NormalizedAttachment[] = [];

    if (Array.isArray(attachments)) {
      for (const raw of attachments) {
        if (!raw) continue;
        const kind = String(raw.kind || "").toLowerCase();
        const url  = String(raw.url || "").trim();
        if (!url) continue;
        if (kind !== "evidence" && kind !== "invoice") continue;
        normAttachments.push({ kind, url });
      }
    }

    // Compatibilidad: si viene attachment_url legacy y no hay attachments
    if (!normAttachments.length && typeof attachment_url === "string" && attachment_url.trim()) {
      normAttachments.push({ kind: "evidence", url: attachment_url.trim() });
    }

    const firstAttachmentUrl = normAttachments[0]?.url ?? null;

    // Inserta expense (dejamos attachment_url por compatibilidad, pero ya no es obligatorio)
    const { data: exp, error: eErr } = await supabase
      .from("expenses")
      .insert([
        {
          date,
          item: item.trim(),
          description: desc,
          total_amount: Number(total_amount.toFixed(2)),
          attachment_url: firstAttachmentUrl,
        }
      ])
      .select()
      .single();

    if (eErr) return res.status(500).json({ error: eErr.message });

    // Inserta detalle por placa
    const rows = normPlates.map((plate, i) => ({
      expense_id: exp.id,
      plate,
      share_amount: shares[i]
    }));

    const { error: dErr } = await supabase.from("expense_vehicles").insert(rows);
    if (dErr) return res.status(500).json({ error: dErr.message });

    // Inserta adjuntos (si hay)
    if (normAttachments.length) {
      const attachRows = normAttachments.map((a) => ({
        expense_id: exp.id,
        kind: a.kind,
        url: a.url
      }));
      const { error: aErr } = await supabase
        .from("expense_attachments")
        .insert(attachRows);
      if (aErr) return res.status(500).json({ error: aErr.message });
    }

    // Audit log
    await supabase.from("expense_audit_log").insert([
      {
        expense_id: exp.id,
        action: "created",
        changed_fields: {
          plates: normPlates,
          shares,
          attachments: normAttachments
        },
        actor: null
      }
    ]);

    return res.status(201).json({ expense: exp, detail: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

// Listar gastos (incluye detalle y adjuntos; con placa usa INNER)
r.get("/", async (req: Request, res: Response) => {
  const limit  = Math.min(Math.max(parseInt(String(req.query.limit || 20), 10) || 20, 1), 100);
  const offset = Math.max(parseInt(String(req.query.offset || 0), 10) || 0, 0);
  const from   = String(req.query.from || "");
  const to     = String(req.query.to   || "");
  const plate  = String(req.query.plate || "").toUpperCase().trim();

  const today = new Date();
  const last7 = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last7Str = last7.toISOString().slice(0, 10); // YYYY-MM-DD

  const selectStr = `
    id, date, item, description, total_amount, attachment_url, created_at, updated_at,
    expense_attachments(kind, url),
    ${
      plate
        ? "expense_vehicles!inner(plate, share_amount)"
        : "expense_vehicles(plate, share_amount)"
    }
  `;

  let q = supabase
    .from("expenses")
    .select(selectStr as any, { count: "exact" })
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Rango por defecto o from/to
  if (!from && !to) {
    q = q.gte("date", last7Str);
  } else {
    if (from) q = q.gte("date", from);
    if (to)   q = q.lte("date", to);
  }

  // Filtro por placa si viene
  if (plate) {
    q = q.eq("expense_vehicles.plate", plate);
  }

  const { data, error, count } = await q;

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: data ?? [], total: count ?? 0, limit, offset });
});

/** PUT /expenses/:id/attachment  (LEGACY: aún soporta actualizar attachment_url) */
r.put("/:id/attachment", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { attachment_url } = req.body || {};
  if (!id || typeof attachment_url !== "string")
    return res.status(400).json({ error: "id and attachment_url required" });

  // Lee actual (para log)
  const { data: prev, error: gErr } = await supabase
    .from("expenses")
    .select("attachment_url")
    .eq("id", id)
    .single();
  if (gErr) return res.status(500).json({ error: gErr.message });

  const { data, error } = await supabase
    .from("expenses")
    .update({ attachment_url, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase.from("expense_audit_log").insert([
    {
      expense_id: id,
      action: "attachment_added",
      changed_fields: {
        attachment_url: {
          old: prev?.attachment_url ?? null,
          new: attachment_url
        }
      },
      actor: null
    }
  ]);

  res.json(data);
});

export default r;
