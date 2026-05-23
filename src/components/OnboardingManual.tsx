import React, { useState } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
  MessageCircle,
  MessageSquare,
  Camera,
  TrendingUp,
  Package,
  User,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface Step {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  actionLabel?: string;
  example?: React.ReactNode;
}

interface OnboardingProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

export const OnboardingManual = ({ isOpen, onClose, isDarkMode }: OnboardingProps) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: Step[] = [
    {
      title: "¡Bienvenido a Voz-Activa!",
      description: "Tu negocio en tu bolsillo. Te enseñaremos cómo usar esta herramienta para que tu negocio vuele.",
      icon: <Sparkles className="w-12 h-12" />,
      color: "from-[#B8860B] to-[#FFD700]",
      actionLabel: "Empezar recorrido"
    },
    {
      title: "Habla con tu Asistente",
      description: "Usa la burbuja flotante para registrar ventas o gastos. ¡Incluso puedes hablarle como a un compadre!",
      icon: <MessageCircle className="w-12 h-12" />,
      color: "from-blue-500 to-cyan-400",
      example: (
        <div className="bg-black/10 p-3 rounded-xl mt-4 italic text-sm">
          "Epa compadre, anótame 20 barras de la venta de hoy"
        </div>
      )
    },
    {
      title: "Registra desde WhatsApp",
      description: "¿Sin tiempo de abrir la app? Escríbele al bot de WhatsApp y registramos todo al instante. Ve a tu Perfil para vincularlo.",
      icon: <MessageSquare className="w-12 h-12" />,
      color: "from-[#25D366] to-[#128C7E]",
      example: (
        <div className="mt-4 space-y-2 text-left">
          <div className="bg-[#25D366]/15 border border-[#25D366]/20 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm font-medium inline-block max-w-[90%]">
            "vendí 5 jugos a 2 mil"
          </div>
          <div className="flex justify-end">
            <div className="bg-[#25D366] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm font-bold text-white max-w-[80%]">
              ✅ 5 jugos a $2.000 — Total $10.000 registrado. 📦 Stock: 45 uds.
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Registra desde Telegram",
      description: "También puedes usar Telegram para registrar ventas y gastos sin abrir la app. Vincúlalo desde tu Perfil igual que WhatsApp.",
      icon: <Send className="w-12 h-12" />,
      color: "from-[#229ED9] to-[#1a7fb5]",
      example: (
        <div className="mt-4 space-y-2 text-left">
          <div className="bg-[#229ED9]/15 border border-[#229ED9]/20 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm font-medium inline-block max-w-[90%]">
            "vendí 3 almuerzos a 12 mil y gasté 8 mil en gas"
          </div>
          <div className="flex justify-end">
            <div className="bg-[#229ED9] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm font-bold text-white max-w-[80%]">
              ✅ Registré venta $36.000 y gasto $8.000
            </div>
          </div>
        </div>
      )
    },
    {
      title: "Finanzas Claras",
      description: "En la pestaña de Finanzas verás cuánto entra y cuánto sale. Gráficos simples para que no se te escape un peso.",
      icon: <TrendingUp className="w-12 h-12" />,
      color: "from-green-500 to-emerald-400"
    },
    {
      title: "Escanea y Organiza",
      description: "Usa la Cámara para leer facturas o ver tus Deudas y Fiados. ¡La IA lee por ti!",
      icon: <Camera className="w-12 h-12" />,
      color: "from-purple-500 to-pink-400"
    },
    {
      title: "Inventario al Día",
      description: "Controla qué tienes en stock y qué se está vendiendo más. Te avisaremos cuando algo se esté acabando.",
      icon: <Package className="w-12 h-12" />,
      color: "from-orange-500 to-yellow-400"
    },
    {
      title: "Tu Pasaporte de Confianza",
      description: "Entre más registres tus ventas, más sube tu Score. ¡Este pasaporte te abre las puertas a créditos para crecer!",
      icon: <ShieldCheck className="w-12 h-12" />,
      color: "from-[#B8860B] to-[#8B4513]",
      example: (
        <div className="bg-[#FFD700]/20 p-3 rounded-xl mt-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#B8860B] flex items-center justify-center text-black font-black">750</div>
          <span className="text-xs font-bold">¡Puntaje apto para crédito!</span>
        </div>
      )
    },
    {
      title: "Tu Perfil Seguro",
      description: "Toca tu foto arriba para ver tus datos o cerrar sesión. Todo está guardado de forma segura en la nube.",
      icon: <User className="w-12 h-12" />,
      color: "from-[#B8860B] to-[#DAA520]"
    }
  ];

  const next = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const prev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className={cn(
            "relative w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col",
            isDarkMode ? "bg-[#1A1A1A] text-[#FDFBF0]" : "bg-white text-[#2e2f2d]"
          )}
        >
          {/* Progress Bar */}
          <div className="absolute top-0 left-0 w-full h-1.5 flex gap-1 px-6 pt-6">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={cn(
                  "h-full flex-1 rounded-full transition-all duration-500",
                  i <= currentStep ? "bg-[#B8860B]" : "bg-gray-500/20"
                )}
              />
            ))}
          </div>

          <button 
            onClick={onClose}
            className="absolute top-8 right-6 p-2 rounded-full hover:bg-black/5 transition-colors"
          >
            <X className="w-5 h-5 opacity-40" />
          </button>

          <div className="p-8 pt-16 flex-1 flex flex-col items-center text-center">
            <motion.div
              key={currentStep}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="space-y-6"
            >
              <div className={cn(
                "w-24 h-24 rounded-3xl bg-gradient-to-br flex items-center justify-center text-white shadow-xl mx-auto mb-8",
                steps[currentStep].color
              )}>
                {steps[currentStep].icon}
              </div>

              <h2 className="text-2xl font-black font-['Plus_Jakarta_Sans'] leading-tight">
                {steps[currentStep].title}
              </h2>
              
              <p className="text-base opacity-70 leading-relaxed font-medium">
                {steps[currentStep].description}
              </p>

              {steps[currentStep].example && (
                <div className="animate-in fade-in zoom-in duration-500">
                  {steps[currentStep].example}
                </div>
              )}
            </motion.div>
          </div>

          <div className="p-8 pt-0 flex items-center justify-between gap-4">
            {currentStep > 0 ? (
              <button 
                onClick={prev}
                className="w-12 h-12 rounded-2xl border border-gray-500/10 flex items-center justify-center hover:bg-black/5 transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            ) : (
              <button 
                onClick={onClose}
                className="text-sm font-bold opacity-40 hover:opacity-100 transition-opacity"
              >
                Saltar
              </button>
            )}

            <button 
              onClick={next}
              className="flex-1 h-14 bg-[#B8860B] text-black rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
            >
              {currentStep === steps.length - 1 ? "¡Entendido!" : (steps[currentStep].actionLabel || "Siguiente")}
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
