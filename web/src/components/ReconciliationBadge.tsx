import { useState } from "react";
import { CheckCircle2, CircleDashed, ExternalLink } from "lucide-react";
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
} from "@floating-ui/react";

const fmtCOP = new Intl.NumberFormat("es-CO");

export type BankMatch = {
  id: number;
  fecha: string | null;
  descripcion: string | null;
  referencia: string | null;
  monto_entrada: number | null;
  sucursal: string | null;
};

/**
 * Tag "Conciliado" / "Sin conciliar" para el monto de un pago, en el mismo
 * espiritu que ReceiptBadge ("Sospechoso"). El link a "con que se concilio"
 * no es una URL propia (transacciones_entrantes no tiene pagina de detalle):
 * es un popover con el registro exacto del banco, mas un boton que abre el
 * modal de Conciliación bancaria ya filtrado a esa referencia.
 */
export const ReconciliationBadge = ({
  bankMatch,
  onViewInBankModal,
  receiptStatus,
  flagDetails,
}: {
  bankMatch: BankMatch | null | undefined;
  onViewInBankModal?: (referencia: string) => void;
  receiptStatus?: string | null;
  flagDetails?: any | null;
}) => {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (nextOpen, _event, reason) => {
      if (!nextOpen) {
        const forceClose = reason === "escape-key" || reason === "outside-press";
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

  const hover = useHover(context, { move: false });
  const focus = useFocus(context);
  const click = useClick(context, { toggle: true });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "dialog" });

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss, role]);

  if (receiptStatus === "advance_offset") {
    const advanceId = flagDetails?.advance_id;
    return (
      <a
        href={advanceId ? `/advances?plate=${flagDetails?.plate || ""}` : `/advances`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition-colors"
        title={`Pago cubierto con anticipo${advanceId ? ` #${advanceId}` : ""}. Clic para ver anticipos.`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
        <span>Anticipo {advanceId ? `#${advanceId}` : ""}</span>
        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
      </a>
    );
  }

  if (!bankMatch) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border bg-gray-50 text-gray-500 border-gray-300"
        title="No se encontró un movimiento bancario que calce (misma fecha y monto exactos)"
      >
        <CircleDashed className="w-3 h-3" />
        <span>Sin conciliar</span>
      </span>
    );
  }

  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        aria-label="Pago conciliado con el banco"
        title="Pago conciliado con el banco — clic para ver el registro"
        {...getReferenceProps()}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400"
      >
        <CheckCircle2 className="w-3 h-3" />
        <span>Conciliado</span>
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-50 w-[min(92vw,340px)] rounded-xl border border-emerald-200 bg-white shadow-xl p-3 text-xs text-gray-700 space-y-1.5"
          >
            <div className="font-semibold text-gray-800 mb-1">Movimiento bancario con el que se concilió:</div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">Fecha</span>
              <span className="font-medium">{bankMatch.fecha ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">Monto</span>
              <span className="font-medium">
                {bankMatch.monto_entrada != null ? `$${fmtCOP.format(bankMatch.monto_entrada)}` : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500 shrink-0">Descripción</span>
              <span className="font-medium text-right">{bankMatch.descripcion ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-gray-500">Referencia</span>
              <span className="font-mono">{bankMatch.referencia ?? "—"}</span>
            </div>
            {bankMatch.sucursal && (
              <div className="flex justify-between gap-2">
                <span className="text-gray-500">Sucursal</span>
                <span className="font-medium">{bankMatch.sucursal}</span>
              </div>
            )}
            {onViewInBankModal && bankMatch.referencia && (
              <button
                type="button"
                onClick={() => onViewInBankModal(bankMatch.referencia!)}
                className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold py-1.5 hover:bg-emerald-700 transition-colors cursor-pointer"
              >
                Ver en Conciliación bancaria <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
};
