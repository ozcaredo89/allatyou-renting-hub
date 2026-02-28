import express, { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.ORACLE_API_PORT || 3005;

// La llave maestra que le darás a tus clientes para que puedan consultar tu Data-as-a-Service
// En producción, esto debería validar contra una tabla de `clients` en la BD
const VALID_API_KEYS = [
    "ORACLE-CLIENT-KEY-987654321", // Cliente A: Logística Empresa X
    "ORACLE-CLIENT-KEY-123456789"  // Cliente B: Inversionista Y
];

// Middleware de Autenticación DaaS
app.use((req, res, next) => {
    const clientKey = req.headers['x-api-key'] as string;

    if (!clientKey || !VALID_API_KEYS.includes(clientKey)) {
        return res.status(401).json({
            error: "No Autorizado",
            message: "API Key inválida o inexistente. Adquiera una suscripción a The Oracle Nodes."
        });
    }

    next();
});

// Endpoint Principal Financiero: Extrae las métricas Semanales de los Nodos Comerciales
app.get('/api/v1/market-intelligence/nodes', async (req: Request, res: Response) => {
    try {
        const { category, limit = 50 } = req.query;

        let query = supabase
            .from('oracle_weekly_stats')
            .select('*')
            .order('week_start', { ascending: false })
            .order('total_events', { ascending: false })
            .limit(Number(limit));

        // Si el cliente pagó por un filtro específico (ej. "Solo Logística" o "Solo Retail")
        if (category && typeof category === 'string') {
            query = query.eq('category', category);
        }

        const { data, error } = await query;

        if (error) throw error;

        return res.status(200).json({
            status: "success",
            count: data?.length || 0,
            metadata: {
                source: "The Oracle Nodes Intelligence Engine",
                timestamp: new Date().toISOString()
            },
            data: data
        });

    } catch (err: any) {
        console.error("[DAAS-API] Fallo respondiendo reporte:", err.message);
        return res.status(500).json({ error: "Fallo Interno del Motor Oráculo" });
    }
});

// Arrancar el Servidor DaaS
export function startMonetizationApi() {
    app.listen(PORT, () => {
        console.log("==========================================");
        console.log(`📡 [DAAS-API] The Oracle Nodes REST API Online`);
        console.log(`   - Puerto: ${PORT}`);
        console.log(`   - Endpoint: http://localhost:${PORT}/api/v1/market-intelligence/nodes`);
        console.log(`   - Auth: Requiere Header 'x-api-key'`);
        console.log("==========================================");
    });
}

// startMonetizationApi();
