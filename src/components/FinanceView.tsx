import React, { useMemo, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, BarChart2, TrendingUp, ShoppingBag, TrendingDown, ChevronRight, Send, MessageCircle, X, Lightbulb } from 'lucide-react';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '../lib/utils';
import { Sale, Expense, getSaleLabel, getSaleQtyLabel } from '../types';
import { MovementDetailModal } from './MovementDetailModal';

const DAY_NAMES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

function SourceBadge({ source }: { source?: string }) {
  if (!source || source === 'manual') return null;
  const config = {
    telegram: { label: 'Telegram', color: '#229ED9', Icon: Send },
    chat:     { label: 'Chat IA',  color: '#8B5CF6', Icon: MessageCircle },
    camara:   { label: 'Cámara',   color: '#F59E0B', Icon: null },
  }[source];
  if (!config) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wide" style={{ color: config.color }}>
      {config.Icon && <config.Icon className="w-2.5 h-2.5" />}
      {config.label}
    </span>
  );
}

function getSaleDate(sale: Sale): Date {
  return sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date();
}
function getExpenseDate(e: Expense): Date {
  return e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const saleDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  if (saleDay.getTime() === today.getTime()) return `Hoy, ${timeStr}`;
  if (saleDay.getTime() === yesterday.getTime()) return `Ayer, ${timeStr}`;
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + `, ${timeStr}`;
}

interface Props {
  isDarkMode: boolean;
  sales: Sale[];
  expenses: Expense[];
}

// ─── Tip card ────────────────────────────────────────────────────────────────

const TipCard: React.FC<{ text: string; onDismiss: () => void; isDarkMode: boolean }> = ({ text, onDismiss, isDarkMode }) => (
  <div
    className={cn('flex-shrink-0 w-64 flex items-start justify-between gap-3 px-4 py-3 rounded-xl border-l-4', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#F5F0E8]')}
    style={{ borderLeftColor: '#F5A623' }}
  >
    <p className={cn('text-sm font-medium leading-snug', isDarkMode ? 'text-[#FDFBF0]/70' : 'text-[#5b5c5a]')}>{text}</p>
    <button onClick={onDismiss} className="flex-shrink-0 opacity-40 hover:opacity-70 transition-opacity mt-0.5">
      <X className="w-3.5 h-3.5" />
    </button>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

export const FinanceView = ({ isDarkMode, sales, expenses }: Props) => {
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(() => new Set());
  // Month totals
  const { monthIncome, monthExpenses } = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let monthIncome = 0;
    let monthExpenses = 0;
    sales.forEach((s) => {
      if (getSaleDate(s) >= monthStart) monthIncome += s.total;
    });
    expenses.forEach((e) => {
      const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
      if (d >= monthStart) monthExpenses += e.amount;
    });
    return { monthIncome, monthExpenses };
  }, [sales, expenses]);

  // Weekly chart
  const weeklyData = useMemo(() => {
    const result = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        name: DAY_NAMES[d.getDay()],
        value: 0,
        ts: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
      };
    });
    sales.forEach((s) => {
      const d = getSaleDate(s);
      const dayTs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const entry = result.find((r) => r.ts === dayTs);
      if (entry) entry.value += s.total;
    });
    return result;
  }, [sales]);

  const maxBar = Math.max(...weeklyData.map((d) => d.value), 1);
  const weekTotal = weeklyData.reduce((sum, d) => sum + d.value, 0);

  const tips = useMemo(() => {
    const result: { id: string; text: string }[] = [];

    // Gastos > 70% ingresos
    if (monthIncome > 0 && monthExpenses / monthIncome > 0.7) {
      const pct = Math.round((monthExpenses / monthIncome) * 100);
      result.push({ id: 'gastos-altos', text: `Por cada $100 que entran, $${pct} se van en gastos. ¿Hay algo que puedas reducir?` });
    }

    // Sin registrar en 24 horas
    const allMs = [
      ...sales.map(s => getSaleDate(s).getTime()),
      ...expenses.map(e => getExpenseDate(e).getTime()),
    ];
    if (allMs.length > 0 && (Date.now() - Math.max(...allMs)) / 3600000 > 24) {
      result.push({ id: 'sin-registro', text: 'No has registrado nada hoy. ¿Cómo te fue?' });
    }

    // Mejor día de la semana superado
    const today = weeklyData[6];
    const prevMax = Math.max(...weeklyData.slice(0, 6).map(d => d.value), 0);
    if (today && today.value > 0 && today.value > prevMax) {
      result.push({ id: 'mejor-dia', text: '¡Hoy fue tu mejor día de ventas! Así se hace.' });
    }

    return result.filter(t => !dismissedTips.has(t.id)).slice(0, 3);
  }, [monthIncome, monthExpenses, sales, expenses, weeklyData, dismissedTips]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className={cn('p-5 rounded-2xl transition-all', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
          <div className="flex items-center gap-2 text-green-500 mb-2">
            <ArrowUpRight className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Ingresos</span>
          </div>
          <p className="text-2xl font-black text-[#B8860B]">${(monthIncome || 0).toLocaleString('es-CO')}</p>
          <p className="text-[10px] opacity-40 mt-1">Este mes</p>
        </div>
        <div className={cn('p-5 rounded-2xl transition-all', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
          <div className="flex items-center gap-2 text-red-500 mb-2">
            <ArrowDownRight className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Gastos</span>
          </div>
          <p className="text-2xl font-black opacity-80">${(monthExpenses || 0).toLocaleString('es-CO')}</p>
          <p className="text-[10px] opacity-40 mt-1">Este mes</p>
        </div>
      </div>

      {/* Chart */}
      <section className={cn('rounded-2xl p-6 transition-colors duration-500', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold">Flujo de Caja</h3>
            <p className="text-xs opacity-50">Últimos 7 días</p>
          </div>
          <div className={cn('flex items-center gap-1 font-bold text-sm', 'text-[#B8860B]')}>
            <TrendingUp className="w-4 h-4" />
            ${(weekTotal || 0).toLocaleString('es-CO')}
          </div>
        </div>
        <div className="h-48 w-full" style={{ minHeight: 192 }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={weeklyData}>
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {weeklyData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={
                      entry.value > 0 && entry.value === maxBar
                        ? '#FFD700'
                        : entry.value > maxBar * 0.6
                          ? '#B8860B'
                          : isDarkMode ? '#333' : '#e3e3df'
                    }
                    fillOpacity={entry.value > 0 ? 1 : 0.5}
                  />
                ))}
              </Bar>
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: isDarkMode ? '#FDFBF0' : '#2e2f2d', opacity: 0.4 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Consejos */}
      {tips.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Lightbulb className="w-4 h-4" style={{ color: '#F5A623' }} />
            <p className={cn('text-sm font-black', isDarkMode ? 'text-white/60' : 'text-[#5b5c5a]')}>Consejos</p>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {tips.map(tip => (
              <TipCard
                key={tip.id}
                text={tip.text}
                isDarkMode={isDarkMode}
                onDismiss={() => setDismissedTips(prev => { const s = new Set(prev); s.add(tip.id); return s; })}
              />
            ))}
          </div>
        </section>
      )}

      {/* Transaction list */}
      <section className="space-y-4">
        <div className="px-1">
          <h3 className="text-xl font-bold">Movimientos</h3>
        </div>

        {sales.length === 0 ? (
          <div className={cn('p-10 rounded-2xl flex flex-col items-center justify-center gap-3 text-center', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
            <div className={cn('w-14 h-14 rounded-full flex items-center justify-center', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#f1f1ee]')}>
              <BarChart2 className={cn('w-7 h-7', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/40')} />
            </div>
            <p className={cn('font-bold', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>Sin movimientos aún</p>
            <p className={cn('text-xs', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/60')}>Aquí verás tu historial financiero</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Sales */}
            {sales.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSale(s)}
                className={cn('w-full p-4 rounded-2xl flex items-center justify-between shadow-sm active:scale-[0.98] transition-all duration-200 text-left', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-[#ffc96f] flex items-center justify-center text-[#2e2f2d] flex-shrink-0">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{getSaleLabel(s)}</p>
                    <div className="flex items-center gap-1.5 text-[10px] opacity-50">
                      <span>{formatRelativeTime(getSaleDate(s))}{getSaleQtyLabel(s) && ` · ${getSaleQtyLabel(s)}`}</span>
                      <SourceBadge source={s.source} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <p className="font-black text-base text-[#B8860B]">+${(s.total || 0).toLocaleString('es-CO')}</p>
                  <ChevronRight className={cn('w-4 h-4', isDarkMode ? 'text-white/20' : 'text-black/20')} />
                </div>
              </button>
            ))}
            {/* Expenses */}
            {expenses.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelectedExpense(e)}
                className={cn('w-full p-4 rounded-2xl flex items-center justify-between shadow-sm active:scale-[0.98] transition-all duration-200 text-left', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}
              >
                <div className="flex items-center gap-3">
                  <div className={cn('w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0', isDarkMode ? 'bg-red-500/20' : 'bg-red-50')}>
                    <TrendingDown className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{e.concept}</p>
                    <div className="flex items-center gap-1.5 text-[10px] opacity-50">
                      <span>{formatRelativeTime(getExpenseDate(e))}</span>
                      <SourceBadge source={e.source} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <p className="font-black text-base text-red-500">-${(e.amount || 0).toLocaleString('es-CO')}</p>
                  <ChevronRight className={cn('w-4 h-4', isDarkMode ? 'text-white/20' : 'text-black/20')} />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedSale && (
        <MovementDetailModal item={{ kind: 'sale', data: selectedSale }} isDarkMode={isDarkMode} onClose={() => setSelectedSale(null)} />
      )}
      {selectedExpense && (
        <MovementDetailModal item={{ kind: 'expense', data: selectedExpense }} isDarkMode={isDarkMode} onClose={() => setSelectedExpense(null)} />
      )}
    </div>
  );
};
