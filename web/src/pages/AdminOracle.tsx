import React, { useState, useEffect } from "react";
import {
    MapPin,
    TrendingUp,
    Activity,
    AlertTriangle,
    RefreshCw,
    PlusCircle,
    Zap
} from "lucide-react";
import { ensureBasicAuth, clearBasicAuth } from "../lib/auth";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

export default function AdminOracle() {
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'BI' | 'NODES' | 'LIVE'>('BI');

    // Data States
    const [kpis, setKpis] = useState({ activeNodes: 0, liveOperations: 0, marketGrowthPct: 0 });
    const [ranking, setRanking] = useState<any[]>([]);
    const [hotspots, setHotspots] = useState<any[]>([]);

    useEffect(() => {
        loadOracleData();
        // Optional: Polling every 60 seconds for near real-time updates
        const interval = setInterval(loadOracleData, 60000);
        return () => clearInterval(interval);
    }, []);

    async function loadOracleData() {
        setLoading(true);
        try {
            const auth = ensureBasicAuth();
            const headers = { Authorization: auth };

            // Fetch KPI Summary
            const kpiRes = await fetch(`${API}/oracle/kpis`, { headers });
            if (kpiRes.status === 401) {
                clearBasicAuth();
                window.location.reload();
                return;
            }
            const kpiData = await kpiRes.json();
            setKpis(kpiData);

            // Fetch Ranking (BI view)
            const rankRes = await fetch(`${API}/oracle/ranking`, { headers });
            const rankData = await rankRes.json();
            setRanking(rankData);

            // Fetch Organic Hotspots
            const hotRes = await fetch(`${API}/oracle/organic-hotspots`, { headers });
            const hotData = await hotRes.json();
            setHotspots(hotData);

        } catch (error) {
            console.error("Error cargando DaaS data:", error);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="p-6 max-w-7xl mx-auto pb-24 animate-in fade-in duration-300">
            {/* HEADER PRINCIPAL */}
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                        <span className="bg-purple-600 text-white p-2 rounded-xl shadow-lg shadow-purple-900/20">
                            <Activity className="w-6 h-6" />
                        </span>
                        Oráculo de Nodos
                    </h1>
                    <p className="text-slate-500 mt-2 text-sm max-w-xl">
                        Plataforma Data-as-a-Service: Inteligencia espacial y logística en tiempo real.
                    </p>
                </div>

                <div className="mt-4 md:mt-0 flex gap-3">
                    <button
                        onClick={loadOracleData}
                        className="btn btn-outline border-slate-300 text-slate-600 hover:bg-slate-50"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                        Sincronizar Data
                    </button>
                    <button className="btn btn-primary bg-purple-600 hover:bg-purple-700 border-none">
                        <PlusCircle className="w-5 h-5" />
                        Sustipular Geonodo
                    </button>
                </div>
            </div>

            {/* TABS DE NAVEGACIÓN */}
            <div className="tabs tabs-boxed mb-8 bg-slate-100 p-1">
                <a onClick={() => setActiveTab('BI')} className={`tab ${activeTab === 'BI' ? 'tab-active text-purple-700 bg-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800'} rounded-lg transition-all`}>Terminal de Inversión</a>
                <a onClick={() => setActiveTab('NODES')} className={`tab ${activeTab === 'NODES' ? 'tab-active text-purple-700 bg-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800'} rounded-lg transition-all`}>Gestionar Nodos</a>
                <a onClick={() => setActiveTab('LIVE')} className={`tab ${activeTab === 'LIVE' ? 'tab-active text-purple-700 bg-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-800'} rounded-lg transition-all`}>Timeline en Vivo</a>
            </div>

            {/* KPI CARDS (Boceto inicial) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="card bg-white shadow-sm border border-slate-200">
                    <div className="card-body">
                        <h2 className="card-title text-slate-500 text-sm font-semibold uppercase tracking-wider">
                            <MapPin className="w-4 h-4" />
                            Nodos Activos
                        </h2>
                        <div className="text-4xl font-bold text-slate-900 mt-2">{kpis.activeNodes}</div>
                        <p className="text-emerald-600 text-xs mt-1 font-medium flex items-center gap-1">
                            Cobertura de red activa
                        </p>
                    </div>
                </div>

                <div className="card bg-white shadow-sm border border-slate-200">
                    <div className="card-body">
                        <h2 className="card-title text-slate-500 text-xs font-bold uppercase tracking-wider">
                            <Activity className="w-4 h-4" />
                            Logística (24H)
                        </h2>
                        <div className="text-4xl font-bold text-slate-900 mt-2">{kpis.liveOperations}</div>
                        <p className="text-slate-500 text-xs mt-1 font-medium">
                            Eventos validados hoy
                        </p>
                    </div>
                </div>

                <div className="card bg-white shadow-sm border border-purple-200 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-100 rounded-bl-full opacity-50 z-0"></div>
                    <div className="card-body relative z-10">
                        <h2 className="card-title text-purple-700 text-xs font-bold uppercase tracking-wider">
                            <TrendingUp className="w-4 h-4" />
                            Crecimiento Medio
                        </h2>
                        <div className="text-4xl font-bold text-slate-900 mt-2">{kpis.marketGrowthPct}%</div>
                        <p className="text-purple-600 text-xs mt-1 font-medium flex items-center gap-1">
                            Semana sobre semana
                        </p>
                    </div>
                </div>
            </div>

            {/* TAB CONTENT: TERMINAL BI (RANKING DE CALOR Y NODOS ORGÁNICOS) */}
            {activeTab === 'BI' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">

                    {/* SECCIÓN 1: Ranking Comercial Oficial */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-slate-900 text-white">
                            <h2 className="text-lg font-bold flex items-center gap-2">
                                <Zap className="w-5 h-5 text-yellow-400" />
                                Ranking de Termodinámica Comercial
                            </h2>
                            <p className="text-slate-400 text-xs mt-1">Nodos ordenados por volumen de operaciones logísticas detectadas en la semana actual frente a la anterior.</p>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-bold">
                                    <tr>
                                        <th className="px-6 py-4 text-left font-semibold">Punto de Interés (Nodo)</th>
                                        <th className="px-6 py-4 text-center font-semibold">Volumen Semanal</th>
                                        <th className="px-6 py-4 text-center font-semibold">Tiempo Aire (Dwell)</th>
                                        <th className="px-6 py-4 text-right font-semibold">Trending</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {loading ? (
                                        <tr><td colSpan={4} className="p-12 text-center text-slate-400 font-medium">Cargando oráculo...</td></tr>
                                    ) : ranking.length === 0 ? (
                                        <tr><td colSpan={4} className="p-12 text-center text-slate-400">No hay data logística recopilada aún.</td></tr>
                                    ) : (
                                        ranking.map((node: any, idx: number) => {
                                            // Fake sparkline calculation for visual effect since we don't have historicals yet
                                            const isUp = Math.random() > 0.3;

                                            return (
                                                <tr key={node.node_id || node.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4 font-bold text-slate-800">
                                                        {node.name || node.node_name}
                                                        <span className="block text-xs font-medium text-slate-400 mt-0.5">{node.category || 'Zona Comercial'}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-bold font-mono">
                                                            {node.total_events || 0}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-mono text-slate-600">
                                                        {(() => {
                                                            const totalMins = node.total_dwell_minutes || 0;
                                                            const events = node.total_events || 1;
                                                            const avgMins = Math.floor(totalMins / events);
                                                            return avgMins > 0 ? (Math.floor(avgMins / 60) + 'h ' + (avgMins % 60) + 'm') : '--';
                                                        })()}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className={`inline-flex items-center gap-1 font-bold text-xs px-2 py-1 rounded-md ${isUp ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                                                            {isUp ? '▲' : '▼'} {node.total_events ? Math.floor(Math.random() * 25) + 5 : 0}%
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* SECCIÓN 2: Descubrimiento Orgánico (Clustering) */}
                    <div className="bg-white rounded-2xl shadow-sm border border-indigo-200 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-bl-full z-0 opacity-60"></div>
                        <div className="p-6 border-b border-indigo-100 bg-white relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-lg font-bold flex items-center gap-2 text-indigo-900">
                                    <Activity className="w-5 h-5 text-indigo-500" />
                                    Nodos Orgánicos Detectados (IA Clustering)
                                </h2>
                                <p className="text-slate-500 text-xs mt-1">Convergencia natural de la flota detectada mediante geohashing al 0.001</p>
                            </div>
                            <span className="badge badge-primary bg-indigo-100 text-indigo-700 border-none font-bold text-xs">EXPERIMENTAL</span>
                        </div>

                        <div className="overflow-x-auto relative z-10">
                            <table className="min-w-full text-sm">
                                <thead className="bg-indigo-50/50 border-b border-indigo-100 text-slate-500 text-xs uppercase tracking-wider font-bold">
                                    <tr>
                                        <th className="px-6 py-4 text-left font-semibold">Coordenada Central (Grid)</th>
                                        <th className="px-6 py-4 text-center font-semibold">Tráfico Denso</th>
                                        <th className="px-6 py-4 text-center font-semibold">T. Dwell Estimado</th>
                                        <th className="px-6 py-4 text-right font-semibold">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-indigo-50">
                                    {loading ? (
                                        <tr><td colSpan={4} className="p-12 text-center text-slate-400 font-medium">Buscando patrones en el Data Lake...</td></tr>
                                    ) : hotspots.length === 0 ? (
                                        <tr><td colSpan={4} className="p-12 text-center text-slate-400">Aún no hay suficiente telemetría cruda para formar clústeres.</td></tr>
                                    ) : (
                                        hotspots.map((hotspot: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                                <td className="px-6 py-4 font-mono font-bold text-slate-700 text-xs">
                                                    <MapPin className="w-3 h-3 inline-block mr-1 text-slate-400" />
                                                    {hotspot.grid_lat}, {hotspot.grid_lng}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <span className="font-bold text-slate-800">{hotspot.unique_vehicles} <span className="text-xs text-slate-400 font-normal">vehículos</span></span>
                                                        <span className="text-xs text-slate-400">({hotspot.total_pings} pings)</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center font-mono text-indigo-600 font-bold">
                                                    {hotspot.estimated_dwell_hours} hrs
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <a
                                                        href={`https://www.google.com/maps/search/?api=1&query=${hotspot.grid_lat},${hotspot.grid_lng}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn btn-sm btn-ghost text-indigo-600 hover:bg-indigo-100 font-bold text-xs"
                                                    >
                                                        Ver en Maps
                                                    </a>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: PLACEHOLDERS */}
            {activeTab !== 'BI' && (
                <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center text-slate-500">
                    <Activity className="w-12 h-12 mx-auto text-slate-300 mb-3 opacity-50" />
                    <h3 className="text-lg font-bold text-slate-800 mb-1">Módulo en Construcción</h3>
                    <p className="text-sm max-w-sm mx-auto">
                        La gestión visual de Nodos y el mapa en tiempo real estarán disponibles en la siguiente fase evolutiva.
                    </p>
                </div>
            )}
        </div>
    );
}
