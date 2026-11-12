// Botón oficial de "Continuar con Google" (Google Identity Services). Issue #49.
// Entrega el ID token (credential) a onCredential; el backend lo valida en /auth/google.
import { useEffect, useRef, useState } from "react";

type GsiButtonOptions = { theme?: string; size?: string; text?: string; shape?: string; width?: number; locale?: string };
type GsiApi = {
  accounts: {
    id: {
      initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
      renderButton: (el: HTMLElement, opts: GsiButtonOptions) => void;
    };
  };
};

declare global {
  interface Window { google?: GsiApi }
}

let scriptPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromise = null; reject(new Error("No se pudo cargar Google")); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export default function GoogleButton({
  clientId,
  onCredential,
  text = "continue_with",
}: {
  clientId: string | null;
  onCredential: (credential: string) => void;
  text?: "continue_with" | "signin_with" | "signup_with";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || !ref.current) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => cbRef.current(r.credential) });
        ref.current.innerHTML = "";
        window.google.accounts.id.renderButton(ref.current, {
          theme: "outline", size: "large", text, shape: "pill", width: 300, locale: "es",
        });
      })
      .catch((e) => setError(e.message));
    return () => { cancelled = true; };
  }, [clientId, text]);

  if (!clientId) {
    return (
      <p className="text-xs text-slate-400 text-center">
        El ingreso con Google aún no está activado en este entorno.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-1">
      <div ref={ref} className="min-h-[44px]" />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
