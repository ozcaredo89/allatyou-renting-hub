/**
 * receiptClassification.ts
 *
 * Single source of truth for "what counts as a problematic payment receipt".
 *
 * Both the SQL filter (suspicious_only=true) and the badge logic in the frontend
 * derive from the same constants and function exported here. They MUST NOT
 * diverge — if a new receipt_status value is added, add it to SUSPICIOUS_STATUSES
 * and everything else picks it up automatically.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** receipt_status values that indicate a problem (operational or technical). */
export const SUSPICIOUS_STATUSES = new Set([
  "suspicious_duplicate",
  "suspicious_ocr_failed",
  "timeout",
] as const);

/** Technical-failure statuses: system errors, NOT financial anomalies. */
const TECHNICAL_STATUSES = new Set<string>(["suspicious_ocr_failed", "timeout"]);

/** Operational-anomaly statuses: duplicates, mismatches — auditor-relevant. */
const OPERATIONAL_STATUSES = new Set<string>(["suspicious_duplicate"]);

/**
 * Pairs where (receipt_status, flag_reason) describe the exact same problem.
 * When both are present, only one human-readable reason is shown.
 */
const DEDUP_MAP: Record<string, Set<string>> = {
  suspicious_duplicate: new Set(["duplicate_reference", "duplicate_amount_date"]),
};

// ---------------------------------------------------------------------------
// Human-readable reason builders
// ---------------------------------------------------------------------------

function reasonFromStatus(status: string): string | null {
  switch (status) {
    case "suspicious_duplicate":   return "Comprobante duplicado";
    case "suspicious_ocr_failed":  return "OCR no pudo leer el comprobante";
    case "timeout":                return "Lectura OCR no completada";
    default:                       return null;
  }
}

function reasonFromFlagReason(flagReason: string | null): string | null {
  if (!flagReason) return null;
  switch (flagReason) {
    case "duplicate_reference":    return "Referencia duplicada";
    case "duplicate_amount_date":  return "Comprobante duplicado";
    case "amount_mismatch":        return "Monto no coincide con OCR";
    default:                       return null;
  }
}

const TECHNICAL_NOTE = "Nota: lectura OCR no completada";

// ---------------------------------------------------------------------------
// Main classification function
// ---------------------------------------------------------------------------

export interface ReceiptClassification {
  is_suspicious:         boolean;
  is_technical_failure:  boolean;
  inconsistency_reasons: string[];
}

/**
 * Classifies a payment receipt into clean / suspicious / technical-failure.
 *
 * Priority rule: OPERATIONAL beats TECHNICAL.
 * If flagged_for_review=true, the payment is always suspicious regardless of
 * receipt_status. The technical note is still appended so auditors have full context.
 *
 * Deduplication rule:
 * receipt_status='suspicious_duplicate' covers flag_reason in
 * {duplicate_reference, duplicate_amount_date}. When both present, one phrase shown.
 *
 * Invariant: !(is_suspicious && is_technical_failure) — enforced with a throw.
 */
export function classifyReceipt(
  receipt_status: string | null,
  flagged_for_review: boolean | null,
  flag_reason: string | null,
): ReceiptClassification {
  const status  = receipt_status ?? "";
  const flagged = flagged_for_review === true;

  const hasTechnicalStatus   = TECHNICAL_STATUSES.has(status);
  const hasOperationalStatus = OPERATIONAL_STATUSES.has(status);

  // Operational wins over technical.
  const is_suspicious        = hasOperationalStatus || flagged;
  const is_technical_failure = hasTechnicalStatus && !is_suspicious;

  // Invariant guard.
  if (is_suspicious && is_technical_failure) {
    throw new Error(
      `classifyReceipt invariant violated: ` +
      `receipt_status=${receipt_status}, flagged_for_review=${flagged_for_review}`,
    );
  }

  // Clean path.
  if (!is_suspicious && !is_technical_failure) {
    return { is_suspicious: false, is_technical_failure: false, inconsistency_reasons: [] };
  }

  const reasons: string[] = [];

  // Pure technical failure.
  if (is_technical_failure) {
    const r = reasonFromStatus(status);
    if (r) reasons.push(r);
    return { is_suspicious: false, is_technical_failure: true, inconsistency_reasons: reasons };
  }

  // Suspicious path —————————————————————————————————————————————————————————

  // 1. Reason from receipt_status (operational statuses only).
  if (hasOperationalStatus) {
    const r = reasonFromStatus(status);
    if (r) reasons.push(r);
  }

  // 2. Reason from flag_reason, with deduplication.
  const flagReasonStr = reasonFromFlagReason(flag_reason);
  if (flagReasonStr) {
    const coveredByStatus = DEDUP_MAP[status]?.has(flag_reason ?? "") ?? false;
    if (!coveredByStatus) {
      reasons.push(flagReasonStr);
    }
  }

  // 3. Fallback when no specific reason was collected.
  if (reasons.length === 0) {
    reasons.push("Marcado para revisión");
  }

  // 4. Append technical note if there was also a technical status.
  if (hasTechnicalStatus) {
    reasons.push(TECHNICAL_NOTE);
  }

  return { is_suspicious: true, is_technical_failure: false, inconsistency_reasons: reasons };
}

// ---------------------------------------------------------------------------
// Supabase filter helper
// ---------------------------------------------------------------------------

/**
 * Returns the PostgREST OR-filter string for suspicious_only=true.
 * Use as: query.or(suspiciousOnlyFilter())
 *
 * Shares SUSPICIOUS_STATUSES with classifyReceipt — the two can never diverge.
 */
export function suspiciousOnlyFilter(): string {
  const statusList = [...SUSPICIOUS_STATUSES].join(",");
  return `receipt_status.in.(${statusList}),flagged_for_review.eq.true`;
}
