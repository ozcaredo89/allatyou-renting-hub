import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, Plus, X, Sparkles } from "lucide-react";
import { BRAND_LINES } from "../constants/vehicleCatalog";

interface VehicleModelComboboxProps {
  brand: string;
  value: string;
  onChange: (value: string, isCustom: boolean) => void;
  variant?: "dark" | "light";
  placeholder?: string;
  required?: boolean;
}

export function VehicleModelCombobox({
  brand,
  value,
  onChange,
  variant = "dark",
  placeholder,
  required = true,
}: VehicleModelComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincronizar query interno con el value externo si cambia por fuera
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Lista de modelos conocidos para la marca seleccionada
  const availableLines = useMemo(() => {
    return BRAND_LINES[brand] || [];
  }, [brand]);

  // Filtrado de modelos según la búsqueda del usuario
  const filteredLines = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableLines;
    return availableLines.filter(line => line.toLowerCase().includes(q));
  }, [availableLines, query]);

  // Determinar si el valor actual o el query ya coincide exactamente con una línea conocida
  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    return availableLines.find(line => line.toLowerCase() === q);
  }, [availableLines, query]);

  // Si la marca no está en el catálogo estándar o es "Otra", es libre
  const isFreeText = brand === "Otra" || availableLines.length === 0;

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (selectedLine: string, isCustom: boolean) => {
    setQuery(selectedLine);
    onChange(selectedLine, isCustom);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setQuery(newText);
    setIsOpen(true);
    // Notificar al padre directamente con el texto que escribe el usuario
    const match = availableLines.find(l => l.toLowerCase() === newText.trim().toLowerCase());
    onChange(newText, !match);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setQuery("");
    onChange("", false);
    inputRef.current?.focus();
    setIsOpen(true);
  };

  const isDark = variant === "dark";
  const defaultPlaceholder = isFreeText
    ? "Ej: Picanto, Odyssey, Civic..."
    : `Busca o escribe el modelo (ej: ${availableLines.slice(0, 2).join(", ") || "Civic"}...)`;

  // Estilos según el theme (Dark para landing, Light para marketplace)
  const inputBg = isDark
    ? "bg-slate-900 border-white/15 text-white placeholder-slate-500 focus:ring-emerald-400 focus:border-emerald-400"
    : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-emerald-500 focus:border-emerald-500";

  const dropdownBg = isDark
    ? "bg-slate-950 border-white/15 text-white shadow-2xl"
    : "bg-white border-slate-200 text-slate-800 shadow-xl";

  const itemHover = isDark ? "hover:bg-slate-800 text-slate-200" : "hover:bg-slate-50 text-slate-700";

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input de búsqueda / escritura directa */}
      <div className="relative">
        <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${isDark ? "text-slate-400" : "text-slate-400"}`} />
        <input
          ref={inputRef}
          type="text"
          required={required}
          value={query}
          placeholder={placeholder || defaultPlaceholder}
          onFocus={() => setIsOpen(true)}
          onChange={handleInputChange}
          className={`w-full rounded-xl border pl-10 pr-16 py-2.5 text-sm font-medium outline-none transition-all ${inputBg}`}
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className={`p-1 rounded-full transition-colors ${
                isDark ? "hover:bg-white/10 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              }`}
              title="Borrar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {!isFreeText && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(prev => !prev);
                inputRef.current?.focus();
              }}
              className={`p-1 rounded-full transition-colors ${
                isDark ? "hover:bg-white/10 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              }`}
            >
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {/* Indicador sutil de modelo personalizado o conocido */}
      {query.trim().length > 0 && !isOpen && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
          {exactMatch ? (
            <span className="text-emerald-500 font-semibold flex items-center gap-1">
              <Check className="w-3 h-3" /> Modelo verificado de {brand}
            </span>
          ) : (
            <span className={isDark ? "text-amber-400 font-medium flex items-center gap-1" : "text-amber-600 font-medium flex items-center gap-1"}>
              <Sparkles className="w-3 h-3" /> Modelo personalizado para {brand}
            </span>
          )}
        </div>
      )}

      {/* Dropdown de opciones y sugerencias */}
      {isOpen && !isFreeText && (
        <div className={`absolute z-50 left-0 right-0 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border p-2 animate-in fade-in slide-in-from-top-1 duration-150 ${dropdownBg}`}>
          {/* Opción destacada para usar el texto exacto escrito si no existe en la lista */}
          {query.trim().length > 0 && !exactMatch && (
            <button
              type="button"
              onClick={() => handleSelect(query.trim(), true)}
              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs font-semibold mb-1.5 border transition-all ${
                isDark
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              <span className="flex items-center gap-2">
                <Plus className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>
                  Usar <strong className="font-bold underline">{query.trim()}</strong>
                </span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950">
                Nuevo
              </span>
            </button>
          )}

          {/* Listado de modelos coincidentes */}
          {filteredLines.length > 0 ? (
            <div className="space-y-0.5">
              <div className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Modelos populares de {brand}:
              </div>
              {filteredLines.map(line => {
                const isSelected = value.trim().toLowerCase() === line.toLowerCase();
                return (
                  <button
                    key={line}
                    type="button"
                    onClick={() => handleSelect(line, false)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors ${itemHover} ${
                      isSelected
                        ? isDark
                          ? "bg-slate-800 text-emerald-400 font-bold"
                          : "bg-emerald-50 text-emerald-700 font-bold"
                        : ""
                    }`}
                  >
                    <span>{line}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={`p-3 text-center text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              <p>No hay modelos sugeridos con "{query}".</p>
              <p className="text-[11px] mt-1 text-emerald-500 font-medium">
                Presiona "Usar {query}" arriba para guardarlo de todas formas.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
