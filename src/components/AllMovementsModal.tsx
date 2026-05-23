import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, TrendingDown, SlidersHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';
import { Sale, Expense, getSaleLabel, getSaleQtyLabel } from '../types';

type Filter = 'todo' | 'ventas' | 'gastos';

interface Movement {
  id: string;
  label: string;
  sub: string;
  amount: number;
  type: 'venta' | 'gasto';
  date: Date;
}

function getSaleDate(s: Sale): Date {
  return s.createdAt?.toDate ? s.createdAt.toDate() : new Date();
}
function getExpenseDate(e: Expense): Date {
  return e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
}

function formatTime(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const time = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  if (day.getTime() === today.getTime()) return `Hoy, ${time}`;
  if (day.getTime() === yesterday.getTime()) return `Ayer, ${time}`;
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) + `, ${time}`;
}

function groupByDate(movements: Movement[]): { label: string; items: Movement[] }[] {
  const groups: Record<string, Movement[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);

  movements.forEach((m) => {
    const day = new Date(m.date.getFullYear(), m.date.getMonth(), m.date.getDate());
    let label: string;
    if (day.getTime() === today.getTime()) label = 'Hoy';
    else if (day.getTime() === yesterday.getTime()) label = 'Ayer';
    else label = m.date.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(m);
  });

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

interface Props {
  isDarkMode: boolean;
  sales: Sale[];
  expenses: Expense[];
  onClose: () => void;
}

export const AllMovementsModal = ({ isDarkMode, sales, expenses, onClose }: Props) => {
  const [filter, setFilter] = useState<Filter>('todo');

  const movements = useMemo<Movement[]>(() => {
    const result: Movement[] = [];

    sales.forEach((s) => {
      result.push({
        id: `s-${s.id}`,
        label: getSaleLabel(s),
        sub: getSaleQtyLabel(s),
        amount: s.total,
        type: 'venta',
        date: getSaleDate(s),
      });
    });

    expenses.forEach((e) => {
      result.push({
        id: `e-${e.id}`,
        label: e.concept,
        sub: '',
        amount: e.amount,
        type: 'gasto',
        date: getExpenseDate(e),
      });
    });

    return result.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sales, expenses]);

  const filtered = useMemo(() => {
    if (filter === 'todo') return movements;
    if (filter === 'ventas') return movements.filter((m) => m.type === 'venta');
    return movements.filter((m) => m.type === 'gasto');
  }, [movements, filter]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const totalIngresos = filtered.filter((m) => m.type === 'venta').reduce((s, m) => s + m.amount, 0);
  const totalGastos = filtered.filter((m) => m.type === 'gasto').reduce((s, m) => s + m.amount, 0);

  const FILTERS: { label: string; value: Filter }[] = [
    { label: 'Todo', value: 'todo' },
    { label: 'Ventas', value: 'ventas' },
    { label: 'Gastos', value: 'gastos' },
  ];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className={cn(
            'relative w-full max-w-md rounded-2xl shadow-2xl z-10 flex flex-col',
            'max-h-[90dvh] max-h-[90vh]',
            isDarkMode ? 'bg-[#0D0D0D] text-[#FDFBF0]' : 'bg-[#FDFBF0] text-[#0D0D0D]'
          )}
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-6 pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-black">Todos los movimientos</h2>
                <p className="text-xs opacity-40 font-bold">{movements.length} registros en total</p>
              </div>
              <button
                onClick={onClose}
                className={cn('w-9 h-9 rounded-full flex items-center justify-center', isDarkMode ? 'bg-white/10' : 'bg-black/5')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary pills */}
            <div className="flex gap-3 mb-4">
              <div className={cn('flex-1 p-3 rounded-xl', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-0.5">Ingresos</p>
                <p className="font-black text-[#B8860B]">${(totalIngresos || 0).toLocaleString('es-CO')}</p>
              </div>
              <div className={cn('flex-1 p-3 rounded-xl', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-0.5">Gastos</p>
                <p className="font-black opacity-70">${(totalGastos || 0).toLocaleString('es-CO')}</p>
              </div>
              <div className={cn('flex-1 p-3 rounded-xl', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-0.5">Neto</p>
                <p className={cn('font-black', (totalIngresos - totalGastos) >= 0 ? 'text-[#B8860B]' : 'text-red-500')}>
                  ${((totalIngresos || 0) - (totalGastos || 0)).toLocaleString('es-CO')}
                </p>
              </div>
            </div>

            {/* Filter tabs */}
            <div className={cn('flex p-1 rounded-xl', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-xs font-bold transition-all',
                    filter === f.value
                      ? 'bg-[#B8860B] text-black shadow-sm'
                      : isDarkMode ? 'text-[#FDFBF0]/50' : 'text-[#5b5c5a]'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto px-6 pb-8">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <SlidersHorizontal className={cn('w-10 h-10', isDarkMode ? 'text-white/20' : 'text-black/20')} />
                <p className={cn('font-bold', isDarkMode ? 'text-white/40' : 'text-black/40')}>Sin movimientos</p>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((group) => (
                  <div key={group.label}>
                    <p className={cn('text-xs font-black uppercase tracking-widest mb-3', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>
                      {group.label}
                    </p>
                    <div className="space-y-2">
                      {group.items.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            'p-4 rounded-xl flex items-center justify-between',
                            isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              'w-10 h-10 rounded-full flex items-center justify-center',
                              m.type === 'venta' ? 'bg-[#ffc96f]' : isDarkMode ? 'bg-red-500/20' : 'bg-red-50'
                            )}>
                              {m.type === 'venta'
                                ? <ShoppingBag className="w-5 h-5 text-[#2e2f2d]" />
                                : <TrendingDown className="w-5 h-5 text-red-500" />}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{m.label}</p>
                              <p className={cn('text-[10px]', isDarkMode ? 'text-white/40' : 'text-black/40')}>
                                {formatTime(m.date)}{m.sub ? ` · ${m.sub}` : ''}
                              </p>
                            </div>
                          </div>
                          <p className={cn('font-black text-base', m.type === 'venta' ? 'text-[#B8860B]' : 'text-red-500')}>
                            {m.type === 'venta' ? '+' : '-'}${(m.amount || 0).toLocaleString('es-CO')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
