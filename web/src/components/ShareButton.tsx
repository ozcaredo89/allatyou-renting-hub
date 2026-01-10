import { useState } from "react";

interface ShareButtonProps {
  title: string;
  text: string;
  hash: string; // El ID de la sección (ej: "#conductores")
  colorClass?: string; // Para cambiar entre verde (conductores) y azul (propietarios)
}

export function ShareButton({ title, text, hash, colorClass = "text-emerald-400" }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/${hash}`;
    const shareData = {
      title: title,
      text: text,
      url: url,
    };

    // 1. Intento usar la API nativa de compartir (Móviles Android/iOS)
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // Si el usuario cancela o falla, no hacemos nada crítico
        console.log("Error compartiendo:", err);
      }
    }

    // 2. Fallback: Copiar al portapapeles (Desktop)
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("No se pudo copiar", err);
    }
  };

  return (
    <button
      onClick={handleShare}
      className={`group flex items-center gap-2 text-xs font-medium ${colorClass} hover:underline decoration-dashed underline-offset-4 transition-all`}
      title="Compartir esta oportunidad"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 transition-colors group-hover:bg-white/10">
        {copied ? (
          "✅"
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
            <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
          </svg>
        )}
      </span>
      {copied ? "¡Enlace copiado!" : "Compartir oportunidad"}
    </button>
  );
}