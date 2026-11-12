import { useState, useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { ensureBasicAuth } from "../lib/auth";
import { compressImage } from "../utils/compressImage";
import { formatDuration } from "../utils/formatDuration";
import VehicleDamage3DMapper, { type VehicleDamagePoint } from "../components/VehicleDamage3DMapper";
import { Camera, X, Check, Plus, Image as ImageIcon, Gauge, Fuel, Share2, CheckCircle2, RotateCcw, ArrowRight, Timer, Car, Save, Users, Play, Pause, AlertCircle, Search, Wrench, Zap, Droplets } from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

const PHOTO_FIELDS = [
  { key: "front", label: "Frente (Exterior)", section: "Exterior" },
  { key: "back", label: "Atrás (Exterior)", section: "Exterior" },
  { key: "left", label: "Lado Izquierdo", section: "Exterior" },
  { key: "right", label: "Lado Derecho", section: "Exterior" },
  { key: "engine", label: "Motor", section: "Mecánica" },
  { key: "interior_dash", label: "Tablero / Consola", section: "Interior" },
  { key: "interior_front", label: "Sillas Delanteras", section: "Interior" },
  { key: "interior_back", label: "Sillas Traseras", section: "Interior" },
  { key: "tires_front_left", label: "Llanta Delantera Izq.", section: "Llantas" },
  { key: "tires_front_right", label: "Llanta Delantera Der.", section: "Llantas" },
  { key: "tires_back_left", label: "Llanta Trasera Izq.", section: "Llantas" },
  { key: "tires_back_right", label: "Llanta Trasera Der.", section: "Llantas" },
];

const FUEL_OPTIONS = [
  { value: "empty", label: "Vacío", short: "E", pct: "0%", color: "text-rose-600 bg-rose-50 border-rose-300" },
  { value: "1/4", label: "1/4", short: "1/4", pct: "25%", color: "text-amber-600 bg-amber-50 border-amber-300" },
  { value: "1/2", label: "1/2", short: "1/2", pct: "50%", color: "text-yellow-700 bg-yellow-50 border-yellow-300" },
  { value: "3/4", label: "3/4", short: "3/4", pct: "75%", color: "text-emerald-600 bg-emerald-50 border-emerald-300" },
  { value: "full", label: "Lleno", short: "F", pct: "100%", color: "text-emerald-700 bg-emerald-100 border-emerald-400" },
];

interface VehicleOption {
  plate: string;
  driver?: { id?: number; full_name?: string; phone?: string } | null;
  current_mileage?: number | null;
  status?: string;
  brand?: string;
  line?: string;
}

// Etiqueta de modalidad según vehicles.status (Issue #51)
const VEHICLE_STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  leasing: { label: "🚗 Leasing", cls: "bg-amber-100 text-amber-800 border-amber-300 font-black" },
  reserved: { label: "Reservado", cls: "bg-blue-100 text-blue-700 border-blue-200 font-bold" },
  maintenance: { label: "Mantenimiento", cls: "bg-orange-100 text-orange-700 border-orange-200 font-bold" },
};
const VehicleStatusBadge = ({ status, small }: { status?: string; small?: boolean }) => {
  const b = VEHICLE_STATUS_BADGES[status || ""] || { label: "Renting", cls: "bg-slate-100 text-slate-600 border-slate-200 font-bold" };
  return (
    <span className={`${small ? "px-1.5 py-0.5 rounded text-[9px]" : "px-2.5 py-0.5 rounded-full text-[10px]"} uppercase border ${b.cls}`}>
      {b.label}
    </span>
  );
};

interface CreatedInspectionResult {
  id: number;
  vehicle_plate: string;
  driver_id?: number | null;
  driver?: { id?: number; full_name?: string; phone?: string } | null;
  type: string;
  mileage?: number | null;
  fuel_level?: string | null;
  comments?: string | null;
  inspector_name?: string | null;
  photos?: Record<string, string>;
  damages?: VehicleDamagePoint[];
  road_test?: boolean | null;
  electrical_harness_status?: string | null;
  coolant_leaks_status?: string | null;
  duration_seconds?: number | null;
  started_at?: string | null;
  continue_token?: string | null;
  status?: string;
  participants?: string[];
  last_known_mileage?: number | null;
  previous_damages?: VehicleDamagePoint[];
  previous_inspection_date?: string | null;
}

const lastInspectorName = () => {
  try {
    return localStorage.getItem("last_inspector_name") || "";
  } catch {
    return "";
  }
};

const emptyForm = () => ({
  vehicle_plate: "",
  driver_id: "",
  type: "general",
  mileage: "",
  fuel_level: "1/2",
  comments: "",
  inspector_name: lastInspectorName(),
  photos: {} as Record<string, string>,
  damages: [] as VehicleDamagePoint[],
  road_test: null as boolean | null,
  electrical_harness_status: null as string | null,
  coolant_leaks_status: null as string | null,
});

export default function NewInspection() {
  // Si viene :token estamos continuando un borrador compartido (ruta pública, sin Basic Auth)
  const { token: routeToken } = useParams<{ token?: string }>();
  const isContinueMode = !!routeToken;

  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [isVehiclePickerOpen, setIsVehiclePickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  // Guardado exitoso con reporte generado
  const [createdInspection, setCreatedInspection] = useState<CreatedInspectionResult | null>(null);

  // Borrador: token de continuación, inicio de la revisión y participantes
  const [draftToken, setDraftToken] = useState<string | null>(routeToken || null);
  const [startedAt, setStartedAt] = useState<Date>(() => new Date());
  const [hasStarted, setHasStarted] = useState<boolean>(isContinueMode);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [accumulatedSecs, setAccumulatedSecs] = useState<number>(0);
  const [segmentStart, setSegmentStart] = useState<number | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [lastKnownMileage, setLastKnownMileage] = useState<number | null>(null);
  const [previousDamages, setPreviousDamages] = useState<VehicleDamagePoint[]>([]);
  const [previousInspectionDate, setPreviousInspectionDate] = useState<string | null>(null);
  const [draftLoadState, setDraftLoadState] = useState<"idle" | "loading" | "ready" | "completed" | "error">(
    isContinueMode ? "loading" : "idle"
  );
  const [completedId, setCompletedId] = useState<number | null>(null);
  const [savedDraft, setSavedDraft] = useState<CreatedInspectionResult | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Estado del formulario
  const [form, setForm] = useState(emptyForm);

  // Estado para el Action Sheet (Menú Inferior)
  const [actionSheetField, setActionSheetField] = useState<{ key: string; label: string } | null>(null);

  // --- LOGICA DE CÁMARA WEBRTC ---
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Referencia oculta para abrir el selector de archivos nativo
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isContinueMode) return; // quien continúa por enlace no tiene credenciales admin
    const auth = ensureBasicAuth();
    fetch(`${API}/vehicles?status=all`, { headers: { Authorization: auth } })
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return setVehicles([]);
        const operational = data.filter((v: VehicleOption) => v.status !== "sold" && v.status !== "inactive");
        setVehicles(operational);
      })
      .catch((err) => console.error("Error fetching vehicles:", err));
  }, [isContinueMode]);

  // Cargar borrador cuando se abre un enlace de continuación
  useEffect(() => {
    if (!routeToken) return;
    fetch(`${API}/public/inspections/continue/${routeToken}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((d: CreatedInspectionResult) => {
        if (d.status === "completed") {
          setCompletedId(d.id);
          setDraftLoadState("completed");
          return;
        }
        setForm({
          vehicle_plate: d.vehicle_plate,
          driver_id: d.driver_id ? String(d.driver_id) : "",
          type: d.type || "general",
          mileage: d.mileage ? String(d.mileage) : "",
          fuel_level: d.fuel_level || "1/2",
          comments: d.comments || "",
          inspector_name: lastInspectorName(),
          photos: d.photos || {},
          damages: Array.isArray(d.damages) ? d.damages : [],
          road_test: d.road_test ?? null,
          electrical_harness_status: d.electrical_harness_status ?? null,
          coolant_leaks_status: d.coolant_leaks_status ?? null,
        });
        if (d.started_at) setStartedAt(new Date(d.started_at));
        const initialAccum =
          d.duration_seconds != null && d.duration_seconds >= 0
            ? d.duration_seconds
            : d.started_at
            ? Math.max(0, (Date.now() - new Date(d.started_at).getTime()) / 1000)
            : 0;
        setAccumulatedSecs(initialAccum);
        setSegmentStart(Date.now());
        setNowTick(Date.now());
        setIsPaused(false);
        setHasStarted(true);
        setParticipants(d.participants || []);
        setLastKnownMileage(d.last_known_mileage ?? null);
        setPreviousDamages(Array.isArray(d.previous_damages) ? d.previous_damages : []);
        setPreviousInspectionDate(d.previous_inspection_date ?? null);
        setDraftLoadState("ready");
      })
      .catch(() => setDraftLoadState("error"));
  }, [routeToken]);

  // Cronómetro visible de la revisión (solo corre cuando se ha iniciado y no está en pausa)
  useEffect(() => {
    if (!hasStarted || isPaused) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasStarted, isPaused]);

  const elapsedSecs = !hasStarted
    ? 0
    : accumulatedSecs + (!isPaused && segmentStart ? Math.max(0, (nowTick - segmentStart) / 1000) : 0);

  const handleStartInspection = () => {
    if (!form.vehicle_plate) {
      return alert("Primero selecciona la placa del vehículo a revisar");
    }
    const now = new Date();
    setStartedAt(now);
    setAccumulatedSecs(0);
    setSegmentStart(now.getTime());
    setNowTick(now.getTime());
    setIsPaused(false);
    setHasStarted(true);
  };

  const handleTogglePause = () => {
    if (!hasStarted) return;
    const now = Date.now();
    if (isPaused) {
      setSegmentStart(now);
      setNowTick(now);
      setIsPaused(false);
    } else {
      const add = segmentStart ? Math.max(0, (now - segmentStart) / 1000) : 0;
      setAccumulatedSecs((prev) => prev + add);
      setSegmentStart(null);
      setIsPaused(true);
    }
  };

  const selectedVehicle = vehicles.find((v) => v.plate === form.vehicle_plate);

  // Búsqueda sin tildes ni mayúsculas; en la placa se ignoran espacios y guiones ("dbc 859" → DBC859)
  const normalizeText = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const normalizePlate = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const filteredVehicles = vehicles.filter((v) => {
    const q = normalizeText(vehicleSearch);
    if (!q) return true;
    const qPlate = normalizePlate(q);
    const text = normalizeText(`${v.driver?.full_name || ""} ${v.brand || ""} ${v.line || ""}`);
    return (qPlate && normalizePlate(v.plate || "").includes(qPlate)) || text.includes(q);
  });

  // Auto-asignar conductor y buscar daños preexistentes cuando cambia el vehículo
  const handleVehicleChange = (plate: string) => {
    const v = vehicles.find((item) => item.plate === plate);
    setForm((prev) => ({
      ...prev,
      vehicle_plate: plate,
      driver_id: v?.driver?.id ? String(v.driver.id) : "",
    }));
    setPreviousDamages([]);
    setPreviousInspectionDate(null);

    if (plate && !isContinueMode) {
      const auth = ensureBasicAuth();
      fetch(`${API}/inspections/${encodeURIComponent(plate)}`, {
        headers: { Authorization: auth },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((rows: CreatedInspectionResult[]) => {
          if (!Array.isArray(rows)) return;
          const lastCompleted = rows.find(
            (r) => r.status !== "draft" && Array.isArray(r.damages) && r.damages.length > 0
          );
          if (lastCompleted && lastCompleted.damages) {
            setPreviousDamages(lastCompleted.damages);
            setPreviousInspectionDate(lastCompleted.started_at || null);
          }
        })
        .catch(() => {
          /* opcional */
        });
    }
  };

  // --- ACCIONES DEL MENÚ ---
  const openActionSheet = (key: string, label: string) => {
    setActionSheetField({ key, label });
  };

  const closeActionSheet = () => {
    setActionSheetField(null);
  };

  const handleChooseCamera = () => {
    if (actionSheetField) {
      startCamera();
    }
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
    closeActionSheet();
  };

  // --- LOGICA CÁMARA ---
  const startCamera = async () => {
    setIsCameraOpen(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("No pudimos acceder a la cámara. Revisa los permisos.");
      setIsCameraOpen(false);
      closeActionSheet();
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
    closeActionSheet();
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !actionSheetField) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Redimensionar directamente a max 1400px para ahorrar memoria en móvil
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
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const file = new File([blob], `${actionSheetField.key}_${Date.now()}.jpg`, {
              type: "image/jpeg",
            });
            handleUpload(file, actionSheetField.key);
            stopCamera();
          }
        },
        "image/jpeg",
        0.75
      );
    }
  };

  // --- SUBIDA CON COMPRESIÓN CLIENT-SIDE ---
  const handleUpload = async (file: File, key: string) => {
    setUploading(true);
    setUploadStatus("Comprimiendo imagen...");
    try {
      // 1. Compresión client-side en el móvil (pasa de 5-15MB a <250KB)
      const compressedFile = await compressImage(file, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.75,
      });

      setUploadStatus("Subiendo foto...");
      const fd = new FormData();
      fd.append("file", compressedFile);
      fd.append("folder", "inspections");

      const res = await fetch(`${API}/uploads`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Error en la subida al servidor");
      const data = await res.json();

      setForm((prev) => ({
        ...prev,
        photos: { ...prev.photos, [key]: data.url },
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al subir la imagen";
      alert(msg);
    } finally {
      setUploading(false);
      setUploadStatus("");
    }
  };

  // --- GUARDAR (avance o finalización) ---
  // Sin token: POST admin (crea). Con token: PUT público por enlace de continuación.
  const persist = async (finalize: boolean): Promise<CreatedInspectionResult> => {
    const name = form.inspector_name.trim();
    try {
      if (name) localStorage.setItem("last_inspector_name", name);
    } catch {
      /* almacenamiento no disponible: no crítico */
    }

    const currentElapsed = Math.round(
      accumulatedSecs + (!isPaused && segmentStart ? Math.max(0, (Date.now() - segmentStart) / 1000) : 0)
    );

    const payload = {
      vehicle_plate: form.vehicle_plate,
      driver_id: form.driver_id || null,
      type: form.type,
      mileage: form.mileage ? Number(form.mileage) : null,
      fuel_level: form.fuel_level || null,
      comments: form.comments,
      inspector_name: name,
      photos: form.photos,
      damages: form.damages,
      road_test: form.road_test,
      electrical_harness_status: form.electrical_harness_status,
      coolant_leaks_status: form.coolant_leaks_status,
      started_at: startedAt.toISOString(),
      elapsed_seconds: currentElapsed,
    };

    let res: Response;
    if (draftToken) {
      res = await fetch(`${API}/public/inspections/continue/${draftToken}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, finalize }),
      });
    } else {
      const auth = ensureBasicAuth();
      res = await fetch(`${API}/inspections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: auth },
        body: JSON.stringify({ ...payload, status: finalize ? "completed" : "draft" }),
      });
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Error al guardar la inspección");
    }
    return res.json();
  };

  const validateBase = () => {
    if (!form.vehicle_plate) return "Selecciona un vehículo";
    if (!form.inspector_name.trim()) return "Escribe tu nombre (inspector responsable)";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateBase();
    if (err) return alert(err);
    const hasAnyEvidencePhoto =
      Object.keys(form.photos).length > 0 || form.damages.some((d) => !!d.photoUrl);
    if (!hasAnyEvidencePhoto) {
      return alert("Por favor toma al menos una foto de evidencia");
    }
    if (form.road_test === null) {
      return alert("Indica si la revisión incluyó prueba de ruta (sí / no)");
    }

    setLoading(true);
    try {
      const created = await persist(true);
      setCreatedInspection(created);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error guardando la inspección";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    const err = validateBase();
    if (err) return alert(err);

    setLoading(true);
    try {
      const saved = await persist(false);
      // Congelar cronómetro mientras se pasa a otra persona
      if (!isPaused && segmentStart) {
        const add = Math.max(0, (Date.now() - segmentStart) / 1000);
        setAccumulatedSecs((prev) => prev + add);
        setSegmentStart(null);
        setIsPaused(true);
      }
      if (saved.continue_token) setDraftToken(saved.continue_token);
      if (saved.participants) setParticipants(saved.participants);
      setSavedDraft(saved);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error guardando el avance";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  // --- COMPARTIR ENLACE DE CONTINUACIÓN POR WHATSAPP ---
  const continueUrl = draftToken ? `${window.location.origin}/inspection/continue/${draftToken}` : "";
  const handleShareContinue = () => {
    if (!continueUrl) return;
    const photos = Object.keys(form.photos).length;
    const dmgCount = form.damages.length;
    const text =
      `🛠️ *INSPECCIÓN EN PROGRESO — CONTINÚALA*\n` +
      `🚗 *Vehículo:* ${form.vehicle_plate}\n` +
      `👤 *Avance guardado por:* ${form.inspector_name.trim() || "N/A"}\n` +
      `⏱️ *Tiempo en revisión:* ${formatDuration(elapsedSecs)}\n` +
      `📸 *Fotos tomadas:* ${photos} / ${PHOTO_FIELDS.length}\n` +
      (dmgCount > 0 ? `⚠️ *Daños marcados en 3D:* ${dmgCount}\n` : "") +
      `\n👉 *Continúa y finaliza aquí:* ${continueUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  // --- COMPARTIR POR WHATSAPP ---
  const handleShareWhatsApp = (targetPhone?: string) => {
    if (!createdInspection) return;
    const viewUrl = `${window.location.origin}/inspection/${createdInspection.id}`;
    const kmText = createdInspection.mileage
      ? `${Number(createdInspection.mileage).toLocaleString("es-CO")} km`
      : "No registrado";
    const fuelText = createdInspection.fuel_level
      ? (FUEL_OPTIONS.find((f) => f.value === createdInspection.fuel_level)?.label || createdInspection.fuel_level)
      : "No registrado";
    const typeLabel =
      createdInspection.type === "entrega"
        ? "Entrega"
        : createdInspection.type === "recepcion"
        ? "Recepción"
        : "Control General";
    const dmgCount = createdInspection.damages?.length || 0;

    const text =
      `📋 *ACTA DE INSPECCIÓN VEHICULAR*\n` +
      `🚗 *Vehículo:* ${createdInspection.vehicle_plate}\n` +
      `📅 *Fecha:* ${new Date().toLocaleDateString("es-CO", { dateStyle: "medium" })}\n` +
      `🔍 *Tipo:* ${typeLabel}\n` +
      `👤 *Inspector:* ${createdInspection.inspector_name || "N/A"}\n` +
      `🛣️ *Kilometraje:* ${kmText}\n` +
      `⛽ *Combustible:* ${fuelText}\n` +
      `🚦 *Prueba de ruta:* ${createdInspection.road_test ? "Sí" : "No"}\n` +
      (createdInspection.electrical_harness_status
        ? `⚡ *Ramal eléctrico:* ${createdInspection.electrical_harness_status === "good" ? "✔ Buen estado" : "✖ Tostada / Dañada"}\n`
        : "") +
      (createdInspection.coolant_leaks_status
        ? `💧 *Fugas refrigerante:* ${createdInspection.coolant_leaks_status === "no_leaks" ? "✔ Sin fugas" : "✖ Fuga detectada"}\n`
        : "") +
      (dmgCount > 0 ? `⚠️ *Daños / Detalles marcados en 3D:* ${dmgCount}\n` : "") +
      (createdInspection.duration_seconds
        ? `⏱️ *Duración de la revisión:* ${formatDuration(createdInspection.duration_seconds)}\n`
        : "") +
      (createdInspection.comments ? `📝 *Observaciones:* ${createdInspection.comments}\n` : "") +
      `\n📸 *Ver reporte y fotos:* ${viewUrl}`;

    const cleanPhone = (targetPhone || "").replace(/\D/g, "");
    const waUrl = cleanPhone
      ? `https://wa.me/57${cleanPhone.startsWith("57") ? cleanPhone.slice(2) : cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(waUrl, "_blank");
  };

  const handleResetForNew = () => {
    if (isContinueMode) {
      // Desde un enlace público no hay acceso al formulario admin: ir al reporte final
      if (createdInspection) window.location.href = `/inspection/${createdInspection.id}`;
      return;
    }
    setCreatedInspection(null);
    setSavedDraft(null);
    setDraftToken(null);
    setParticipants([]);
    setPreviousDamages([]);
    setPreviousInspectionDate(null);
    setStartedAt(new Date());
    setHasStarted(false);
    setIsPaused(false);
    setAccumulatedSecs(0);
    setSegmentStart(null);
    setForm(emptyForm());
  };

  const groupedFields = PHOTO_FIELDS.reduce((acc, field) => {
    if (!acc[field.section]) acc[field.section] = [];
    acc[field.section].push(field);
    return acc;
  }, {} as Record<string, typeof PHOTO_FIELDS>);

  const photosCount = Object.keys(form.photos).length;
  const referenceMileage = selectedVehicle?.current_mileage ?? lastKnownMileage;

  // Estados del enlace de continuación (cargando / inválido / ya finalizado)
  if (isContinueMode && draftLoadState !== "ready") {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        {draftLoadState === "loading" ? (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent mb-4"></div>
            <p className="text-slate-600 font-semibold text-sm">Cargando inspección en progreso...</p>
          </>
        ) : draftLoadState === "completed" ? (
          <>
            <CheckCircle2 className="w-14 h-14 text-emerald-600 mb-3" />
            <h2 className="text-xl font-black text-slate-800 mb-1">Esta inspección ya fue finalizada</h2>
            <p className="text-slate-500 text-sm mb-5">Ya no se puede editar, pero puedes ver el reporte.</p>
            {completedId && (
              <Link to={`/inspection/${completedId}`} className="px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl text-sm">
                Ver reporte
              </Link>
            )}
          </>
        ) : (
          <>
            <X className="w-14 h-14 text-rose-500 mb-3" />
            <h2 className="text-xl font-black text-slate-800 mb-1">Enlace no válido</h2>
            <p className="text-slate-500 text-sm">No encontramos la inspección de este enlace.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6 relative">
      {/* INPUT FILE OCULTO (Global) */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0] && actionSheetField) {
            handleUpload(e.target.files[0], actionSheetField.key);
            closeActionSheet();
          }
        }}
      />

      <div className="mx-auto max-w-2xl bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        {/* HEADER */}
        <div className="bg-slate-900 p-5 sm:p-6 text-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-400">
              Operaciones · Revisión Móvil
            </span>
            {!isContinueMode && (
              <Link
                to="/inspections"
                className="text-xs text-slate-400 hover:text-white underline"
              >
                Ver Historial
              </Link>
            )}
          </div>
          <h1 className="text-2xl font-black">
            {draftToken ? "Inspección en Progreso" : "Nueva Inspección"}
          </h1>
          <p className="text-slate-400 text-xs">
            {draftToken
              ? "Continúa donde quedó la revisión y finalízala"
              : "Registro ágil del vehículo con croquis 3D 360° y fotos comprimidas"}
          </p>
          {participants.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-300 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              Han trabajado en ella: <span className="font-bold">{participants.join(" → ")}</span>
            </p>
          )}
        </div>

        {!hasStarted ? (
          /* --- PASO PREVIO: SELECCIONAR PLACA Y EMPEZAR REVISIÓN --- */
          <div className="p-5 sm:p-6 space-y-5">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                1. Vehículo a Inspeccionar
              </label>

              {form.vehicle_plate && selectedVehicle && !isVehiclePickerOpen ? (
                /* Tarjeta del vehículo seleccionado */
                <div className="bg-white p-4 rounded-2xl border-2 border-emerald-500 shadow-sm space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl font-black tracking-wider text-slate-900 font-mono">
                        {form.vehicle_plate}
                      </span>
                      <VehicleStatusBadge status={selectedVehicle.status} />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsVehiclePickerOpen(true);
                        setVehicleSearch("");
                      }}
                      className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-200 transition"
                    >
                      Cambiar
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">Conductor: </span>
                      <span className="font-bold text-slate-800">
                        {selectedVehicle.driver?.full_name || "Sin conductor asignado"}
                      </span>
                      {selectedVehicle.driver?.phone && (
                        <span className="text-slate-500 ml-1">({selectedVehicle.driver.phone})</span>
                      )}
                    </div>
                    {selectedVehicle.current_mileage && (
                      <div className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                        Último Km: {Number(selectedVehicle.current_mileage).toLocaleString("es-CO")} km
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Buscador interactivo */
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={vehicleSearch}
                      onChange={(e) => {
                        setVehicleSearch(e.target.value);
                        setIsVehiclePickerOpen(true);
                      }}
                      onFocus={() => setIsVehiclePickerOpen(true)}
                      placeholder="Buscar por placa (ej. 859, DBC) o conductor..."
                      className="w-full pl-10 pr-10 py-3.5 rounded-xl border border-slate-300 font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm placeholder:text-slate-400 shadow-sm"
                    />
                    {vehicleSearch && (
                      <button
                        type="button"
                        onClick={() => setVehicleSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                        title="Limpiar búsqueda"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Lista de resultados */}
                  <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-sm">
                    {filteredVehicles.length === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-400 space-y-1">
                        <p className="font-semibold text-slate-600">No se encontraron vehículos</p>
                        <p>No hay coincidencias para "{vehicleSearch}"</p>
                      </div>
                    ) : (
                      filteredVehicles.map((v) => {
                        const isSelected = form.vehicle_plate === v.plate;
                        return (
                          <button
                            key={v.plate}
                            type="button"
                            onClick={() => {
                              handleVehicleChange(v.plate);
                              setVehicleSearch("");
                              setIsVehiclePickerOpen(false);
                            }}
                            className={`w-full p-3.5 text-left flex items-center justify-between gap-3 transition-colors ${
                              isSelected
                                ? "bg-emerald-50 hover:bg-emerald-100/70"
                                : "hover:bg-slate-50"
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-base text-slate-900 tracking-wider">
                                  {v.plate}
                                </span>
                                <VehicleStatusBadge status={v.status} small />
                              </div>
                              <p className="text-xs text-slate-600">
                                {v.driver?.full_name ? (
                                  <span className="font-medium text-slate-800">👤 {v.driver.full_name}</span>
                                ) : (
                                  <span className="text-slate-400 italic">Libre (Sin conductor)</span>
                                )}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {v.current_mileage ? (
                                <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                  {Number(v.current_mileage).toLocaleString("es-CO")} km
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">-</span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {form.vehicle_plate && isVehiclePickerOpen && (
                    <div className="text-right pt-0.5">
                      <button
                        type="button"
                        onClick={() => setIsVehiclePickerOpen(false)}
                        className="text-xs text-slate-500 hover:text-slate-700 font-semibold underline"
                      >
                        Cancelar y mantener {form.vehicle_plate}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Evento</label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                  {[
                    { id: "general", label: "Control" },
                    { id: "entrega", label: "Entrega" },
                    { id: "recepcion", label: "Recepción" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForm({ ...form, type: t.id })}
                      className={`py-2 rounded-lg text-xs font-extrabold transition-all ${
                        form.type === t.id
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Inspector Responsable</label>
                <input
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Tu nombre o cargo"
                  value={form.inspector_name}
                  onChange={(e) => setForm({ ...form, inspector_name: e.target.value })}
                />
              </div>
            </div>

            {/* ADVERTENCIA DEL CRONÓMETRO */}
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="text-xs text-amber-900 space-y-1 leading-relaxed">
                <p className="font-black uppercase tracking-wider text-amber-800">
                  ⏱️ Control de Tiempo y Estadísticas
                </p>
                <p>
                  Una vez presiones <strong>Empezar Revisión</strong>, el cronómetro comenzará a correr y se guardarán estadísticas de cuánto tiempo toma realizar esta revisión. El tiempo continuará registrándose hasta que la finalices (podrás pausarlo si necesitas interrumpirla).
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartInspection}
              disabled={!form.vehicle_plate}
              className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg shadow-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-98 flex items-center justify-center gap-2.5"
            >
              <Play className="w-5 h-5 fill-current" />
              Empezar Revisión
            </button>
          </div>
        ) : (
          <>
            {/* CRONÓMETRO DE LA REVISIÓN CON PAUSA */}
            <div
              className={`sticky top-0 z-30 border-b px-4 py-2.5 flex items-center justify-between transition-colors ${
                isPaused
                  ? "bg-slate-800 border-slate-700 text-white"
                  : "bg-amber-50 border-amber-200 text-amber-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <Timer className={`w-4 h-4 ${isPaused ? "text-amber-400" : "text-amber-700 animate-pulse"}`} />
                <span className="text-[11px] font-bold uppercase tracking-wider">
                  {isPaused ? "Revisión en pausa" : "Tiempo en revisión"}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono font-black text-base tabular-nums">
                  {formatDuration(elapsedSecs)}
                </span>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition active:scale-95 ${
                    isPaused
                      ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm"
                      : "bg-amber-200/80 hover:bg-amber-300 text-amber-950"
                  }`}
                >
                  {isPaused ? (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" /> Reanudar
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" /> Pausar
                    </>
                  )}
                </button>
              </div>
            </div>

            {isPaused && (
              <div className="bg-slate-900/95 text-white px-4 py-3 flex items-center justify-between gap-3 border-b border-slate-700">
                <p className="text-xs text-slate-300">
                  ⏸️ El cronómetro está pausado. Reanúdalo para continuar diligenciando la revisión.
                </p>
                <button
                  type="button"
                  onClick={handleTogglePause}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs whitespace-nowrap"
                >
                  Reanudar ahora
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className={`p-4 sm:p-6 space-y-6 transition-opacity ${isPaused ? "opacity-50 pointer-events-none select-none" : ""}`}>
              {/* 1. SELECCIÓN DE VEHÍCULO */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Vehículo en Revisión
                    </label>
                    <div className="w-full p-3 rounded-xl border border-slate-300 font-black text-slate-800 uppercase bg-white flex items-center justify-between">
                      <span>{form.vehicle_plate}</span>
                      {!draftToken && photosCount === 0 && form.damages.length === 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setHasStarted(false);
                            setIsPaused(false);
                            setAccumulatedSecs(0);
                            setSegmentStart(null);
                          }}
                          className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline normal-case"
                        >
                          Cambiar placa
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {!selectedVehicle && referenceMileage && (
                  <div className="text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 inline-block">
                    Último Km: {Number(referenceMileage).toLocaleString("es-CO")} km
                  </div>
                )}

                {selectedVehicle && (
                  <div className="text-xs bg-white p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-slate-400">Conductor: </span>
                      <span className="font-bold text-slate-800">
                        {selectedVehicle.driver?.full_name || "Sin conductor asignado"}
                      </span>
                      {selectedVehicle.driver?.phone && (
                        <span className="text-slate-500 ml-1">({selectedVehicle.driver.phone})</span>
                      )}
                    </div>
                    {selectedVehicle.current_mileage && (
                      <div className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                        Último Km: {Number(selectedVehicle.current_mileage).toLocaleString("es-CO")} km
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. TIPO DE INSPECCIÓN Y DATOS DEL INSPECTOR */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Evento</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                    {[
                      { id: "general", label: "Control" },
                      { id: "entrega", label: "Entrega" },
                      { id: "recepcion", label: "Recepción" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setForm({ ...form, type: t.id })}
                        className={`py-2 rounded-lg text-xs font-extrabold transition-all ${
                          form.type === t.id
                            ? "bg-slate-900 text-white shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Inspector Responsable</label>
                  <input
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="Tu nombre o cargo"
                    value={form.inspector_name}
                    onChange={(e) => setForm({ ...form, inspector_name: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* 3. ODÓMETRO / KILOMETRAJE ACTUAL */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Gauge className="w-4 h-4 text-emerald-600" />
                    Kilometraje Actual (Odómetro)
                  </label>
                  {form.mileage && (
                    <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      {Number(form.mileage).toLocaleString("es-CO")} KM
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Ej. 84500"
                    value={form.mileage}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, "");
                      setForm({ ...form, mileage: clean });
                    }}
                    className="w-full text-lg font-black tracking-wider p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none bg-white"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    KM
                  </span>
                </div>
              </div>

              {/* 4. NIVEL DE GASOLINA / COMBUSTIBLE (VISUAL) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Fuel className="w-4 h-4 text-amber-600" />
                    Tanque de Gasolina
                  </label>
                  <span className="text-xs font-black text-slate-700">
                    Nivel:{" "}
                    <span className="text-emerald-600 uppercase">
                      {FUEL_OPTIONS.find((f) => f.value === form.fuel_level)?.label || form.fuel_level}
                    </span>
                  </span>
                </div>

                {/* BARRA SEGMENTADA INTERACTIVA */}
                <div className="h-4 w-full bg-slate-200 rounded-full overflow-hidden p-0.5 flex gap-1 shadow-inner">
                  {FUEL_OPTIONS.map((opt, idx) => {
                    const activeIdx = FUEL_OPTIONS.findIndex((f) => f.value === form.fuel_level);
                    const isFilled = idx <= activeIdx;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm({ ...form, fuel_level: opt.value })}
                        className={`h-full flex-1 rounded-sm transition-all ${
                          isFilled
                            ? activeIdx === 0
                              ? "bg-rose-500"
                              : activeIdx === 1
                              ? "bg-amber-500"
                              : activeIdx === 2
                              ? "bg-yellow-500"
                              : "bg-emerald-500"
                            : "bg-slate-300 hover:bg-slate-400"
                        }`}
                        title={`Marcar ${opt.label}`}
                      />
                    );
                  })}
                </div>

                {/* BOTONES TÁCTILES GRANDES (PENSADOS PARA MÓVIL) */}
                <div className="grid grid-cols-5 gap-1.5">
                  {FUEL_OPTIONS.map((opt) => {
                    const isSelected = form.fuel_level === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm({ ...form, fuel_level: opt.value })}
                        className={`py-2.5 px-1 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${
                          isSelected
                            ? `${opt.color} ring-2 ring-emerald-500 font-black shadow-sm scale-102`
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold"
                        }`}
                      >
                        <span className="text-sm">{opt.short}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{opt.pct}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4.1 PRUEBA DE RUTA */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-blue-600" />
                  ¿Incluye prueba de ruta?
                </label>
                <p className="text-[11px] text-slate-500">
                  Se subieron al carro y lo anduvieron para probarlo y escucharlo.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: true, label: "Sí, se probó andando" },
                    { v: false, label: "No" },
                  ].map((opt) => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => setForm({ ...form, road_test: opt.v })}
                      className={`py-3 rounded-xl border text-sm font-extrabold transition-all ${
                        form.road_test === opt.v
                          ? opt.v
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                            : "bg-slate-800 text-white border-slate-800 shadow-sm"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4.2 CHEQUEO MECÁNICO: VANO MOTOR */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Wrench className="w-4 h-4 text-emerald-600" /> Chequeo Mecánico Crítico
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Inspección visual del vano motor para prevenir fallas eléctricas y recalentamiento.
                  </p>
                </div>

                {/* 1. Coraza del ramal eléctrico */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      Coraza del ramal eléctrico
                    </label>
                    {form.electrical_harness_status && (
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                        form.electrical_harness_status === "good"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}>
                        {form.electrical_harness_status === "good" ? "✔ Buen estado" : "✖ Tostada / Dañada"}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, electrical_harness_status: "good" })}
                      className={`py-3 px-2 rounded-xl border text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                        form.electrical_harness_status === "good"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Check className="w-4 h-4" /> Buen estado
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, electrical_harness_status: "damaged" })}
                      className={`py-3 px-2 rounded-xl border text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                        form.electrical_harness_status === "damaged"
                          ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                      }`}
                    >
                      <X className="w-4 h-4" /> Tostada / Dañada
                    </button>
                  </div>
                </div>

                {/* 2. Fugas de refrigerante */}
                <div className="space-y-1.5 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Droplets className="w-3.5 h-3.5 text-blue-500" />
                      Fugas de refrigerante
                    </label>
                    {form.coolant_leaks_status && (
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                        form.coolant_leaks_status === "no_leaks"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}>
                        {form.coolant_leaks_status === "no_leaks" ? "✔ Sin fugas" : "✖ Fuga detectada"}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, coolant_leaks_status: "no_leaks" })}
                      className={`py-3 px-2 rounded-xl border text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                        form.coolant_leaks_status === "no_leaks"
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Check className="w-4 h-4" /> Sin fugas
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, coolant_leaks_status: "leak_detected" })}
                      className={`py-3 px-2 rounded-xl border text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                        form.coolant_leaks_status === "leak_detected"
                          ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                      }`}
                    >
                      <X className="w-4 h-4" /> Fuga detectada
                    </button>
                  </div>
                </div>
              </div>

              {/* 4.2 SILUETA 3D 360° INTERACTIVA DE DAÑOS */}
              <VehicleDamage3DMapper
                value={form.damages}
                onChange={(nextDamages) => setForm((prev) => ({ ...prev, damages: nextDamages }))}
                vehiclePlate={form.vehicle_plate}
                inspectorName={form.inspector_name}
                previousDamages={previousDamages}
                previousInspectionDate={previousInspectionDate}
              />

              {/* 5. FOTOS DE EVIDENCIA (GRID MÓVIL) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Fotos de Evidencia General
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Compresión automática activa para no saturar memoria
                    </p>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                    {photosCount} / {PHOTO_FIELDS.length} listas
                  </span>
                </div>

                {Object.entries(groupedFields).map(([section, fields]) => (
                  <div key={section} className="pt-2">
                    <h4 className="text-emerald-700 font-extrabold uppercase text-[11px] mb-3 tracking-wider">
                      {section}
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {fields.map((field) => (
                        <div key={field.key} className="relative">
                          <label className="block text-[11px] font-bold text-slate-600 mb-1 truncate">
                            {field.label}
                          </label>

                          {form.photos[field.key] ? (
                            // FOTO CARGADA
                            <div className="relative h-28 w-full rounded-2xl overflow-hidden border border-emerald-200 bg-emerald-50 shadow-sm group">
                              <img
                                src={form.photos[field.key]}
                                alt={field.label}
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newPhotos = { ...form.photos };
                                    delete newPhotos[field.key];
                                    setForm({ ...form, photos: newPhotos });
                                  }}
                                  className="bg-red-500 text-white rounded-full p-2 shadow-lg hover:bg-red-600 active:scale-95"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-white text-[10px] font-bold text-center py-0.5 flex items-center justify-center gap-1">
                                <Check className="w-3 h-3" /> LISTO
                              </div>
                            </div>
                          ) : (
                            // BOTÓN DE CARGA
                            <button
                              type="button"
                              onClick={() => openActionSheet(field.key, field.label)}
                              className="w-full h-28 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-emerald-500 hover:text-emerald-600 text-slate-400 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95"
                            >
                              <div className="p-2.5 bg-white rounded-full shadow-sm text-slate-500">
                                <Plus className="w-5 h-5" />
                              </div>
                              <span className="text-[10px] font-bold">Tomar Foto</span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* 6. OBSERVACIONES */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observaciones Generales / Kit de Carretera / Documentos
                </label>
                <textarea
                  className="w-full p-3 rounded-xl border border-slate-300 h-28 resize-none focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                  placeholder="Detalles adicionales sobre kit de carretera, llanta de repuesto, documentos, ruidos mecánicos..."
                  value={form.comments}
                  onChange={(e) => setForm({ ...form, comments: e.target.value })}
                />
              </div>

              {/* BOTONES: GUARDAR AVANCE / FINALIZAR */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={loading || uploading}
                  className="w-full py-3.5 rounded-2xl border-2 border-slate-900 bg-white hover:bg-slate-50 text-slate-900 font-black text-base disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {loading ? "Guardando..." : "Guardar avance y pasar a otra persona"}
                </button>
                <button
                  type="submit"
                  disabled={loading || uploading}
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg shadow-xl disabled:opacity-50 transition-all active:scale-98"
                >
                  {loading ? "Guardando Inspección..." : "Guardar y Finalizar Revisión"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* --- ACTION SHEET INFERIOR (CÁMARA O ARCHIVO) --- */}
      {actionSheetField && !isCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 space-y-4 animate-in slide-in-from-bottom duration-300 shadow-2xl">
            <div className="flex justify-between items-center mb-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  Captura de Evidencia
                </span>
                <h3 className="text-lg font-black text-slate-800">{actionSheetField.label}</h3>
              </div>
              <button
                onClick={closeActionSheet}
                className="p-1.5 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Las fotos se comprimen en tu celular antes de subir para ahorrar datos y espacio.
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleChooseCamera}
                className="flex flex-col items-center justify-center gap-3 p-5 rounded-2xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 transition-colors active:scale-95"
              >
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <Camera className="w-6 h-6" />
                </div>
                <span className="text-xs font-black text-slate-700">Usar Cámara</span>
              </button>

              <button
                onClick={handleChooseFile}
                className="flex flex-col items-center justify-center gap-3 p-5 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-colors active:scale-95"
              >
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <span className="text-xs font-black text-slate-700">Galería / Archivo</span>
              </button>
            </div>
          </div>
          <div className="absolute inset-0 -z-10" onClick={closeActionSheet} />
        </div>
      )}

      {/* --- MODAL DE CÁMARA (WEBRTC) --- */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-in fade-in duration-300">
          <div className="p-4 flex justify-between items-center bg-black/60 absolute top-0 w-full z-10 backdrop-blur-sm">
            <span className="text-white font-extrabold text-sm">{actionSheetField?.label}</span>
            <button onClick={stopCamera} className="text-white bg-white/20 p-2 rounded-full">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 relative flex items-center justify-center bg-black">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="p-8 bg-black flex justify-center pb-12">
            <button
              onClick={capturePhoto}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:bg-white active:scale-95 transition-all shadow-2xl"
            >
              <div className="w-16 h-16 bg-white rounded-full" />
            </button>
          </div>
        </div>
      )}

      {/* LOADING OVERLAY CON STATUS */}
      {uploading && (
        <div className="fixed inset-0 z-[70] bg-black/70 flex flex-col items-center justify-center text-white backdrop-blur-sm">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mb-4"></div>
          <p className="font-bold text-sm">{uploadStatus || "Procesando imagen..."}</p>
          <p className="text-xs text-slate-400 mt-1">Optimizando tamaño para el bucket</p>
        </div>
      )}

      {/* --- MODAL DE AVANCE GUARDADO & PASAR A OTRA PERSONA --- */}
      {savedDraft && !createdInspection && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl space-y-5">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full mx-auto flex items-center justify-center shadow-inner">
              <Save className="w-8 h-8" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">Inspección abierta</span>
              <h2 className="text-2xl font-black text-slate-900 mt-0.5">¡Avance guardado!</h2>
              <p className="text-xs text-slate-500 mt-1">
                Queda pendiente de completar y cerrar. Envía el enlace para que otra persona la continúe.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 text-left text-xs space-y-2 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Vehículo:</span>
                <span className="font-black text-slate-800">{form.vehicle_plate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Tiempo en revisión:</span>
                <span className="font-bold text-slate-800 font-mono">{formatDuration(elapsedSecs)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Fotos:</span>
                <span className="font-bold text-slate-800">{photosCount} / {PHOTO_FIELDS.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Daños marcados en 3D:</span>
                <span className="font-bold text-amber-700">{form.damages.length}</span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleShareContinue}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
              >
                <Share2 className="w-4 h-4" /> Pasar por WhatsApp para continuar
              </button>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(continueUrl).then(
                    () => alert("Enlace copiado"),
                    () => prompt("Copia el enlace:", continueUrl)
                  );
                }}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs"
              >
                Copiar enlace
              </button>
            </div>

            <button
              onClick={() => {
                setSavedDraft(null);
                if (isPaused) {
                  const now = Date.now();
                  setSegmentStart(now);
                  setNowTick(now);
                  setIsPaused(false);
                }
              }}
              className="text-xs text-slate-500 hover:text-slate-800 font-bold flex items-center justify-center gap-1 mx-auto pt-1"
            >
              Seguir yo con la revisión
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL DE ÉXITO & COMPARTIR POR WHATSAPP --- */}
      {createdInspection && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full mx-auto flex items-center justify-center shadow-inner">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                Registro Completado
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-0.5">
                ¡Inspección Guardada!
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                La evidencia ha sido archivada de manera segura con sus fotos comprimidas.
              </p>
            </div>

            {/* RESUMEN RÁPIDO */}
            <div className="bg-slate-50 rounded-2xl p-4 text-left text-xs space-y-2 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Vehículo:</span>
                <span className="font-black text-slate-800">{createdInspection.vehicle_plate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Kilometraje:</span>
                <span className="font-bold text-slate-800">
                  {createdInspection.mileage
                    ? `${Number(createdInspection.mileage).toLocaleString("es-CO")} km`
                    : "No registrado"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Combustible:</span>
                <span className="font-bold text-slate-800 uppercase">
                  {createdInspection.fuel_level || "No registrado"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Prueba de ruta:</span>
                <span className="font-bold text-slate-800">{createdInspection.road_test ? "Sí" : "No"}</span>
              </div>
              {createdInspection.electrical_harness_status && (
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Ramal eléctrico:</span>
                  <span className={`font-bold ${createdInspection.electrical_harness_status === "good" ? "text-emerald-700" : "text-rose-700"}`}>
                    {createdInspection.electrical_harness_status === "good" ? "✔ Buen estado" : "✖ Tostada / Dañada"}
                  </span>
                </div>
              )}
              {createdInspection.coolant_leaks_status && (
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Fugas refrigerante:</span>
                  <span className={`font-bold ${createdInspection.coolant_leaks_status === "no_leaks" ? "text-emerald-700" : "text-rose-700"}`}>
                    {createdInspection.coolant_leaks_status === "no_leaks" ? "✔ Sin fugas" : "✖ Fuga detectada"}
                  </span>
                </div>
              )}
              {createdInspection.duration_seconds != null && (
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">Duración revisión:</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {formatDuration(createdInspection.duration_seconds)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Daños marcados en 3D:</span>
                <span className="font-bold text-amber-700">
                  {createdInspection.damages?.length || 0} puntos
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-bold">Evidencias:</span>
                <span className="font-bold text-emerald-600">
                  {Object.keys(createdInspection.photos || {}).length} fotos adjuntas
                </span>
              </div>
            </div>

            {/* BOTONES DE WHATSAPP */}
            <div className="space-y-2 pt-1">
              {createdInspection.driver?.phone && (
                <button
                  onClick={() => handleShareWhatsApp(createdInspection.driver?.phone)}
                  className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg transition active:scale-95"
                >
                  <Share2 className="w-4 h-4" /> Enviar por WhatsApp al Conductor ({createdInspection.driver.phone})
                </button>
              )}

              <button
                onClick={() => handleShareWhatsApp()}
                className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition active:scale-95"
              >
                <Share2 className="w-4 h-4 text-emerald-400" /> Compartir por WhatsApp (Cualquier Persona)
              </button>

              <Link
                to={`/inspection/${createdInspection.id}`}
                target="_blank"
                className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition"
              >
                Ver reporte completo online <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* ACCIÓN NUEVA INSPECCIÓN */}
            <button
              onClick={handleResetForNew}
              className="text-xs text-slate-500 hover:text-slate-800 font-bold flex items-center justify-center gap-1 mx-auto pt-2"
            >
              <RotateCcw className="w-3.5 h-3.5" /> {isContinueMode ? "Ir al reporte final" : "Realizar otra inspección"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
