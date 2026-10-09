import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const fmtCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export interface DebitNotePdfData {
  id: number;
  contract_id: number;
  plate: string;
  driver_name?: string | null;
  driver_document?: string | null;
  driver_phone?: string | null;
  date?: string;
  created_at?: string;
  expense_item?: string;
  expense_category?: string;
  expense_description?: string | null;
  total_expense_amount: number;
  amount_deducted: number;
  balance_before: number;
  balance_after: number;
  excess_amount: number;
  excess_payment_method?: string | null;
  advance_id?: number | null;
  notes?: string | null;
}

export function generateDebitNotePDF(data: DebitNotePdfData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Encabezado Corporativo
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 28, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("ALL AT YOU RENTING S.A.S.", 14, 13);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text("Gestión de Flota & Renting Operativo con Opción de Compra", 14, 20);

  // Badge de Consecutivo
  const noteNumber = `ND-${String(data.id).padStart(5, "0")}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(noteNumber, pageWidth - 14, 15, { align: "right" });

  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  const printDate = data.created_at
    ? new Date(data.created_at).toLocaleDateString("es-CO", { year: "numeric", month: "short", day: "numeric" })
    : new Date().toLocaleDateString("es-CO");
  doc.text(`Fecha: ${printDate}`, pageWidth - 14, 22, { align: "right" });

  // Título del Documento
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text("COMPROBANTE DE NOTA DÉBITO — FONDO DE MANTENIMIENTO", 14, 38);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Deducción autorizada de gastos operativos contra el fondo acumulado de leasing.", 14, 44);

  // Tarjetas de Información: Vehículo & Conductor
  autoTable(doc, {
    startY: 48,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 38 },
      1: { cellWidth: 55 },
      2: { fontStyle: "bold", cellWidth: 38 },
      3: { cellWidth: 55 },
    },
    body: [
      [
        "Vehículo / Placa:",
        data.plate.toUpperCase(),
        "Contrato Leasing:",
        `#${data.contract_id}`,
      ],
      [
        "Conductor / Titular:",
        data.driver_name || "No asignado",
        "Documento Identidad:",
        data.driver_document || "—",
      ],
      [
        "Fecha del Gasto:",
        data.date || printDate,
        "Teléfono Contacto:",
        data.driver_phone || "—",
      ],
    ],
  });

  // Detalle del Gasto
  const afterVehicleY = (doc as any).lastAutoTable.finalY + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Detalle del Gasto Operativo", 14, afterVehicleY);

  autoTable(doc, {
    startY: afterVehicleY + 2,
    head: [["Concepto / Repuesto / Servicio", "Categoría", "Valor Total"]],
    headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: "bold" },
    body: [
      [
        data.expense_item || "Mantenimiento preventivo / correctivo",
        data.expense_category || "Mantenimiento",
        fmtCOP.format(data.total_expense_amount),
      ],
    ],
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 45 },
      2: { cellWidth: 40, halign: "right", fontStyle: "bold" },
    },
  });

  // Movimiento del Fondo de Mantenimiento
  const afterExpenseY = (doc as any).lastAutoTable.finalY + 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("Liquidación y Cruce Contable del Fondo", 14, afterExpenseY);

  autoTable(doc, {
    startY: afterExpenseY + 2,
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 3, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 120 },
      1: { halign: "right", fontStyle: "bold", cellWidth: 65 },
    },
    body: [
      ["Saldo Disponible en Fondo (Antes del gasto)", fmtCOP.format(data.balance_before)],
      [
        "(-) Valor Cubierto por Fondo de Mantenimiento (Débito)",
        `-${fmtCOP.format(data.amount_deducted)}`,
      ],
      ["(=) Saldo Restante en Fondo de Mantenimiento", fmtCOP.format(data.balance_after)],
    ],
  });

  // Bloque de Excedente (si existe)
  let currentY = (doc as any).lastAutoTable.finalY + 6;

  if (data.excess_amount > 0) {
    doc.setFillColor(254, 242, 242); // red-50
    doc.setDrawColor(252, 165, 165); // red-300
    doc.roundedRect(14, currentY, pageWidth - 28, 24, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(153, 27, 27); // red-800
    doc.text(`EXCEDENTE NO CUBIERTO POR EL FONDO: ${fmtCOP.format(data.excess_amount)}`, 18, currentY + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(69, 10, 10);
    const methodDesc =
      data.excess_payment_method === "advance"
        ? `Financiado mediante Préstamo / Anticipo Operativo #${data.advance_id || ""} para pago diferido en cuotas.`
        : "Cubierto en efectivo de contado por el conductor en el momento del servicio.";
    doc.text(`Forma de pago acordada: ${methodDesc}`, 18, currentY + 14);

    currentY += 30;
  } else {
    doc.setFillColor(240, 253, 244); // green-50
    doc.setDrawColor(187, 247, 208); // green-200
    doc.roundedRect(14, currentY, pageWidth - 28, 14, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(22, 101, 52); // green-800
    doc.text("Gasto cubierto al 100% por el Fondo de Mantenimiento Acumulado.", 18, currentY + 8);

    currentY += 20;
  }

  // Notas u Observaciones
  if (data.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text("Observaciones:", 14, currentY);
    doc.setFont("helvetica", "normal");
    doc.text(data.notes, 14, currentY + 5);
    currentY += 14;
  }

  // Firmas
  const signatureY = Math.max(currentY + 25, 235);
  doc.setDrawColor(148, 163, 184); // slate-400
  doc.line(25, signatureY, 85, signatureY);
  doc.line(125, signatureY, 185, signatureY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text("ADMINISTRACIÓN / RENTING HUB", 55, signatureY + 5, { align: "center" });
  doc.text("CONDUCTOR / ARRENDATARIO", 155, signatureY + 5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Firma Autorizada", 55, signatureY + 9, { align: "center" });
  doc.text(data.driver_name || "C.C. ________________", 155, signatureY + 9, { align: "center" });

  // Pie de página
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Documento de control interno generado automáticamente por Renting Hub · ${noteNumber}`,
    pageWidth / 2,
    285,
    { align: "center" }
  );

  // Descarga del PDF
  doc.save(`Nota_Debito_${noteNumber}_${data.plate.toUpperCase()}.pdf`);
}
