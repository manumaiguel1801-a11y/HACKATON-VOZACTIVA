import React from 'react';
import {
  ArrowLeft, Star, TrendingUp, ShieldCheck, Banknote,
  PiggyBank, Wallet, CheckCircle2, Lock, ChevronRight,
  BadgeCheck, Landmark,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Tab, Sale, Expense, Debt } from '../types';
import { calculateScore } from '../services/scoringService';

interface CreditViewProps {
  isDarkMode: boolean;
  onNavigate: (tab: Tab) => void;
  firstName: string;
  sales: Sale[];
  expenses: Expense[];
  debts: Debt[];
}

// ─── Score ring ───────────────────────────────────────────────────────────────

const ScoreRing = ({ score, max = 950 }: { score: number; max?: number }) => {
  const pct = Math.min(score / max, 1);
  const r = 44;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const color = score >= 700 ? '#22c55e' : score >= 500 ? '#B8860B' : '#ef4444';

  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg viewBox="0 0 100 100" className="-rotate-90 w-full h-full">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
          className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-white">{score}</span>
        <span className="text-[10px] text-white/40 font-bold">/ {max}</span>
      </div>
    </div>
  );
};

// ─── Product card ─────────────────────────────────────────────────────────────

const ProductCard = ({
  icon, title, subtitle, tag, active, isDarkMode, onClick,
}: {
  icon: React.ReactNode; title: string; subtitle: string;
  tag: string; active?: boolean; isDarkMode: boolean; onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={!active}
    className={cn(
      'relative flex flex-col gap-3 p-4 rounded-2xl text-left transition-all active:scale-95',
      active
        ? isDarkMode
          ? 'bg-[#1A1A1A] border border-white/10 hover:border-[#B8860B]/40'
          : 'bg-white shadow-sm hover:shadow-md border border-transparent'
        : isDarkMode
          ? 'bg-white/4 border border-white/6 cursor-not-allowed'
          : 'bg-black/3 border border-transparent cursor-not-allowed',
    )}>
    {/* Tag */}
    <span className={cn(
      'absolute top-3 right-3 text-[10px] font-black px-2 py-0.5 rounded-full',
      active
        ? 'bg-emerald-500/15 text-emerald-500'
        : isDarkMode ? 'bg-white/8 text-white/30' : 'bg-black/8 text-black/30',
    )}>
      {tag}
    </span>

    {/* Icon */}
    <div className={cn(
      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
      active ? 'bg-gradient-to-br from-[#B8860B] to-[#FFD700]' : isDarkMode ? 'bg-white/8' : 'bg-black/8',
    )}>
      {React.cloneElement(icon as React.ReactElement, {
        className: cn('w-5 h-5', active ? 'text-black' : isDarkMode ? 'text-white/25' : 'text-black/25'),
      })}
    </div>

    {/* Text */}
    <div>
      <p className={cn('font-black text-sm leading-tight', !active && (isDarkMode ? 'text-white/30' : 'text-black/30'))}>
        {title}
      </p>
      <p className={cn('text-xs mt-0.5', isDarkMode ? 'text-white/35' : 'text-black/40')}>{subtitle}</p>
    </div>

    {active && <ChevronRight className={cn('w-4 h-4 self-end', isDarkMode ? 'text-white/30' : 'text-black/30')} />}
    {!active && <Lock className={cn('w-3.5 h-3.5 self-end', isDarkMode ? 'text-white/15' : 'text-black/15')} />}
  </button>
);

// ─── CreditView ───────────────────────────────────────────────────────────────

export const CreditView = ({ isDarkMode, onNavigate, firstName, sales, expenses, debts }: CreditViewProps) => {
  const scoreData = React.useMemo(() => calculateScore(sales, expenses, debts), [sales, expenses, debts]);
  const score = scoreData.hasEnoughData ? scoreData.scoreFinal : 0;

  const scoreLabel = score >= 800 ? 'Excelente' : score >= 700 ? 'Muy bueno' : score >= 550 ? 'Regular' : score > 0 ? 'En construcción' : 'Sin datos aún';
  const scoreColor = score >= 700 ? 'text-emerald-400' : score >= 500 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className={cn('min-h-screen', isDarkMode ? 'bg-[#0D0D0D] text-white' : 'bg-[#FDFBF0] text-gray-900')}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-inherit border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <button onClick={() => onNavigate('perfil')}
          className={cn('w-9 h-9 rounded-full flex items-center justify-center transition-colors',
            isDarkMode ? 'bg-white/8 hover:bg-white/12 text-white' : 'bg-black/6 hover:bg-black/10 text-gray-700')}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <p className="font-black text-base leading-tight">Mi vida crediticia</p>
          <p className={cn('text-xs', isDarkMode ? 'text-white/40' : 'text-black/40')}>Hola, {firstName}</p>
        </div>
      </div>

      <div className="px-4 py-5 space-y-6 max-w-lg mx-auto pb-28">

        {/* ── Score hero ── */}
        <div className="relative rounded-3xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0D0D0D 0%, #1c1400 60%, #2A1F00 100%)' }}>
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-[#FFD700]/5 -translate-y-10 translate-x-10" />
          <div className="absolute bottom-0 left-0 w-28 h-28 rounded-full bg-[#B8860B]/8 translate-y-8 -translate-x-6" />
          <div className="relative p-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Landmark className="w-4 h-4 text-[#FFD700]" />
              <p className="text-[#FFD700] text-xs font-black uppercase tracking-widest">Pasaporte financiero</p>
            </div>
            <ScoreRing score={score} />
            <p className={cn('mt-3 font-black text-lg', scoreColor)}>{scoreLabel}</p>
            <p className="text-white/40 text-xs mt-1">
              {scoreData.hasEnoughData
                ? 'Basado en tu historial real de Voz Activa'
                : 'Registra 5+ movimientos para calcular tu puntaje'}
            </p>
            <button onClick={() => onNavigate('pasaporte')}
              className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-colors">
              <BadgeCheck className="w-3.5 h-3.5 text-[#FFD700]" />
              Ver pasaporte completo
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
            </button>
          </div>
        </div>

        {/* ── Productos ── */}
        <div>
          <p className={cn('text-xs uppercase tracking-widest font-black mb-3 px-0.5', isDarkMode ? 'text-white/30' : 'text-black/30')}>
            Productos disponibles
          </p>
          <div className="grid grid-cols-2 gap-3">
            <ProductCard
              icon={<Wallet />} title="Pasaporte financiero" subtitle="Tu historial y puntaje"
              tag="Activo" active isDarkMode={isDarkMode} onClick={() => onNavigate('pasaporte')} />
            <ProductCard
              icon={<Banknote />} title="Microcrédito" subtitle="Desde $300.000"
              tag="Pronto" isDarkMode={isDarkMode} />
            <ProductCard
              icon={<ShieldCheck />} title="Seguro de vida" subtitle="Desde $5.000/mes"
              tag="Pronto" isDarkMode={isDarkMode} />
            <ProductCard
              icon={<PiggyBank />} title="Ahorro programado" subtitle="Con intereses"
              tag="Pronto" isDarkMode={isDarkMode} />
            <ProductCard
              icon={<TrendingUp />} title="Historial crediticio" subtitle="Reportes y moras"
              tag="Pronto" isDarkMode={isDarkMode} />
            <ProductCard
              icon={<Star />} title="Beneficios" subtitle="Descuentos y alianzas"
              tag="Pronto" isDarkMode={isDarkMode} />
          </div>
        </div>

        {/* ── Cómo mejorar ── */}
        <div className={cn('rounded-2xl p-5', isDarkMode ? 'bg-[#1A1A1A] border border-white/8' : 'bg-white border border-black/5 shadow-sm')}>
          <p className="font-black text-sm mb-4">Cómo mejorar tu puntaje</p>
          <div className="space-y-3">
            {[
              { text: 'Registra ventas y gastos todos los días', done: scoreData.hasEnoughData },
              { text: 'Cobra tus fiados a tiempo', done: (debts.filter(d => d.type === 'me-deben' && d.status === 'pagada').length > 0) },
              { text: 'Mantén tu meta de ahorro activa', done: false },
              { text: 'Lleva más de 30 días activo en la app', done: (sales.length + expenses.length) >= 10 },
            ].map(({ text, done }) => (
              <div key={text} className="flex items-center gap-3">
                <div className={cn('w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0',
                  done ? 'bg-emerald-500' : isDarkMode ? 'bg-white/8' : 'bg-black/8')}>
                  <CheckCircle2 className={cn('w-3 h-3', done ? 'text-white' : isDarkMode ? 'text-white/20' : 'text-black/20')} />
                </div>
                <p className={cn('text-sm', done
                  ? isDarkMode ? 'text-white/80' : 'text-gray-800'
                  : isDarkMode ? 'text-white/40' : 'text-black/40'
                )}>
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Info ── */}
        <div className={cn('rounded-2xl p-5 flex gap-4', isDarkMode ? 'bg-[#B8860B]/10 border border-[#B8860B]/20' : 'bg-[#FFF8DC] border border-[#DAA520]/30')}>
          <Landmark className="w-5 h-5 text-[#B8860B] flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-sm text-[#B8860B] mb-1">¿Por qué importa?</p>
            <p className={cn('text-xs leading-relaxed', isDarkMode ? 'text-white/50' : 'text-black/55')}>
              Tu puntaje en Voz Activa es tu carta de presentación ante bancos, cooperativas y entidades de microfinanzas. Mientras más activo seas, mejores oportunidades de crédito tendrás.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};
