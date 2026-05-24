import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, Eye, FileText, CheckCircle2, ArrowRight,
  Building2, Lock, Star, AlertCircle,
  Fingerprint, BarChart3, ClipboardList, QrCode, LogOut,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { AvalDashboard } from './AvalDashboard';
import { IdentityVerification } from './IdentityVerification';
import { Sale } from '../types';

interface Props {
  isDarkMode: boolean;
  userId: string;
  prefillCedula?: string;
  profileBirthDate?: string;
  userName?: string;
  sales: Sale[];
  identityVerified?: boolean;
  verifiedCedula?: string;
  verifiedName?: string;
  onExit?: () => void;
}

type Step = 'info' | 'identity' | 'dashboard';

const STEPS = [
  {
    number: '01',
    icon: Fingerprint,
    title: 'Verificá tu identidad',
    desc: 'Confirma quién eres con tu número de cédula. Sin banco, sin filas, desde el celular.',
  },
  {
    number: '02',
    icon: BarChart3,
    title: 'Conecta tu historial',
    desc: 'Tus ventas y gastos registrados en Voz-Activa se convierten en evidencia real de tu actividad económica.',
  },
  {
    number: '03',
    icon: FileText,
    title: 'Genera tu certificado',
    desc: 'Descarga un PDF con código QR verificable. Muéstralo al banco con confianza.',
  },
];

const INCLUDES = [
  { icon: BarChart3,     label: 'Resumen de ingresos y gastos',     desc: 'Últimos 3 o 6 meses de actividad real' },
  { icon: Star,          label: 'Puntuación crediticia Voz-Activa', desc: 'Escala 150–950 basada en tu comportamiento' },
  { icon: ClipboardList, label: 'Tabla de movimientos verificados', desc: 'Ventas, gastos y cobros auditables' },
  { icon: QrCode,        label: 'Código QR de verificación',        desc: 'Cualquier banco puede confirmar la autenticidad' },
  { icon: Building2,     label: 'Carta de presentación',            desc: 'Redactada con lenguaje financiero formal' },
];

const REQUIREMENTS: { text: string; key?: boolean }[] = [
  { text: 'La mayoría de tus ingresos deben venir por vía de entidad financiera: transferencias, pagos QR, Nequi, Daviplata, Davivienda o Bancolombia. Los bancos no reconocen efectivo.', key: true },
  { text: 'Mínimo 30 días de actividad registrada en la app' },
  { text: 'Perfil completo con número de identificación' },
  { text: 'Al menos 10 ventas o movimientos registrados' },
  { text: 'Foto de perfil y datos básicos del negocio' },
];

export const AvalView = ({ isDarkMode, userId, prefillCedula = '', profileBirthDate = '', userName = '', sales, identityVerified, verifiedCedula: savedCedula, verifiedName: savedName, onExit }: Props) => {
  const [step, setStep]                     = useState<Step>(identityVerified ? 'dashboard' : 'info');
  const [verifiedName, setVerifiedName]     = useState(savedName || userName);
  const [verifiedCedula, setVerifiedCedula] = useState(savedCedula || prefillCedula);

  // React when Firestore profile loads after component already mounted
  useEffect(() => {
    if (identityVerified) {
      setStep('dashboard');
      if (savedCedula) setVerifiedCedula(savedCedula);
      if (savedName)   setVerifiedName(savedName);
    }
  }, [identityVerified, savedCedula, savedName]);

  const card = cn('rounded-2xl p-6', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white');
  const muted = isDarkMode ? 'text-white/40' : 'text-black/40';
  const text  = isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]';

  // ── Dashboard ────────────────────────────────────────────────────────────
  if (step === 'dashboard') {
    return (
      <AvalDashboard
        isDarkMode={isDarkMode}
        cedula={verifiedCedula}
        userName={verifiedName}
        userId={userId}
        onBack={() => setStep('info')}
      />
    );
  }

  // ── Identity step ─────────────────────────────────────────────────────────
  if (step === 'identity') {
    return (
      <IdentityVerification
        isDarkMode={isDarkMode}
        userId={userId}
        prefillCedula={prefillCedula}
        profileBirthDate={profileBirthDate}
        onVerified={(name) => {
          setVerifiedName(name || userName);
          setStep('dashboard');
        }}
        onBack={() => setStep('info')}
      />
    );
  }

  // ── Info page ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">


      {/* Hero */}
      <div className={cn(
        'relative overflow-hidden rounded-2xl px-6 pt-8 pb-10',
        isDarkMode ? 'bg-[#1A1A00]' : 'bg-gradient-to-br from-[#FFF8DC] to-[#FFF0A0]'
      )}>
        <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-[#B8860B]/10" />
        <div className="absolute -right-2 bottom-0 w-32 h-32 rounded-full bg-[#FFD700]/10" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#B8860B] to-[#FFD700] flex items-center justify-center text-black shadow-lg">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[#B8860B]">Oportunidad para crédito · Verificación crediticia</span>
          </div>
          <h1 className="font-['Plus_Jakarta_Sans'] font-black text-3xl leading-tight mb-3" style={{ color: '#2e2f2d' }}>
            Hazte visible<br />para los bancos.
          </h1>
          <p className="text-sm font-medium leading-relaxed max-w-xs" style={{ color: '#5b5c5a' }}>
            Convierte cada venta que registras en evidencia financiera formal. Un certificado 100% verificable que habla por ti.
          </p>
          <button
            onClick={() => setStep('identity')}
            className="mt-6 flex items-center gap-2 px-5 py-3 rounded-xl font-black text-sm bg-gradient-to-r from-[#B8860B] to-[#DAA520] text-white shadow-md active:scale-[0.97] transition-all"
          >
            Validar identidad
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Qué es */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-[#B8860B]" />
          <h2 className={cn("font-black text-base font-['Plus_Jakarta_Sans']", text)}>¿Qué es Oportunidad para crédito?</h2>
        </div>
        <p className={cn('text-sm leading-relaxed', isDarkMode ? 'text-white/60' : 'text-[#5b5c5a]')}>
          Miles de vendedores informales en Colombia tienen ingresos reales pero ningún banco los ve. <strong className={text}>Oportunidad para crédito</strong> traduce tu historial diario de ventas y gastos en un documento financiero formal, con la misma estructura que un banco espera ver.
        </p>
        <p className={cn('text-sm leading-relaxed mt-3', isDarkMode ? 'text-white/60' : 'text-[#5b5c5a]')}>
          No reemplaza un salario, pero sí demuestra que tu negocio existe, genera ingresos consistentes y que eres una persona confiable.
        </p>
      </div>

      {/* Cómo funciona */}
      <div>
        <p className={cn('text-[10px] font-black uppercase tracking-widest px-1 mb-3', muted)}>Cómo funciona</p>
        <div className="space-y-3">
          {STEPS.map((s) => (
            <div key={s.number} className={cn('flex gap-4 p-4 rounded-2xl', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#B8860B]/20 to-[#FFD700]/20 flex items-center justify-center flex-shrink-0">
                <s.icon className="w-5 h-5 text-[#B8860B]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black text-[#B8860B] tracking-widest">{s.number}</span>
                  <h3 className={cn('font-black text-sm', text)}>{s.title}</h3>
                </div>
                <p className={cn('text-xs leading-relaxed', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]/80')}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Qué incluye */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-4 h-4 text-[#B8860B]" />
          <h2 className={cn("font-black text-base font-['Plus_Jakarta_Sans']", text)}>¿Qué incluye el certificado?</h2>
        </div>
        <div className="space-y-3">
          {INCLUDES.map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', isDarkMode ? 'bg-[#B8860B]/15' : 'bg-[#FFF8DC]')}>
                <item.icon className="w-4 h-4 text-[#B8860B]" />
              </div>
              <div>
                <p className={cn('text-sm font-bold', text)}>{item.label}</p>
                <p className={cn('text-xs', muted)}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Requisitos */}
      <div className={cn('rounded-2xl p-6 border-2', isDarkMode ? 'bg-[#1A1A1A] border-[#B8860B]/20' : 'bg-[#FFFDF5] border-[#B8860B]/20')}>
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4 text-[#B8860B]" />
          <h2 className={cn("font-black text-base font-['Plus_Jakarta_Sans']", text)}>Requisitos</h2>
        </div>
        <div className="space-y-2.5">
          {REQUIREMENTS.map((req) => (
            req.key ? (
              <div key={req.text} className={cn('flex items-start gap-3 rounded-xl p-3 border-2', isDarkMode ? 'bg-[#B8860B]/10 border-[#B8860B]/30' : 'bg-[#FFF8DC] border-[#B8860B]/40')}>
                <AlertCircle className="w-4 h-4 text-[#B8860B] flex-shrink-0 mt-0.5" />
                <p className={cn('text-sm font-semibold leading-relaxed', isDarkMode ? 'text-[#FFD700]/90' : 'text-[#7a5c00]')}>{req.text}</p>
              </div>
            ) : (
              <div key={req.text} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#B8860B] flex-shrink-0 mt-0.5" />
                <p className={cn('text-sm', isDarkMode ? 'text-white/60' : 'text-[#5b5c5a]')}>{req.text}</p>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Privacidad */}
      <div className={cn('rounded-2xl p-4 flex gap-3', isDarkMode ? 'bg-white/5' : 'bg-black/3')}>
        <Lock className={cn('w-4 h-4 flex-shrink-0 mt-0.5', muted)} />
        <p className={cn('text-xs leading-relaxed', muted)}>
          <strong className={isDarkMode ? 'text-white/60' : 'text-black/50'}>Privacidad garantizada.</strong> Tu información solo se usa para generar tu certificado. Nunca se comparte con terceros sin tu autorización explícita.
        </p>
      </div>

      {/* CTA final */}
      <div className={cn('rounded-2xl p-6 text-center', isDarkMode ? 'bg-[#1A1A00]' : 'bg-gradient-to-br from-[#FFF8DC] to-[#FFF0A0]')}>
        <ShieldCheck className="w-10 h-10 text-[#B8860B] mx-auto mb-3" />
        <h3 className={cn("font-black text-lg font-['Plus_Jakarta_Sans'] mb-2", text)}>¿Listo para ser visible?</h3>
        <p className={cn('text-sm mb-5', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]')}>
          Da el primer paso hacia el acceso al crédito formal.
        </p>
        <button
          onClick={() => setStep('identity')}
          className="w-full flex items-center justify-between px-5 py-4 rounded-xl font-black text-sm bg-gradient-to-r from-[#B8860B] to-[#DAA520] text-white shadow-lg active:scale-[0.98] transition-all"
        >
          <span>Validar identidad</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
