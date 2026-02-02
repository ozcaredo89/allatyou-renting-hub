import { useState } from "react";
import { 
  Check, 
  X, 
  Gift, 
  ShieldCheck, 
  AlertTriangle, 
  Wrench,
  MessageCircle,
  CreditCard
} from "lucide-react";

const API = (import.meta.env.VITE_API_URL as string).replace(/\/+$/, "");

export default function AssistanceQuiz() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0); // 0-2: Preguntas, 3: Formulario, 4: Oferta
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [formData, setFormData] = useState({ name: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  // --- LAS PREGUNTAS (Copywriting Acordado) ---
  const questions = [
    {
      icon: <ShieldCheck className="w-12 h-12 text-emerald-500 mb-4" />,
      title: "Respaldo Experto",
      text: "En el momento crítico de un choque o una varada, ¿prefieres tener a un equipo con experiencia resolviendo el problema por ti o afrontarlo por tu cuenta?",
      yes: "Sí, prefiero el respaldo de la experiencia",
      no: "Prefiero afrontarlo solo"
    },
    {
      icon: <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />,
      title: "Cero Sorpresas",
      text: "¿Te ha pasado que recibes una fotomulta sorpresa por haber olvidado renovar el SOAT a tiempo, generando gastos innecesarios?",
      yes: "Sí, me ha pasado (o quiero evitarlo)",
      no: "No, siempre estoy pendiente"
    },
    {
      icon: <Wrench className="w-12 h-12 text-blue-500 mb-4" />,
      title: "Confianza Mecánica",
      text: "¿Te genera desconfianza tener que buscar un taller desconocido cuando algo falla en la vía?",
      yes: "Sí, es difícil encontrar un taller 100% honesto",
      no: "No, yo ya tengo mi taller de confianza"
    }
  ];

  const handleAnswer = (val: boolean) => {
    const newAnswers = [...answers, val];
    setAnswers(newAnswers);
    // Pequeño delay para que se sienta el cambio
    setTimeout(() => {
        if (step < 2) {
          setStep(step + 1);
        } else {
          setStep(3); // Pasar al formulario
        }
    }, 200);
  };

  const submitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) return alert("Por favor completa tus datos para ver el resultado.");
    
    setSubmitting(true);
    try {
      await fetch(`${API}/marketing/quiz-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: formData.name,
          phone: formData.phone,
          answers: { q1: answers[0], q2: answers[1], q3: answers[2] }
        })
      });
      setStep(4); // Mostrar oferta final
    } catch (err) {
      console.error(err);
      setStep(4); // Fallback: mostramos oferta igual
    } finally {
      setSubmitting(false);
    }
  };

  const closeQuiz = () => {
      setIsOpen(false);
      // Opcional: reiniciar si cierran antes de terminar? 
      // Por ahora mantenemos el estado por si lo abren de nuevo.
  };

  // --- RENDER 1: BOTÓN FLOTANTE (Si está cerrado) ---
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        // CAMBIOS DE DISEÑO AQUÍ:
        // 1. bg-slate-900 -> bg-emerald-600 (Fondo vibrante)
        // 2. hover:bg-slate-800 -> hover:bg-emerald-700 (Hover más oscuro)
        // 3. border-emerald-500/50 -> border-emerald-400 (Borde más definido)
        className="fixed bottom-6 right-6 z-50 flex items-center gap-4 bg-emerald-600 text-white p-4 rounded-full shadow-2xl hover:scale-105 transition-all group animate-in slide-in-from-bottom-10 duration-700 hover:bg-emerald-700 border-2 border-emerald-400"
      >
        <div className="relative">
            {/* Ícono pasa a blanco */}
            <ShieldCheck className="w-7 h-7 text-white group-hover:animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
        </div>
        <div className="text-left hidden md:block">
            {/* CAMBIOS DE TEXTO AQUÍ */}
            <p className="text-xs text-emerald-100 font-bold uppercase tracking-wider mb-0.5">Diagnóstico Gratuito</p>
            <p className="text-sm font-extrabold leading-tight">Sal de dudas en 1 minuto</p>
        </div>
        {/* Texto móvil simplificado */}
        <span className="md:hidden font-bold text-sm">Diagnóstico</span>
      </button>
    );
  }

  // --- RENDER 2: MODAL (Si está abierto) ---
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      
      {/* Contenedor del Modal */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg relative overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
        
        {/* Botón Cerrar */}
        <button 
            onClick={closeQuiz} 
            className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors z-10"
        >
            <X className="w-5 h-5 text-slate-500" />
        </button>

        {/* CONTENIDO CAMBIANTE SEGÚN EL PASO */}
        <div className="p-8 overflow-y-auto custom-scrollbar">
            
            {/* FASE 1: PREGUNTAS (0, 1, 2) */}
            {step < 3 && (
                <div className="text-center">
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mb-8 mx-auto max-w-[200px]">
                        <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${((step + 1) / 3) * 100}%` }} />
                    </div>
                    
                    <div className="flex justify-center animate-in zoom-in-50 duration-500">{questions[step].icon}</div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-3">{questions[step].title}</h3>
                    <p className="text-lg text-slate-600 mb-8 leading-relaxed">{questions[step].text}</p>
                    
                    <div className="space-y-3">
                        <button 
                            onClick={() => handleAnswer(true)}
                            className="w-full flex items-center justify-center gap-3 p-4 rounded-xl bg-slate-900 text-white font-bold hover:bg-emerald-600 transition-all shadow-lg hover:shadow-emerald-500/30 group"
                        >
                            <div className="bg-white/20 p-1 rounded-full group-hover:bg-white/30"><Check className="w-4 h-4" /></div>
                            {questions[step].yes}
                        </button>
                        <button 
                            onClick={() => handleAnswer(false)}
                            className="w-full p-4 rounded-xl bg-slate-50 text-slate-500 font-medium hover:bg-slate-100 transition-colors text-sm"
                        >
                            {questions[step].no}
                        </button>
                    </div>
                </div>
            )}

            {/* FASE 2: FORMULARIO (3) */}
            {step === 3 && (
                <div className="text-center">
                    <div className="inline-block p-4 bg-emerald-100 rounded-full mb-4 animate-bounce">
                        <Gift className="w-8 h-8 text-emerald-600" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">¡Diagnóstico Listo!</h3>
                    <p className="text-slate-600 mb-6 text-sm">
                        Déjanos tus datos para enviarte el resultado y desbloquear tu <strong>Beneficio de Bienvenida</strong>.
                    </p>
                    
                    <form onSubmit={submitLead} className="space-y-4 text-left">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Nombre Completo</label>
                            <input 
                                required
                                className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white transition-colors"
                                placeholder="Ej: Juan Pérez"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">WhatsApp</label>
                            <input 
                                required
                                type="tel"
                                className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white transition-colors"
                                placeholder="Ej: 300 123 4567"
                                value={formData.phone}
                                onChange={e => setFormData({...formData, phone: e.target.value})}
                            />
                        </div>
                        <button 
                            disabled={submitting}
                            className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg mt-2 disabled:opacity-70 flex justify-center gap-2 items-center"
                        >
                            {submitting ? "Procesando..." : <>Ver Mi Resultado <ShieldCheck className="w-5 h-5"/></>}
                        </button>
                    </form>
                </div>
            )}

            {/* FASE 3: OFERTA FINAL (4) */}
            {step === 4 && (
                <div className="text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <h3 className="text-2xl font-bold text-emerald-600 mb-2">¡Tu Perfil es Ideal!</h3>
                    <p className="text-slate-600 mb-8 text-sm leading-relaxed">
                        Gracias por responder. Notamos que valoras tu tranquilidad. Nuestro servicio <strong>AllAtYou Assistance</strong> es perfecto para ti.
                    </p>

                    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 mb-6">
                        <p className="text-xs uppercase tracking-widest text-slate-500 mb-4 font-bold">¿Qué prefieres?</p>
                        <div className="grid gap-3">
                            {/* OPCIÓN A: COMPRAR */}
                            <button 
                                onClick={() => window.location.href = "/register"} // Ajusta tu ruta de compra
                                className="flex items-center gap-4 p-4 bg-white border-2 border-emerald-500 rounded-xl hover:bg-emerald-50 transition-all text-left group shadow-sm hover:shadow-md"
                            >
                                <div className="bg-emerald-100 p-2 rounded-full text-emerald-600 group-hover:scale-110 transition-transform">
                                    <CreditCard className="w-6 h-6" />
                                </div>
                                <div>
                                    <span className="block font-bold text-slate-900">Adquirir Asistencia</span>
                                    <span className="text-xs text-emerald-600 font-medium">Protección inmediata</span>
                                </div>
                                <div className="ml-auto text-emerald-500"><Check className="w-5 h-5" /></div>
                            </button>

                            {/* OPCIÓN B: AGENDAR */}
                            <a 
                                href={`https://wa.me/573000000000?text=Hola,%20soy%20${formData.name},%20hice%20el%20test%20y%20quiero%20agendar%20una%20cita.`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all text-left group"
                            >
                                <div className="bg-blue-50 p-2 rounded-full text-blue-500 group-hover:scale-110 transition-transform">
                                    <MessageCircle className="w-6 h-6" />
                                </div>
                                <div>
                                    <span className="block font-bold text-slate-900">Agendar una Cita</span>
                                    <span className="text-xs text-slate-500">Resolver dudas primero</span>
                                </div>
                            </a>
                        </div>
                    </div>
                    <p className="text-xs text-slate-400">Tus datos están seguros con nosotros.</p>
                </div>
            )}

        </div>
      </div>
    </div>
  );
}