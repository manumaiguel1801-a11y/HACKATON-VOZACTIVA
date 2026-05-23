import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight, ArrowDownRight, BarChart2, TrendingUp, TrendingDown,
  ShoppingBag, ChevronRight, ChevronDown, Send, MessageCircle, Lightbulb,
  Wallet, Calendar,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from 'recharts';
import { cn } from '../lib/utils';
import { Sale, Expense, getSaleLabel } from '../types';
import { MovementDetailModal } from './MovementDetailModal';
import { RegisterSaleModal } from './RegisterSaleModal';
import { RegisterExpenseModal } from './RegisterExpenseModal';

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function getSaleDate(sale: Sale): Date {
  return sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date();
}
function getExpenseDate(e: Expense): Date {
  return e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
}
function formatTime(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const t = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  if (d.getTime() === today.getTime()) return `Hoy, ${t}`;
  if (d.getTime() === yesterday.getTime()) return `Ayer, ${t}`;
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + `, ${t}`;
}
function fmt(v: number | null | undefined): string {
  return '$' + (v ?? 0).toLocaleString('es-CO');
}
function fmtY(v: number): string {
  if (v === 0) return '$0';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
}

function SourceBadge({ source }: { source?: string }) {
  if (!source || source === 'manual') return null;
  const cfg: Record<string, { label: string; color: string; Icon: React.ElementType | null }> = {
    telegram: { label: 'Telegram', color: '#229ED9', Icon: Send },
    chat:     { label: 'Chat IA',  color: '#8B5CF6', Icon: MessageCircle },
    camara:   { label: 'Cámara',   color: '#F59E0B', Icon: null },
  };
  const c = cfg[source];
  if (!c) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wide" style={{ color: c.color }}>
      {c.Icon && <c.Icon className="w-2.5 h-2.5" />}
      {c.label}
    </span>
  );
}

interface Props {
  isDarkMode: boolean;
  sales: Sale[];
  expenses: Expense[];
  userId: string;
  userName?: string;
}

type Movement =
  | { kind: 'sale'; date: Date; data: Sale }
  | { kind: 'expense'; date: Date; data: Expense };

export const FinanceView = ({ isDarkMode, sales, expenses, userId, userName }: Props) => {
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  const cardBase = cn('rounded-2xl shadow-sm p-6', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white');
  const muted = isDarkMode ? 'text-white/40' : 'text-[#5b5c5a]/60';
  const divColor = isDarkMode ? 'border-white/10' : 'border-gray-100';

  // ── stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yestStart = new Date(todayStart.getTime() - 86_400_000);
    let monthIncome = 0, monthExp = 0, txCount = 0, todayInc = 0, yestInc = 0;
    sales.forEach(s => {
      const d = getSaleDate(s);
      if (d >= monthStart) { monthIncome += s.total; txCount++; }
      if (d >= todayStart) todayInc += s.total;
      else if (d >= yestStart && d < todayStart) yestInc += s.total;
    });
    expenses.forEach(e => {
      const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
      if (d >= monthStart) { monthExp += e.amount; txCount++; }
    });
    return { monthIncome, monthExp, txCount, todayInc, yestInc };
  }, [sales, expenses]);

  const balance = stats.monthIncome - stats.monthExp;
  const vsYest = stats.todayInc - stats.yestInc;

  // ── weekly data (grouped bars) ────────────────────────────────────────────
  const weeklyData = useMemo(() => {
    const rows = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { name: DAY_SHORT[d.getDay()], income: 0, exp: 0, ts: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() };
    });
    sales.forEach(s => {
      const d = getSaleDate(s);
      const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const row = rows.find(r => r.ts === ts);
      if (row) row.income += s.total;
    });
    expenses.forEach(e => {
      const d = getExpenseDate(e);
      const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const row = rows.find(r => r.ts === ts);
      if (row) row.exp += e.amount;
    });
    return rows;
  }, [sales, expenses]);

  // ── all movements merged & sorted ─────────────────────────────────────────
  const allMovements = useMemo<Movement[]>(() => [
    ...sales.map<Movement>(s => ({ kind: 'sale', date: getSaleDate(s), data: s })),
    ...expenses.map<Movement>(e => ({ kind: 'expense', date: getExpenseDate(e), data: e })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime()), [sales, expenses]);

  // ── tip ───────────────────────────────────────────────────────────────────
  const tipText = useMemo(() => {
    if (stats.monthIncome > 0 && stats.monthExp / stats.monthIncome > 0.7) {
      const pct = Math.round((stats.monthExp / stats.monthIncome) * 100);
      return `Por cada $100 que entran, $${pct} se van en gastos. ¿Hay algo que puedas reducir?`;
    }
    if (vsYest > 0) return `Hoy llevas ${fmt(vsYest)} más que ayer. ¡Buen ritmo de ventas!`;
    const todayRow = weeklyData[6];
    const prevMax = Math.max(...weeklyData.slice(0, 6).map(r => r.income), 0);
    if (todayRow?.income > 0 && todayRow.income > prevMax) return '¡Hoy fue tu mejor día de ventas de la semana! Sigue así.';
    if (balance > 0) return `Llevas ${fmt(balance)} de utilidad este mes. Tu negocio está en positivo.`;
    return 'Registra tus ventas y gastos cada día para ver cómo crece tu negocio.';
  }, [stats, vsYest, weeklyData, balance]);

  const metrics = [
    { label: 'Ingresos',       sub: 'Este mes', value: fmt(stats.monthIncome), color: 'text-green-600',                           bg: isDarkMode ? 'bg-green-500/20'  : 'bg-green-50',  Icon: ArrowUpRight,  iconColor: 'text-green-600' },
    { label: 'Gastos',         sub: 'Este mes', value: fmt(stats.monthExp),    color: 'text-red-500',                             bg: isDarkMode ? 'bg-red-500/20'    : 'bg-red-50',    Icon: ArrowDownRight,iconColor: 'text-red-500' },
    { label: 'Utilidad',       sub: 'Este mes', value: fmt(Math.max(0,balance)),color: isDarkMode ? 'text-white' : 'text-[#2e2f2d]',bg: isDarkMode ? 'bg-[#B8860B]/20' : 'bg-amber-50', Icon: TrendingUp,    iconColor: 'text-[#B8860B]' },
    { label: 'Transacciones',  sub: 'Este mes', value: String(stats.txCount),  color: isDarkMode ? 'text-white' : 'text-[#2e2f2d]',bg: isDarkMode ? 'bg-white/10'     : 'bg-gray-100', Icon: Calendar,      iconColor: isDarkMode ? 'text-white/50' : 'text-gray-500' },
  ];

  // border classes per cell: 2×2 mobile → 4×1 desktop
  const metricBorder = [
    `border-r border-b md:border-b-0`,
    `border-b md:border-r md:border-b-0`,
    `border-r`,
    ``,
  ];

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Row 1: Balance + Actions ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:grid" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)' }}>

        {/* Balance card */}
        <div className={cn(cardBase, 'relative overflow-hidden')}>
          <p className={cn('text-[10px] font-bold uppercase tracking-widest mb-3', muted)}>Saldo disponible</p>
          <p className={cn('text-4xl font-black mb-3 leading-none', isDarkMode ? 'text-white' : 'text-[#2e2f2d]')}>
            {fmt(balance)}
          </p>
          <div className="flex items-center gap-1.5">
            {vsYest >= 0
              ? <ArrowUpRight className="w-4 h-4 text-green-500 flex-shrink-0" />
              : <ArrowDownRight className="w-4 h-4 text-red-500 flex-shrink-0" />}
            <span className={cn('text-sm font-semibold', vsYest >= 0 ? 'text-green-500' : 'text-red-500')}>
              {fmt(Math.abs(vsYest))}
            </span>
            <span className={cn('text-xs', muted)}>vs. ayer</span>
          </div>
          <Wallet className="absolute bottom-4 right-4 w-20 h-20 text-[#B8860B] opacity-[0.07]" />
        </div>

        {/* Action buttons */}
        <div className="flex flex-row md:flex-col gap-3">
          <button
            onClick={() => setShowSaleModal(true)}
            className="flex-1 flex items-center justify-between px-5 py-4 rounded-xl text-white font-bold text-sm active:scale-[0.98] transition-all duration-200"
            style={{ background: '#B8860B' }}
          >
            <span>+ Registrar venta</span>
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowExpenseModal(true)}
            className={cn(
              'flex-1 flex items-center justify-between px-5 py-4 rounded-xl font-bold text-sm border-2 border-[#B8860B] text-[#B8860B] active:scale-[0.98] transition-all duration-200',
              isDarkMode ? 'bg-transparent' : 'bg-white'
            )}
          >
            <span>— Registrar gasto</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Row 2: 4 Metrics ─────────────────────────────────────────────── */}
      <div className={cn('rounded-2xl shadow-sm', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
        <div className="grid grid-cols-2 md:grid-cols-4">
          {metrics.map((m, i) => (
            <div key={m.label} className={cn('flex items-center gap-3 p-4 md:p-5', metricBorder[i], divColor)}>
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', m.bg)}>
                <m.Icon className={cn('w-5 h-5', m.iconColor)} />
              </div>
              <div className="min-w-0">
                <p className={cn('text-[10px] font-bold uppercase tracking-wider', muted)}>{m.label}</p>
                <p className={cn('font-black text-base truncate', m.color)}>{m.value}</p>
                <p className={cn('text-[10px]', muted)}>{m.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 3: Chart + Movements ─────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:grid md:items-stretch" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)' }}>

        {/* Chart card */}
        <div className={cn(cardBase, 'flex flex-col')}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-base">Flujo de caja</h3>
              <p className={cn('text-xs', muted)}>Últimos 7 días</p>
            </div>
            <button className={cn('flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border', isDarkMode ? 'border-white/20 text-white/60' : 'border-gray-200 text-[#5b5c5a]')}>
              7 días <ChevronDown className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#B8860B]" />
              <span className={cn('text-xs', muted)}>Ingresos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={cn('w-2.5 h-2.5 rounded-full', isDarkMode ? 'bg-white/20' : 'bg-gray-300')} />
              <span className={cn('text-xs', muted)}>Gastos</span>
            </div>
          </div>
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={weeklyData} barCategoryGap="20%" barGap={2}>
                <CartesianGrid vertical={false} stroke={isDarkMode ? '#2a2a2a' : '#f0f0ee'} />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 700, fill: isDarkMode ? '#FDFBF0' : '#2e2f2d', opacity: 0.5 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={fmtY}
                  tick={{ fontSize: 9, fill: isDarkMode ? '#FDFBF0' : '#2e2f2d', opacity: 0.4 }}
                  width={42}
                />
                <Tooltip
                  cursor={{ fill: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}
                  contentStyle={{
                    background: isDarkMode ? '#1A1A1A' : '#fff',
                    border: 'none',
                    borderRadius: 12,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [fmt(value), name === 'income' ? 'Ingresos' : 'Gastos']}
                />
                <Bar dataKey="income" fill="#B8860B" radius={[4, 4, 0, 0]} />
                <Bar dataKey="exp" fill={isDarkMode ? '#3a3a3a' : '#e3e3df'} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent movements card */}
        <div className={cn(cardBase, 'flex flex-col')}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base">Movimientos recientes</h3>
            <button className="text-xs font-bold text-[#B8860B]">Ver todos</button>
          </div>
          {allMovements.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-10 text-center">
              <BarChart2 className={cn('w-10 h-10', isDarkMode ? 'text-white/20' : 'text-gray-300')} />
              <p className={cn('text-sm', muted)}>Sin movimientos aún</p>
            </div>
          ) : (
            <>
              <div
                className="overflow-y-auto max-h-[520px] space-y-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#B8860B]/60 [&::-webkit-scrollbar-track]:bg-transparent"
                style={{ scrollbarWidth: 'thin', scrollbarColor: '#B8860B60 transparent' }}
              >
                {allMovements.map((m) => {
                  const isSale = m.kind === 'sale';
                  const label = isSale ? getSaleLabel(m.data as Sale) : (m.data as Expense).concept;
                  const amount = isSale ? (m.data as Sale).total : (m.data as Expense).amount;
                  return (
                    <button
                      key={`${m.kind}-${m.data.id}`}
                      onClick={() => isSale ? setSelectedSale(m.data as Sale) : setSelectedExpense(m.data as Expense)}
                      className={cn(
                        'w-full flex items-center justify-between gap-3 p-3 rounded-xl active:scale-[0.98] transition-all duration-150 text-left',
                        isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0',
                          isSale ? 'bg-[#ffc96f]' : isDarkMode ? 'bg-red-500/20' : 'bg-red-50'
                        )}>
                          {isSale
                            ? <ShoppingBag className="w-4 h-4 text-[#2e2f2d]" />
                            : <TrendingDown className="w-4 h-4 text-red-500" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-xs truncate">{label}</p>
                          <div className="flex items-center gap-1 text-[10px] opacity-50">
                            <span>{formatTime(m.date)}</span>
                            <SourceBadge source={m.data.source} />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={cn('font-black text-sm', isSale ? 'text-green-500' : 'text-red-500')}>
                          {isSale ? '+' : '-'}{fmt(amount)}
                        </span>
                        <ChevronRight className={cn('w-3.5 h-3.5', isDarkMode ? 'text-white/20' : 'text-black/20')} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Row 4: Tip ───────────────────────────────────────────────────── */}
      <div className={cn('rounded-2xl p-5 flex items-center gap-4', isDarkMode ? 'bg-[#1e1a00]' : 'bg-[#FFF8E7]')}>
        <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-[#B8860B]/15">
          <Lightbulb className="w-5 h-5 text-[#B8860B]" />
        </div>
        <p className={cn('flex-1 text-sm font-medium leading-snug', isDarkMode ? 'text-[#FDFBF0]/70' : 'text-[#5b5c5a]')}>
          {tipText}
        </p>
        <button className="flex-shrink-0 flex items-center gap-1 text-xs font-bold text-[#B8860B] whitespace-nowrap">
          Ver análisis <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Modals */}
      {showSaleModal && (
        <RegisterSaleModal userId={userId} isDarkMode={isDarkMode} onClose={() => setShowSaleModal(false)} />
      )}
      {showExpenseModal && (
        <RegisterExpenseModal userId={userId} isDarkMode={isDarkMode} onClose={() => setShowExpenseModal(false)} />
      )}
      {selectedSale && (
        <MovementDetailModal item={{ kind: 'sale', data: selectedSale }} isDarkMode={isDarkMode} onClose={() => setSelectedSale(null)} />
      )}
      {selectedExpense && (
        <MovementDetailModal item={{ kind: 'expense', data: selectedExpense }} isDarkMode={isDarkMode} onClose={() => setSelectedExpense(null)} />
      )}
    </div>
  );
};
