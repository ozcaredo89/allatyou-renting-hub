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

r.post("/", async (req: Request, res: Response) => {
  try {
    const {
      date,
      item,
      category = "Otros", // NUEVO: Categoría por defecto
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

    // Inserta expense agregando el campo category
    const { data: exp, error: eErr } = await supabase
      .from("expenses")
      .insert([
        {
          date,
          item: item.trim(),
          category, // NUEVO
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
          attachments: normAttachments,
          category // NUEVO
        },
        actor: null
      }
    ]);

    return res.status(201).json({ expense: exp, detail: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "internal error" });
  }
});

// Listar gastos (incluye categoría)
r.get("/", async (req: Request, res: Response) => {
  const limit  = Math.min(Math.max(parseInt(String(req.query.limit || 20), 10) || 20, 1), 100);
  const offset = Math.max(parseInt(String(req.query.offset || 0), 10) || 0, 0);
  const from   = String(req.query.from || "");
  const to     = String(req.query.to   || "");
  const plate  = String(req.query.plate || "").toUpperCase().trim();

  const today = new Date();
  const last7 = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last7Str = last7.toISOString().slice(0, 10); // YYYY-MM-DD

  // NUEVO: Agregamos "category" al select
  const selectStr = `
    id, date, item, category, description, total_amount, attachment_url, created_at, updated_at,
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

  if (!from && !to) {
    q = q.gte("date", last7Str);
  } else {
    if (from) q = q.gte("date", from);
    if (to)   q = q.lte("date", to);
  }

  if (plate) {
    q = q.eq("expense_vehicles.plate", plate);
  }

  const { data, error, count } = await q;

  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: data ?? [], total: count ?? 0, limit, offset });
});

r.put("/:id/attachment", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { attachment_url } = req.body || {};
  if (!id || typeof attachment_url !== "string")
    return res.status(400).json({ error: "id and attachment_url required" });

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

r.post("/:id/attachments", async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (!id || !Number.isFinite(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const incoming = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

  if (!incoming.length) {
    return res.status(400).json({ error: "attachments must be non-empty" });
  }

  const normalized: NormalizedAttachment[] = [];
  for (const raw of incoming) {
    if (!raw) continue;
    const kind = String(raw.kind || "").toLowerCase();
    const url = String(raw.url || "").trim();
    if (!url) continue;
    if (kind !== "evidence" && kind !== "invoice") continue;
    normalized.push({ kind, url });
  }

  if (!normalized.length) {
    return res.status(400).json({ error: "valid attachments required" });
  }

  const { data: current, error: curErr } = await supabase
    .from("expense_attachments")
    .select("id")
    .eq("expense_id", id);

  if (curErr) return res.status(500).json({ error: curErr.message });

  const existingCount = (current ?? []).length;

  if (existingCount + normalized.length > 5) {
    return res.status(400).json({
      error: `max 5 attachments allowed (current: ${existingCount}, new: ${normalized.length})`
    });
  }

  const rows = normalized.map(a => ({
    expense_id: id,
    kind: a.kind,
    url: a.url
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("expense_attachments")
    .insert(rows)
    .select();

  if (insErr) return res.status(500).json({ error: insErr.message });

  await supabase.from("expense_audit_log").insert([
    {
      expense_id: id,
      action: "attachments_added",
      changed_fields: { added: normalized.map(a => a.url) },
      actor: null
    }
  ]);

  res.status(201).json({ attachments: inserted });
});

r.put("/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { date, item, category, description, total_amount } = req.body; // NUEVO: recibe category

  if (!id) return res.status(400).json({ error: "Invalid ID" });

  try {
    const { data, error } = await supabase
      .from("expenses")
      .update({
        date,
        item,
        category, // NUEVO: actualiza category
        description,
        total_amount
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default r;