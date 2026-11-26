import { useState, useRef } from "react";
import { compressImage } from "../utils/compressImage";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

type DemoKind = "selfie" | "id_front" | "id_back" | "license_front" | "license_back";

function DocumentDemoIllustration({ kind }: { kind: DemoKind }) {
  if (kind === "selfie") {
    return (
      <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-emerald-400/60 bg-slate-900/90 text-emerald-400">
        <svg viewBox="0 0 48 48" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="24" cy="18" r="7" />
          <path d="M11 39c2.5-6.5 7.5-9.5 13-9.5s10.5 3 13 9.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  const isBack = kind === "id_back" || kind === "license_back";
  const isLicense = kind === "license_front" || kind === "license_back";
  const accent = isLicense ? "border-sky-400/50 bg-sky-950/30" : "border-emerald-400/50 bg-emerald-950/30";
  return (
    <div className={`mx-auto mb-2 h-14 w-24 rounded-lg border ${accent} p-1.5 flex flex-col justify-between`}>
      {!isBack ? (
        <>
          <div className="flex items-center gap-1.5">
            <div className="h-6 w-5 rounded-sm bg-slate-700/80 border border-white/15 shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-1.5 w-11 rounded bg-white/30" />
              <div className="h-1.5 w-8 rounded bg-white/20" />
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">
              {isLicense ? "LIC. FRENTE" : "CC FRENTE"}
            </span>
            <div className="h-1.5 w-6 rounded bg-emerald-400/50" />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded bg-white/20" />
            <div className="h-1.5 w-3/4 rounded bg-white/15" />
          </div>
          <div className="flex items-end justify-between gap-1">
            <div className="h-4 flex-1 rounded-sm bg-white/25" />
            <span className="text-[8px] font-bold uppercase tracking-wider text-slate-300">
              REVERSO
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function DocumentPhotoCard(props: {
  demoKind: DemoKind;
  title: string;
  hint: string;
  url?: string;
  uploading: boolean;
  accept?: string;
  capture?: "user" | "environment";
  onUpload: (file: File) => void;
}) {
  const isPdf = Boolean(props.url && props.url.toLowerCase().includes(".pdf"));
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-3 flex flex-col justify-between">
      <div className="mb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-white">{props.title} *</span>
          {props.url && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
              ✓ Lista
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{props.hint}</p>
      </div>

      {props.url ? (
        <div className="space-y-2">
          {!isPdf ? (
            <a href={props.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-emerald-500/30 bg-slate-900">
              <img src={props.url} alt={props.title} className="h-28 w-full object-cover" />
            </a>
          ) : (
            <a href={props.url} target="_blank" rel="noreferrer" className="flex h-20 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold text-emerald-300">
              📄 Documento PDF adjunto
            </a>
          )}
          <label className="block text-center cursor-pointer rounded-lg border border-white/15 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/5">
            {props.uploading ? "Subiendo..." : "Cambiar foto"}
            <input
              type="file"
              accept={props.accept || "image/*,application/pdf"}
              capture={props.capture}
              className="hidden"
              disabled={props.uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) props.onUpload(f);
              }}
            />
          </label>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-slate-900/50 p-3 hover:bg-slate-900 cursor-pointer transition-colors text-center">
          <DocumentDemoIllustration kind={props.demoKind} />
          <span className="text-xs font-semibold text-emerald-400">
            {props.uploading ? "Subiendo..." : "Toca para subir o tomar foto"}
          </span>
          <span className="text-[10px] text-slate-500 mt-0.5">
            {props.demoKind === "selfie" ? "JPG o PNG (cámara frontal)" : "JPG, PNG o PDF"}
          </span>
          <input
            type="file"
            accept={props.accept || "image/*,application/pdf"}
            capture={props.capture}
            className="hidden"
            disabled={props.uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) props.onUpload(f);
            }}
          />
        </label>
      )}
    </div>
  );
}

interface DriverFormProps {
  referralCode?: string;
  editToken?: string;
  initialData?: any;
  onUpdated?: () => void;
}

export function DriverApplicationForm({ referralCode, editToken, initialData, onUpdated }: DriverFormProps) {
  const isEditMode = Boolean(editToken);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submittedEditUrl, setSubmittedEditUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialDocs: Array<{ kind: string; url: string }> = Array.isArray(initialData?.driver_application_documents)
    ? initialData.driver_application_documents
        .filter((d: any) => d?.kind && d?.url && !String(d.url).includes("placeholder"))
        .map((d: any) => ({ kind: String(d.kind), url: String(d.url) }))
    : [];

  const initialRefs = Array.isArray(initialData?.driver_application_references) && initialData.driver_application_references.length >= 2
    ? [...initialData.driver_application_references]
        .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
        .slice(0, 2)
        .map((r: any) => ({ name: r.ref_name || "", phone: r.ref_phone || "" }))
    : [
        { name: "", phone: "" },
        { name: "", phone: "" },
      ];

  const rawFamiliar = String(initialData?.familiar_with_vehicle || "Sí");
  const isFamiliarOtro = rawFamiliar.startsWith("Otro:");

  // Estado alineado con las columnas de driver_applications y tu backend
  const [formData, setFormData] = useState({
    personal: {
      fullName: initialData?.full_name || "",
      documentNumber: initialData?.document_number || "",
      dateOfBirth: initialData?.date_of_birth || "",
      phoneMobile: initialData?.phone_mobile || "",
      email: initialData?.email || "",
      address: initialData?.address || "",
    },
    workExperience: {
      hasCommercialExp: Boolean(initialData?.has_commercial_exp),
      drivingExpTime: initialData?.driving_exp_time || "",
      similarJobExp: initialData?.similar_job_exp || "",
    },
    license: {
      hasValidLicense: true,
      licenseNumberCat: initialData?.license_number_cat || "",
      familiarWithVehicle: isFamiliarOtro ? "Otro" : rawFamiliar || "Sí",
      familiarWithVehicleOther: isFamiliarOtro ? rawFamiliar.replace(/^Otro:\s*/i, "") : "",
    },
    responsibilities: {
      willingBasicMaintenance: initialData?.willing_basic_maintenance ?? true,
      weeklyDeliveryCommitment: initialData?.weekly_delivery_commitment ?? true,
    },
    substances: {
      substanceUseLast6Months: Boolean(initialData?.substance_use_last_6_months),
      substanceDetails: initialData?.substance_details || "",
      toxicologyTestConsent: initialData?.toxicology_test_consent ?? true,
    },
    confirmations: {
      acceptsWorkConditions: Boolean(initialData?.accepts_work_conditions),
      understandsDamageLiability: Boolean(initialData?.understands_damage_liability),
      truthDeclarationAccepted: Boolean(initialData?.truth_declaration_accepted),
    },
    references: initialRefs,
    documents: initialDocs,
    referral: { referralCodeUsed: initialData?.referral_code_used || referralCode || "" }
  });

  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const handleDocumentUpload = async (kind: string, file: File) => {
    setUploadingDoc(kind);
    setError(null);
    try {
      const fd = new FormData();
      const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.8 });
      fd.append("file", compressed);
      fd.append("folder", "documents");
      const res = await fetch(`${API}/uploads`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Error al subir el archivo");
      }
      const data = await res.json();
      setFormData(prev => {
        const filtered = prev.documents.filter(d => d.kind !== kind);
        return {
          ...prev,
          documents: [...filtered, { kind, url: data.url }]
        };
      });
    } catch (err: any) {
      setError(`Error subiendo documento: ${err.message}`);
    } finally {
      setUploadingDoc(null);
    }
  };

  // Canvas para firma digital
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnSignature, setHasDrawnSignature] = useState(false);

  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#10b981"; // emerald-500
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasDrawnSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawnSignature(false);
    setFormData(prev => ({
      ...prev,
      documents: prev.documents.filter(d => d.kind !== "digital_signature")
    }));
  };

  const saveDrawnSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawnSignature) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `signature_${Date.now()}.png`, { type: "image/png" });
      await handleDocumentUpload("digital_signature", file);
    }, "image/png");
  };

  const validateStep = (currentStep: number): boolean => {
    setError(null);
    if (currentStep === 1) {
      if (!formData.personal.fullName.trim() || formData.personal.fullName.trim().length < 5) {
        setError("Por favor ingresa tu nombre completo (mínimo 5 letras).");
        return false;
      }
      if (!formData.personal.documentNumber.trim() || formData.personal.documentNumber.trim().length < 5) {
        setError("Por favor ingresa tu número de documento/cédula (mínimo 5 caracteres).");
        return false;
      }
      if (!formData.personal.dateOfBirth) {
        setError("Por favor selecciona tu fecha de nacimiento.");
        return false;
      }
      const dob = new Date(formData.personal.dateOfBirth + "T00:00:00Z");
      const now = new Date();
      let age = now.getUTCFullYear() - dob.getUTCFullYear();
      const m = now.getUTCMonth() - dob.getUTCMonth();
      if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
      if (isNaN(age) || age < 18) {
        setError("Debes ser mayor de 18 años para postularte como conductor.");
        return false;
      }
      if (!formData.personal.phoneMobile.trim() || formData.personal.phoneMobile.trim().length < 7) {
        setError("Por favor ingresa un número de celular de contacto válido.");
        return false;
      }
      if (!formData.personal.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.personal.email.trim())) {
        setError("Por favor ingresa un correo electrónico válido (ej. usuario@gmail.com).");
        return false;
      }
      if (formData.personal.address.trim().length < 8) {
        setError("La dirección de residencia debe tener mínimo 8 caracteres.");
        return false;
      }
      if (!formData.documents.some(d => d.kind === "driver_selfie")) {
        setError("Por favor tómate o sube una selfie clara para tu perfil de conductor.");
        return false;
      }
      if (!formData.documents.some(d => d.kind === "id_front_photo") || !formData.documents.some(d => d.kind === "id_back_photo")) {
        setError("Por favor adjunta ambas fotos de tu cédula (cara frontal y cara trasera).");
        return false;
      }
    }

    if (currentStep === 2) {
      if (!formData.license.licenseNumberCat.trim()) {
        setError("Por favor ingresa la categoría de tu licencia vigente (ej. C1, C2).");
        return false;
      }
      if (!formData.documents.some(d => d.kind === "license_front_photo") || !formData.documents.some(d => d.kind === "license_back_photo")) {
        setError("Por favor adjunta ambas fotos de tu licencia de conducción (cara frontal y cara trasera).");
        return false;
      }
      if (!formData.workExperience.drivingExpTime.trim()) {
        setError("Por favor indica tus años de experiencia manejando.");
        return false;
      }
    }

    if (currentStep === 3) {
      const { acceptsWorkConditions, understandsDamageLiability, truthDeclarationAccepted } = formData.confirmations;
      if (!acceptsWorkConditions || !understandsDamageLiability || !truthDeclarationAccepted) {
        setError("Debes aceptar todas las confirmaciones legales para continuar.");
        return false;
      }
    }

    if (currentStep === 4) {
      const ref1Name = formData.references[0]?.name?.trim() || "";
      const ref1Phone = formData.references[0]?.phone?.trim() || "";
      const ref2Name = formData.references[1]?.name?.trim() || "";
      const ref2Phone = formData.references[1]?.phone?.trim() || "";

      if (!ref1Name || ref1Name.length < 2) {
        setError("Por favor ingresa el nombre de la Referencia 1.");
        return false;
      }
      if (!ref1Phone || ref1Phone.length < 7) {
        setError("Por favor ingresa un número de teléfono válido para la Referencia 1.");
        return false;
      }
      if (!ref2Name || ref2Name.length < 2) {
        setError("Por favor ingresa el nombre de la Referencia 2.");
        return false;
      }
      if (!ref2Phone || ref2Phone.length < 7) {
        setError("Por favor ingresa un número de teléfono válido para la Referencia 2.");
        return false;
      }
    }

    return true;
  };

  const handleNext = async () => {
    if (step === 3 && hasDrawnSignature && !formData.documents.some(d => d.kind === "digital_signature")) {
      await saveDrawnSignature();
    }
    if (validateStep(step)) setStep(prev => prev + 1);
  };
  
  const handleBack = () => {
    setError(null);
    setStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    // Validar todos los pasos por seguridad antes de enviar
    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(4)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const targetUrl = isEditMode
        ? `${API}/driver-applications/by-token/${editToken}`
        : `${API}/driver-applications`;
      const response = await fetch(targetUrl, {
        method: isEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errData = await response.json();
        if (errData.fields && Array.isArray(errData.fields) && errData.fields.length > 0) {
          const fieldLabels: Record<string, string> = {
            "personal.fullName": "Nombre completo",
            "personal.documentNumber": "Cédula / Documento",
            "personal.dateOfBirth": "Fecha de nacimiento (debes tener al menos 18 años)",
            "personal.phoneMobile": "Celular",
            "personal.email": "Correo electrónico",
            "personal.address": "Dirección de residencia",
            "workExperience.drivingExpTime": "Años de experiencia",
            "workExperience.similarJobExp": "Experiencia previa",
            "license.licenseNumberCat": "Categoría de licencia",
            "references": "Referencias (mínimo 2)",
            "references[0].name": "Nombre Referencia 1",
            "references[0].phone": "Teléfono Referencia 1",
            "references[1].name": "Nombre Referencia 2",
            "references[1].phone": "Teléfono Referencia 2",
            "confirmations.acceptsWorkConditions": "Aceptación de condiciones de trabajo",
            "confirmations.understandsDamageLiability": "Responsabilidad civil por daños",
            "confirmations.truthDeclarationAccepted": "Certificación de veracidad de datos",
          };
          const issues = errData.fields
            .map((f: any) => fieldLabels[f.path] || f.path)
            .join(", ");
          throw new Error(`Por favor revisa los siguientes campos: ${issues}`);
        }
        throw new Error(errData.message || "Error en la validación del formulario.");
      }
      const okData = await response.json().catch(() => ({}));
      if (okData?.editUrl) setSubmittedEditUrl(okData.editUrl);
      setSuccess(true);
      onUpdated?.();
    } catch (err: any) {
      setError(err.message || "Ocurrió un error inesperado al enviar la postulación.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-3xl border border-emerald-500/30 bg-slate-900/80 p-8 text-center space-y-3">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl text-emerald-400">✓</div>
        <h3 className="text-xl font-bold text-white">
          {isEditMode ? "¡Postulación Actualizada!" : "¡Postulación Enviada!"}
        </h3>
        <p className="text-slate-300 text-sm">
          {isEditMode
            ? "Guardamos tus cambios y enviamos un correo con el resumen actualizado."
            : `Pronto nos pondremos en contacto contigo. Enviamos un resumen de tus datos a ${formData.personal.email}.`}
        </p>
        {submittedEditUrl && (
          <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/70 p-4 text-left text-xs text-slate-300">
            <p className="font-semibold text-white mb-1">¿Necesitas corregir algún dato?</p>
            <p className="text-slate-400 mb-2">
              Puedes revisar o modificar tu postulación mientras esté en revisión usando el enlace que enviamos a tu correo:
            </p>
            <a href={submittedEditUrl} className="text-emerald-400 underline break-all font-medium">
              {submittedEditUrl}
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl">
      <div className="mb-6 flex justify-between gap-2">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${step >= s ? 'bg-emerald-500' : 'bg-slate-700'}`} />
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-400 border border-red-500/20 leading-relaxed">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white">1. Información Personal</h3>
          
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Nombre Completo *</label>
            <input
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
              placeholder="Ej. Juan Pérez Restrepo"
              value={formData.personal.fullName}
              onChange={e => setFormData({...formData, personal: {...formData.personal, fullName: e.target.value}})}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Cédula / Documento *</label>
              <input
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
                placeholder="Número de cédula"
                value={formData.personal.documentNumber}
                onChange={e => setFormData({...formData, personal: {...formData.personal, documentNumber: e.target.value}})}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Fecha de Nacimiento *</label>
              <input
                type="date"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
                value={formData.personal.dateOfBirth}
                onChange={e => setFormData({...formData, personal: {...formData.personal, dateOfBirth: e.target.value}})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Celular / WhatsApp *</label>
              <input
                type="tel"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
                placeholder="Ej. 3123456789"
                value={formData.personal.phoneMobile}
                onChange={e => setFormData({...formData, personal: {...formData.personal, phoneMobile: e.target.value}})}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Correo Electrónico *</label>
              <input
                type="email"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
                placeholder="ejemplo@correo.com"
                value={formData.personal.email}
                onChange={e => setFormData({...formData, personal: {...formData.personal, email: e.target.value}})}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Dirección de Residencia *</label>
            <input
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-400"
              placeholder="Dirección, Barrio, Ciudad"
              value={formData.personal.address}
              onChange={e => setFormData({...formData, personal: {...formData.personal, address: e.target.value}})}
            />
          </div>

          {/* Selfie + Cédula Frontal y Trasera (Obligatorios) */}
          <div className="pt-3 border-t border-white/10 space-y-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Fotos obligatorias de identidad
              </h4>
              <p className="text-[11px] text-slate-400">
                Sigue la guía visual: buena luz, sin reflejos y con las 4 esquinas del documento visibles.
              </p>
            </div>

            <DocumentPhotoCard
              demoKind="selfie"
              title="Selfie (Foto de perfil)"
              hint="Rostro centrado, buena iluminación, sin gorra ni gafas oscuras."
              url={formData.documents.find(d => d.kind === "driver_selfie")?.url}
              uploading={uploadingDoc === "driver_selfie"}
              accept="image/*"
              capture="user"
              onUpload={(f) => handleDocumentUpload("driver_selfie", f)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DocumentPhotoCard
                demoKind="id_front"
                title="Cédula — Cara Frontal"
                hint="Donde aparece tu foto y número de documento."
                url={formData.documents.find(d => d.kind === "id_front_photo")?.url}
                uploading={uploadingDoc === "id_front_photo"}
                onUpload={(f) => handleDocumentUpload("id_front_photo", f)}
              />
              <DocumentPhotoCard
                demoKind="id_back"
                title="Cédula — Cara Trasera"
                hint="Reverso completo con huella y código de barras."
                url={formData.documents.find(d => d.kind === "id_back_photo")?.url}
                uploading={uploadingDoc === "id_back_photo"}
                onUpload={(f) => handleDocumentUpload("id_back_photo", f)}
              />
            </div>
          </div>

          <button onClick={handleNext} className="w-full mt-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">
            Siguiente
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">2. Experiencia</h3>
          <div className="space-y-3 py-1">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 font-medium">
              ✓ Requisito obligatorio: debes contar con licencia de conducción vigente.
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Categoría de licencia vigente *</label>
              <input
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white"
                placeholder="Ej. C1, C2, B1"
                value={formData.license.licenseNumberCat}
                onChange={e => setFormData({...formData, license: {...formData.license, licenseNumberCat: e.target.value}})}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DocumentPhotoCard
                demoKind="license_front"
                title="Licencia — Cara Frontal"
                hint="Foto legible del frente con tus datos y número."
                url={formData.documents.find(d => d.kind === "license_front_photo")?.url}
                uploading={uploadingDoc === "license_front_photo"}
                onUpload={(f) => handleDocumentUpload("license_front_photo", f)}
              />
              <DocumentPhotoCard
                demoKind="license_back"
                title="Licencia — Cara Trasera"
                hint="Reverso legible con categorías y fechas de vigencia."
                url={formData.documents.find(d => d.kind === "license_back_photo")?.url}
                uploading={uploadingDoc === "license_back_photo"}
                onUpload={(f) => handleDocumentUpload("license_back_photo", f)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Años de experiencia manejando *</label>
            <input
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white"
              placeholder="Ej. 3 años (o sólo el número)"
              value={formData.workExperience.drivingExpTime}
              onChange={e => setFormData({...formData, workExperience: {...formData.workExperience, drivingExpTime: e.target.value}})}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Experiencia previa (opcional)</label>
            <textarea
              className="w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-2 text-sm text-white h-24"
              placeholder="Describe en qué plataformas has conducido (Uber, Didi, taxi, renting, etc.)..."
              value={formData.workExperience.similarJobExp}
              onChange={e => setFormData({...formData, workExperience: {...formData.workExperience, similarJobExp: e.target.value}})}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">
              Atrás
            </button>
            <button onClick={handleNext} className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">
              Siguiente
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">3. Compromisos y Aceptaciones</h3>
          <div className="rounded-xl bg-slate-950 p-4 space-y-4 border border-white/5">
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-500"
                checked={formData.responsibilities.weeklyDeliveryCommitment}
                onChange={e => setFormData({...formData, responsibilities: {...formData.responsibilities, weeklyDeliveryCommitment: e.target.checked}})}
              />
              Acepto entrega semanal de liquidación estipulada para el vehículo
            </label>
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-500"
                checked={formData.substances.toxicologyTestConsent}
                onChange={e => setFormData({...formData, substances: {...formData.substances, toxicologyTestConsent: e.target.checked}})}
              />
              Acepto pruebas de toxicología aleatorias por seguridad
            </label>
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-500"
                required
                checked={formData.confirmations.acceptsWorkConditions}
                onChange={e => setFormData({...formData, confirmations: {...formData.confirmations, acceptsWorkConditions: e.target.checked}})}
              />
              Acepto las condiciones de trabajo y reglas de uso del renting *
            </label>
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-500"
                required
                checked={formData.confirmations.understandsDamageLiability}
                onChange={e => setFormData({...formData, confirmations: {...formData.confirmations, understandsDamageLiability: e.target.checked}})}
              />
              Entiendo mi responsabilidad civil sobre daños y buen cuidado del auto *
            </label>
            <label className="flex items-start gap-3 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-1 accent-emerald-500"
                required
                checked={formData.confirmations.truthDeclarationAccepted}
                onChange={e => setFormData({...formData, confirmations: {...formData.confirmations, truthDeclarationAccepted: e.target.checked}})}
              />
              Certifico que toda la información ingresada en esta postulación es verídica *
            </label>
          </div>

          {/* Firma Digital */}
          <div className="rounded-xl bg-slate-950 p-4 border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <span>✍️</span> Firma Digital (Opcional)
              </label>
              {formData.documents.some(d => d.kind === "digital_signature") && (
                <span className="text-[11px] font-bold text-emerald-400">✓ Firma registrada</span>
              )}
            </div>

            {formData.documents.some(d => d.kind === "digital_signature") ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                <span className="text-xs text-emerald-300 font-medium">Firma digital guardada correctamente</span>
                <button
                  type="button"
                  onClick={clearSignature}
                  className="text-xs text-red-400 hover:text-red-300 underline font-semibold"
                >
                  Borrar y volver a firmar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400">
                  Dibuja tu firma en el recuadro con tu dedo o mouse, o sube una foto de tu firma:
                </p>
                <div className="border border-white/20 rounded-xl overflow-hidden bg-slate-900 touch-none">
                  <canvas
                    ref={canvasRef}
                    width={340}
                    height={120}
                    className="w-full h-28 cursor-crosshair block"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={clearSignature}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                    >
                      Limpiar
                    </button>
                    {hasDrawnSignature && (
                      <button
                        type="button"
                        onClick={saveDrawnSignature}
                        disabled={uploadingDoc === "digital_signature"}
                        className="px-3 py-1.5 text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg transition-colors"
                      >
                        {uploadingDoc === "digital_signature" ? "Guardando..." : "Confirmar trazo"}
                      </button>
                    )}
                  </div>
                  <label className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer">
                    O subir foto de tu firma
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleDocumentUpload("digital_signature", f);
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">
              Atrás
            </button>
            <button onClick={handleNext} className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400">
              Siguiente
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">4. Referencias Personales / Familiares</h3>
          <p className="text-xs text-slate-400">
            Ingresa los datos de contacto de 2 personas que puedan dar referencia tuya.
          </p>
          
          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-2">
            <span className="text-xs font-semibold text-emerald-400">Referencia 1</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="Nombre completo"
                value={formData.references[0]?.name || ""}
                onChange={e => {
                  const val = e.target.value;
                  const r = [...formData.references];
                  // Si el usuario escribe o pega nombre y teléfono en el mismo campo
                  const phoneMatch = val.match(/(\+?\d[\d\s\-]{6,}\d)/);
                  if (phoneMatch && (!r[0]?.phone || r[0].phone === "Consultar")) {
                    r[0] = {
                      name: val.replace(phoneMatch[0], "").trim(),
                      phone: phoneMatch[0].replace(/\s+/g, ""),
                    };
                  } else {
                    r[0] = { ...r[0], name: val };
                  }
                  setFormData({ ...formData, references: r });
                }}
              />
              <input
                type="tel"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="Teléfono / Celular"
                value={formData.references[0]?.phone === "Consultar" ? "" : formData.references[0]?.phone || ""}
                onChange={e => {
                  const r = [...formData.references];
                  r[0] = { ...r[0], phone: e.target.value };
                  setFormData({ ...formData, references: r });
                }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-2">
            <span className="text-xs font-semibold text-emerald-400">Referencia 2</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="Nombre completo"
                value={formData.references[1]?.name || ""}
                onChange={e => {
                  const val = e.target.value;
                  const r = [...formData.references];
                  const phoneMatch = val.match(/(\+?\d[\d\s\-]{6,}\d)/);
                  if (phoneMatch && (!r[1]?.phone || r[1].phone === "Consultar")) {
                    r[1] = {
                      name: val.replace(phoneMatch[0], "").trim(),
                      phone: phoneMatch[0].replace(/\s+/g, ""),
                    };
                  } else {
                    r[1] = { ...r[1], name: val };
                  }
                  setFormData({ ...formData, references: r });
                }}
              />
              <input
                type="tel"
                className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white"
                placeholder="Teléfono / Celular"
                value={formData.references[1]?.phone === "Consultar" ? "" : formData.references[1]?.phone || ""}
                onChange={e => {
                  const r = [...formData.references];
                  r[1] = { ...r[1], phone: e.target.value };
                  setFormData({ ...formData, references: r });
                }}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button onClick={handleBack} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-bold text-white hover:bg-white/5">
              Atrás
            </button>
            <button
              disabled={loading}
              onClick={handleSubmit}
              className="flex-[2] rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Finalizar Registro"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}