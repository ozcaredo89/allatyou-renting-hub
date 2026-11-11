import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Rotate3d,
  Plus,
  Camera,
  Image as ImageIcon,
  X,
  Trash2,
  Check,
  AlertTriangle,
  Sparkles,
  Eye,
  History,
  MapPin,
  ChevronRight,
  Layers,
} from "lucide-react";
import { compressImage } from "../utils/compressImage";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

export type DamageCategory = "body" | "bumper" | "glass" | "lights" | "wheels" | "interior";
export type DamageSeverity = "leve" | "medio" | "grave";

export interface VehicleDamagePoint {
  id: string;
  point3d: { x: number; y: number; z: number };
  normal3d?: { x: number; y: number; z: number };
  viewMode: "exterior" | "interior";
  zoneId: string;
  zoneLabel: string;
  category: DamageCategory;
  tags: string[];
  severity: DamageSeverity;
  note?: string;
  photoUrl?: string;
  createdAt?: string;
  author?: string;
}

const CATEGORY_LABELS: Record<DamageCategory, string> = {
  body: "Latonería / Pintura",
  bumper: "Bompers / Plásticos",
  glass: "Vidrios y Espejos",
  lights: "Farolas y Stops",
  wheels: "Llantas y Rines",
  interior: "Interior y Tapicería",
};

const CATEGORY_QUICK_TAGS: Record<DamageCategory, string[]> = {
  body: [
    "Rayón",
    "Hundido / Abolladura",
    "Daño de pintura",
    "Peladura / Descascarado",
    "Descuadre",
    "Óxido",
    "Golpe fuerte",
  ],
  bumper: [
    "Rayón",
    "Hundido",
    "Daño de pintura",
    "Fisura / Partido",
    "Descolgado / Suelto",
    "Roce inferior / Andén",
    "Falta tapa / pieza",
  ],
  glass: [
    "Picado (Piedra)",
    "Fisura / Grieta",
    "Rayado",
    "Polarizado dañado",
    "Carcasa rayada / rota",
    "Luna rota / Faltante",
  ],
  lights: [
    "Lente rayado",
    "Partido / Fisurado",
    "Humedad interna",
    "Opaco / Quemado",
    "Soporte suelto",
    "Bombillo fundido",
  ],
  wheels: [
    "Rin rayado (Andén)",
    "Rin golpeado / doblado",
    "Llanta lisa / Desgaste",
    "Chichón / Protuberancia",
    "Corte lateral",
    "Falta copa / perno",
  ],
  interior: [
    "Mancha en tapicería",
    "Rasgadura / Roto",
    "Quemadura",
    "Plástico rayado / partido",
    "Botón desgastado / suelto",
    "Desgaste por uso",
  ],
};

const SEVERITY_META: Record<
  DamageSeverity,
  { label: string; colorHex: string; badgeClass: string; ringClass: string }
> = {
  leve: {
    label: "Leve",
    colorHex: "#f59e0b",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
    ringClass: "ring-amber-500 bg-amber-50 border-amber-400 text-amber-900",
  },
  medio: {
    label: "Medio",
    colorHex: "#f97316",
    badgeClass: "bg-orange-100 text-orange-800 border-orange-300",
    ringClass: "ring-orange-500 bg-orange-50 border-orange-400 text-orange-900",
  },
  grave: {
    label: "Grave",
    colorHex: "#e11d48",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
    ringClass: "ring-rose-600 bg-rose-50 border-rose-400 text-rose-900",
  },
};

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Face3D {
  verts: [Vec3, Vec3, Vec3, Vec3];
  zoneId: string;
  zoneLabel: string;
  category: DamageCategory;
  baseColor: string;
  mode: "exterior" | "interior" | "both";
   preferredCamera: { yaw: number; pitch: number };
}

interface ZoneMeta {
  zoneId: string;
  zoneLabel: string;
  category: DamageCategory;
  mode: "exterior" | "interior";
  preferredCamera: { yaw: number; pitch: number };
}

// Geometría 3D paramétrica del vehículo (X = ancho [-1..1], Y = alto [0..1.55], Z = largo [+2.25 frente .. -2.25 atrás])
function buildVehicleFaces(): { faces: Face3D[]; zones: Record<string, ZoneMeta> } {
  const faces: Face3D[] = [];
  const zones: Record<string, ZoneMeta> = {};

  const addQuad = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    zoneId: string,
    zoneLabel: string,
    category: DamageCategory,
    baseColor: string,
    preferredCamera: { yaw: number; pitch: number },
    mode: "exterior" | "interior" | "both" = "exterior"
  ) => {
    faces.push({
      verts: [
        { x: p0[0], y: p0[1], z: p0[2] },
        { x: p1[0], y: p1[1], z: p1[2] },
        { x: p2[0], y: p2[1], z: p2[2] },
        { x: p3[0], y: p3[1], z: p3[2] },
      ],
      zoneId,
      zoneLabel,
      category,
      baseColor,
      mode,
      preferredCamera,
    });
    if (!zones[zoneId]) {
      zones[zoneId] = {
        zoneId,
        zoneLabel,
        category,
        mode: mode === "interior" ? "interior" : "exterior",
        preferredCamera,
      };
    }
  };

  // Colores base elegantes tipo estudio automotriz
  const BODY_MAIN = "#cbd5e1";
  const BODY_PANEL = "#d8e0ea";
  const BODY_ROOF = "#e2e8f0";
  const BUMPER_COL = "#94a3b8";
  const GLASS_COL = "#38bdf8";
  const HEADLIGHT_COL = "#fef08a";
  const TAILLIGHT_COL = "#fb7185";
  const WHEEL_COL = "#334155";
  const RIM_COL = "#94a3b8";

  // --- FRENTE ---
  addQuad(
    [-0.86, 0.22, 2.22],
    [0.86, 0.22, 2.22],
    [0.88, 0.56, 2.18],
    [-0.88, 0.56, 2.18],
    "front_bumper",
    "Bomper Delantero",
    "bumper",
    BUMPER_COL,
    { yaw: 0, pitch: 0.28 }
  );
  // Esquinas bomper delantero
  addQuad(
    [-0.95, 0.22, 1.92],
    [-0.86, 0.22, 2.22],
    [-0.88, 0.56, 2.18],
    [-0.95, 0.58, 1.92],
    "front_bumper",
    "Bomper Delantero",
    "bumper",
    BUMPER_COL,
    { yaw: -0.45, pitch: 0.28 }
  );
  addQuad(
    [0.86, 0.22, 2.22],
    [0.95, 0.22, 1.92],
    [0.95, 0.58, 1.92],
    [0.88, 0.56, 2.18],
    "front_bumper",
    "Bomper Delantero",
    "bumper",
    BUMPER_COL,
    { yaw: 0.45, pitch: 0.28 }
  );
  // Parrilla / Persiana
  addQuad(
    [-0.5, 0.56, 2.19],
    [0.5, 0.56, 2.19],
    [0.48, 0.78, 2.1],
    [-0.48, 0.78, 2.1],
    "grille",
    "Persiana / Parrilla Frontal",
    "bumper",
    "#475569",
    { yaw: 0, pitch: 0.25 }
  );
  // Farolas Delanteras (Izq = -X, Der = +X)
  addQuad(
    [-0.88, 0.56, 2.18],
    [-0.5, 0.56, 2.19],
    [-0.48, 0.78, 2.1],
    [-0.86, 0.78, 2.04],
    "headlight_l",
    "Farola Delantera Izq.",
    "lights",
    HEADLIGHT_COL,
    { yaw: -0.35, pitch: 0.28 }
  );
  addQuad(
    [0.5, 0.56, 2.19],
    [0.88, 0.56, 2.18],
    [0.86, 0.78, 2.04],
    [0.48, 0.78, 2.1],
    "headlight_r",
    "Farola Delantera Der.",
    "lights",
    HEADLIGHT_COL,
    { yaw: 0.35, pitch: 0.28 }
  );

  // --- CAPÓ ---
  addQuad(
    [-0.86, 0.78, 2.06],
    [0.86, 0.78, 2.06],
    [0.84, 0.92, 0.92],
    [-0.84, 0.92, 0.92],
    "hood",
    "Capó",
    "body",
    BODY_MAIN,
    { yaw: 0, pitch: 0.55 }
  );

  // --- PARABRISAS DELANTERO ---
  addQuad(
    [-0.8, 0.92, 0.9],
    [0.8, 0.92, 0.9],
    [0.72, 1.44, 0.18],
    [-0.72, 1.44, 0.18],
    "windshield",
    "Parabrisas Delantero",
    "glass",
    GLASS_COL,
    { yaw: 0, pitch: 0.45 }
  );

  // --- TECHO ---
  addQuad(
    [-0.72, 1.44, 0.18],
    [0.72, 1.44, 0.18],
    [0.7, 1.42, -1.05],
    [-0.7, 1.42, -1.05],
    "roof",
    "Techo / Capota",
    "body",
    BODY_ROOF,
    { yaw: 0, pitch: 1.25 }
  );

  // --- PANORÁMICO TRASERO ---
  addQuad(
    [-0.7, 1.42, -1.05],
    [0.7, 1.42, -1.05],
    [0.78, 0.96, -1.68],
    [-0.78, 0.96, -1.68],
    "rear_window",
    "Panorámico Trasero",
    "glass",
    GLASS_COL,
    { yaw: Math.PI, pitch: 0.45 }
  );

  // --- BAÚL / COMPUERTA TRASERA ---
  addQuad(
    [-0.82, 0.96, -1.68],
    [0.82, 0.96, -1.68],
    [0.84, 0.86, -2.14],
    [-0.84, 0.86, -2.14],
    "trunk",
    "Baúl / Compuerta Trasera",
    "body",
    BODY_MAIN,
    { yaw: Math.PI, pitch: 0.5 }
  );
  addQuad(
    [-0.52, 0.56, -2.18],
    [0.52, 0.56, -2.18],
    [0.52, 0.86, -2.14],
    [-0.52, 0.86, -2.14],
    "trunk",
    "Baúl / Compuerta Trasera",
    "body",
    BODY_PANEL,
    { yaw: Math.PI, pitch: 0.3 }
  );

  // --- STOPS TRASEROS ---
  addQuad(
    [-0.86, 0.58, -2.16],
    [-0.52, 0.58, -2.18],
    [-0.52, 0.86, -2.14],
    [-0.84, 0.86, -2.14],
    "taillight_l",
    "Stop Trasero Izq.",
    "lights",
    TAILLIGHT_COL,
    { yaw: -2.75, pitch: 0.3 }
  );
  addQuad(
    [0.52, 0.58, -2.18],
    [0.86, 0.58, -2.16],
    [0.84, 0.86, -2.14],
    [0.52, 0.86, -2.14],
    "taillight_r",
    "Stop Trasero Der.",
    "lights",
    TAILLIGHT_COL,
    { yaw: 2.75, pitch: 0.3 }
  );

  // --- BOMPER TRASERO ---
  addQuad(
    [-0.86, 0.24, -2.2],
    [0.86, 0.24, -2.2],
    [0.86, 0.58, -2.16],
    [-0.86, 0.58, -2.16],
    "rear_bumper",
    "Bomper Trasero",
    "bumper",
    BUMPER_COL,
    { yaw: Math.PI, pitch: 0.28 }
  );
  addQuad(
    [-0.95, 0.24, -1.88],
    [-0.86, 0.24, -2.2],
    [-0.86, 0.58, -2.16],
    [-0.95, 0.6, -1.88],
    "rear_bumper",
    "Bomper Trasero",
    "bumper",
    BUMPER_COL,
    { yaw: -2.6, pitch: 0.28 }
  );
  addQuad(
    [0.86, 0.24, -2.2],
    [0.95, 0.24, -1.88],
    [0.95, 0.6, -1.88],
    [0.86, 0.58, -2.16],
    "rear_bumper",
    "Bomper Trasero",
    "bumper",
    BUMPER_COL,
    { yaw: 2.6, pitch: 0.28 }
  );

  // --- LADO IZQUIERDO (CONDUCTOR, X negativo) ---
  // Guardafango delantero izq
  addQuad(
    [-0.96, 0.28, 1.92],
    [-0.96, 0.28, 0.88],
    [-0.88, 0.9, 0.88],
    [-0.88, 0.78, 1.98],
    "fender_fl",
    "Guardafango Delantero Izq.",
    "body",
    BODY_PANEL,
    { yaw: -Math.PI / 2, pitch: 0.25 }
  );
  // Puerta delantera izq
  addQuad(
    [-0.96, 0.28, 0.88],
    [-0.96, 0.28, -0.12],
    [-0.88, 0.92, -0.12],
    [-0.88, 0.9, 0.88],
    "door_fl",
    "Puerta Delantera Izq.",
    "body",
    BODY_MAIN,
    { yaw: -Math.PI / 2, pitch: 0.25 }
  );
  // Puerta trasera izq
  addQuad(
    [-0.96, 0.28, -0.12],
    [-0.96, 0.28, -1.05],
    [-0.88, 0.94, -1.05],
    [-0.88, 0.92, -0.12],
    "door_rl",
    "Puerta Trasera Izq.",
    "body",
    BODY_PANEL,
    { yaw: -Math.PI / 2, pitch: 0.25 }
  );
  // Costado trasero izq
  addQuad(
    [-0.96, 0.28, -1.05],
    [-0.95, 0.28, -1.88],
    [-0.86, 0.94, -1.84],
    [-0.88, 0.94, -1.05],
    "quarter_rl",
    "Costado Trasero Izq.",
    "body",
    BODY_MAIN,
    { yaw: -Math.PI / 2, pitch: 0.25 }
  );
  // Estribo izquierdo
  addQuad(
    [-0.96, 0.18, 0.95],
    [-0.96, 0.18, -1.08],
    [-0.96, 0.28, -1.08],
    [-0.96, 0.28, 0.95],
    "rocker_l",
    "Estribo / Zócalo Izq.",
    "body",
    "#64748b",
    { yaw: -Math.PI / 2, pitch: 0.18 }
  );
  // Vidrios laterales izq
  addQuad(
    [-0.87, 0.91, 0.82],
    [-0.87, 0.92, -0.1],
    [-0.73, 1.42, -0.1],
    [-0.73, 1.42, 0.22],
    "window_fl",
    "Vidrio Delantero Izq.",
    "glass",
    GLASS_COL,
    { yaw: -Math.PI / 2, pitch: 0.3 }
  );
  addQuad(
    [-0.87, 0.92, -0.12],
    [-0.87, 0.94, -1.08],
    [-0.72, 1.41, -0.98],
    [-0.73, 1.42, -0.12],
    "window_rl",
    "Vidrio Trasero Izq.",
    "glass",
    GLASS_COL,
    { yaw: -Math.PI / 2, pitch: 0.3 }
  );
  // Espejo retrovisor izq
  addQuad(
    [-1.12, 0.88, 0.72],
    [-0.88, 0.88, 0.72],
    [-0.88, 1.03, 0.58],
    [-1.12, 1.03, 0.58],
    "mirror_l",
    "Espejo Retrovisor Izq.",
    "glass",
    "#64748b",
    { yaw: -Math.PI / 2, pitch: 0.3 }
  );

  // --- LADO DERECHO (COPILOTO, X positivo) ---
  // Guardafango delantero der
  addQuad(
    [0.96, 0.28, 0.88],
    [0.96, 0.28, 1.92],
    [0.88, 0.78, 1.98],
    [0.88, 0.9, 0.88],
    "fender_fr",
    "Guardafango Delantero Der.",
    "body",
    BODY_PANEL,
    { yaw: Math.PI / 2, pitch: 0.25 }
  );
  // Puerta delantera der
  addQuad(
    [0.96, 0.28, -0.12],
    [0.96, 0.28, 0.88],
    [0.88, 0.9, 0.88],
    [0.88, 0.92, -0.12],
    "door_fr",
    "Puerta Delantera Der.",
    "body",
    BODY_MAIN,
    { yaw: Math.PI / 2, pitch: 0.25 }
  );
  // Puerta trasera der
  addQuad(
    [0.96, 0.28, -1.05],
    [0.96, 0.28, -0.12],
    [0.88, 0.92, -0.12],
    [0.88, 0.94, -1.05],
    "door_rr",
    "Puerta Trasera Der.",
    "body",
    BODY_PANEL,
    { yaw: Math.PI / 2, pitch: 0.25 }
  );
  // Costado trasero der
  addQuad(
    [0.95, 0.28, -1.88],
    [0.96, 0.28, -1.05],
    [0.88, 0.94, -1.05],
    [0.86, 0.94, -1.84],
    "quarter_rr",
    "Costado Trasero Der.",
    "body",
    BODY_MAIN,
    { yaw: Math.PI / 2, pitch: 0.25 }
  );
  // Estribo derecho
  addQuad(
    [0.96, 0.18, -1.08],
    [0.96, 0.18, 0.95],
    [0.96, 0.28, 0.95],
    [0.96, 0.28, -1.08],
    "rocker_r",
    "Estribo / Zócalo Der.",
    "body",
    "#64748b",
    { yaw: Math.PI / 2, pitch: 0.18 }
  );
  // Vidrios laterales der
  addQuad(
    [0.87, 0.92, -0.1],
    [0.87, 0.91, 0.82],
    [0.73, 1.42, 0.22],
    [0.73, 1.42, -0.1],
    "window_fr",
    "Vidrio Delantero Der.",
    "glass",
    GLASS_COL,
    { yaw: Math.PI / 2, pitch: 0.3 }
  );
  addQuad(
    [0.87, 0.94, -1.08],
    [0.87, 0.92, -0.12],
    [0.73, 1.42, -0.12],
    [0.72, 1.41, -0.98],
    "window_rr",
    "Vidrio Trasero Der.",
    "glass",
    GLASS_COL,
    { yaw: Math.PI / 2, pitch: 0.3 }
  );
  // Espejo retrovisor der
  addQuad(
    [0.88, 0.88, 0.72],
    [1.12, 0.88, 0.72],
    [1.12, 1.03, 0.58],
    [0.88, 1.03, 0.58],
    "mirror_r",
    "Espejo Retrovisor Der.",
    "glass",
    "#64748b",
    { yaw: Math.PI / 2, pitch: 0.3 }
  );

  // --- LLANTAS Y RINES (Octágonos 3D laterales + banda de rodadura) ---
  const addWheel = (
    cx: number,
    cz: number,
    isLeft: boolean,
    zoneId: string,
    zoneLabel: string
  ) => {
    const rOuter = 0.36;
    const rInner = 0.22;
    const cy = 0.36;
    const xOut = isLeft ? cx - 0.04 : cx + 0.04;
    const xIn = isLeft ? cx + 0.16 : cx - 0.16;
    const camYaw = isLeft ? -Math.PI / 2 : Math.PI / 2;
    const steps = 8;

    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      const z0Out = cz + Math.cos(a0) * rOuter;
      const y0Out = cy + Math.sin(a0) * rOuter;
      const z1Out = cz + Math.cos(a1) * rOuter;
      const y1Out = cy + Math.sin(a1) * rOuter;

      const z0In = cz + Math.cos(a0) * rInner;
      const y0In = cy + Math.sin(a0) * rInner;
      const z1In = cz + Math.cos(a1) * rInner;
      const y1In = cy + Math.sin(a1) * rInner;

      // Cara lateral de la llanta (caucho)
      addQuad(
        [xOut, y0In, z0In],
        [xOut, y0Out, z0Out],
        [xOut, y1Out, z1Out],
        [xOut, y1In, z1In],
        zoneId,
        zoneLabel,
        "wheels",
        WHEEL_COL,
        { yaw: camYaw, pitch: 0.2 },
        "both"
      );

      // Rin central metálico
      addQuad(
        [xOut + (isLeft ? -0.005 : 0.005), cy, cz],
        [xOut + (isLeft ? -0.005 : 0.005), y0In, z0In],
        [xOut + (isLeft ? -0.005 : 0.005), y1In, z1In],
        [xOut + (isLeft ? -0.005 : 0.005), cy, cz],
        zoneId,
        zoneLabel,
        "wheels",
        RIM_COL,
        { yaw: camYaw, pitch: 0.2 },
        "both"
      );

      // Banda de rodadura 3D
      addQuad(
        [xIn, y0Out, z0Out],
        [xOut, y0Out, z0Out],
        [xOut, y1Out, z1Out],
        [xIn, y1Out, z1Out],
        zoneId,
        zoneLabel,
        "wheels",
        "#1e293b",
        { yaw: camYaw, pitch: 0.2 },
        "both"
      );
    }
  };

  addWheel(-0.95, 1.38, true, "wheel_fl", "Llanta / Rin Delantero Izq.");
  addWheel(-0.95, -1.36, true, "wheel_rl", "Llanta / Rin Trasero Izq.");
  addWheel(0.95, 1.38, false, "wheel_fr", "Llanta / Rin Delantero Der.");
  addWheel(0.95, -1.36, false, "wheel_rr", "Llanta / Rin Trasero Der.");

  // --- INTERIOR / CABINA 3D (visible al activar modo "Interior") ---
  // Piso de cabina
  addQuad(
    [-0.82, 0.32, 0.85],
    [0.82, 0.32, 0.85],
    [0.82, 0.32, -1.15],
    [-0.82, 0.32, -1.15],
    "center_console",
    "Piso / Alfombra Cabina",
    "interior",
    "#334155",
    { yaw: 0.6, pitch: 0.95 },
    "interior"
  );
  // Tablero / Consola frontal
  addQuad(
    [-0.8, 0.65, 0.86],
    [0.8, 0.65, 0.86],
    [0.78, 0.94, 0.48],
    [-0.78, 0.94, 0.48],
    "dashboard",
    "Tablero / Consola Frontal",
    "interior",
    "#475569",
    { yaw: 0, pitch: 0.85 },
    "interior"
  );
  // Timón / Volante (Izquierda)
  addQuad(
    [-0.58, 0.78, 0.42],
    [-0.26, 0.78, 0.42],
    [-0.26, 1.04, 0.34],
    [-0.58, 1.04, 0.34],
    "steering",
    "Timón / Volante",
    "interior",
    "#1e293b",
    { yaw: -0.5, pitch: 0.8 },
    "interior"
  );
  // Consola central
  addQuad(
    [-0.16, 0.36, 0.55],
    [0.16, 0.36, 0.55],
    [0.16, 0.68, -0.25],
    [-0.16, 0.68, -0.25],
    "center_console",
    "Consola Central / Palanca",
    "interior",
    "#64748b",
    { yaw: 0, pitch: 1.05 },
    "interior"
  );
  // Silla Conductor (Del. Izq.)
  addQuad(
    [-0.72, 0.48, 0.32],
    [-0.22, 0.48, 0.32],
    [-0.22, 0.52, -0.18],
    [-0.72, 0.52, -0.18],
    "seat_fl",
    "Silla Conductor (Delantera Izq.)",
    "interior",
    "#94a3b8",
    { yaw: -0.7, pitch: 0.9 },
    "interior"
  );
  addQuad(
    [-0.7, 0.52, -0.14],
    [-0.24, 0.52, -0.14],
    [-0.26, 1.12, -0.24],
    [-0.68, 1.12, -0.24],
    "seat_fl",
    "Silla Conductor (Delantera Izq.)",
    "interior",
    "#cbd5e1",
    { yaw: -0.7, pitch: 0.9 },
    "interior"
  );
  // Silla Copiloto (Del. Der.)
  addQuad(
    [0.22, 0.48, 0.32],
    [0.72, 0.48, 0.32],
    [0.72, 0.52, -0.18],
    [0.22, 0.52, -0.18],
    "seat_fr",
    "Silla Copiloto (Delantera Der.)",
    "interior",
    "#94a3b8",
    { yaw: 0.7, pitch: 0.9 },
    "interior"
  );
  addQuad(
    [0.24, 0.52, -0.14],
    [0.7, 0.52, -0.14],
    [0.68, 1.12, -0.24],
    [0.26, 1.12, -0.24],
    "seat_fr",
    "Silla Copiloto (Delantera Der.)",
    "interior",
    "#cbd5e1",
    { yaw: 0.7, pitch: 0.9 },
    "interior"
  );
  // Sillas Traseras
  addQuad(
    [-0.76, 0.5, -0.42],
    [0.76, 0.5, -0.42],
    [0.76, 0.54, -0.95],
    [-0.76, 0.54, -0.95],
    "seat_rear",
    "Sillas Traseras / Cojinería",
    "interior",
    "#94a3b8",
    { yaw: 0.4, pitch: 0.95 },
    "interior"
  );
  addQuad(
    [-0.74, 0.54, -0.92],
    [0.74, 0.54, -0.92],
    [0.72, 1.1, -1.04],
    [-0.72, 1.1, -1.04],
    "seat_rear",
    "Sillas Traseras / Cojinería",
    "interior",
    "#cbd5e1",
    { yaw: 0.4, pitch: 0.95 },
    "interior"
  );
  // Carteras / Paneles Internos Puertas Izq y Der
  addQuad(
    [-0.84, 0.35, 0.75],
    [-0.84, 0.35, -1.0],
    [-0.82, 0.88, -1.0],
    [-0.82, 0.88, 0.75],
    "door_panel_l",
    "Carteras / Tapizado Puertas Izq.",
    "interior",
    "#64748b",
    { yaw: 1.2, pitch: 0.7 },
    "interior"
  );
  addQuad(
    [0.84, 0.35, -1.0],
    [0.84, 0.35, 0.75],
    [0.82, 0.88, 0.75],
    [0.82, 0.88, -1.0],
    "door_panel_r",
    "Carteras / Tapizado Puertas Der.",
    "interior",
    "#64748b",
    { yaw: -1.2, pitch: 0.7 },
    "interior"
  );

  return { faces, zones };
}

// Utilidades matemáticas 3D
const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const norm3 = (v: Vec3): Vec3 => {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

function shadeHexColor(hex: string, factor: number): string {
  const clean = hex.replace("#", "");
  const r = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * factor)));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * factor)));
  return `rgb(${r}, ${g}, ${b})`;
}

// Coordenadas baricéntricas en 2D para interpolar el punto exacto 3D al tocar un triángulo en pantalla
function barycentric2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): [number, number, number] | null {
  const v0x = bx - ax;
  const v0y = by - ay;
  const v1x = cx - ax;
  const v1y = cy - ay;
  const v2x = px - ax;
  const v2y = py - ay;
  const denom = v0x * v1y - v1x * v0y;
  if (Math.abs(denom) < 1e-5) return null;
  const v = (v2x * v1y - v1x * v2y) / denom;
  const w = (v0x * v2y - v2x * v0y) / denom;
  const u = 1 - v - w;
  if (u >= -0.01 && v >= -0.01 && w >= -0.01) {
    return [u, v, w];
  }
  return null;
}

const CAMERA_PRESETS = [
  { id: "iso", label: "360° Libre", yaw: -0.62, pitch: 0.36, mode: "exterior" as const },
  { id: "front", label: "Frente", yaw: 0, pitch: 0.26, mode: "exterior" as const },
  { id: "left", label: "Izquierda", yaw: -Math.PI / 2, pitch: 0.24, mode: "exterior" as const },
  { id: "right", label: "Derecha", yaw: Math.PI / 2, pitch: 0.24, mode: "exterior" as const },
  { id: "back", label: "Atrás", yaw: Math.PI, pitch: 0.26, mode: "exterior" as const },
  { id: "top", label: "Techo", yaw: 0, pitch: 1.32, mode: "exterior" as const },
  { id: "interior", label: "Interior / Cabina", yaw: -0.55, pitch: 0.88, mode: "interior" as const },
];

interface RenderedTri {
  pts2d: [{ x: number; y: number; zCam: number }, { x: number; y: number; zCam: number }, { x: number; y: number; zCam: number }];
  pts3d: [Vec3, Vec3, Vec3];
  normal3d: Vec3;
  avgZ: number;
  face: Face3D;
}

interface ProjectedPin {
  index: number;
  damage: VehicleDamagePoint;
  sx: number;
  sy: number;
  zCam: number;
  isFrontFacing: boolean;
}

interface VehicleDamage3DMapperProps {
  value: VehicleDamagePoint[];
  onChange?: (next: VehicleDamagePoint[]) => void;
  readOnly?: boolean;
  vehiclePlate?: string;
  inspectorName?: string;
  previousDamages?: VehicleDamagePoint[];
  previousInspectionDate?: string | null;
  onViewPhoto?: (url: string, title: string) => void;
}

export default function VehicleDamage3DMapper({
  value = [],
  onChange,
  readOnly = false,
  vehiclePlate,
  inspectorName,
  previousDamages = [],
  previousInspectionDate,
  onViewPhoto,
}: VehicleDamage3DMapperProps) {
  const { faces, zones } = useMemo(() => buildVehicleFaces(), []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewMode, setViewMode] = useState<"exterior" | "interior">("exterior");
  const [activePreset, setActivePreset] = useState<string>("iso");

  // Cámara orbital 360° (yaw libre 0..2PI, pitch entre 0.12 y 1.42)
  const cameraRef = useRef({
    yaw: -0.62,
    pitch: 0.36,
    targetYaw: -0.62,
    targetPitch: 0.36,
    zoom: 1,
  });

  // Referencia de triángulos y pines proyectados en el último frame para hit-testing exacto al tocar
  const renderedTrisRef = useRef<RenderedTri[]>([]);
  const projectedPinsRef = useRef<ProjectedPin[]>([]);
  const hoveredZoneRef = useRef<string | null>(null);
  const [hoveredZoneLabel, setHoveredZoneLabel] = useState<string | null>(null);

  // Estado del daño seleccionado o en creación/edición
  const [selectedDamageId, setSelectedDamageId] = useState<string | null>(null);
  const [draftDamage, setDraftDamage] = useState<VehicleDamagePoint | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Cámara WebRTC integrada para foto de detalle del daño
  const [isDamageCameraOpen, setIsDamageCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const animateToCamera = (yaw: number, pitch: number, mode?: "exterior" | "interior") => {
    // Elegir el camino angular más corto para que el giro sea fluido
    const currentYaw = cameraRef.current.yaw;
    const diff = ((yaw - currentYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    cameraRef.current.targetYaw = currentYaw + diff;
    cameraRef.current.targetPitch = Math.max(0.12, Math.min(1.42, pitch));
    if (mode) setViewMode(mode);
  };

  // Loop de renderizado 3D en Canvas (60fps con interpolación suave de cámara)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let animId = 0;

    const render = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(300, Math.floor(rect.width));
      const height = Math.max(260, Math.floor(rect.height));

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Suavizado de cámara hacia targetYaw / targetPitch
      const cam = cameraRef.current;
      cam.yaw += (cam.targetYaw - cam.yaw) * 0.16;
      cam.pitch += (cam.targetPitch - cam.pitch) * 0.16;

      const cosY = Math.cos(cam.yaw);
      const sinY = Math.sin(cam.yaw);
      const cosP = Math.cos(cam.pitch);
      const sinP = Math.sin(cam.pitch);

      const fov = Math.min(width, height) * 0.92 * cam.zoom;
      const camDist = 6.0;
      const centerY3D = 0.72;

      const project3D = (p: Vec3) => {
        const py = p.y - centerY3D;
        // Rotación Yaw alrededor de Y
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        // Rotación Pitch alrededor de X
        const y2 = py * cosP - z1 * sinP;
        const z2 = py * sinP + z1 * cosP;

        const depth = camDist - z2;
        const scale = fov / Math.max(1.2, depth);
        return {
          x: width / 2 + x1 * scale,
          y: height * 0.54 - y2 * scale,
          zCam: z2,
          scale,
        };
      };

      const rotateVec = (v: Vec3) => {
        const x1 = v.x * cosY - v.z * sinY;
        const z1 = v.x * sinY + v.z * cosY;
        const y2 = v.y * cosP - z1 * sinP;
        const z2 = v.y * sinP + v.z * cosP;
        return { x: x1, y: y2, z: z2 };
      };

      // 1. Fondo tipo estudio automotriz
      const bgGrad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        20,
        width * 0.5,
        height * 0.5,
        Math.max(width, height) * 0.75
      );
      bgGrad.addColorStop(0, "#1e293b");
      bgGrad.addColorStop(1, "#0f172a");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Plataforma circular 360° en el piso (Y = 0)
      ctx.save();
      ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
      ctx.lineWidth = 1;
      for (const radius of [1.65, 2.35, 2.85]) {
        ctx.beginPath();
        const segs = 48;
        for (let i = 0; i <= segs; i++) {
          const ang = (i / segs) * Math.PI * 2;
          const pt = project3D({ x: Math.cos(ang) * radius, y: 0.02, z: Math.sin(ang) * radius });
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
      }

      // Indicadores cardinales en la plataforma (FRENTE, ATRÁS, IZQ, DER)
      const cardinals = [
        { label: "FRENTE", x: 0, z: 2.68, col: "#34d399" },
        { label: "ATRÁS", x: 0, z: -2.68, col: "#94a3b8" },
        { label: "IZQ (COND.)", x: -1.48, z: 0, col: "#94a3b8" },
        { label: "DER (COPIL.)", x: 1.48, z: 0, col: "#94a3b8" },
      ];
      ctx.font = "800 10px system-ui, -apple-system, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const c of cardinals) {
        const p = project3D({ x: c.x, y: 0.02, z: c.z });
        ctx.fillStyle = c.col;
        ctx.fillText(c.label, p.x, p.y);
      }

      // Sombra suave bajo el chasis
      ctx.beginPath();
      const shadowOutline: [number, number][] = [
        [-0.95, 2.15],
        [0.95, 2.15],
        [0.98, -2.15],
        [-0.98, -2.15],
      ];
      shadowOutline.forEach(([sx, sz], idx) => {
        const sp = project3D({ x: sx, y: 0.03, z: sz });
        if (idx === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(2, 6, 23, 0.55)";
      ctx.fill();
      ctx.restore();

      // 3. Construir y ordenar triángulos 3D por profundidad (Painter's Algorithm + iluminación)
      const lightDir = norm3({ x: 0.35, y: 0.82, z: 0.45 });
      const tris: RenderedTri[] = [];

      const activeDraftOrSelectedZone =
        draftDamage?.zoneId ||
        value.find((d) => d.id === selectedDamageId)?.zoneId ||
        hoveredZoneRef.current;

      for (const face of faces) {
        if (viewMode === "exterior" && face.mode === "interior") continue;
        // En modo interior ocultamos el techo y parabrisas/vidrios superiores para poder tocar la cabina
        if (
          viewMode === "interior" &&
          (face.zoneId === "roof" ||
            face.zoneId === "windshield" ||
            face.zoneId === "rear_window" ||
            face.zoneId === "window_fl" ||
            face.zoneId === "window_rl" ||
            face.zoneId === "window_fr" ||
            face.zoneId === "window_rr")
        ) {
          continue;
        }

        const [v0, v1, v2, v3] = face.verts;
        const p0 = project3D(v0);
        const p1 = project3D(v1);
        const p2 = project3D(v2);
        const p3 = project3D(v3);

        const e1 = sub3(v1, v0);
        const e2 = sub3(v2, v0);
        const nWorld = norm3(cross3(e1, e2));

        tris.push({
          pts2d: [p0, p1, p2],
          pts3d: [v0, v1, v2],
          normal3d: nWorld,
          avgZ: (p0.zCam + p1.zCam + p2.zCam) / 3,
          face,
        });
        tris.push({
          pts2d: [p0, p2, p3],
          pts3d: [v0, v2, v3],
          normal3d: nWorld,
          avgZ: (p0.zCam + p2.zCam + p3.zCam) / 3,
          face,
        });
      }

      tris.sort((a, b) => a.avgZ - b.avgZ);
      renderedTrisRef.current = tris;

      // Contar daños por zona para resaltar sutilmente piezas con reporte
      const zoneHasDamage = new Set(value.map((d) => d.zoneId));

      for (const tri of tris) {
        const [a, b, c] = tri.pts2d;
        const nCam = rotateVec(tri.normal3d);
        const facingSign = nCam.z >= 0 ? 1 : -1;
        const effNormal = {
          x: tri.normal3d.x * facingSign,
          y: tri.normal3d.y * facingSign,
          z: tri.normal3d.z * facingSign,
        };
        const diffuse = Math.max(0, dot3(effNormal, lightDir));
        const shade = 0.62 + diffuse * 0.42;

        const isHighlightedZone = activeDraftOrSelectedZone === tri.face.zoneId;
        const hasDmg = zoneHasDamage.has(tri.face.zoneId);

        let fillColor = shadeHexColor(tri.face.baseColor, shade);
        if (isHighlightedZone) {
          fillColor = shadeHexColor("#34d399", 0.78 + diffuse * 0.25);
        } else if (hasDmg && tri.face.category !== "wheels") {
          fillColor = shadeHexColor("#fda4af", 0.72 + diffuse * 0.25);
        }

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();

        ctx.fillStyle = fillColor;
        ctx.fill();

        ctx.strokeStyle = isHighlightedZone
          ? "rgba(16, 185, 129, 0.85)"
          : "rgba(15, 23, 42, 0.32)";
        ctx.lineWidth = isHighlightedZone ? 1.3 : 0.75;
        ctx.stroke();
      }

      // 4. Placa amarilla colombiana en frente y atrás si hay placa seleccionada
      if (vehiclePlate) {
        const drawPlate = (zPos: number, facingFront: boolean) => {
          const nZ = facingFront ? 1 : -1;
          const nRot = rotateVec({ x: 0, y: 0, z: nZ });
          if (nRot.z < 0.05) return; // Ocultar cuando está de espaldas
          const pCenter = project3D({ x: 0, y: 0.4, z: zPos });
          ctx.save();
          const pw = 46;
          const ph = 16;
          ctx.fillStyle = "#facc15";
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(pCenter.x - pw / 2, pCenter.y - ph / 2, pw, ph, 3);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#0f172a";
          ctx.font = "900 9px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(vehiclePlate.slice(0, 7), pCenter.x, pCenter.y + 0.5);
          ctx.restore();
        };
        drawPlate(2.23, true);
        drawPlate(-2.21, false);
      }

      // 5. Dibujar pines 3D numerados (los ya guardados + el punto temporal si se está editando)
      const allPoints = draftDamage
        ? [...value.filter((d) => d.id !== draftDamage.id), draftDamage]
        : value;

      const projPins: ProjectedPin[] = allPoints.map((dmg, idx) => {
        const proj = project3D(dmg.point3d);
        let isFrontFacing = true;
        if (dmg.normal3d) {
          const nr = rotateVec(dmg.normal3d);
          isFrontFacing = nr.z > -0.15;
        }
        return {
          index: idx + 1,
          damage: dmg,
          sx: proj.x,
          sy: proj.y,
          zCam: proj.zCam,
          isFrontFacing,
        };
      });

      // Ordenar para que los pines más cercanos a la cámara se dibujen encima
      const sortedPins = [...projPins].sort((a, b) => a.zCam - b.zCam);
      projectedPinsRef.current = sortedPins;

      for (const pin of sortedPins) {
        const isSelected =
          pin.damage.id === selectedDamageId || pin.damage.id === draftDamage?.id;
        const sevColor = SEVERITY_META[pin.damage.severity || "leve"]?.colorHex || "#f59e0b";

        ctx.save();
        ctx.globalAlpha = pin.isFrontFacing || isSelected ? 1 : 0.38;

        // Halo pulsante si está seleccionado
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(pin.sx, pin.sy, 17, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
          ctx.fill();
        }

        // Círculo del pin
        const radius = isSelected ? 12 : 10;
        ctx.beginPath();
        ctx.arc(pin.sx, pin.sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = sevColor;
        ctx.fill();
        ctx.lineWidth = isSelected ? 2.5 : 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        // Número del pin
        ctx.fillStyle = "#ffffff";
        ctx.font = `900 ${isSelected ? 11 : 10}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(pin.index), pin.sx, pin.sy + 0.5);
        ctx.restore();
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [faces, value, draftDamage, selectedDamageId, viewMode, vehiclePlate]);

  // Interacción táctil y de mouse: Rotar 360° al arrastrar, Marcar punto al tocar
  const dragStateRef = useRef<{
    isDown: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    movedDist: number;
  }>({
    isDown: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    movedDist: 0,
  });

  const findHitOnCanvas = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // 1. Verificar si tocó primero un pin existente (de adelante hacia atrás)
    const pins = projectedPinsRef.current;
    for (let i = pins.length - 1; i >= 0; i--) {
      const p = pins[i];
      const dist = Math.hypot(x - p.sx, y - p.sy);
      if (dist <= 16) {
        return { type: "pin" as const, pin: p };
      }
    }

    // 2. Verificar intersección con los triángulos 3D del vehículo (del más cercano al más lejano)
    const tris = renderedTrisRef.current;
    for (let i = tris.length - 1; i >= 0; i--) {
      const tri = tris[i];
      const [a, b, c] = tri.pts2d;
      const bary = barycentric2D(x, y, a.x, a.y, b.x, b.y, c.x, c.y);
      if (bary) {
        const [u, v, w] = bary;
        const [v0, v1, v2] = tri.pts3d;
        const point3d: Vec3 = {
          x: Number((u * v0.x + v * v1.x + w * v2.x).toFixed(3)),
          y: Number((u * v0.y + v * v1.y + w * v2.y).toFixed(3)),
          z: Number((u * v0.z + v * v1.z + w * v2.z).toFixed(3)),
        };
        return {
          type: "surface" as const,
          point3d,
          normal3d: tri.normal3d,
          face: tri.face,
        };
      }
    }

    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      isDown: true,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      movedDist: 0,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = dragStateRef.current;
    if (!st.isDown) {
      // Hover en desktop para mostrar qué pieza está bajo el cursor
      const hit = findHitOnCanvas(e.clientX, e.clientY);
      if (hit?.type === "surface") {
        hoveredZoneRef.current = hit.face.zoneId;
        setHoveredZoneLabel(hit.face.zoneLabel);
      } else if (hit?.type === "pin") {
        hoveredZoneRef.current = hit.pin.damage.zoneId;
        setHoveredZoneLabel(hit.pin.damage.zoneLabel);
      } else {
        hoveredZoneRef.current = null;
        setHoveredZoneLabel(null);
      }
      return;
    }

    const dx = e.clientX - st.lastX;
    const dy = e.clientY - st.lastY;
    st.lastX = e.clientX;
    st.lastY = e.clientY;
    st.movedDist += Math.hypot(dx, dy);

    if (st.movedDist > 4) {
      setActivePreset("custom");
      cameraRef.current.targetYaw -= dx * 0.011;
      cameraRef.current.yaw = cameraRef.current.targetYaw;
      cameraRef.current.targetPitch = Math.max(
        0.12,
        Math.min(1.42, cameraRef.current.targetPitch + dy * 0.009)
      );
      cameraRef.current.pitch = cameraRef.current.targetPitch;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = dragStateRef.current;
    st.isDown = false;

    // Si casi no arrastró, es un toque (Tap) para seleccionar o marcar un punto en el carro 3D
    if (st.movedDist < 9) {
      const hit = findHitOnCanvas(e.clientX, e.clientY);
      if (!hit) return;

      if (hit.type === "pin") {
        const dmg = hit.pin.damage;
        setSelectedDamageId(dmg.id);
        if (!readOnly) {
          setDraftDamage({ ...dmg });
        }
        const zMeta = zones[dmg.zoneId];
        if (zMeta) {
          animateToCamera(zMeta.preferredCamera.yaw, zMeta.preferredCamera.pitch, dmg.viewMode);
        }
        return;
      }

      if (hit.type === "surface" && !readOnly) {
        const defaultTag = CATEGORY_QUICK_TAGS[hit.face.category]?.[0] || "Rayón";
        const newPoint: VehicleDamagePoint = {
          id: `dmg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          point3d: hit.point3d,
          normal3d: hit.normal3d,
          viewMode,
          zoneId: hit.face.zoneId,
          zoneLabel: hit.face.zoneLabel,
          category: hit.face.category,
          tags: [defaultTag],
          severity: "leve",
          note: "",
          createdAt: new Date().toISOString(),
          author: inspectorName?.trim() || undefined,
        };
        setDraftDamage(newPoint);
        setSelectedDamageId(newPoint.id);
      }
    }
  };

  // --- CÁMARA Y SUBIDA DE FOTO DEL DAÑO ---
  const startDamageCamera = async () => {
    setIsDamageCameraOpen(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setCameraStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
    } catch {
      alert("No pudimos abrir la cámara. Puedes subir la foto desde tu galería.");
      setIsDamageCameraOpen(false);
    }
  };

  const stopDamageCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
    setIsDamageCameraOpen(false);
  };

  const uploadDamagePhotoFile = async (file: File) => {
    if (!draftDamage) return;
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.75,
      });
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("folder", "inspections/damages");

      const res = await fetch(`${API}/uploads`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Error subiendo foto del daño");
      const data = await res.json();
      setDraftDamage((prev) => (prev ? { ...prev, photoUrl: data.url } : null));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No se pudo subir la foto";
      alert(msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const captureDamagePhoto = () => {
    if (!videoRef.current || !photoCanvasRef.current || !draftDamage) return;
    const video = videoRef.current;
    const canvas = photoCanvasRef.current;
    let width = video.videoWidth || 1280;
    let height = video.videoHeight || 720;
    const maxDim = 1400;
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const file = new File([blob], `damage_${draftDamage.zoneId}_${Date.now()}.jpg`, {
              type: "image/jpeg",
            });
            uploadDamagePhotoFile(file);
            stopDamageCamera();
          }
        },
        "image/jpeg",
        0.75
      );
    }
  };

  const handleToggleTag = (tag: string) => {
    if (!draftDamage) return;
    const exists = draftDamage.tags.includes(tag);
    const nextTags = exists
      ? draftDamage.tags.filter((t) => t !== tag)
      : [...draftDamage.tags, tag];
    setDraftDamage({ ...draftDamage, tags: nextTags });
  };

  const handleSaveDraftDamage = () => {
    if (!draftDamage || !onChange) return;
    if (draftDamage.tags.length === 0 && !draftDamage.note?.trim()) {
      alert("Selecciona al menos una etiqueta rápida o escribe el detalle del fallo");
      return;
    }
    const cleanDamage: VehicleDamagePoint = {
      ...draftDamage,
      author: draftDamage.author || inspectorName?.trim() || undefined,
    };
    const existsIdx = value.findIndex((d) => d.id === cleanDamage.id);
    if (existsIdx >= 0) {
      const copy = [...value];
      copy[existsIdx] = cleanDamage;
      onChange(copy);
    } else {
      onChange([...value, cleanDamage]);
    }
    setDraftDamage(null);
  };

  const handleDeleteDamage = (id: string) => {
    if (!onChange) return;
    onChange(value.filter((d) => d.id !== id));
    if (draftDamage?.id === id) setDraftDamage(null);
    if (selectedDamageId === id) setSelectedDamageId(null);
  };

  const handleFocusDamage = (dmg: VehicleDamagePoint) => {
    setSelectedDamageId(dmg.id);
    const zMeta = zones[dmg.zoneId];
    if (zMeta) {
      animateToCamera(zMeta.preferredCamera.yaw, zMeta.preferredCamera.pitch, dmg.viewMode);
    } else if (dmg.point3d) {
      const yaw = Math.atan2(-dmg.point3d.x, dmg.point3d.z);
      animateToCamera(yaw, 0.35, dmg.viewMode);
    }
  };

  const handleImportPreviousDamages = () => {
    if (!onChange || previousDamages.length === 0) return;
    const existingIds = new Set(value.map((d) => d.id));
    const imported = previousDamages
      .filter((d) => !existingIds.has(d.id))
      .map((d) => ({
        ...d,
        id: `prev_${d.id}`,
      }));
    onChange([...value, ...imported]);
  };

  const activeSelectedDamage = useMemo(
    () => value.find((d) => d.id === selectedDamageId) || null,
    [value, selectedDamageId]
  );

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg text-white">
      {/* INPUT OCULTO PARA SUBIR FOTO DE GALERÍA */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            uploadDamagePhotoFile(e.target.files[0]);
            e.target.value = "";
          }
        }}
      />

      {/* HEADER DEL MAPA 3D */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Rotate3d className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
              Croquis 3D 360° de Daños y Novedades
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {readOnly
              ? "Arrastra para girar 360° el vehículo y toca cualquier punto numerado para ver su detalle y foto."
              : "Gira el carro 360° con un dedo y toca sobre cualquier pieza para marcar rayón, hundido, pintura o foto."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
              value.length > 0
                ? "bg-amber-500/20 text-amber-300 border-amber-400/30"
                : "bg-emerald-500/20 text-emerald-300 border-emerald-400/30"
            }`}
          >
            {value.length === 0
              ? "Sin daños marcados"
              : `${value.length} ${value.length === 1 ? "punto marcado" : "puntos marcados"}`}
          </span>
        </div>
      </div>

      {/* BARRA DE ÁNGULOS RÁPIDOS DE CÁMARA + EXT/INT */}
      <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {CAMERA_PRESETS.map((preset) => {
          const isActive = activePreset === preset.id && viewMode === preset.mode;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setActivePreset(preset.id);
                animateToCamera(preset.yaw, preset.pitch, preset.mode);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                isActive
                  ? "bg-emerald-500 text-slate-950 shadow-sm"
                  : "bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              {preset.id === "interior" && <Layers className="w-3.5 h-3.5" />}
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* BOTÓN OPCIONAL PARA CARGAR DAÑOS DE LA INSPECCIÓN ANTERIOR */}
      {!readOnly && previousDamages.length > 0 && (
        <div className="px-4 py-2.5 bg-indigo-950/60 border-b border-indigo-800/50 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-indigo-200">
            <History className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <span>
              La inspección anterior
              {previousInspectionDate
                ? ` (${new Date(previousInspectionDate).toLocaleDateString("es-CO")})`
                : ""}{" "}
              registró <strong>{previousDamages.length}</strong>{" "}
              {previousDamages.length === 1 ? "daño" : "daños"}.
            </span>
          </div>
          <button
            type="button"
            onClick={handleImportPreviousDamages}
            className="px-3 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs transition"
          >
            Traer daños preexistentes
          </button>
        </div>
      )}

      {/* LIENZO INTERACTIVO 3D 360° */}
      <div className="relative select-none">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-full h-[300px] sm:h-[340px] block cursor-grab active:cursor-grabbing touch-none"
        />

        {/* Píldora flotante de sección apuntada o modo actual */}
        <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-slate-900/85 backdrop-blur-sm border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
            <Rotate3d className="w-3.5 h-3.5 text-emerald-400" />
            {viewMode === "interior" ? "Vista Cabina Interior 360°" : "Vista Exterior 360°"}
          </span>
          {hoveredZoneLabel && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/90 text-slate-950 text-[11px] font-black shadow">
              {hoveredZoneLabel}
            </span>
          )}
        </div>

        {/* Leyenda de severidad */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-slate-300">
          <div className="flex items-center gap-3 bg-slate-900/85 backdrop-blur-sm px-3 py-1 rounded-lg border border-slate-800">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Leve
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Medio
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" /> Grave
            </span>
          </div>
          {!readOnly && (
            <span className="hidden sm:inline-block bg-slate-900/85 px-2.5 py-1 rounded-lg border border-slate-800 text-[11px] text-emerald-300 font-bold">
              Toca una pieza para marcar daño
            </span>
          )}
        </div>
      </div>

      {/* PANEL DE EDICIÓN / CREACIÓN DE UN PUNTO DE DAÑO (CUANDO SE TOCA EL CARRO) */}
      {!readOnly && draftDamage && (
        <div className="p-4 sm:p-5 bg-white text-slate-900 border-t-4 border-emerald-500 space-y-4 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                { CATEGORY_LABELS[draftDamage.category] || "Sección Seleccionada" }
              </span>
              <h4 className="text-base sm:text-lg font-black text-slate-900">
                {draftDamage.zoneLabel}
              </h4>
            </div>

            <button
              type="button"
              onClick={() => setDraftDamage(null)}
              className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
              title="Cerrar editor de punto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 1. ETIQUETAS RÁPIDAS CONTEXTUALES SEGÚN LA SECCIÓN */}
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Etiquetas rápidas para {draftDamage.zoneLabel}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(CATEGORY_QUICK_TAGS[draftDamage.category] || CATEGORY_QUICK_TAGS.body).map((tag) => {
                const selected = draftDamage.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 flex items-center gap-1 ${
                      selected
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 text-emerald-400" />}
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. SEVERIDAD DEL DAÑO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                Severidad
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["leve", "medio", "grave"] as DamageSeverity[]).map((sev) => {
                  const meta = SEVERITY_META[sev];
                  const active = draftDamage.severity === sev;
                  return (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setDraftDamage({ ...draftDamage, severity: sev })}
                      className={`py-2 px-2 rounded-xl border text-xs font-extrabold transition-all ${
                        active
                          ? `ring-2 ${meta.ringClass}`
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. FOTO DE EVIDENCIA DEL DAÑO (OPCIONAL) */}
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                Foto de este daño (Opcional)
              </label>
              {draftDamage.photoUrl ? (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 p-2 rounded-xl">
                  <img
                    src={draftDamage.photoUrl}
                    alt={draftDamage.zoneLabel}
                    className="w-12 h-12 rounded-lg object-cover border border-emerald-300"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-emerald-800 truncate">Foto adjunta</p>
                    <button
                      type="button"
                      onClick={() => setDraftDamage({ ...draftDamage, photoUrl: undefined })}
                      className="text-[11px] font-bold text-rose-600 hover:underline"
                    >
                      Quitar foto
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={startDamageCamera}
                    className="py-2 px-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Camera className="w-3.5 h-3.5 text-emerald-600" />
                    {uploadingPhoto ? "Subiendo..." : "Cámara"}
                  </button>
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="py-2 px-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                    Galería
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 4. DESCRIPCIÓN / DETALLE LIBRE */}
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
              Nota o fallo detallado (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej. Rayón de 10 cm cerca a la manija, pintura levantada..."
              value={draftDamage.note || ""}
              onChange={(e) => setDraftDamage({ ...draftDamage, note: e.target.value })}
              className="w-full p-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>

          {/* ACCIONES DEL PUNTO */}
          <div className="flex items-center justify-between gap-2 pt-1">
            {value.some((d) => d.id === draftDamage.id) ? (
              <button
                type="button"
                onClick={() => handleDeleteDamage(draftDamage.id)}
                className="px-3.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-extrabold flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Eliminar punto
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDraftDamage(null)}
                className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold"
              >
                Cancelar
              </button>
            )}

            <button
              type="button"
              disabled={uploadingPhoto}
              onClick={handleSaveDraftDamage}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-md transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              {value.some((d) => d.id === draftDamage.id)
                ? "Actualizar Punto"
                : "Guardar Punto en el Carro"}
            </button>
          </div>
        </div>
      )}

      {/* DETALLE EN MODO SOLO LECTURA CUANDO SE TOCA UN PIN */}
      {readOnly && activeSelectedDamage && (
        <div className="p-4 bg-slate-800/90 border-t border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-white text-slate-900 font-black text-xs flex items-center justify-center">
                {value.findIndex((d) => d.id === activeSelectedDamage.id) + 1}
              </span>
              <span className="font-black text-sm text-white">
                {activeSelectedDamage.zoneLabel}
              </span>
              <span
                className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                  SEVERITY_META[activeSelectedDamage.severity || "leve"]?.badgeClass
                }`}
              >
                {SEVERITY_META[activeSelectedDamage.severity || "leve"]?.label}
              </span>
            </div>
            {activeSelectedDamage.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {activeSelectedDamage.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 rounded-md bg-slate-700 text-slate-100 text-[11px] font-bold"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {activeSelectedDamage.note && (
              <p className="text-xs text-slate-300">{activeSelectedDamage.note}</p>
            )}
          </div>

          {activeSelectedDamage.photoUrl && (
            <button
              type="button"
              onClick={() =>
                onViewPhoto
                  ? onViewPhoto(
                      activeSelectedDamage.photoUrl!,
                      `${activeSelectedDamage.zoneLabel} · ${activeSelectedDamage.tags.join(", ")}`
                    )
                  : window.open(activeSelectedDamage.photoUrl, "_blank")
              }
              className="flex items-center gap-2 bg-slate-900 hover:bg-slate-950 p-1.5 pr-3 rounded-xl border border-slate-700 text-xs font-bold text-emerald-400"
            >
              <img
                src={activeSelectedDamage.photoUrl}
                alt={activeSelectedDamage.zoneLabel}
                className="w-10 h-10 rounded-lg object-cover"
              />
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" /> Ver foto
              </span>
            </button>
          )}
        </div>
      )}

      {/* LISTA RESUMEN DE TODOS LOS PUNTOS MARCADOS */}
      <div className="p-4 bg-slate-950/50 border-t border-slate-800">
        {value.length === 0 ? (
          <div className="text-center py-3 text-xs text-slate-400 flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4 text-slate-500" />
            <span>
              {readOnly
                ? "No se reportaron daños puntuales en la silueta 3D en esta inspección."
                : "Aún no has marcado daños. Gira el carro y toca sobre cualquier pieza si encuentras algún detalle."}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              <span>Puntos registrados ({value.length})</span>
              <span>Toca para enfocar en 3D</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {value.map((dmg, idx) => {
                const sevMeta = SEVERITY_META[dmg.severity || "leve"] || SEVERITY_META.leve;
                const isSelected = dmg.id === selectedDamageId;
                return (
                  <div
                    key={dmg.id}
                    onClick={() => {
                      handleFocusDamage(dmg);
                      if (!readOnly) setDraftDamage({ ...dmg });
                    }}
                    className={`p-3 rounded-xl border transition cursor-pointer flex items-start justify-between gap-2.5 ${
                      isSelected
                        ? "bg-slate-800 border-emerald-500/80 ring-1 ring-emerald-500/50"
                        : "bg-slate-900/90 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className="w-6 h-6 rounded-full text-white font-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5 shadow"
                        style={{ backgroundColor: sevMeta.colorHex }}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs text-white truncate">
                            {dmg.zoneLabel}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${sevMeta.badgeClass}`}
                          >
                            {sevMeta.label}
                          </span>
                        </div>
                        {dmg.tags.length > 0 && (
                          <p className="text-[11px] text-emerald-300 font-semibold mt-0.5 truncate">
                            {dmg.tags.join(" · ")}
                          </p>
                        )}
                        {dmg.note && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{dmg.note}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {dmg.photoUrl && (
                        <img
                          src={dmg.photoUrl}
                          alt={dmg.zoneLabel}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onViewPhoto) {
                              onViewPhoto(
                                dmg.photoUrl!,
                                `${dmg.zoneLabel} · ${dmg.tags.join(", ")}`
                              );
                            } else {
                              window.open(dmg.photoUrl, "_blank");
                            }
                          }}
                          className="w-9 h-9 rounded-lg object-cover border border-slate-600 hover:scale-105 transition"
                          title="Ver foto del daño"
                        />
                      )}
                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteDamage(dmg.id);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE CÁMARA PARA FOTO PUNTUAL DEL DAÑO */}
      {isDamageCameraOpen && (
        <div className="fixed inset-0 z-[90] bg-black flex flex-col">
          <div className="p-4 flex justify-between items-center bg-black/70 absolute top-0 w-full z-10">
            <span className="text-white font-extrabold text-sm">
              Foto de daño · {draftDamage?.zoneLabel}
            </span>
            <button
              type="button"
              onClick={stopDamageCamera}
              className="text-white bg-white/20 p-2 rounded-full"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 relative flex items-center justify-center bg-black">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
            <canvas ref={photoCanvasRef} className="hidden" />
          </div>
          <div className="p-8 bg-black flex justify-center pb-12">
            <button
              type="button"
              onClick={captureDamagePhoto}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:bg-white active:scale-95 transition-all shadow-2xl"
            >
              <div className="w-16 h-16 bg-white rounded-full" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
