import React, { useState, useMemo } from 'react';
import { Plus, ShoppingBag, BarChart2, TrendingDown, ChevronRight, Send, MessageCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '../lib/utils';
import { Sale, Expense, getSaleLabel, getSaleQtyLabel } from '../types';
import { RegisterSaleModal } from './RegisterSaleModal';
import { RegisterExpenseModal } from './RegisterExpenseModal';
import { AllMovementsModal } from './AllMovementsModal';
import { MovementDetailModal } from './MovementDetailModal';

type TimeFilter = '1d' | '2d' | '7d' | '30d';

const TIME_FILTERS: { label: string; value: TimeFilter }[] = [
  { label: 'Hoy', value: '1d' },
  { label: '2 días', value: '2d' },
  { label: 'Semana', value: '7d' },
  { label: 'Mes', value: '30d' },
];

const DAY_NAMES = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const montoValido = (v: unknown): v is number =>
  typeof v === 'number' && !isNaN(v) && isFinite(v);

function getSaleDate(sale: Sale): Date {
  return sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date();
}

function getExpenseDate(e: Expense): Date {
  return e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
}

function SourceBadge({ source }: { source?: string }) {
  if (!source || source === 'manual') return null;
  const config: Record<string, { label: string; color: string; Icon: React.ElementType | null }> = {
    telegram: { label: 'Telegram', color: '#229ED9', Icon: Send },
    chat:     { label: 'Chat IA',  color: '#8B5CF6', Icon: MessageCircle },
    camara:   { label: 'Cámara',   color: '#F59E0B', Icon: null },
    whatsapp: { label: 'WhatsApp', color: '#25D366', Icon: MessageCircle },
  };
  const c = config[source];
  if (!c) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wide" style={{ color: c.color }}>
      {c.Icon && <c.Icon className="w-2.5 h-2.5" />}
      {c.label}
    </span>
  );
}

function filterByTime(date: Date, filter: TimeFilter): boolean {
  const now = new Date();
  if (filter === '1d') {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return date >= midnight;
  }
  const days: Record<string, number> = { '2d': 2, '7d': 7, '30d': 30 };
  return date >= new Date(now.getTime() - days[filter] * 86400000);
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
  userId: string;
  sales: Sale[];
  expenses: Expense[];
}

export const Dashboard = ({ isDarkMode, userId, sales, expenses }: Props) => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('1d');
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showAllMovements, setShowAllMovements] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  // Totals
  const { todayIncome, todayExpenses, totalBalance } = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    let todayIncome = 0;
    let todayExpenses = 0;
    let totalBalance = 0;
    sales.forEach((s) => {
      if (!montoValido(s.total)) return;
      totalBalance += s.total;
      if (getSaleDate(s) >= midnight) todayIncome += s.total;
    });
    expenses.forEach((e) => {
      if (!montoValido(e.amount)) return;
      const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
      totalBalance -= e.amount;
      if (d >= midnight) todayExpenses += e.amount;
    });
    return { todayIncome, todayExpenses, totalBalance };
  }, [sales, expenses]);

  // Combined + filtered movement list (sales + expenses), sorted newest first
  const filteredMovements = useMemo(() => {
    const items = [
      ...sales.map(s => ({ kind: 'sale' as const, data: s, date: getSaleDate(s) })),
      ...expenses.map(e => ({ kind: 'expense' as const, data: e, date: getExpenseDate(e) })),
    ].filter(m => filterByTime(m.date, timeFilter));
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sales, expenses, timeFilter]);

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
      if (!montoValido(s.total)) return;
      const d = getSaleDate(s);
      const dayTs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const entry = result.find((r) => r.ts === dayTs);
      if (entry) entry.value += s.total;
    });
    return result;
  }, [sales]);

  const maxBar = Math.max(...weeklyData.map((d) => d.value), 1);
  const weekTotal = weeklyData.reduce((sum, d) => sum + d.value, 0);

  return (
    <>
      <div className="space-y-8">
        {/* Hero Card */}
        <section className={cn(
          'rounded-xl p-8 shadow-[0_8px_32px_rgba(184,134,11,0.15)] relative overflow-hidden transition-all duration-500',
          isDarkMode
            ? 'bg-gradient-to-br from-[#B8860B] to-[#DAA520] text-black'
            : 'bg-gradient-to-br from-[#B8860B] to-[#FFD700] text-black'
        )}>
          <div className="relative z-10">
            <p className="text-sm opacity-90 mb-1">Saldo total</p>
            <h2 className="text-5xl font-extrabold tracking-tight mb-6">
              ${(totalBalance || 0).toLocaleString('es-CO')}
            </h2>
            <div className="flex gap-4">
              <div className="flex-1 bg-black/5 backdrop-blur-md p-4 rounded-lg">
                <p className="text-xs opacity-80 mb-1">Ingresos de hoy</p>
                <p className="text-xl font-bold">+${(todayIncome || 0).toLocaleString('es-CO')}</p>
              </div>
              <div className="flex-1 bg-black/5 backdrop-blur-md p-4 rounded-lg">
                <p className="text-xs opacity-80 mb-1">Gastos</p>
                <p className="text-xl font-bold">-${(todayExpenses || 0).toLocaleString('es-CO')}</p>
              </div>
            </div>
          </div>
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#DAA520] rounded-full blur-[80px] opacity-40" />
        </section>

        {/* CTAs */}
        <div className="flex gap-3">
          <button
            onClick={() => setShowSaleModal(true)}
            className="flex-1 h-16 bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform"
          >
            <Plus className="w-5 h-5" />
            Registrar Venta
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className={cn(
              'flex-1 h-16 rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform border-2',
              isDarkMode
                ? 'bg-[#1A1A1A] border-red-500/30 text-red-400'
                : 'bg-white border-red-200 text-red-500 shadow-sm'
            )}
          >
            <TrendingDown className="w-5 h-5" />
            Registrar Gasto
          </button>
        </div>

        {/* Weekly Chart */}
        <section className={cn(
          'rounded-lg p-6 transition-colors duration-500',
          isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f1f1ee]'
        )}>
          <div className="flex justify-between items-end mb-6">
            <div>
              <h3 className="text-lg font-bold">Ganancias de la semana</h3>
              <p className={cn('text-sm', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>
                Rendimiento semanal
              </p>
            </div>
            <span className="text-[#B8860B] font-bold text-lg">
              ${(weekTotal || 0).toLocaleString('es-CO')}
            </span>
          </div>
          <div
            className="w-full [&_svg]:outline-none [&_svg]:border-none [&>div]:outline-none [&>div]:border-none"
            style={{ height: 160, outline: 'none', border: 'none' }}
          >
            <ResponsiveContainer width="100%" height={160} minWidth={0} style={{ outline: 'none', border: 'none' }}>
              <BarChart data={weeklyData} style={{ outline: 'none', border: 'none' }} barCategoryGap="20%">
                <Bar dataKey="value" radius={[10, 10, 0, 0]} activeBar={false} isAnimationActive={false}>
                  {weeklyData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.value > 0 && entry.value === maxBar
                          ? '#FFD700'
                          : entry.value > maxBar * 0.6
                            ? '#DAA520'
                            : isDarkMode ? '#333' : '#ddddd9'
                      }
                    />
                  ))}
                </Bar>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fontWeight: 500, fill: isDarkMode ? '#FDFBF0' : '#2e2f2d', opacity: 0.6 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Movimientos */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold">Movimientos recientes</h3>
            <button
            onClick={() => setShowAllMovements(true)}
            className="text-[#B8860B] font-bold text-sm"
          >Ver todo</button>
          </div>

          {/* Time filter pills */}
          <div className="flex gap-2">
            {TIME_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTimeFilter(f.value)}
                className={cn(
                  'flex-1 py-2 rounded-xl text-xs font-bold transition-all duration-200',
                  timeFilter === f.value
                    ? 'bg-[#B8860B] text-black shadow-sm'
                    : isDarkMode
                      ? 'bg-[#1A1A1A] text-[#FDFBF0]/60'
                      : 'bg-[#f1f1ee] text-[#5b5c5a]'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredMovements.length === 0 ? (
            <div className={cn(
              'p-10 rounded-xl flex flex-col items-center justify-center gap-3 text-center',
              isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white'
            )}>
              <div className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center',
                isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#f1f1ee]'
              )}>
                <BarChart2 className={cn('w-7 h-7', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/40')} />
              </div>
              <p className={cn('font-bold', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>
                Sin movimientos en este período
              </p>
              <p className={cn('text-xs', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/60')}>
                Registra tu primera venta para verla aquí
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMovements.map((m) => {
                if (m.kind === 'sale') {
                  const s = m.data;
                  return (
                    <button
                      key={`s-${s.id}`}
                      onClick={() => setSelectedSale(s)}
                      className={cn(
                        'w-full p-5 rounded-lg flex items-center justify-between shadow-sm active:scale-[0.98] transition-all duration-200 text-left',
                        isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white'
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-[#ffc96f] flex items-center justify-center text-[#2e2f2d] flex-shrink-0">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold truncate">{getSaleLabel(s)}</p>
                          <div className={cn('flex items-center gap-1.5 text-sm', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>
                            <span>{formatRelativeTime(m.date)}{getSaleQtyLabel(s) && ` · ${getSaleQtyLabel(s)}`}</span>
                            <SourceBadge source={s.source} />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <p className="font-bold text-[#B8860B]">+${(s.total || 0).toLocaleString('es-CO')}</p>
                        <ChevronRight className={cn('w-4 h-4', isDarkMode ? 'text-white/20' : 'text-black/20')} />
                      </div>
                    </button>
                  );
                } else {
                  const e = m.data;
                  return (
                    <button
                      key={`e-${e.id}`}
                      onClick={() => setSelectedExpense(e)}
                      className={cn(
                        'w-full p-5 rounded-lg flex items-center justify-between shadow-sm active:scale-[0.98] transition-all duration-200 text-left',
                        isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white'
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn('w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0', isDarkMode ? 'bg-red-500/20' : 'bg-red-50')}>
                          <TrendingDown className="w-6 h-6 text-red-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold truncate">{e.concept}</p>
                          <div className={cn('flex items-center gap-1.5 text-sm', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>
                            <span>{formatRelativeTime(m.date)}</span>
                            <SourceBadge source={e.source} />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <p className="font-bold text-red-500">-${(e.amount || 0).toLocaleString('es-CO')}</p>
                        <ChevronRight className={cn('w-4 h-4', isDarkMode ? 'text-white/20' : 'text-black/20')} />
                      </div>
                    </button>
                  );
                }
              })}
            </div>
          )}
        </section>
      </div>

      {showSaleModal && (
        <RegisterSaleModal userId={userId} isDarkMode={isDarkMode} onClose={() => setShowSaleModal(false)} />
      )}

      {showExpenseModal && (
        <RegisterExpenseModal userId={userId} isDarkMode={isDarkMode} onClose={() => setShowExpenseModal(false)} />
      )}

      {showAllMovements && (
        <AllMovementsModal isDarkMode={isDarkMode} sales={sales} expenses={expenses} onClose={() => setShowAllMovements(false)} />
      )}

      {selectedSale && (
        <MovementDetailModal
          item={{ kind: 'sale', data: selectedSale }}
          isDarkMode={isDarkMode}
          onClose={() => setSelectedSale(null)}
        />
      )}

      {selectedExpense && (
        <MovementDetailModal
          item={{ kind: 'expense', data: selectedExpense }}
          isDarkMode={isDarkMode}
          onClose={() => setSelectedExpense(null)}
        />
      )}
    </>
  );
};
