import "dotenv/config";
import crypto from "crypto";

const PROTRACK_API = "https://api.protrack365.com/api";
const ACCOUNT = process.env.PROTRACK_ACCOUNT || "";
const PASSWORD = process.env.PROTRACK_PASSWORD || "";

// Almacén en memoria del token y su expiración
let currentToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Módulo Auth-Quantum: Genera el token MD5 de acceso para la API de Protrack.
 * Calcula la firma usando el algoritmo md5(md5(password) + time).
 */
export async function getAccessToken(): Promise<string> {
    // Retornar de memoria si aún es válido (damos un margen de 5 minutos de seguridad)
    const marginSecs = 300;
    if (currentToken && (Date.now() / 1000) < (tokenExpiresAt - marginSecs)) {
        return currentToken;
    }

    try {
        const time = Math.floor(Date.now() / 1000).toString();

        // 1. md5(password)
        const passMd5 = crypto.createHash('md5').update(PASSWORD).digest('hex');
        // 2. md5(md5(password) + time)
        const signature = crypto.createHash('md5').update(passMd5 + time).digest('hex');

        const url = `${PROTRACK_API}/authorization?time=${time}&account=${ACCOUNT}&signature=${signature}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Protrack Auth Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.code !== 0 || !data.record?.access_token) {
            console.error("RAW PROTRACK RESPONSE:", data);
            throw new Error(`Auth failed with code ${data.code}`);
        }

        currentToken = data.record.access_token;
        // data.record.expires_in viene en segundos (ej: 7200 = 2 horas)
        tokenExpiresAt = Math.floor(Date.now() / 1000) + data.record.expires_in;

        console.log(`[AUTH-QUANTUM] Nuevo Token generado. Expira a las: ${new Date(tokenExpiresAt * 1000).toLocaleString()}`);
        if (!currentToken) throw new Error("Recieved empty token from API");
        return currentToken;
    } catch (error) {
        console.error("[AUTH-QUANTUM] Fallo Crítico de conexión:", error);
        throw error;
    }
}
