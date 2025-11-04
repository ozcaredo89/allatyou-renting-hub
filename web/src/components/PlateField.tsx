// web/src/components/PlateField.tsx
import React, { useEffect, useMemo, useState } from "react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";

export type DriverFlat = {
  plate: string;
  driver_name: string;
  has_credit: boolean;
  default_amount: number | null;
  default_installment: number | null;
};

export type DriverResp =
  | { found: false }
  | { found: true; driver: DriverFlat }
  | DriverFlat;

const API_BASE = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");
const PLATE_RE = /^[A-Z]{3}\d{3}$/;

export default function PlateField({
  value,
  onChange,
  requireAuth = false,
  onDriverResolved,
  placeholder = "ABC123",
  maxLength = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  requireAuth?: boolean;
  onDriverResolved?: (d: DriverFlat | null) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  const [plateExists, setPlateExists] = useState<boolean | null>(null);
  const plateValid = useMemo(() => PLATE_RE.test(value), [value]);

  useEffect(() => {
    let cancelled = false;
    async function fetchDriver() {
      if (!plateValid || !value) {
        setPlateExists(null);
        onDriverResolved?.(null);
        return;
      }
      try {
        const headers: Record<string, string> = {};
        if (requireAuth) headers.Authorization = ensureBasicAuth();
        const rs = await fetch(`${API_BASE}/drivers/${value.toUpperCase()}`, { headers });
        if (rs.status === 401 || rs.status === 403) {
          if (requireAuth) clearBasicAuth();
          setPlateExists(false);
          onDriverResolved?.(null);
          return;
        }
        if (!rs.ok) {
          setPlateExists(false);
          onDriverResolved?.(null);
          return;
        }
        const raw: DriverResp = await rs.json();
        if (cancelled) return;

        let found = false; let d: DriverFlat | null = null;
        if ("found" in raw) {
          if (raw.found === true) { found = true; d = raw.driver; }
        } else if ("plate" in raw) {
          found = true; d = raw as DriverFlat;
        }
        setPlateExists(found);
        onDriverResolved?.(found ? d : null);
      } catch {
        setPlateExists(null);
        onDriverResolved?.(null);
      }
    }
    const t = setTimeout(fetchDriver, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value, plateValid, requireAuth, onDriverResolved]);

  return (
    <div>
      <input
        className={`w-full rounded-xl border bg-white px-3 py-2 uppercase outline-none focus:ring-2 focus:ring-black/60 ${
          value && !plateValid ? "border-red-500" : "border-gray-300"
        }`}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        inputMode="text"
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
      />
      {!plateValid && value ? (
        <div className="mt-1 text-xs text-red-600">Formato válido: ABC123</div>
      ) : plateExists === false ? (
        <div className="mt-1 text-xs text-red-600">Placa no registrada</div>
      ) : plateExists === true ? (
        <div className="mt-1 text-xs text-green-700">✔️ Placa registrada</div>
      ) : null}
    </div>
  );
}
