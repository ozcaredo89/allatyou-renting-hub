// web/src/components/Logo.tsx

interface LogoProps {
  className?: string;
}

export default function Logo({ className = "h-10 w-auto" }: LogoProps) {
  // El color verde esmeralda usado en la app (tailwind emerald-500)
  const emeraldColor = "#10b981"; 

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 280 60" // Área de dibujo
      fill="none"
      className={className} // Permite ajustar tamaño desde fuera con Tailwind
      aria-label="AllAtYou Renting Hub"
    >
      {/* ICONO GEOMÉTRICO (Flecha/Triángulo Verde) */}
      <path
        d="M35 5L5 55H20L35 30L50 55H65L35 5Z"
        fill={emeraldColor}
      />

      {/* TEXTO "AllAt" (Blanco) */}
      <text
        x="80"
        y="48"
        fill="white"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontWeight="bold"
        fontSize="42"
        letterSpacing="-1"
      >
        AllAt
      </text>

      {/* TEXTO "You" (Verde) */}
      <text
        x="178" // Ajustado para que pegue con el texto anterior
        y="48"
        fill={emeraldColor}
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontWeight="bold"
        fontSize="42"
        letterSpacing="-1"
      >
        You
      </text>
    </svg>
  );
}