export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    registered: "bg-blue-100 text-blue-800",
    pending_review: "bg-purple-100 text-purple-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    active: "bg-green-100 text-green-800",
    closed: "bg-gray-100 text-gray-800",
    confirmed: "bg-emerald-100 text-emerald-800", // Para pagos
  };

  const label = status ? status.replace("_", " ").toUpperCase() : "UNKNOWN";
  const colorClass = colors[status] || "bg-gray-100 text-gray-800";

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide ${colorClass}`}>
      {label}
    </span>
  );
}