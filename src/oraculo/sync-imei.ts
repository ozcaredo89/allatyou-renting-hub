import { supabase } from '../lib/supabase';
import { extractPrivateToken } from "./auto-auth";
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const GPSCENTER_API = "https://real.gpscenter.xyz";
const CID = "1342693";

/**
 * Obtiene la lista completa de dispositivos GPS desde Protrack (API Interna WEB)
 * e intenta vincular los IMEIs con las Placas registradas en Supabase.
 */
export async function syncGpsImeis() {
    console.log("==========================================");
    console.log("[SYNC-IMEI] Iniciando emparejamiento Automático de Flota...");

    try {
        const token = await extractPrivateToken();
        if (!token) throw new Error("Puppeteer no devolvió un token válido.");

        const t = Date.now();
        const mapUrl = `${GPSCENTER_API}/LocationService?method=customerDeviceAndGpsone&maptype=google&customerid=${CID}&token=${token}&version=2&lang=es-es&fromweb=1&timezone=-18000&_t=${t}`;

        const response = await fetch(mapUrl, {
            headers: {
                "Accept": "*/*",
                "Referer": `https://real.gpscenter.xyz/V2/dist/index.html?id=${CID}&lang=es-es&token=${token}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
            }
        });

        let txt = await response.text();
        if (txt.includes("jsonp")) {
            txt = txt.replace(/jsonp\d+\(/, "").slice(0, -1);
        }

        const data = JSON.parse(txt);
        if (!data.records || !Array.isArray(data.records)) {
            console.error("[SYNC-IMEI] La API de Protrack no devolvió registros válidos.");
            return;
        }

        const devices = data.records;
        console.log(`[SYNC-IMEI] 📡 Se encontraron ${devices.length} dispositivos en Protrack.`);

        // Buscar vehículos locales que no tengan IMEI
        const { data: localVehicles, error } = await supabase
            .from('vehicles')
            .select('plate')
            .is('gps_imei', null);

        if (error) throw error;

        if (!localVehicles || localVehicles.length === 0) {
            console.log("[SYNC-IMEI] Todos los vehículos de la base de datos ya tienen IMEI asignado.");
            return;
        }

        console.log(`[SYNC-IMEI] 🚗 Buscando match para ${localVehicles.length} vehículos sin IMEI...`);

        let matchedCount = 0;

        for (const local of localVehicles) {
            // Limpiamos la placa local para la búsqueda (Ej: DBC859)
            const searchPlate = local.plate.replace(/\s/g, '').toUpperCase();

            // Buscar en Protrack por carnumber o devicename
            const match = devices.find((d: any) => {
                const pCarNum = (d.carnumber || "").replace(/\s/g, '').toUpperCase();
                const pDevName = (d.devicename || "").replace(/\s/g, '').toUpperCase();
                return pCarNum.includes(searchPlate) || pDevName.includes(searchPlate);
            });

            if (match && match.imei) {
                console.log(`   💚 [MATCH] Placa ${local.plate} => IMEI: ${match.imei}`);

                // Actualizar localmente
                await supabase
                    .from('vehicles')
                    .update({ gps_imei: match.imei })
                    .eq('plate', local.plate);

                matchedCount++;
            } else {
                console.log(`   🔸 [NULL] Placa ${local.plate} no se encontró en Protrack.`);
            }
        }

        console.log(`[SYNC-IMEI] ✅ Proceso completado. ${matchedCount} GPS vinculados exitosamente.`);

    } catch (error) {
        console.error("[SYNC-IMEI] Error Fatal:", error);
    }
}

// Ejecutar si se llama directo desde CMD
if (require.main === module) {
    syncGpsImeis().then(() => process.exit(0));
}
