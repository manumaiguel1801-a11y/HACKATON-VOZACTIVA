import React, { useState } from 'react';
import {
  ShieldCheck, Eye, FileText, CheckCircle2, ArrowRight,
  Building2, Lock, Star, AlertCircle, ChevronLeft,
  Fingerprint, BarChart3, ClipboardList, QrCode, IdCard,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { AvalDashboard } from './AvalDashboard';

interface Props {
  isDarkMode: boolean;
  prefillCedula?: string;
  userName?: string;
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

const REQUIREMENTS = [
  'Mínimo 30 días de actividad registrada en la app',
  'Perfil completo con número de identificación',
  'Al menos 10 ventas o movimientos registrados',
  'Foto de perfil y datos básicos del negocio',
];

export const AvalView = ({ isDarkMode, prefillCedula = '', userName = '' }: Props) => {
  const [step, setStep] = useState<Step>('info');
  const [cedula, setCedula] = useState(prefillCedula);
  const [cedulaError, setCedulaError] = useState('');

  const card = cn('rounded-2xl p-6', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white');
  const muted = isDarkMode ? 'text-white/40' : 'text-black/40';
  const text  = isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]';

  const handleIdentitySubmit = () => {
    const clean = cedula.replace(/\D/g, '');
    if (clean.length < 6) {
      setCedulaError('Ingresa un número de cédula válido.');
      return;
    }
    setCedulaError('');
    setStep('dashboard');
  };

  // ── Dashboard ────────────────────────────────────────────────────────────
  if (step === 'dashboard') {
    return (
      <AvalDashboard
        isDarkMode={isDarkMode}
        cedula={cedula}
        userName={userName}
        onBack={() => setStep('info')}
      />
    );
  }

  // ── Identity step ─────────────────────────────────────────────────────────
  if (step === 'identity') {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-400 max-w-sm mx-auto">
        <button
          onClick={() => setStep('info')}
          className={cn('flex items-center gap-1.5 text-xs font-bold transition-colors', isDarkMode ? 'text-white/40 hover:text-white/70' : 'text-black/40 hover:text-black/70')}
        >
          <ChevronLeft className="w-4 h-4" />
          Volver
        </button>

        <div className={cn('rounded-2xl p-6 space-y-5', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
          {/* Icon */}
          <div className="flex flex-col items-center text-center gap-3 pb-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#B8860B] to-[#FFD700] flex items-center justify-center text-black shadow-lg">
              <IdCard className="w-7 h-7" />
            </div>
            <div>
              <h2 className={cn("font-black text-xl font-['Plus_Jakarta_Sans']", text)}>Confirma tu identidad</h2>
              <p className={cn('text-sm mt-1', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]')}>
                Ingresa tu número de cédula para continuar
              </p>
            </div>
          </div>

          {/* Input */}
          <div className="space-y-1.5">
            <label className={cn('text-xs font-bold uppercase tracking-widest', muted)}>
              Número de cédula
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={cedula}
              onChange={e => { setCedula(e.target.value.replace(/\D/g, '')); setCedulaError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleIdentitySubmit()}
              placeholder="Ej: 1020304050"
              className={cn(
                'w-full h-14 px-4 rounded-xl border-2 text-base font-bold transition-colors outline-none',
                cedulaError
                  ? 'border-red-400 bg-red-50 text-red-700'
                  : isDarkMode
                    ? 'bg-[#0D0D0D] border-white/10 text-[#FDFBF0] placeholder:text-white/20 focus:border-[#B8860B]'
                    : 'bg-[#FDFBF0] border-black/10 text-[#2e2f2d] placeholder:text-black/25 focus:border-[#B8860B]'
              )}
            />
            {cedulaError && (
              <p className="text-xs font-medium text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {cedulaError}
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleIdentitySubmit}
            className="w-full h-14 flex items-center justify-between px-5 rounded-xl font-black text-sm bg-gradient-to-r from-[#B8860B] to-[#DAA520] text-white shadow-md active:scale-[0.98] transition-all"
          >
            <span>Ingresar al panel</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          {/* Security note */}
          <div className="flex items-center justify-center gap-1.5">
            <Lock className={cn('w-3.5 h-3.5', muted)} />
            <p className={cn('text-[11px] font-medium', muted)}>
              Tu cédula no se comparte con terceros
            </p>
          </div>
        </div>
      </div>
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
            <span className="text-[10px] font-black uppercase tracking-widest text-[#B8860B]">Mi Aval · Verificación crediticia</span>
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
          <h2 className={cn("font-black text-base font-['Plus_Jakarta_Sans']", text)}>¿Qué es Mi Aval?</h2>
        </div>
        <p className={cn('text-sm leading-relaxed', isDarkMode ? 'text-white/60' : 'text-[#5b5c5a]')}>
          Miles de vendedores informales en Colombia tienen ingresos reales pero ningún banco los ve. <strong className={text}>Mi Aval</strong> traduce tu historial diario de ventas y gastos en un documento financiero formal, con la misma estructura que un banco espera ver.
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
            <div key={req} className="flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-[#B8860B] flex-shrink-0 mt-0.5" />
              <p className={cn('text-sm', isDarkMode ? 'text-white/60' : 'text-[#5b5c5a]')}>{req}</p>
            </div>
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
