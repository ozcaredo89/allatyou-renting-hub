import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  safePolygon,
} from "@floating-ui/react";

const fmtCOP = new Intl.NumberFormat("es-CO");

// Mirrors src/lib/receiptClassification.ts on the backend.
export type DuplicatePaymentSummary = {
  id: number;
  plate: string;
  payment_date: string | null;
  amount: number | null;
  reference_number: string | null;
  proof_url: string | null;
};

export type AmountMismatchDetails = {
  db_amount: number;
  ocr_amount: number;
  difference: number;
};

export type MatchContext = {
  match_type: "reference" | "amount_date";
  matched_reference?: string | null;
};

function matchContextHeadline(matchContext?: MatchContext | null): string {
  if (matchContext?.match_type === "reference" && matchContext.matched_reference) {
    return `El número de referencia "${matchContext.matched_reference}" de este comprobante se repite en:`;
  }
  if (matchContext?.match_type === "amount_date") {
    return "El monto y la fecha de este comprobante coinciden con:";
  }
  return "Comprobantes en conflicto";
}

/**
 * The actual "what is the duplicate" content: reasons list plus the
 * side-by-side comprobante comparison table. Extracted so it can render
 * either inside the hover popover (ReceiptBadge, used in compact tables) or
 * directly inline, always visible, with no interaction required.
 */
export const InconsistencyDetails = ({
  reasons,
  duplicatePayments,
  matchContext,
  amountMismatch,
  current,
}: {
  reasons: string[];
  duplicatePayments?: DuplicatePaymentSummary[];
  matchContext?: MatchContext | null;
  amountMismatch?: AmountMismatchDetails | null;
  current: { plate: string; payment_date: string | null; amount: number | null; proof_url: string | null };
}) => {
  const hasDuplicates = !!duplicatePayments && duplicatePayments.length > 0;

  return (
    <>
      {reasons.length > 0 && (
        <div className="space-y-1">
          {reasons.map((r, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="text-amber-500 mt-px">•</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}

      {hasDuplicates && (
        <div className={reasons.length > 0 ? "mt-3 border-t border-amber-100 pt-2" : ""}>
          <div className="font-semibold text-gray-800 mb-1">{matchContextHeadline(matchContext)}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="pr-2 py-1 font-medium">&nbsp;</th>
                  <th className="pr-2 py-1 font-medium">Placa</th>
                  <th className="pr-2 py-1 font-medium">Fecha</th>
                  <th className="pr-2 py-1 font-medium">Monto</th>
                  <th className="py-1 font-medium">Comprobante</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-amber-100 bg-amber-50/60">
                  <td className="pr-2 py-1 font-medium text-gray-500">Actual</td>
                  <td className="pr-2 py-1">{current.plate}</td>
                  <td className="pr-2 py-1">{current.payment_date ?? "—"}</td>
                  <td className="pr-2 py-1">
                    {current.amount != null ? "$" + fmtCOP.format(current.amount) : "—"}
                    {amountMismatch && (
                      <div className="text-[10px] text-amber-600 font-normal">
                        OCR leyó ${fmtCOP.format(amountMismatch.ocr_amount)}
                      </div>
                    )}
                  </td>
                  <td className="py-1">
                    {current.proof_url ? (
                      <a
                        href={current.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline hover:text-black"
                      >
                        Ver <ExternalLink size={11} />
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
                {duplicatePayments!.map((d) => (
                  <tr key={d.id} className="border-t border-amber-100">
                    <td className="pr-2 py-1 text-gray-400">#{d.id}</td>
                    <td className="pr-2 py-1">{d.plate}</td>
                    <td className="pr-2 py-1">{d.payment_date ?? "—"}</td>
                    <td className="pr-2 py-1">{d.amount != null ? "$" + fmtCOP.format(d.amount) : "—"}</td>
                    <td className="py-1">
                      {d.proof_url ? (
                        <a
                          href={d.proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 underline hover:text-black"
                        >
                          Ver comprobante <ExternalLink size={11} />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
};

/**
 * Compact badge for use in dense tables (e.g. Reports.tsx's "último pago por
 * vehículo" view). Renders InconsistencyDetails inside a non-modal floating
 * popover (via @floating-ui/react + a body portal, so it escapes any
 * ancestor's overflow-x-auto clipping).
 *
 * Open triggers: hover (preview, non-blocking) or keyboard focus.
 * Click / Enter / Space "pins" the popover open so it survives the hover-out
 * that happens once the pointer or Tab focus moves off the button and into
 * the popover itself (e.g. to reach a "Ver comprobante" link).
 * Close triggers: Escape, an outside click, or (while not pinned) losing
 * hover/focus. No focus trap — Tab flows through normally.
 *
 * For a page that's specifically ABOUT reviewing inconsistencies (not a
 * dense summary table), prefer rendering InconsistencyDetails directly and
 * always-visible instead of hiding it behind this hover interaction.
 */
export const ReceiptBadge = ({
  is_suspicious,
  is_technical_failure,
  reasons,
  duplicatePayments,
  matchContext,
  amountMismatch,
  current,
}: {
  is_suspicious: boolean;
  is_technical_failure: boolean;
  reasons: string[];
  duplicatePayments?: DuplicatePaymentSummary[];
  matchContext?: MatchContext | null;
  amountMismatch?: AmountMismatchDetails | null;
  current: { plate: string; payment_date: string | null; amount: number | null; proof_url: string | null };
}) => {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (nextOpen, _event, reason) => {
      if (!nextOpen) {
        const forceClose = reason === "escape-key" || reason === "outside-press";
        // While pinned, ignore hover-out/blur closes — only Escape or an
        // outside click should dismiss it.
        if (pinned && !forceClose) return;
        setPinned(false);
      } else if (reason === "click") {
        setPinned(true);
      }
      setOpen(nextOpen);
    },
    placement: "top-start",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const hover = useHover(context, { move: false, handleClose: safePolygon() });
  const focus = useFocus(context);
  const click = useClick(context, { toggle: true });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss, role]);

  if (!is_suspicious && !is_technical_failure) return null;

  const isSuspicious = is_suspicious;
  const label = reasons.join(" · ") || (isSuspicious ? "Sospechoso" : "Lectura incompleta");
  const ariaLabel = `${isSuspicious ? "Inconsistencia" : "Problema técnico"}: ${label}`;

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label={ariaLabel}
        title={ariaLabel}
        {...getReferenceProps()}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border transition-colors focus:outline-none focus:ring-2 ${
          isSuspicious
            ? "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 focus:ring-amber-400"
            : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200 focus:ring-slate-400"
        }`}
      >
        {isSuspicious ? "⚠️" : "ℹ️"}
        <span>{isSuspicious ? "Sospechoso" : "Lectura incompleta"}</span>
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            aria-label={ariaLabel}
            className="z-50 w-[min(92vw,480px)] rounded-xl border border-amber-200 bg-white shadow-xl p-3 text-xs text-gray-700"
          >
            <InconsistencyDetails
              reasons={reasons}
              duplicatePayments={duplicatePayments}
              matchContext={matchContext}
              amountMismatch={amountMismatch}
              current={current}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
};
