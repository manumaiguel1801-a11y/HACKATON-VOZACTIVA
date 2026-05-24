import React, { useState, useRef } from 'react';
import {
  IdCard, Camera, Upload, CheckCircle2, XCircle,
  Loader2, ChevronLeft, ShieldCheck, AlertCircle, RefreshCw,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { analyzeCedulaImage, saveVerification, VerificationResult } from '../services/identityService';

type Step = 'cedula' | 'foto' | 'analizando' | 'resultado';

interface Props {
  isDarkMode: boolean;
  userId: string;
  prefillCedula?: string;
  profileBirthDate?: string;
  onVerified: (name: string) => void;
  onBack: () => void;
}

export const IdentityVerification = ({ isDarkMode, userId, prefillCedula = '', profileBirthDate = '', onVerified, onBack }: Props) => {
  const [step, setStep]               = useState<Step>('cedula');
  const [cedula, setCedula]           = useState(prefillCedula);
  const [cedulaError, setCedulaError] = useState('');
  const [photoFile, setPhotoFile]     = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [result, setResult]           = useState<VerificationResult | null>(null);
  const [saving, setSaving]           = useState(false);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  const text  = isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]';
  const muted = isDarkMode ? 'text-white/40' : 'text-black/40';
  const card  = cn('rounded-2xl p-6', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white');
  const inputBase = (error: boolean) => cn(
    'w-full h-14 px-4 rounded-xl border-2 text-base font-bold outline-none transition-colors',
    error
      ? 'border-red-400 bg-red-50 text-red-700'
      : isDarkMode
        ? 'bg-[#0D0D0D] border-white/10 text-[#FDFBF0] placeholder:text-white/20 focus:border-[#B8860B]'
        : 'bg-[#FDFBF0] border-black/10 text-[#2e2f2d] placeholder:text-black/25 focus:border-[#B8860B]',
  );

  // ── Step 1 ───────────────────────────────────────────────────────────────
  const handleCedulaNext = () => {
    const cleanNum = cedula.replace(/\D/g, '');
    if (cleanNum.length < 6) {
      setCedulaError('Ingresa un número de cédula válido.');
      return;
    }
    setCedulaError('');
    setStep('foto');
  };

  // ── Step 2 ───────────────────────────────────────────────────────────────
  const handleFileSelect = (file: File) => {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleAnalyze = async () => {
    if (!photoFile) return;
    setStep('analizando');

    const res = await analyzeCedulaImage(photoFile, cedula, profileBirthDate);
    setResult(res);

    if (res.ok) {
      setSaving(true);
      try {
        await saveVerification(userId, photoFile, res);
      } catch (e) {
        console.error('[IdentityVerification] Save error:', e);
      } finally {
        setSaving(false);
      }
    }

    setStep('resultado');
  };

  const handleRetry = () => {
    setPhotoFile(null);
    setPhotoPreview('');
    setResult(null);
    setStep('foto');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-400 max-w-sm mx-auto">
      {/* Back */}
      {step !== 'analizando' && (
        <button
          onClick={step === 'cedula' ? onBack : () => setStep(step === 'foto' ? 'cedula' : 'foto')}
          className={cn('flex items-center gap-1.5 text-xs font-bold transition-colors', isDarkMode ? 'text-white/40 hover:text-white/70' : 'text-black/40 hover:text-black/70')}
        >
          <ChevronLeft className="w-4 h-4" />
          {step === 'cedula' ? 'Volver' : 'Atrás'}
        </button>
      )}

      {/* ── PASO 1: Cédula + Fecha ──────────────────────────────────────── */}
      {step === 'cedula' && (
        <div className={cn(card, 'space-y-5')}>
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#B8860B] to-[#FFD700] flex items-center justify-center text-black shadow-lg">
              <IdCard className="w-7 h-7" />
            </div>
            <div>
              <h2 className={cn("font-black text-xl font-['Plus_Jakarta_Sans']", text)}>Paso 1 de 2</h2>
              <p className={cn('text-sm mt-1', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]')}>
                Ingresa tu número de cédula
              </p>
            </div>
          </div>

          {/* Cédula */}
          <div className="space-y-1.5">
            <label className={cn('text-xs font-bold uppercase tracking-widest', muted)}>Número de cédula</label>
            <input
              type="tel"
              inputMode="numeric"
              value={cedula}
              onChange={e => { setCedula(e.target.value.replace(/\D/g, '')); setCedulaError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleCedulaNext()}
              placeholder="Ej: 1020304050"
              className={inputBase(!!cedulaError)}
            />
            {cedulaError && (
              <p className="text-xs font-medium text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />{cedulaError}
              </p>
            )}
          </div>

          <button
            onClick={handleCedulaNext}
            className="w-full py-3.5 flex items-center justify-center rounded-xl font-black text-sm bg-gradient-to-r from-[#B8860B] to-[#DAA520] text-white shadow-md active:scale-[0.98] transition-all"
          >
            Continuar →
          </button>
        </div>
      )}

      {/* ── PASO 2: Foto ───────────────────────────────────────────────── */}
      {step === 'foto' && (
        <div className={cn(card, 'space-y-5')}>
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#B8860B] to-[#FFD700] flex items-center justify-center text-black shadow-lg">
              <Camera className="w-7 h-7" />
            </div>
            <div>
              <h2 className={cn("font-black text-xl font-['Plus_Jakarta_Sans']", text)}>Paso 2 de 2</h2>
              <p className={cn('text-sm mt-1', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]')}>
                Toma o sube una foto de tu cédula
              </p>
            </div>
          </div>

          {photoPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              <img src={photoPreview} alt="Cédula" className="w-full h-48 object-cover rounded-xl" />
              <button
                onClick={() => { setPhotoFile(null); setPhotoPreview(''); }}
                className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-lg flex items-center justify-center text-white"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'w-full h-40 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 transition-colors',
                isDarkMode
                  ? 'border-white/15 hover:border-[#B8860B]/50 hover:bg-[#B8860B]/5'
                  : 'border-black/10 hover:border-[#B8860B]/40 hover:bg-[#FFF8DC]/50',
              )}
            >
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', isDarkMode ? 'bg-white/8' : 'bg-black/5')}>
                <Upload className={cn('w-5 h-5', muted)} />
              </div>
              <div className="text-center">
                <p className={cn('text-sm font-bold', text)}>Toca para subir foto</p>
                <p className={cn('text-xs mt-0.5', muted)}>JPG, PNG · Frente de la cédula</p>
              </div>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
          />

          <div className={cn('rounded-xl p-3 space-y-1.5', isDarkMode ? 'bg-white/5' : 'bg-[#FFF8DC]')}>
            {['Fondo plano, buena luz', 'Cédula completa visible, sin cortes', 'Evita reflejos o sombras'].map(tip => (
              <p key={tip} className={cn('text-xs flex items-center gap-2', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]')}>
                <span className="text-[#B8860B]">·</span>{tip}
              </p>
            ))}
          </div>

          <button
            onClick={handleAnalyze}
            disabled={!photoFile}
            className={cn(
              'w-full py-3.5 rounded-xl font-black text-sm transition-all active:scale-[0.98]',
              photoFile
                ? 'bg-gradient-to-r from-[#B8860B] to-[#DAA520] text-white shadow-md'
                : isDarkMode ? 'bg-white/10 text-white/30' : 'bg-black/8 text-black/30',
            )}
          >
            Verificar identidad
          </button>
        </div>
      )}

      {/* ── ANALIZANDO ─────────────────────────────────────────────────── */}
      {step === 'analizando' && (
        <div className={cn(card, 'flex flex-col items-center text-center gap-5 py-10')}>
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#B8860B] to-[#FFD700] flex items-center justify-center text-black">
              <IdCard className="w-8 h-8" />
            </div>
            <div className="absolute -inset-1 rounded-2xl border-2 border-[#B8860B]/30 animate-ping" />
          </div>
          <div>
            <h2 className={cn("font-black text-lg font-['Plus_Jakarta_Sans'] mb-1", text)}>Analizando documento</h2>
            <p className={cn('text-sm', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]')}>
              La IA está leyendo tu cédula...
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#B8860B]" />
            <span className={cn('text-xs font-medium', muted)}>Esto tarda unos segundos</span>
          </div>
        </div>
      )}

      {/* ── RESULTADO ──────────────────────────────────────────────────── */}
      {step === 'resultado' && result && (
        <div className={cn(card, 'space-y-5')}>
          {result.ok ? (
            <>
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
                  <CheckCircle2 className="w-9 h-9 text-green-500" />
                </div>
                <div>
                  <h2 className={cn("font-black text-xl font-['Plus_Jakarta_Sans']", text)}>¡Identidad verificada!</h2>
                  <p className={cn('text-sm mt-1', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]')}>
                    Tu documento fue reconocido correctamente
                  </p>
                </div>
              </div>

              <div className={cn('rounded-xl p-4 space-y-2', isDarkMode ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200')}>
                <div className="flex justify-between items-center">
                  <span className={cn('text-xs font-bold uppercase tracking-widest', muted)}>Nombre</span>
                  <span className={cn('text-sm font-black', text)}>{result.extractedName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={cn('text-xs font-bold uppercase tracking-widest', muted)}>Cédula</span>
                  <span className={cn('text-sm font-black', text)}>••••{result.extractedCedula?.slice(-4)}</span>
                </div>
                {result.extractedBirthDate && (
                  <div className="flex justify-between items-center">
                    <span className={cn('text-xs font-bold uppercase tracking-widest', muted)}>Nacimiento</span>
                    <span className={cn('text-sm font-black', text)}>{result.extractedBirthDate}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className={cn('text-xs font-bold uppercase tracking-widest', muted)}>Confianza</span>
                  <span className="text-xs font-black text-green-600 uppercase">{result.confidence}</span>
                </div>
              </div>

              {saving && (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#B8860B]" />
                  <span className={cn('text-xs', muted)}>Guardando verificación...</span>
                </div>
              )}

              <button
                onClick={() => onVerified(result.extractedName ?? '')}
                disabled={saving}
                className="w-full py-3.5 flex items-center justify-center gap-2 rounded-xl font-black text-sm bg-gradient-to-r from-[#B8860B] to-[#DAA520] text-white shadow-md active:scale-[0.98] transition-all disabled:opacity-60"
              >
                <ShieldCheck className="w-4 h-4" />
                Ingresar al panel
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center text-center gap-3">
                <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center">
                  <XCircle className="w-9 h-9 text-red-500" />
                </div>
                <div>
                  <h2 className={cn("font-black text-xl font-['Plus_Jakarta_Sans']", text)}>No pudimos verificar</h2>
                  <p className={cn('text-sm mt-1 leading-relaxed', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]')}>
                    {result.message}
                  </p>
                </div>
              </div>

              <button
                onClick={handleRetry}
                className="w-full py-3.5 flex items-center justify-center gap-2 rounded-xl font-black text-sm bg-gradient-to-r from-[#B8860B] to-[#DAA520] text-white shadow-md active:scale-[0.98] transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Intentar de nuevo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
