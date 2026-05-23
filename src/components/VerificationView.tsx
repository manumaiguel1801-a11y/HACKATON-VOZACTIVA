import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { ShieldCheck, AlertCircle, Clock } from 'lucide-react';

interface VerificationData {
  name: string;
  score: number;
  scoreLabel: string;
  businessAgeDays: number;
  monthlyProjection: number;
  generatedAt: string | null;
  expiresAt: string | null;
}

interface Props {
  code: string;
  isDarkMode: boolean;
}

function scoreColor(score: number): string {
  if (score >= 850) return '#22c55e';
  if (score >= 750) return '#84cc16';
  if (score >= 650) return '#DAA520';
  if (score >= 500) return '#f97316';
  return '#ef4444';
}

function formatBusinessAge(days: number): string {
  if (days < 30) return `${days} días`;
  if (days < 365) return `${Math.floor(days / 30)} meses`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0 ? `${years} año${years > 1 ? 's' : ''} y ${months} meses` : `${years} año${years > 1 ? 's' : ''}`;
}

export const VerificationView = ({ code, isDarkMode }: Props) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VerificationData | null>(null);
  const [status, setStatus] = useState<'valid' | 'expired' | 'notfound'>('valid');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/verify?code=${encodeURIComponent(code)}`);
        if (res.status === 404) { setStatus('notfound'); return; }
        if (!res.ok) { setStatus('notfound'); return; }
        const json = await res.json();
        setData(json as VerificationData);
        setStatus(json.status === 'expired' ? 'expired' : 'valid');
      } catch {
        setStatus('notfound');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [code]);

  const bg = isDarkMode ? 'bg-[#0D0D0D] text-[#FDFBF0]' : 'bg-[#FDFBF0] text-[#1A1A1A]';
  const card = isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm';

  if (loading) {
    return (
      <div className={cn('min-h-screen flex items-center justify-center', bg)}>
        <div className="w-12 h-12 border-4 border-[#B8860B] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen flex flex-col items-center justify-center px-6 py-12', bg)}>
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-1">
          <p className="font-['Plus_Jakarta_Sans'] font-black text-2xl tracking-tight">
            <span className="text-[#B8860B]">VOZ·</span>ACTIVA
          </p>
          <p className={cn('text-xs font-bold uppercase tracking-widest', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>
            Verificación de Pasaporte Financiero
          </p>
        </div>

        {/* Código */}
        <div className={cn('rounded-2xl px-4 py-2.5 text-center', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f1f1ee]')}>
          <p className={cn('text-[11px] font-bold tracking-widest uppercase', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>
            Código verificado
          </p>
          <p className="font-['Plus_Jakarta_Sans'] font-black text-[#B8860B] text-sm mt-0.5">{code}</p>
        </div>

        {status === 'notfound' && (
          <div className={cn('rounded-2xl p-6 flex flex-col items-center gap-3 text-center', card)}>
            <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-red-500" />
            </div>
            <p className="font-black text-lg">Código no encontrado</p>
            <p className={cn('text-sm', isDarkMode ? 'text-[#FDFBF0]/50' : 'text-[#5b5c5a]')}>
              Este código de verificación no existe o fue generado antes de que la función estuviera disponible.
            </p>
          </div>
        )}

        {status === 'expired' && data && (
          <div className={cn('rounded-2xl p-6 flex flex-col items-center gap-3 text-center', card)}>
            <div className="w-14 h-14 rounded-full bg-orange-500/10 flex items-center justify-center">
              <Clock className="w-7 h-7 text-orange-500" />
            </div>
            <p className="font-black text-lg">Código expirado</p>
            <p className={cn('text-sm', isDarkMode ? 'text-[#FDFBF0]/50' : 'text-[#5b5c5a]')}>
              Este pasaporte venció. El titular debe generar uno nuevo.
            </p>
          </div>
        )}

        {status === 'valid' && data && (
          <div className={cn('rounded-2xl overflow-hidden', card)}>
            {/* Score hero */}
            <div className="bg-[#1A1A1A] p-6 flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-full bg-[#FFD700]/10 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-[#FFD700]" />
              </div>
              <p className="text-[#FDFBF0]/60 text-xs font-bold uppercase tracking-widest">Score verificado</p>
              <p
                className="font-['Plus_Jakarta_Sans'] font-black text-5xl"
                style={{ color: scoreColor(data.score) }}
              >
                {data.score}
              </p>
              <span
                className="px-3 py-1 rounded-full text-xs font-black text-white"
                style={{ backgroundColor: scoreColor(data.score) }}
              >
                {data.scoreLabel}
              </span>
            </div>

            {/* Info titular */}
            <div className="p-5 space-y-4">
              <div>
                <p className={cn('text-[10px] font-bold uppercase tracking-widest', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>Titular</p>
                <p className="font-black text-base mt-0.5">{data.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {data.businessAgeDays > 0 && (
                  <div className={cn('rounded-xl p-3', isDarkMode ? 'bg-[#0D0D0D]' : 'bg-[#f1f1ee]')}>
                    <p className={cn('text-[10px] font-bold uppercase', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>Antigüedad</p>
                    <p className="font-black text-sm mt-0.5">{formatBusinessAge(data.businessAgeDays)}</p>
                  </div>
                )}
                {data.monthlyProjection > 0 && (
                  <div className={cn('rounded-xl p-3', isDarkMode ? 'bg-[#0D0D0D]' : 'bg-[#f1f1ee]')}>
                    <p className={cn('text-[10px] font-bold uppercase', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>Proy. mensual</p>
                    <p className="font-black text-sm mt-0.5">${data.monthlyProjection.toLocaleString('es-CO')}</p>
                  </div>
                )}
              </div>

              {/* Fechas */}
              <div className={cn('rounded-xl p-3 space-y-1.5', isDarkMode ? 'bg-[#0D0D0D]' : 'bg-[#f1f1ee]')}>
                <div className="flex justify-between text-xs">
                  <span className={isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60'}>Emisión</span>
                  <span className="font-bold">
                    {data.generatedAt
                      ? new Date(data.generatedAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className={isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60'}>Válido hasta</span>
                  <span className="font-bold text-[#B8860B]">
                    {data.expiresAt
                      ? new Date(data.expiresAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
                      : '—'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse shrink-0" />
                <p className={cn('text-[10px] font-bold', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/50')}>
                  Documento verificado · Voz-Activa Scoring Crediticio Alternativo
                </p>
              </div>
            </div>
          </div>
        )}

        <p className={cn('text-center text-[10px]', isDarkMode ? 'text-[#FDFBF0]/20' : 'text-[#5b5c5a]/40')}>
          Este documento no constituye garantía financiera. Solo certifica actividad registrada en la plataforma.
        </p>
      </div>
    </div>
  );
};
