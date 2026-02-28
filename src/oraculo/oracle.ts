import { extractPrivateToken } from "./auto-auth";

// Utilizamos el endpoint no documentado extraído por ingeniería inversa
// ya que la API oficial deniega acceso a esta sub-cuenta (Error 10007).
const GPSCENTER_API = "https://real.gpscenter.xyz";
const CID = "1342693";

export interface TelemetryData {
    imei: string;
    speed: number;
    accstatus: number; // 1: ON, 0: OFF
    latitude: number;
    longitude: number;
    gpstime: number;
}

/**
 * Oráculo Ingesta: Ejecuta el polling sobre el endpoint interno del mapa web.
 * Trae la flota completa de un solo golpe.
 */
export async function getFleetTelemetry(): Promise<TelemetryData[]> {
    try {
        // 1. Ejecutar el Automator (Puppeteer) para extraer token fresco de la web
        console.log("[ORACLE-INGESTA] Solicitando token fresco vía Puppeteer...");
        const token = await extractPrivateToken();
        if (!token) throw new Error("Puppeteer no devolvió un token válido.");

        // 2. Armar la URL mágica extraída del network panel
        const t = Date.now();
        const mapUrl = `${GPSCENTER_API}/LocationService?method=customerDeviceAndGpsone&maptype=google&customerid=${CID}&token=${token}&version=2&lang=es-es&fromweb=1&timezone=-18000&_t=${t}`;

        // 3. Spoofer los Headers para fingir que somos Chrome
        const response = await fetch(mapUrl, {
            headers: {
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
                "Connection": "keep-alive",
                "Referer": `https://real.gpscenter.xyz/V2/dist/index.html?id=${CID}&lang=es-es&token=${token}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
                "sec-ch-ua": `"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"`,
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": `"Windows"`
            }
        });

        let txt = await response.text();

        if (txt.includes("jsonp")) {
            txt = txt.replace(/jsonp\d+\(/, "");
            txt = txt.substring(0, txt.length - 1);
        }

        const data = JSON.parse(txt);

        if (!data.records || !Array.isArray(data.records)) {
            throw new Error(`Track query failed or returned no array. Raw JSON: ${txt.substring(0, 100)}`);
        }

        // Filtrar y retornar solo la información crucial que necesitamos
        const validTelemetry: TelemetryData[] = data.records
            .map((r: any) => ({
                imei: r.imei || r.i,
                speed: typeof r.speed !== 'undefined' ? r.speed : r.s,
                accstatus: typeof r.accstatus !== 'undefined' ? r.accstatus : r.ac,
                latitude: typeof r.lat !== 'undefined' ? r.lat : r.la,
                longitude: typeof r.lng !== 'undefined' ? r.lng : r.lo,
                gpstime: typeof r.gpstime !== 'undefined' ? r.gpstime : r.gt
            }))
            // Limpieza Estocástica Base: Descartar saltos GPS o coordenadas nulas
            .filter((t: TelemetryData) => t.speed <= 120 && t.latitude !== 0 && t.longitude !== 0);

        return validTelemetry;

    } catch (error) {
        console.error("[ORACLE-INGESTA] Fallo obteniendo telemetría clandestina:", error);
        throw error;
    }
}

// ============================================================================
// SIMULACIÓN DE CASO DE USO (Para probar localmente)
// ============================================================================
export async function runOracleDiagnostic() {
    console.log("Iniciando Diagnóstico Masivo del Oráculo...");
    try {
        const telemetry = await getFleetTelemetry();
        console.log(`📡 Se extrajeron ${telemetry.length} vehículos limpios de la API Privada.`);

        // Filtro Analítico Rápido
        const parados = telemetry.filter(t => t.speed === 0 && t.accstatus === 0);
        const trafico = telemetry.filter(t => t.speed === 0 && t.accstatus === 1);
        const moviendose = telemetry.filter(t => t.speed > 0);

        console.log(`📊 Estatus de Flota (Tiempo Real):`);
        console.log(`   - 🛑 Motor Apagado (Potencial Descarga): ${parados.length}`);
        console.log(`   - 🚦 Ruido por Tráfico (Speed 0, ACC on): ${trafico.length}`);
        console.log(`   - 🛣️ En Tránsito: ${moviendose.length}`);

        if (parados.length > 0) {
            console.log("   --> Nodos detectados para cruce espacial:", parados.map(p => p.imei).join(", "));
        }

    } catch (err) {
        console.error("Fallo durante el ciclo de Diagnóstico", err);
    }
}

// Descomenta para probar unitariamente
runOracleDiagnostic();
