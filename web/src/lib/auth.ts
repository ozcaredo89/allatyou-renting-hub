// web/src/lib/auth.ts
export function ensureBasicAuth(): string {
  let token = sessionStorage.getItem("ba");
  if (!token) {
    const u = prompt("Admin user:");
    const p = prompt("Admin password:");
    if (!u || !p) throw new Error("Auth required");
    token = "Basic " + btoa(`${u}:${p}`);
    sessionStorage.setItem("ba", token);
  }
  return token;
}
