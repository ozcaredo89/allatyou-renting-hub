interface ContactBtnProps {
  value: string; // teléfono o email
  contextMsg?: string; // mensaje o asunto
}

export function WhatsAppBtn({ value, contextMsg = "" }: ContactBtnProps) {
  if (!value) return null;
  const cleanPhone = value.replace(/\D/g, ""); // Quita no-números
  const link = `https://wa.me/57${cleanPhone}?text=${encodeURIComponent(contextMsg)}`;

  return (
    <a
      href={link}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-semibold text-xs border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors hover:bg-emerald-100"
    >
      <span>💬</span> WhatsApp
    </a>
  );
}

export function EmailBtn({ value, contextMsg = "" }: ContactBtnProps) {
  if (!value) return null;
  const link = `mailto:${value}?subject=${encodeURIComponent(contextMsg)}`;

  return (
    <a
      href={link}
      className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-semibold text-xs border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors hover:bg-blue-100"
    >
      <span>✉️</span> Email
    </a>
  );
}