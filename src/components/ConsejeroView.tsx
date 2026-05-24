import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles, Send, Target, Plus, ChevronRight, AlertTriangle,
  TrendingDown, Clock, CheckCircle2, Loader2, X, CalendarDays,
  PiggyBank, MessageCircle,
} from 'lucide-react';
import { doc, collection, addDoc, updateDoc, setDoc, getDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import {
  Meta, ConsejeroMessage, Sale, Expense, Debt,
  InventoryProduct, UserProfile, RegistroDiario, MetaAjuste,
} from '../types';
import { computeFinancialContext } from '../services/financialAnalysis';
import { sendMessageToConsejero, getUnconfirmedDays, parseMetaFromResponse } from '../services/consejeroService';
import { populateTestData } from '../testData';

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) { return `$${Math.round(n).toLocaleString('es-CO')}`; }
function todayStr() { return new Date().toISOString().split('T')[0]; }
function genId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
type ConsejeroAction = 'delete-meta' | 'complete-meta' | null;

function detectMetaAction(text: string): ConsejeroAction {
  const t = text.toLowerCase();
  const wantsDelete =
    /\b(elimin[ao]|borr[ao]|quit[ao]|sac[ao]|cancel[ao])\b/.test(t) &&
    /\bmeta\b/.test(t);
  const wantsComplete =
    /\b(ya (cumpl|logr|alcanc)|ya la (cumpli|logré|alcancé)|me regalaron|ya tengo|la consegui|la conseguí|complet[eé]|ya no la necesit)\b/.test(t);
  if (wantsDelete) return 'delete-meta';
  if (wantsComplete) return 'complete-meta';
  return null;
}

function getMondayStr(date: Date): string {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().split('T')[0];
}

type InternalTab = 'chat' | 'meta';

// ─── Local tip (no Gemini call) ─────────────────────────────────────────────

function getLocalTip(
  ctx: ReturnType<typeof computeFinancialContext>,
  meta: Meta | null,
  unconfirmedCount: number,
): { tip: string; cta: string } | null {
  if (meta && unconfirmedCount >= 7) {
    return {
      tip: `Llevas ${unconfirmedCount} días sin confirmar tu ahorro en "${meta.nombre}". La meta está en riesgo.`,
      cta: 'Revisemos juntos',
    };
  }
  if (meta && unconfirmedCount >= 3) {
    return {
      tip: `Tienes ${unconfirmedCount} días pendientes en "${meta.nombre}". ¿Pudiste ahorrar esos días o se te olvidó registrar?`,
      cta: '¿Qué opciones tengo?',
    };
  }
  if (ctx.fiadoMas30Dias && ctx.fiadosPendientes.length > 0) {
    const top = ctx.fiadosPendientes[0];
    return {
      tip: `${top.nombre} te debe $${top.monto.toLocaleString('es-CO')} hace más de ${top.diasPendiente} días. Puede afectar tu flujo de caja.`,
      cta: 'Ayúdame a cobrarlos',
    };
  }
  if (ctx.ventasBajaron30) {
    return {
      tip: 'Tus ventas bajaron más del 30% esta semana. Puede que haya algo que ajustar.',
      cta: 'Analicemos qué pasó',
    };
  }
  if (ctx.rachaPositiva7) {
    return {
      tip: `¡Llevas ${ctx.rachaDiasRegistrando} días seguidos registrando! Así se construye un negocio sano.`,
      cta: 'Ver cómo voy',
    };
  }
  return null;
}

// ─── ConsejeroAvatar ─────────────────────────────────────────────────────────

const ConsejeroAvatar = ({ size = 'md' }: { size?: 'sm' | 'md' }) => (
  <div className={cn(
    'rounded-full bg-gradient-to-br from-[#B8860B] to-[#FFD700] flex items-center justify-center flex-shrink-0',
    size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'
  )}>
    <Sparkles className={cn('text-black', size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
  </div>
);

// ─── TypingBubble ────────────────────────────────────────────────────────────

const TypingBubble = ({ text, isDarkMode }: { text: string; isDarkMode: boolean }) => (
  <div className="flex gap-2 items-end mb-4 px-1">
    <ConsejeroAvatar size="sm" />
    <div className={cn(
      'max-w-[75%] px-4 py-3 rounded-2xl rounded-bl-sm text-sm leading-relaxed',
      isDarkMode ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-900 shadow-sm'
    )}>
      {text ? (
        <span>{text}</span>
      ) : (
        <div className="flex gap-1 items-center h-4">
          {[0, 150, 300].map(delay => (
            <div key={delay} className="w-1.5 h-1.5 rounded-full bg-[#B8860B] animate-bounce"
              style={{ animationDelay: `${delay}ms` }} />
          ))}
        </div>
      )}
    </div>
  </div>
);

// ─── MessageBubble ───────────────────────────────────────────────────────────

const MessageBubble = ({ msg, isDarkMode }: { msg: ConsejeroMessage; isDarkMode: boolean }) => {
  const isUser = msg.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex gap-2 mb-4 px-1', isUser ? 'flex-row-reverse' : 'flex-row items-end')}
    >
      {!isUser && <ConsejeroAvatar size="sm" />}
      <div className={cn(
        'max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
        isUser
          ? 'bg-gradient-to-br from-[#B8860B] to-[#DAA520] text-white rounded-br-sm'
          : isDarkMode
            ? 'bg-[#1A1A1A] text-white rounded-bl-sm'
            : 'bg-white text-gray-900 shadow-sm rounded-bl-sm'
      )}>
        {msg.content}
      </div>
    </motion.div>
  );
};

// ─── QuickSuggestions ────────────────────────────────────────────────────────

const QuickSuggestions = ({
  meta, unconfirmedCount, isDarkMode, onSelect, disabled,
}: {
  meta: Meta | null; unconfirmedCount: number; isDarkMode: boolean;
  onSelect: (t: string) => void; disabled: boolean;
}) => {
  let suggestions: string[];
  if (!meta) {
    suggestions = ['Quiero definir una meta de ahorro', '¿Cuánto puedo ahorrar hoy?', '¿Cómo van mis ventas?'];
  } else if (unconfirmedCount >= 7) {
    suggestions = ['Se me olvidó registrar esos días', 'Estuve complicado esa semana', '¿Qué opciones tengo?'];
  } else if (unconfirmedCount >= 3) {
    suggestions = ['¿Qué opciones tengo?', 'Se me pasó registrar', '¿Cuándo llego al objetivo?'];
  } else {
    suggestions = ['¿Cuánto llevo ahorrado?', '¿Cómo están mis finanzas?', '¿Cuándo llego al objetivo?'];
  }
  return (
    <div className="flex gap-2 pb-2 overflow-x-auto no-scrollbar">
      {suggestions.map(s => (
        <button key={s} onClick={() => !disabled && onSelect(s)} disabled={disabled}
          className={cn(
            'flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors',
            isDarkMode
              ? 'border-white/15 text-white/60 hover:border-[#FFD700]/40 hover:text-[#FFD700]/80 disabled:opacity-30'
              : 'border-black/12 text-black/55 hover:border-[#B8860B]/40 hover:text-[#B8860B] disabled:opacity-30'
          )}>
          {s}
        </button>
      ))}
    </div>
  );
};

// ─── DailyChecklist ──────────────────────────────────────────────────────────

const DailyChecklist = ({
  meta, isDarkMode, onConfirmDay, onSkipDay,
}: {
  meta: Meta; isDarkMode: boolean;
  onConfirmDay: (fecha: string) => void;
  onSkipDay: (fecha: string) => void;
}) => {
  const today = todayStr();
  const esSemanal = meta.frecuencia === 'semanal';
  const pending = [...getUnconfirmedDays(meta)].reverse().slice(0, 7);

  const formatLabel = (fecha: string) => {
    if (esSemanal) {
      const lunes = new Date(fecha + 'T12:00:00');
      const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
      const lunesLabel = lunes.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
      const domingoLabel = domingo.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
      const thisWeek = getMondayStr(new Date()) === fecha;
      return thisWeek ? `Esta semana (${lunesLabel} – ${domingoLabel})` : `Semana del ${lunesLabel} al ${domingoLabel}`;
    }
    if (fecha === today) return 'Hoy';
    const d = new Date(fecha + 'T12:00:00');
    const diff = Math.round((new Date(today + 'T12:00:00').getTime() - d.getTime()) / 86400000);
    if (diff === 1) return 'Ayer';
    return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const montoLabel = esSemanal ? fmt(meta.ahorroDiario * 7) : fmt(meta.ahorroDiario);
  const periodLabel = esSemanal ? 'esta semana' : 'hoy';

  const isCurrent = (fecha: string) =>
    esSemanal ? getMondayStr(new Date()) === fecha : fecha === today;

  if (pending.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3">
        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        <p className="text-sm font-bold text-emerald-500">¡Todo al día! Sigue así.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {pending.map((fecha, idx) => {
        const current = isCurrent(fecha);
        return (
          <div key={fecha}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors',
              current
                ? isDarkMode ? 'bg-amber-500/12 border border-amber-500/25' : 'bg-amber-50 border border-amber-200'
                : isDarkMode ? 'bg-white/4' : 'bg-black/3',
            )}>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-bold truncate', current ? 'text-amber-500' : isDarkMode ? 'text-white/80' : 'text-gray-800')}>
                {formatLabel(fecha)}
              </p>
              <p className={cn('text-xs', isDarkMode ? 'text-white/40' : 'text-black/45')}>
                {idx === 0 && current ? `Guardar ${montoLabel} ${periodLabel}` : `Pendiente — ${montoLabel}`}
              </p>
            </div>
            <button
              onClick={() => onSkipDay(fecha)}
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-colors flex-shrink-0',
                isDarkMode ? 'bg-white/8 hover:bg-red-500/20 text-white/40 hover:text-red-400' : 'bg-black/5 hover:bg-red-100 text-black/35 hover:text-red-500'
              )}>
              ✕
            </button>
            <button
              onClick={() => onConfirmDay(fecha)}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-black transition-colors flex-shrink-0 shadow-sm active:scale-95">
              ✓
            </button>
          </div>
        );
      })}
    </div>
  );
};

// ─── SavingsCalendar ─────────────────────────────────────────────────────────

const SavingsCalendar = ({ meta, isDarkMode }: { meta: Meta; isDarkMode: boolean }) => {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon

  const today = todayStr();
  const registroMap = new Map((meta.registros || []).map(r => [r.fecha, r.estado]));

  const fechaInicio = meta.fechaInicio?.toDate ? meta.fechaInicio.toDate() : new Date(meta.fechaInicio);
  const fechaInicioStr = fechaInicio.toISOString().split('T')[0];

  const prevMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Can we go to next month? Don't go past current month
  const nowDate = new Date();
  const canGoNext = year < nowDate.getFullYear() || (year === nowDate.getFullYear() && month < nowDate.getMonth());

  // Build cells: nulls for leading empty + day numbers
  const cells: Array<{ day: number; dateStr: string } | null> = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { day, dateStr };
    }),
  ];

  const esSemanal = meta.frecuencia === 'semanal';

  const getEstado = (dateStr: string) => {
    if (esSemanal) {
      const d = new Date(dateStr + 'T12:00:00');
      return registroMap.get(getMondayStr(d));
    }
    return registroMap.get(dateStr);
  };

  const getDayStyle = (dateStr: string): string => {
    if (dateStr > today) return isDarkMode ? 'text-white/15' : 'text-black/15';
    if (dateStr < fechaInicioStr) return isDarkMode ? 'text-white/15' : 'text-black/15';
    const estado = getEstado(dateStr);
    if (estado === 'cumplido') return 'text-emerald-500 font-black';
    if (estado === 'fallido') return 'text-red-400 font-bold';
    if (estado === 'sin_confirmar') return 'text-amber-400 font-bold';
    return isDarkMode ? 'text-white/40' : 'text-black/40';
  };

  const getDotColor = (dateStr: string): string | null => {
    if (dateStr > today || dateStr < fechaInicioStr) return null;
    const estado = getEstado(dateStr);
    if (estado === 'cumplido') return 'bg-emerald-500';
    if (estado === 'fallido') return 'bg-red-400';
    if (estado === 'sin_confirmar') return 'bg-amber-400';
    return null;
  };

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth}
          className={cn('w-7 h-7 rounded-full flex items-center justify-center transition-colors',
            isDarkMode ? 'hover:bg-white/10 text-white/60' : 'hover:bg-black/8 text-black/50')}>
          ‹
        </button>
        <p className="text-sm font-black">{monthNames[month]} {year}</p>
        <button onClick={nextMonth} disabled={!canGoNext}
          className={cn('w-7 h-7 rounded-full flex items-center justify-center transition-colors disabled:opacity-20',
            isDarkMode ? 'hover:bg-white/10 text-white/60' : 'hover:bg-black/8 text-black/50')}>
          ›
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['L','M','X','J','V','S','D'].map(d => (
          <div key={d} className={cn('text-center text-[10px] font-bold py-0.5', isDarkMode ? 'text-white/25' : 'text-black/25')}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((cell, i) => (
          <div key={i} className="flex flex-col items-center py-0.5">
            {cell && (
              <>
                <span className={cn('text-[13px] leading-none', getDayStyle(cell.dateStr),
                  cell.dateStr === today ? 'underline decoration-dotted' : '')}>
                  {cell.day}
                </span>
                {getDotColor(cell.dateStr) && (
                  <span className={cn('w-1 h-1 rounded-full mt-0.5', getDotColor(cell.dateStr)!)} />
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-3">
        {[
          { color: 'bg-emerald-500', label: 'Ahorró' },
          { color: 'bg-amber-400', label: 'Pendiente' },
          { color: 'bg-red-400', label: 'No pudo' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-[10px]">
            <span className={cn('w-2 h-2 rounded-full flex-shrink-0', color)} />
            <span className={isDarkMode ? 'text-white/40' : 'text-black/40'}>{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── WeeklySavingsChart ──────────────────────────────────────────────────────

const WeeklySavingsChart = ({ meta, isDarkMode }: { meta: Meta; isDarkMode: boolean }) => {
  const today = new Date();
  const dow = today.getDay();
  const daysFromMon = dow === 0 ? 6 : dow - 1;

  const data = Array.from({ length: 5 }, (_, i) => {
    const w = 4 - i; // 4 weeks ago to current
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - daysFromMon - w * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const saved = (meta.registros || [])
      .filter(r => { const d = new Date(r.fecha); return r.estado === 'cumplido' && d >= weekStart && d <= weekEnd; })
      .reduce((sum, r) => sum + (r.montoAhorrado || meta.ahorroDiario), 0);

    const label = w === 0 ? 'Esta sem' : w === 1 ? 'Sem ant' : `Sem -${w}`;
    return { semana: label, ahorrado: saved };
  });

  const targetWeekly = meta.ahorroDiario * 7;
  const tickColor = isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';

  return (
    <ResponsiveContainer width="100%" height={110}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <XAxis dataKey="semana" tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 9, fill: tickColor }} axisLine={false} tickLine={false}
          tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`} />
        <Tooltip
          formatter={(v: any) => [fmt(v), 'Ahorrado']}
          contentStyle={{ background: isDarkMode ? '#1A1A1A' : 'white', border: 'none', borderRadius: 8, fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
          labelStyle={{ color: isDarkMode ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)', fontWeight: 600 }}
          cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
        />
        <Bar dataKey="ahorrado" fill="#B8860B" radius={[4, 4, 0, 0]} />
        <ReferenceLine y={targetWeekly} stroke="#FFD700" strokeDasharray="4 4" strokeWidth={1.5} />
      </BarChart>
    </ResponsiveContainer>
  );
};

// ─── AdjustmentOptions ───────────────────────────────────────────────────────

const AdjustmentOptions = ({
  meta, ctx, isDarkMode, onChoose,
}: {
  meta: Meta;
  ctx: ReturnType<typeof computeFinancialContext>;
  isDarkMode: boolean;
  onChoose: (option: 'extend' | 'reduce' | 'collect') => void;
}) => {
  const fechaObj = meta.fechaObjetivo?.toDate ? meta.fechaObjetivo.toDate() : new Date(meta.fechaObjetivo);
  const diasRestantes = Math.max(0, Math.ceil((fechaObj.getTime() - Date.now()) / 86400000));
  const montoFaltante = Math.max(0, meta.montoObjetivo - meta.montoAhorrado);
  const unconfirmed = getUnconfirmedDays(meta).length;

  const nuevaPlazoFecha = new Date(fechaObj);
  nuevaPlazoFecha.setDate(fechaObj.getDate() + unconfirmed + 5);

  const nuevosRest = diasRestantes + unconfirmed + 10;
  const ahorroReducido = Math.max(
    Math.ceil(montoFaltante / nuevosRest),
    Math.round(ctx.capacidadAhorroDiaria * 0.7)
  );

  const options = [
    {
      key: 'extend' as const,
      label: 'Alargar el plazo',
      detail: `Nueva fecha: ${nuevaPlazoFecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'long' })}`,
      icon: <CalendarDays className="w-4 h-4" />,
    },
    {
      key: 'reduce' as const,
      label: 'Reducir ahorro diario',
      detail: `${fmt(ahorroReducido)}/día`,
      icon: <TrendingDown className="w-4 h-4" />,
    },
    ...(ctx.totalFiadosPendientes > 0 ? [{
      key: 'collect' as const,
      label: 'Cobrar mis fiados',
      detail: `${fmt(ctx.totalFiadosPendientes)} pendientes`,
      icon: <ChevronRight className="w-4 h-4" />,
    }] : []),
  ];

  return (
    <div className={cn(
      'rounded-2xl border overflow-hidden',
      isDarkMode ? 'bg-red-950/30 border-red-500/20' : 'bg-red-50 border-red-200'
    )}>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="font-black text-sm text-red-500">Meta en riesgo — {unconfirmed} días sin confirmar</p>
        </div>
        <p className={cn('text-xs mb-3 leading-relaxed', isDarkMode ? 'text-white/60' : 'text-black/55')}>
          Elige la opción que mejor se adapte a tu situación:
        </p>
        <div className="flex flex-col gap-2">
          {options.map(opt => (
            <button key={opt.key} onClick={() => onChoose(opt.key)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.98]',
                isDarkMode ? 'bg-white/8 hover:bg-white/12 text-white' : 'bg-white hover:bg-gray-50 text-gray-900 shadow-sm'
              )}>
              <span className="text-[#B8860B]">{opt.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold">{opt.label}</p>
                <p className={cn('text-[11px]', isDarkMode ? 'text-white/50' : 'text-black/45')}>{opt.detail}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-40 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── New Goal Modal ──────────────────────────────────────────────────────────

const NewGoalModal = ({
  isDarkMode, capacidadAhorro, onClose, onConfirm,
}: {
  isDarkMode: boolean; capacidadAhorro: number;
  onClose: () => void;
  onConfirm: (nombre: string, monto: number, dias: number, frecuencia: 'diario' | 'semanal') => void;
}) => {
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState('');
  const [dias, setDias] = useState(60);
  const [frecuencia, setFrecuencia] = useState<'diario' | 'semanal'>('diario');
  const montoNum = parseInt(monto.replace(/\D/g, '')) || 0;
  const ahorroDiario = dias > 0 && montoNum > 0 ? Math.ceil(montoNum / dias) : 0;
  const ahorroSemanal = ahorroDiario * 7;
  const esViable = capacidadAhorro > 0 && ahorroDiario <= capacidadAhorro * 1.5;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className={cn('relative w-full max-w-sm rounded-2xl overflow-hidden z-10', isDarkMode ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-900')}>
        <div className="h-1 w-full bg-gradient-to-r from-[#B8860B] to-[#FFD700]" />
        <div className="px-5 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[#B8860B]" />
              <p className="font-black text-base">Nueva meta</p>
            </div>
            <button onClick={onClose} className="opacity-40 hover:opacity-70"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className={cn('text-xs font-bold mb-1.5 block', isDarkMode ? 'text-white/60' : 'text-black/50')}>¿Para qué es?</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Nevera nueva, arriendo del local…"
                className={cn('w-full px-3 py-2.5 rounded-xl text-sm border outline-none focus:ring-2 focus:ring-[#B8860B]/40',
                  isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-black/10 text-gray-900 placeholder:text-black/30')} />
            </div>
            <div>
              <label className={cn('text-xs font-bold mb-1.5 block', isDarkMode ? 'text-white/60' : 'text-black/50')}>¿Cuánto necesitas?</label>
              <input value={monto} onChange={e => setMonto(e.target.value)} placeholder="Ej: 500000" inputMode="numeric"
                className={cn('w-full px-3 py-2.5 rounded-xl text-sm border outline-none focus:ring-2 focus:ring-[#B8860B]/40',
                  isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'bg-gray-50 border-black/10 text-gray-900 placeholder:text-black/30')} />
            </div>
            <div>
              <label className={cn('text-xs font-bold mb-1.5 block', isDarkMode ? 'text-white/60' : 'text-black/50')}>Plazo</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[30, 60, 90, 120].map(d => (
                  <button key={d} onClick={() => setDias(d)}
                    className={cn('py-2 rounded-xl text-xs font-bold transition-colors',
                      dias === d ? 'bg-[#B8860B] text-black' : isDarkMode ? 'bg-white/8 text-white/60 hover:bg-white/12' : 'bg-gray-100 text-black/60 hover:bg-gray-200')}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={cn('text-xs font-bold mb-1.5 block', isDarkMode ? 'text-white/60' : 'text-black/50')}>¿Cada cuánto registras?</label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { key: 'diario', label: 'Cada día', desc: 'Registro diario' },
                  { key: 'semanal', label: 'Cada semana', desc: 'Registro semanal' },
                ] as const).map(op => (
                  <button key={op.key} onClick={() => setFrecuencia(op.key)}
                    className={cn('flex flex-col items-center py-2.5 px-2 rounded-xl text-center transition-colors',
                      frecuencia === op.key
                        ? 'bg-[#B8860B] text-black'
                        : isDarkMode ? 'bg-white/8 text-white/60 hover:bg-white/12' : 'bg-gray-100 text-black/60 hover:bg-gray-200')}>
                    <span className="text-xs font-black">{op.label}</span>
                    <span className={cn('text-[10px] mt-0.5', frecuencia === op.key ? 'text-black/60' : isDarkMode ? 'text-white/35' : 'text-black/40')}>{op.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {montoNum > 0 && (
            <div className={cn('rounded-xl px-4 py-3', isDarkMode ? 'bg-white/5' : 'bg-gray-50')}>
              <p className="text-xs font-bold mb-0.5">Plan calculado</p>
              <p className="text-sm font-black text-[#B8860B]">
                {frecuencia === 'semanal' ? `${fmt(ahorroSemanal)}/semana` : `${fmt(ahorroDiario)}/día`}
              </p>
              {!esViable && capacidadAhorro > 0 && (
                <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Tu capacidad estimada es {fmt(capacidadAhorro)}/día. Puede ser difícil.
                </p>
              )}
              {esViable && (
                <p className={cn('text-xs mt-1', isDarkMode ? 'text-white/50' : 'text-black/50')}>Viable con tu ritmo actual.</p>
              )}
            </div>
          )}
          <button disabled={!nombre.trim() || montoNum <= 0} onClick={() => onConfirm(nombre.trim(), montoNum, dias, frecuencia)}
            className="w-full h-11 rounded-xl font-black text-sm bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-transform">
            Crear meta
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Log Savings Modal ───────────────────────────────────────────────────────

const LogSavingsModal = ({
  meta, isDarkMode, fecha, onClose, onConfirm,
}: {
  meta: Meta; isDarkMode: boolean; fecha?: string;
  onClose: () => void; onConfirm: (amount: number, fecha?: string) => void;
}) => {
  const [amount, setAmount] = useState(meta.ahorroDiario.toString());
  const amountNum = parseInt(amount.replace(/\D/g, '')) || 0;
  const isToday = !fecha || fecha === todayStr();
  const dateLabel = fecha && !isToday
    ? new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'hoy';
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className={cn('relative w-full max-w-sm rounded-2xl overflow-hidden z-10', isDarkMode ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-900')}>
        <div className="h-1 w-full bg-gradient-to-r from-[#B8860B] to-[#FFD700]" />
        <div className="px-5 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-[#B8860B]" />
              <p className="font-black text-base">Registrar ahorro</p>
            </div>
            <button onClick={onClose} className="opacity-40 hover:opacity-70"><X className="w-5 h-5" /></button>
          </div>
          <p className={cn('text-xs leading-relaxed', isDarkMode ? 'text-white/60' : 'text-black/55')}>
            <span className="font-bold">{meta.nombre}</span> — {dateLabel}
          </p>
          <div>
            <label className={cn('text-xs font-bold mb-1.5 block', isDarkMode ? 'text-white/60' : 'text-black/50')}>¿Cuánto guardaste?</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric"
              className={cn('w-full px-3 py-3 rounded-xl text-lg font-black border outline-none focus:ring-2 focus:ring-[#B8860B]/40',
                isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-black/10 text-gray-900')} />
          </div>
          <div className="flex gap-2.5">
            <button onClick={onClose}
              className={cn('flex-1 h-11 rounded-xl font-bold text-sm transition-colors',
                isDarkMode ? 'bg-white/8 hover:bg-white/12 text-white/70' : 'bg-black/5 hover:bg-black/10 text-black/60')}>
              Cancelar
            </button>
            <button disabled={amountNum <= 0} onClick={() => onConfirm(amountNum, fecha)}
              className="flex-1 h-11 rounded-xl font-black text-sm bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-md disabled:opacity-40 active:scale-[0.98] transition-transform">
              Confirmar
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Main ConsejeroView ──────────────────────────────────────────────────────

interface ConsejeroViewProps {
  isDarkMode: boolean; userId: string;
  sales: Sale[]; expenses: Expense[]; debts: Debt[];
  inventory: InventoryProduct[]; metas: Meta[]; profile: UserProfile | null;
}

export const ConsejeroView = ({
  isDarkMode, userId, sales, expenses, debts, inventory, metas, profile,
}: ConsejeroViewProps) => {
  const [internalTab, setInternalTab] = useState<InternalTab>('chat');
  const [messages, setMessages] = useState<ConsejeroMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showNewGoalModal, setShowNewGoalModal] = useState(false);
  const [showLogSavingsModal, setShowLogSavingsModal] = useState(false);
  const [logSavingsDay, setLogSavingsDay] = useState<string | null>(null);
  const [adjustmentChosen, setAdjustmentChosen] = useState(false);
  const [loadingTestData, setLoadingTestData] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [tipDismissed, setTipDismissed] = useState(false);

  const firstName = profile?.firstName || 'amigo';

  const activeMeta = useMemo(
    () => metas.find(m => ['activa', 'en-riesgo', 'reajustada'].includes(m.estado)) ?? null,
    [metas]
  );

  const financialContext = useMemo(
    () => computeFinancialContext(sales, expenses, debts, inventory),
    [sales, expenses, debts, inventory]
  );

  const unconfirmedCount = activeMeta ? getUnconfirmedDays(activeMeta).length : 0;
  const showAdjustment = !adjustmentChosen && unconfirmedCount >= 7;

  const hasAlerts =
    (activeMeta && unconfirmedCount >= 3) ||
    financialContext.fiadoMas30Dias ||
    financialContext.ventasBajaron30 ||
    financialContext.rachaPositiva7;

  const localTip = useMemo(
    () => getLocalTip(financialContext, activeMeta, unconfirmedCount),
    [financialContext, activeMeta, unconfirmedCount],
  );

  // ── Derived meta stats ──
  const metaPct = activeMeta
    ? Math.min(100, Math.round((activeMeta.montoAhorrado / activeMeta.montoObjetivo) * 100))
    : 0;
  const metaFechaObj = activeMeta
    ? (activeMeta.fechaObjetivo?.toDate ? activeMeta.fechaObjetivo.toDate() : new Date(activeMeta.fechaObjetivo))
    : null;
  const metaDiasRestantes = metaFechaObj
    ? Math.max(0, Math.ceil((metaFechaObj.getTime() - Date.now()) / 86400000))
    : 0;

  // ── Scroll to bottom ──
  useEffect(() => {
    if (internalTab === 'chat') messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, internalTab]);

  // ── Load history ──
  useEffect(() => {
    if (!userId) return;
    getDoc(doc(db, 'users', userId))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.consejeroHistory) && data.consejeroHistory.length > 0) {
            setMessages(data.consejeroHistory);
          }
        }
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));
  }, [userId]);

  // ── Fill missing registros ──
  useEffect(() => {
    if (!activeMeta || !userId) return;
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
    const existing = new Set((activeMeta.registros || []).map(r => r.fecha));
    const esSemanal = activeMeta.frecuencia === 'semanal';
    const checkKey = esSemanal ? getMondayStr(todayDate) : todayDate.toISOString().split('T')[0];
    if (existing.has(checkKey)) return;

    const fechaInicio = activeMeta.fechaInicio?.toDate
      ? activeMeta.fechaInicio.toDate() : new Date(activeMeta.fechaInicio);
    fechaInicio.setHours(0, 0, 0, 0);

    const newReg: RegistroDiario[] = [...(activeMeta.registros || [])];

    if (esSemanal) {
      // Add one registro per week (Monday) from fechaInicio to today
      const cursor = new Date(getMondayStr(fechaInicio) + 'T12:00:00');
      while (cursor <= todayDate) {
        const key = cursor.toISOString().split('T')[0];
        if (!existing.has(key)) newReg.push({ fecha: key, estado: 'sin_confirmar' });
        cursor.setDate(cursor.getDate() + 7);
      }
    } else {
      const cursor = new Date(fechaInicio);
      while (cursor <= todayDate) {
        const key = cursor.toISOString().split('T')[0];
        if (!existing.has(key)) newReg.push({ fecha: key, estado: 'sin_confirmar' });
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    updateDoc(doc(db, 'users', userId, 'metas', activeMeta.id), { registros: newReg }).catch(console.error);
  }, [activeMeta?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save history ──
  const saveHistory = useCallback(async (msgs: ConsejeroMessage[]) => {
    await setDoc(doc(db, 'users', userId), { consejeroHistory: msgs.slice(-30) }, { merge: true }).catch(console.error);
  }, [userId]);

  // ── Send message (always switches to chat tab) ──
  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    setInternalTab('chat');
    const userMsg: ConsejeroMessage = { id: genId(), role: 'user', content: text.trim(), timestamp: Date.now() };
    const withUser = [...messages, userMsg];
    setMessages(withUser); setInput(''); setIsLoading(true);

    let partial = '';
    try {
      const full = await sendMessageToConsejero(text.trim(), withUser, financialContext, activeMeta, firstName, false, chunk => {
        partial += chunk; setStreamingText(partial);
      });
      // Extraer marcador de meta del texto de Gemini antes de mostrarlo
      const { cleanText, meta: confirmedMeta } = parseMetaFromResponse(full);

      const assistantMsg: ConsejeroMessage = { id: genId(), role: 'assistant', content: cleanText, timestamp: Date.now() };
      const final = [...withUser, assistantMsg];
      setMessages(final);
      saveHistory(final).catch(console.error);

      // Agente: ejecutar acción si el usuario lo pidió
      if (activeMeta) {
        const action = detectMetaAction(text.trim());
        if (action === 'delete-meta') {
          await deleteDoc(doc(db, 'users', userId, 'metas', activeMeta.id)).catch(console.error);
        } else if (action === 'complete-meta') {
          await updateDoc(doc(db, 'users', userId, 'metas', activeMeta.id), { estado: 'completada' }).catch(console.error);
        }
      }

      // Crear meta si Gemini incluyó el marcador y no hay una activa
      if (!activeMeta && confirmedMeta) {
        const { nombre, montoObjetivo, dias } = confirmedMeta;
        const ahorroDiario = Math.ceil(montoObjetivo / dias);
        const fi = new Date();
        const fo = new Date(); fo.setDate(fo.getDate() + dias);
        addDoc(collection(db, 'users', userId, 'metas'), {
          nombre, montoObjetivo, montoAhorrado: 0, ahorroDiario, frecuencia: 'diario',
          fechaInicio: Timestamp.fromDate(fi), fechaObjetivo: Timestamp.fromDate(fo),
          estado: 'activa', registros: [{ fecha: todayStr(), estado: 'sin_confirmar' }], historialAjustes: [],
        }).then(() => setInternalTab('meta')).catch(console.error);
      }
    } catch {
      const err: ConsejeroMessage = { id: genId(), role: 'assistant', content: 'Hubo un problema para conectar. Verifica tu conexión e intenta de nuevo.', timestamp: Date.now() };
      const final = [...withUser, err];
      setMessages(final);
      saveHistory(final).catch(console.error);
    } finally {
      setStreamingText(''); setIsLoading(false);
    }
  }, [messages, isLoading, financialContext, activeMeta, firstName, saveHistory, userId]);

  // ── Adjust goal ──
  const handleAdjustGoal = useCallback(async (option: 'extend' | 'reduce' | 'collect') => {
    if (!activeMeta) return;
    setAdjustmentChosen(true);

    const fechaObj = activeMeta.fechaObjetivo?.toDate ? activeMeta.fechaObjetivo.toDate() : new Date(activeMeta.fechaObjetivo);
    const diasRestantes = Math.max(0, Math.ceil((fechaObj.getTime() - Date.now()) / 86400000));
    const montoFaltante = Math.max(0, activeMeta.montoObjetivo - activeMeta.montoAhorrado);
    const ajusteBase: Omit<MetaAjuste, 'nuevaFechaObjetivo' | 'nuevoAhorroDiario'> = {
      fecha: Timestamp.now(), razon: `Reajuste por ${unconfirmedCount} días sin confirmar`,
      ahorroDiarioAnterior: activeMeta.ahorroDiario, fechaObjetivoAnterior: activeMeta.fechaObjetivo,
    };

    let message = '';
    const payload: Record<string, any> = { estado: 'reajustada', historialAjustes: [...(activeMeta.historialAjustes || [])] };

    if (option === 'extend') {
      const nf = new Date(fechaObj); nf.setDate(fechaObj.getDate() + unconfirmedCount + 5);
      const ts = Timestamp.fromDate(nf);
      payload.fechaObjetivo = ts;
      payload.historialAjustes.push({ ...ajusteBase, nuevoAhorroDiario: activeMeta.ahorroDiario, nuevaFechaObjetivo: ts });
      message = `Quiero alargar el plazo de mi meta "${activeMeta.nombre}" hasta el ${nf.toLocaleDateString('es-CO', { day: '2-digit', month: 'long' })}, manteniendo ${fmt(activeMeta.ahorroDiario)}/día.`;
    } else if (option === 'reduce') {
      const nr = diasRestantes + unconfirmedCount + 10;
      const na = Math.max(Math.ceil(montoFaltante / nr), Math.round(financialContext.capacidadAhorroDiaria * 0.7));
      payload.ahorroDiario = na;
      payload.historialAjustes.push({ ...ajusteBase, nuevoAhorroDiario: na, nuevaFechaObjetivo: activeMeta.fechaObjetivo });
      message = `Quiero reducir mi ahorro diario a ${fmt(na)}/día. Sé que me tarda más pero es más alcanzable con mis ventas actuales.`;
    } else {
      const top = financialContext.fiadosPendientes[0];
      message = `Voy a intentar cobrarle a ${top?.nombre || 'mis clientes'} lo que me deben para ponerlo en la meta. ¿Cómo lo manejo?`;
    }

    await updateDoc(doc(db, 'users', userId, 'metas', activeMeta.id), payload).catch(console.error);
    await handleSend(message);
  }, [activeMeta, unconfirmedCount, financialContext, userId, handleSend]);

  // ── Create goal ──
  const handleCreateGoal = useCallback(async (nombre: string, monto: number, dias: number, frecuencia: 'diario' | 'semanal') => {
    setShowNewGoalModal(false);
    const ahorroDiario = Math.ceil(monto / dias);
    const fi = new Date(); const fo = new Date(); fo.setDate(fo.getDate() + dias);
    const primerRegistroFecha = frecuencia === 'semanal' ? getMondayStr(fi) : todayStr();
    await addDoc(collection(db, 'users', userId, 'metas'), {
      nombre, montoObjetivo: monto, montoAhorrado: 0, ahorroDiario, frecuencia,
      fechaInicio: Timestamp.fromDate(fi), fechaObjetivo: Timestamp.fromDate(fo),
      estado: 'activa', registros: [{ fecha: primerRegistroFecha, estado: 'sin_confirmar' }], historialAjustes: [],
    }).catch(console.error);
    const ritmoLabel = frecuencia === 'semanal'
      ? `guardando ${fmt(ahorroDiario * 7)}/semana`
      : `guardando ${fmt(ahorroDiario)}/día`;
    await handleSend(`Acabo de crear mi meta "${nombre}" — quiero juntar ${fmt(monto)} en ${dias} días ${ritmoLabel}. ¿Qué me recomiendas para arrancar bien?`);
    setInternalTab('meta');
  }, [userId, handleSend]);

  // ── Log savings (for a specific day, defaults to today) ──
  const handleLogSavings = useCallback(async (amount: number, fecha?: string) => {
    if (!activeMeta) return;
    setShowLogSavingsModal(false);
    setLogSavingsDay(null);
    const targetDate = fecha || todayStr();
    const newTotal = activeMeta.montoAhorrado + amount;
    const updReg = (activeMeta.registros || []).map(r =>
      r.fecha === targetDate ? { ...r, estado: 'cumplido' as const, montoAhorrado: amount } : r
    );
    if (!updReg.find(r => r.fecha === targetDate)) updReg.push({ fecha: targetDate, estado: 'cumplido', montoAhorrado: amount });
    const completed = newTotal >= activeMeta.montoObjetivo;
    await updateDoc(doc(db, 'users', userId, 'metas', activeMeta.id), {
      montoAhorrado: newTotal, registros: updReg, ...(completed ? { estado: 'completada' } : {}),
    }).catch(console.error);
    const isToday = targetDate === todayStr();
    await handleSend(
      completed
        ? `¡Completé mi meta "${activeMeta.nombre}"! Logré juntar ${fmt(newTotal)} en total.`
        : isToday
          ? `Guardé ${fmt(amount)} para mi meta "${activeMeta.nombre}". Llevo ${fmt(newTotal)} de ${fmt(activeMeta.montoObjetivo)}.`
          : `Registré que guardé ${fmt(amount)} el día ${targetDate} para mi meta "${activeMeta.nombre}". Llevo ${fmt(newTotal)} de ${fmt(activeMeta.montoObjetivo)}.`
    );
  }, [activeMeta, userId, handleSend]);

  // ── Mark a day as failed ──
  const handleMarkFailed = useCallback(async (fecha: string) => {
    if (!activeMeta) return;
    const updReg = (activeMeta.registros || []).map(r =>
      r.fecha === fecha ? { ...r, estado: 'fallido' as const } : r
    );
    if (!updReg.find(r => r.fecha === fecha)) updReg.push({ fecha, estado: 'fallido' });
    await updateDoc(doc(db, 'users', userId, 'metas', activeMeta.id), { registros: updReg }).catch(console.error);
  }, [activeMeta, userId]);

  // ── Delete meta ──
  const handleDeleteMeta = useCallback(async () => {
    if (!activeMeta) return;
    if (!window.confirm(`¿Eliminar la meta "${activeMeta.nombre}"? Esta acción no se puede deshacer.`)) return;
    await deleteDoc(doc(db, 'users', userId, 'metas', activeMeta.id)).catch(console.error);
    setInternalTab('chat');
  }, [activeMeta, userId]);

  // ── Test data ──
  const handleLoadTestData = useCallback(async () => {
    setLoadingTestData(true);
    try { await populateTestData(userId); window.location.reload(); }
    catch (err) { console.error(err); setLoadingTestData(false); }
  }, [userId]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100dvh-14rem)] md:h-[calc(100dvh-8rem)]">

      {/* ── Header ── */}
      <div className="flex items-center justify-between pb-3 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <ConsejeroAvatar />
          <div>
            <p className="font-black text-base">Consejero</p>
            <p className={cn('text-xs', isDarkMode ? 'text-white/45' : 'text-black/45')}>
              Tu asesor financiero
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {process.env.NODE_ENV !== 'production' && (
            <button onClick={handleLoadTestData} disabled={loadingTestData}
              className={cn('text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors',
                isDarkMode ? 'border-white/15 text-white/40 hover:border-amber-500/40 hover:text-amber-400' : 'border-black/10 text-black/35 hover:border-amber-500/40 hover:text-amber-600')}>
              {loadingTestData ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Datos prueba'}
            </button>
          )}
          <button onClick={() => setShowNewGoalModal(true)}
            className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-bold transition-colors',
              isDarkMode ? 'bg-white/8 hover:bg-white/12 text-white/70' : 'bg-black/5 hover:bg-black/8 text-black/60')}>
            <Plus className="w-3.5 h-3.5" />
            {activeMeta ? 'Nueva meta' : 'Crear meta'}
          </button>
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className={cn('flex p-1 rounded-2xl mb-3 flex-shrink-0', isDarkMode ? 'bg-white/6' : 'bg-black/5')}>
        {([
          { id: 'chat', icon: <MessageCircle className="w-4 h-4" />, label: 'Chat', dot: false },
          { id: 'meta', icon: <Target className="w-4 h-4" />, label: 'Mi Meta', dot: unconfirmedCount >= 3 },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setInternalTab(t.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-all relative',
              internalTab === t.id
                ? isDarkMode ? 'bg-[#1A1A1A] text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                : isDarkMode ? 'text-white/45 hover:text-white/70' : 'text-black/45 hover:text-black/70'
            )}>
            {t.icon}
            {t.label}
            {t.dot && <span className="w-2 h-2 rounded-full bg-red-500 absolute top-1.5 right-3" />}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">

        {/* ── CHAT TAB ── */}
        {internalTab === 'chat' && (
          <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex-1 flex flex-col min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {messages.length === 0 && !isLoading && historyLoaded && (
                hasAlerts && localTip && !tipDismissed ? (
                  <div className="flex flex-col items-center justify-center h-full py-8 px-4">
                    <ConsejeroAvatar />
                    <p className="font-black text-base mt-3 mb-4">¿En qué te puedo ayudar?</p>
                    <div className={cn(
                      'w-full max-w-[290px] rounded-2xl p-4 border',
                      isDarkMode ? 'bg-[#1A1A1A] border-white/8' : 'bg-white border-black/6 shadow-sm'
                    )}>
                      <p className={cn('text-xs leading-relaxed mb-3', isDarkMode ? 'text-white/70' : 'text-black/65')}>
                        💡 {localTip.tip}
                      </p>
                      <button
                        onClick={() => { setTipDismissed(true); handleSend(localTip.cta); }}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black font-black text-sm shadow-sm active:scale-95 transition-transform">
                        {localTip.cta}
                      </button>
                    </div>
                    <button
                      onClick={() => setTipDismissed(true)}
                      className={cn('mt-3 text-xs', isDarkMode ? 'text-white/30 hover:text-white/50' : 'text-black/30 hover:text-black/50')}>
                      Ahora no
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-8 px-4 text-center">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#B8860B]/20 to-[#FFD700]/20 flex items-center justify-center mb-3">
                      <Sparkles className="w-6 h-6 text-[#B8860B]" />
                    </div>
                    <p className="font-black text-base mb-1">Hola, {firstName}</p>
                    <p className={cn('text-sm leading-relaxed max-w-[240px]', isDarkMode ? 'text-white/50' : 'text-black/50')}>
                      Soy tu Consejero. Analizo tus datos reales y te ayudo con tus metas de ahorro.
                    </p>
                    {!activeMeta && (
                      <button onClick={() => setShowNewGoalModal(true)}
                        className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black font-black text-sm shadow-md active:scale-95 transition-transform">
                        <Target className="w-4 h-4" /> Crear mi primera meta
                      </button>
                    )}
                  </div>
                )
              )}
              {messages.map(msg => (
                <React.Fragment key={msg.id}>
                  <MessageBubble msg={msg} isDarkMode={isDarkMode} />
                </React.Fragment>
              ))}
              {isLoading && <TypingBubble text={streamingText} isDarkMode={isDarkMode} />}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions + Input */}
            <div className="flex-shrink-0 pt-2">
              <QuickSuggestions meta={activeMeta} unconfirmedCount={unconfirmedCount}
                isDarkMode={isDarkMode} onSelect={handleSend} disabled={isLoading} />
              <div className="flex items-center gap-2 pt-1">
                <div className={cn('flex-1 flex items-center gap-2 px-4 py-2.5 rounded-2xl border',
                  isDarkMode ? 'bg-[#1A1A1A] border-white/10' : 'bg-white border-black/10 shadow-sm')}>
                  <input value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input); } }}
                    placeholder="Escríbele al Consejero…" disabled={isLoading}
                    className={cn('flex-1 text-sm bg-transparent outline-none',
                      isDarkMode ? 'text-white placeholder:text-white/30' : 'text-gray-900 placeholder:text-black/30')} />
                </div>
                <button onClick={() => handleSend(input)} disabled={!input.trim() || isLoading}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-[#B8860B] to-[#FFD700] flex items-center justify-center flex-shrink-0 shadow-md disabled:opacity-40 active:scale-90 transition-transform">
                  {isLoading ? <Loader2 className="w-4 h-4 text-black animate-spin" /> : <Send className="w-4 h-4 text-black" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── META TAB ── */}
        {internalTab === 'meta' && (
          <motion.div key="meta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto min-h-0 space-y-5 pb-4">

            {!activeMeta ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#B8860B]/20 to-[#FFD700]/20 flex items-center justify-center mb-4">
                  <Target className="w-7 h-7 text-[#B8860B]" />
                </div>
                <p className="font-black text-base mb-1">Sin meta activa</p>
                <p className={cn('text-sm leading-relaxed max-w-[260px] mb-5', isDarkMode ? 'text-white/50' : 'text-black/50')}>
                  Define una meta de ahorro y el Consejero te ayudará a cumplirla día a día.
                </p>
                <button onClick={() => setShowNewGoalModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black font-black text-sm shadow-md active:scale-95 transition-transform">
                  <Plus className="w-4 h-4" /> Crear meta
                </button>
              </div>
            ) : (
              <>
                {/* ── Progreso principal ── */}
                <div className={cn('rounded-2xl border overflow-hidden', isDarkMode ? 'bg-[#1A1A1A] border-white/8' : 'bg-white border-black/5 shadow-sm')}>
                  <div className="h-0.5 w-full bg-gradient-to-r from-[#B8860B] to-[#FFD700]" />
                  <div className="p-5">
                    <div className="flex items-center gap-5">
                      {/* Ring grande */}
                      <div className="relative flex-shrink-0">
                        <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
                          <circle cx="18" cy="18" r="15.9" fill="none"
                            stroke={isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'} strokeWidth="2.5" />
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#B8860B"
                            strokeWidth="2.5" strokeLinecap="round"
                            strokeDasharray={`${metaPct} 100`} className="transition-all duration-700" />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-lg font-black text-[#B8860B]">
                          {metaPct}%
                        </span>
                      </div>

                      {/* Stats */}
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-base leading-tight mb-1">{activeMeta.nombre}</p>
                        <p className={cn('text-sm font-bold text-[#B8860B]')}>{fmt(activeMeta.montoAhorrado)}</p>
                        <p className={cn('text-xs', isDarkMode ? 'text-white/45' : 'text-black/45')}>
                          de {fmt(activeMeta.montoObjetivo)} objetivo
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className={cn('text-xs flex items-center gap-1',
                            unconfirmedCount >= 7 ? 'text-red-500' : unconfirmedCount >= 3 ? 'text-amber-500' : 'text-emerald-500')}>
                            {unconfirmedCount >= 3
                              ? <><AlertTriangle className="w-3 h-3" /> {unconfirmedCount} días sin confirmar</>
                              : <><CheckCircle2 className="w-3 h-3" /> Al día</>}
                          </span>
                          <span className={cn('text-xs flex items-center gap-1', isDarkMode ? 'text-white/40' : 'text-black/40')}>
                            <CalendarDays className="w-3 h-3" /> {metaDiasRestantes}d restantes
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2.5 mt-4">
                      <button onClick={() => {
                        const key = activeMeta.frecuencia === 'semanal' ? getMondayStr(new Date()) : todayStr();
                        setLogSavingsDay(key); setShowLogSavingsModal(true);
                      }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black font-black text-sm shadow-sm active:scale-95 transition-transform">
                        <PiggyBank className="w-4 h-4" />
                        {activeMeta.frecuencia === 'semanal' ? 'Ahorré esta semana' : 'Ahorré hoy'}
                      </button>
                      <button onClick={() => { setInternalTab('chat'); }}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-colors',
                          isDarkMode ? 'bg-white/8 hover:bg-white/12 text-white/70' : 'bg-black/5 hover:bg-black/8 text-black/60'
                        )}>
                        <MessageCircle className="w-4 h-4" /> Hablar
                      </button>
                    </div>
                  </div>
                </div>

                {/* ── Alerta de reajuste (si aplica) ── */}
                <AnimatePresence>
                  {showAdjustment && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <AdjustmentOptions
                        meta={activeMeta} ctx={financialContext}
                        isDarkMode={isDarkMode} onChoose={handleAdjustGoal} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── Checklist diario ── */}
                <div className={cn('rounded-2xl border p-4', isDarkMode ? 'bg-[#1A1A1A] border-white/8' : 'bg-white border-black/5 shadow-sm')}>
                  <p className="font-black text-sm mb-3">Checklist de ahorro</p>
                  <DailyChecklist
                    meta={activeMeta}
                    isDarkMode={isDarkMode}
                    onConfirmDay={(fecha) => { setLogSavingsDay(fecha); setShowLogSavingsModal(true); }}
                    onSkipDay={handleMarkFailed}
                  />
                </div>

                {/* ── Calendario mensual ── */}
                <div className={cn('rounded-2xl border p-4', isDarkMode ? 'bg-[#1A1A1A] border-white/8' : 'bg-white border-black/5 shadow-sm')}>
                  <p className="font-black text-sm mb-1">Historial de ahorro</p>
                  <SavingsCalendar meta={activeMeta} isDarkMode={isDarkMode} />
                </div>

                {/* ── Gráfico de progreso semanal ── */}
                <div className={cn('rounded-2xl border p-4', isDarkMode ? 'bg-[#1A1A1A] border-white/8' : 'bg-white border-black/5 shadow-sm')}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-black text-sm">Progreso semanal</p>
                    <span className={cn('text-[10px] flex items-center gap-1', isDarkMode ? 'text-white/35' : 'text-black/35')}>
                      <span className="w-5 border-t border-dashed border-[#FFD700] inline-block" /> Meta semanal
                    </span>
                  </div>
                  <WeeklySavingsChart meta={activeMeta} isDarkMode={isDarkMode} />
                </div>

                {/* ── Detalle del plan ── */}
                <div className={cn('rounded-2xl border p-4', isDarkMode ? 'bg-[#1A1A1A] border-white/8' : 'bg-white border-black/5 shadow-sm')}>
                  <p className="font-black text-sm mb-3">Plan de ahorro</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        label: activeMeta.frecuencia === 'semanal' ? 'Ahorro semanal' : 'Ahorro diario',
                        value: activeMeta.frecuencia === 'semanal' ? fmt(activeMeta.ahorroDiario * 7) : fmt(activeMeta.ahorroDiario),
                      },
                      { label: 'Frecuencia', value: activeMeta.frecuencia === 'semanal' ? 'Semanal' : 'Diario' },
                      { label: 'Falta para la meta', value: fmt(Math.max(0, activeMeta.montoObjetivo - activeMeta.montoAhorrado)) },
                      { label: 'Días restantes', value: `${metaDiasRestantes} días` },
                    ].map(({ label, value }) => (
                      <div key={label} className={cn('rounded-xl p-3', isDarkMode ? 'bg-white/5' : 'bg-gray-50')}>
                        <p className={cn('text-[10px] font-bold mb-0.5', isDarkMode ? 'text-white/45' : 'text-black/45')}>{label}</p>
                        <p className="text-sm font-black text-[#B8860B]">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Eliminar meta ── */}
                <button
                  onClick={handleDeleteMeta}
                  className={cn(
                    'w-full py-2.5 rounded-xl text-xs font-bold transition-colors',
                    isDarkMode
                      ? 'text-white/25 hover:text-red-400 hover:bg-red-500/10'
                      : 'text-black/25 hover:text-red-500 hover:bg-red-50'
                  )}>
                  Eliminar esta meta
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {showNewGoalModal && (
          <NewGoalModal isDarkMode={isDarkMode} capacidadAhorro={financialContext.capacidadAhorroDiaria}
            onClose={() => setShowNewGoalModal(false)} onConfirm={handleCreateGoal} />
        )}
        {showLogSavingsModal && activeMeta && (
          <LogSavingsModal meta={activeMeta} isDarkMode={isDarkMode}
            fecha={logSavingsDay ?? undefined}
            onClose={() => { setShowLogSavingsModal(false); setLogSavingsDay(null); }}
            onConfirm={handleLogSavings} />
        )}
      </AnimatePresence>
    </div>
  );
};
