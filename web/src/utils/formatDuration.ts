// Formatea una duración en segundos: "05:09" o "1h 05m 09s"
export const formatDuration = (totalSecs: number) => {
  const s = Math.max(0, Math.floor(totalSecs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${pad(m)}m ${pad(sec)}s` : `${pad(m)}:${pad(sec)}`;
};
