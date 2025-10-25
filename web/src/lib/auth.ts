// web/src/lib/auth.ts

// Guarda/recupera el header Authorization Basic en sessionStorage
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

// Elimina las credenciales guardadas (útil si el server responde 401/403)
export function clearBasicAuth(): void {
  sessionStorage.removeItem("ba");
}

// Helper de fetch que añade Authorization automáticamente
export async function requestWithBasicAuth(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = ensureBasicAuth();
  const headers = new Headers(init.headers || {});
  if (!headers.has("Authorization")) {
    headers.set("Authorization", token);
  }
  return fetch(input, { ...init, headers });
}
