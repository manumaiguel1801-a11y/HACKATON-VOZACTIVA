import React, { useState, useMemo } from 'react';
import {
  Plus, ShoppingBag, BarChart2, TrendingDown, ChevronRight, Send, MessageCircle,
  ArrowUpRight, TrendingUp, Package, Sparkles, AlertTriangle, Users,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { cn } from '../lib/utils';
import { Sale, Expense, Debt, InventoryProduct, Tab, getSaleLabel, getSaleQtyLabel } from '../types';
import { calculateScore, getScoreLabel, getScoreColor } from '../services/scoringService';
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
const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const montoValido = (v: unknown): v is number =>
  typeof v === 'number' && !isNaN(v) && isFinite(v);

function getSaleDate(sale: Sale): Date {
  return sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date();
}

function getExpenseDate(e: Expense): Date {
  return e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
}

function getProductEmoji(nombre: string): string {
  const n = nombre.toLowerCase();
  if (/arroz|pan|harina|azúcar|sal|aceite|leche|huevo/.test(n)) return '🍚';
  if (/pollo|carne|res|cerdo|pescado|chorizo/.test(n)) return '🥩';
  if (/fruta|manzana|banano|naranja|papaya|piña/.test(n)) return '🍎';
  if (/verdura|papa|cebolla|tomate|zanahoria|ajo/.test(n)) return '🥦';
  if (/gaseosa|jugo|agua|refresco|bebida/.test(n)) return '🥤';
  if (/cerveza|aguardiente|ron|licor|vino/.test(n)) return '🍺';
  if (/jabón|shampoo|desodorante|crema|loción/.test(n)) return '🧴';
  if (/pila|cable|cargador|foco|bombillo/.test(n)) return '🔋';
  if (/papel|cuaderno|lápiz|esfero|bolígrafo/.test(n)) return '📝';
  if (/ropa|camisa|pantalón|vestido|zapato/.test(n)) return '👕';
  return '📦';
}

function PctBadge({ pct, inverse = false }: { pct: number; inverse?: boolean }) {
  if (!isFinite(pct) || pct === 0) return null;
  const positive = inverse ? pct < 0 : pct > 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full',
      positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
    )}>
      {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
    </span>
  );
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
  inventory?: InventoryProduct[];
  debts?: Debt[];
  onNavigate?: (tab: Tab) => void;
}

export const Dashboard = ({ isDarkMode, userId, sales, expenses, inventory = [], debts = [], onNavigate }: Props) => {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('1d');
  const [showSaleModal, setShowSaleModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showAllMovements, setShowAllMovements] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  // ── Existing mobile metrics ─────────────────────────────────────────────────
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

  const filteredMovements = useMemo(() => {
    const items = [
      ...sales.map(s => ({ kind: 'sale' as const, data: s, date: getSaleDate(s) })),
      ...expenses.map(e => ({ kind: 'expense' as const, data: e, date: getExpenseDate(e) })),
    ].filter(m => filterByTime(m.date, timeFilter));
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sales, expenses, timeFilter]);

  const weeklyData = useMemo(() => {
    const result = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return { name: DAY_NAMES[d.getDay()], value: 0, ts: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() };
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

  // ── Desktop: month metrics ──────────────────────────────────────────────────
  const monthData = useMemo(() => {
    const now = new Date();
    const curMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    let curInc = 0, curExp = 0, curTx = 0;
    let prevInc = 0, prevExp = 0, prevTx = 0;

    sales.forEach((s) => {
      if (!montoValido(s.total)) return;
      const d = getSaleDate(s);
      if (d >= curMonthStart) { curInc += s.total; curTx++; }
      else if (d >= prevMonthStart) { prevInc += s.total; prevTx++; }
    });
    expenses.forEach((e) => {
      if (!montoValido(e.amount)) return;
      const d = getExpenseDate(e);
      if (d >= curMonthStart) { curExp += e.amount; curTx++; }
      else if (d >= prevMonthStart) { prevExp += e.amount; prevTx++; }
    });

    const pct = (cur: number, prev: number) => prev === 0 ? 0 : Math.round(((cur - prev) / prev) * 100);
    return {
      ingresos: curInc, gastos: curExp, utilidad: curInc - curExp, transacciones: curTx,
      pctIngresos: pct(curInc, prevInc),
      pctGastos: pct(curExp, prevExp),
      pctUtilidad: pct(curInc - curExp, prevInc - prevExp),
      pctTransacciones: pct(curTx, prevTx),
    };
  }, [sales, expenses]);

  // ── Desktop: 7-day flujo de caja (income + expense per day) ────────────────
  const flujoCajaData = useMemo(() => {
    const result = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return {
        name: DAY_SHORT[d.getDay()],
        income: 0,
        exp: 0,
        ts: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
      };
    });
    sales.forEach((s) => {
      if (!montoValido(s.total)) return;
      const d = getSaleDate(s);
      const dayTs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const entry = result.find(r => r.ts === dayTs);
      if (entry) entry.income += s.total;
    });
    expenses.forEach((e) => {
      if (!montoValido(e.amount)) return;
      const d = getExpenseDate(e);
      const dayTs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const entry = result.find(r => r.ts === dayTs);
      if (entry) entry.exp += e.amount;
    });
    return result;
  }, [sales, expenses]);

  // ── Desktop: today summary ──────────────────────────────────────────────────
  const todayData = useMemo(() => {
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    const todayDebts = debts.filter(d => {
      const dc = d.createdAt?.toDate ? d.createdAt.toDate() : new Date();
      return dc >= midnight && d.type === 'me-deben' && d.status !== 'pagada';
    });
    return { ventas: todayIncome, gastos: todayExpenses, fiados: todayDebts.length };
  }, [todayIncome, todayExpenses, debts]);

  // ── Desktop: stock bajo ─────────────────────────────────────────────────────
  const stockBajoList = useMemo(() =>
    [...inventory]
      .filter(p => (p.cantidad ?? 0) <= 5)
      .sort((a, b) => (a.cantidad ?? 0) - (b.cantidad ?? 0))
      .slice(0, 5),
  [inventory]);

  // ── Desktop: score ──────────────────────────────────────────────────────────
  const scoreData = useMemo(() => {
    const bd = calculateScore(sales, expenses, debts);
    return {
      scoreFinal: bd.scoreFinal,
      hasEnoughData: bd.hasEnoughData,
      scoreColor: getScoreColor(bd.scoreFinal),
      scoreLabel: getScoreLabel(bd.scoreFinal),
    };
  }, [sales, expenses, debts]);

  // ── Desktop: last 5 movements (no time filter) ──────────────────────────────
  const allRecentMovements = useMemo(() => {
    return [
      ...sales.map(s => ({ kind: 'sale' as const, data: s, date: getSaleDate(s) })),
      ...expenses.map(e => ({ kind: 'expense' as const, data: e, date: getExpenseDate(e) })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
  }, [sales, expenses]);

  // ── Desktop: smart insight ──────────────────────────────────────────────────
  const tipText = useMemo(() => {
    if (stockBajoList.length > 0) {
      return `Tienes ${stockBajoList.length} producto${stockBajoList.length > 1 ? 's' : ''} con stock bajo. Reabastecer a tiempo evita perder ventas.`;
    }
    const pendingDebts = debts.filter(d => d.type === 'me-deben' && d.status !== 'pagada');
    if (pendingDebts.length > 0) {
      const total = pendingDebts.reduce((s, d) => s + (d.amount - (d.amountPaid ?? 0)), 0);
      return `Tienes $${total.toLocaleString('es-CO')} en cobros pendientes. Recuerda hacer seguimiento para mejorar tu flujo de caja.`;
    }
    if (monthData.gastos > monthData.ingresos * 0.8 && monthData.ingresos > 0) {
      return 'Tus gastos son más del 80% de tus ingresos este mes. Revisa dónde puedes reducir costos.';
    }
    return 'Vas bien. Mantén el registro diario de ventas y gastos para mejorar tu pasaporte financiero.';
  }, [stockBajoList, debts, monthData]);

  // ── Desktop SVG Gauge ───────────────────────────────────────────────────────
  const GAUGE_R = 75; const GAUGE_CX = 100; const GAUGE_CY = 110;
  const gaugeP = scoreData.hasEnoughData ? Math.min((scoreData.scoreFinal - 150) / 800, 0.999) : 0;
  const gaugeAngleRad = (180 + gaugeP * 180) * (Math.PI / 180);
  const gaugeEndX = GAUGE_CX + GAUGE_R * Math.cos(gaugeAngleRad);
  const gaugeEndY = GAUGE_CY + GAUGE_R * Math.sin(gaugeAngleRad);

  // ── Desktop render ──────────────────────────────────────────────────────────
  function renderDesktop() {
    const card = cn(
      'rounded-xl p-5 transition-colors duration-300',
      isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white'
    );
    const muted = isDarkMode ? 'text-white/50' : 'text-black/50';
    const border = isDarkMode ? 'border-white/5' : 'border-black/5';

    return (
      <div className="space-y-5">

        {/* ── Fila 1: 4 metric cards ── */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Ingresos del mes', value: monthData.ingresos, pct: monthData.pctIngresos, color: 'text-green-500', icon: <TrendingUp className="w-4 h-4" /> },
            { label: 'Gastos del mes',   value: monthData.gastos,   pct: monthData.pctGastos,   color: 'text-red-500',   icon: <TrendingDown className="w-4 h-4" />, inv: true },
            { label: 'Utilidad neta',    value: monthData.utilidad,  pct: monthData.pctUtilidad,  color: monthData.utilidad >= 0 ? 'text-[#B8860B]' : 'text-red-500', icon: <ArrowUpRight className="w-4 h-4" /> },
            { label: 'Transacciones',    value: monthData.transacciones, pct: monthData.pctTransacciones, color: 'text-blue-500', icon: <BarChart2 className="w-4 h-4" />, isCurrency: false },
          ].map((m) => (
            <div key={m.label} className={card}>
              <div className={cn('flex items-center justify-between mb-3', muted)}>
                <span className="text-xs font-medium">{m.label}</span>
                <span className={m.color}>{m.icon}</span>
              </div>
              <p className="text-2xl font-extrabold tracking-tight">
                {m.isCurrency === false
                  ? m.value
                  : `$${(m.value || 0).toLocaleString('es-CO')}`}
              </p>
              <div className="mt-1.5">
                <PctBadge pct={m.pct} inverse={m.inv} />
              </div>
            </div>
          ))}
        </div>

        {/* ── Fila 2: Flujo de caja + Resumen del día ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,13fr) minmax(0,7fr)' } as React.CSSProperties}>

          {/* Flujo de caja */}
          <div className={card}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base">Flujo de caja</h3>
                <p className={cn('text-xs', muted)}>Últimos 7 días</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#B8860B] inline-block" />Ingresos</span>
                <span className={cn('flex items-center gap-1.5', muted)}><span className={cn('w-2.5 h-2.5 rounded-full inline-block', isDarkMode ? 'bg-white/20' : 'bg-black/15')} />Gastos</span>
              </div>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flujoCajaData} barCategoryGap="25%" barGap={3}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: isDarkMode ? '#ffffff80' : '#00000060' }} />
                  <YAxis hide />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      background: isDarkMode ? '#1A1A1A' : '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`$${v.toLocaleString('es-CO')}`, '']}
                  />
                  <Bar dataKey="income" name="Ingresos" fill="#B8860B" radius={[6, 6, 0, 0]} isAnimationActive={false} activeBar={false} />
                  <Bar dataKey="exp" name="Gastos" fill={isDarkMode ? '#ffffff25' : '#00000015'} radius={[6, 6, 0, 0]} isAnimationActive={false} activeBar={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Resumen del día */}
          <div className={card}>
            <h3 className="font-bold text-base mb-4">Resumen del día</h3>
            <div className={cn('space-y-3 divide-y', border)}>
              {[
                { label: 'Ventas de hoy',   value: `$${todayData.ventas.toLocaleString('es-CO')}`,  color: 'text-green-500' },
                { label: 'Gastos de hoy',   value: `$${todayData.gastos.toLocaleString('es-CO')}`,  color: 'text-red-500' },
                { label: 'Fiados nuevos',   value: `${todayData.fiados} cliente${todayData.fiados !== 1 ? 's' : ''}`, color: isDarkMode ? 'text-white' : 'text-black' },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between pt-3 first:pt-0">
                  <span className={cn('text-sm', muted)}>{row.label}</span>
                  <span className={cn('font-bold text-sm', row.color)}>{row.value}</span>
                </div>
              ))}
            </div>
            <div className={cn('mt-4 pt-3 border-t', border)}>
              <p className={cn('text-xs font-medium mb-1', muted)}>Utilidad de hoy</p>
              <p className={cn('text-2xl font-extrabold', todayData.ventas - todayData.gastos >= 0 ? 'text-[#B8860B]' : 'text-red-500')}>
                ${(todayData.ventas - todayData.gastos).toLocaleString('es-CO')}
              </p>
            </div>
          </div>
        </div>

        {/* ── Fila 3: Movimientos recientes + Stock bajo + Tu progreso ── */}
        <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,8fr) minmax(0,7fr) minmax(0,5fr)' } as React.CSSProperties}>

          {/* Movimientos recientes */}
          <div className={card}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base">Movimientos recientes</h3>
              <button onClick={() => setShowAllMovements(true)} className="text-[#B8860B] text-xs font-bold hover:underline">Ver todo</button>
            </div>
            {allRecentMovements.length === 0 ? (
              <div className={cn('flex flex-col items-center justify-center py-10 gap-2 text-center', muted)}>
                <BarChart2 className="w-8 h-8 opacity-30" />
                <p className="text-sm">Sin movimientos aún</p>
              </div>
            ) : (
              <div className="space-y-2">
                {allRecentMovements.map((m) => {
                  if (m.kind === 'sale') {
                    const s = m.data;
                    return (
                      <button key={`s-${s.id}`} onClick={() => setSelectedSale(s)}
                        className={cn('w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left hover:opacity-80',
                          isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/3')}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#ffc96f]/30 flex items-center justify-center flex-shrink-0">
                            <ShoppingBag className="w-4 h-4 text-[#B8860B]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{getSaleLabel(s)}</p>
                            <p className={cn('text-xs', muted)}>{formatRelativeTime(m.date)}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-[#B8860B] flex-shrink-0 ml-2">
                          +${(s.total || 0).toLocaleString('es-CO')}
                        </span>
                      </button>
                    );
                  } else {
                    const e = m.data;
                    return (
                      <button key={`e-${e.id}`} onClick={() => setSelectedExpense(e)}
                        className={cn('w-full flex items-center justify-between p-3 rounded-lg transition-colors text-left hover:opacity-80',
                          isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/3')}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', isDarkMode ? 'bg-red-500/20' : 'bg-red-50')}>
                            <TrendingDown className="w-4 h-4 text-red-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{e.concept}</p>
                            <p className={cn('text-xs', muted)}>{formatRelativeTime(m.date)}</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-red-500 flex-shrink-0 ml-2">
                          -${(e.amount || 0).toLocaleString('es-CO')}
                        </span>
                      </button>
                    );
                  }
                })}
              </div>
            )}
          </div>

          {/* Stock bajo */}
          <div className={card}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base">Stock bajo</h3>
              {onNavigate && (
                <button onClick={() => onNavigate('inventario')} className="text-[#B8860B] text-xs font-bold hover:underline">Ver inventario</button>
              )}
            </div>
            {stockBajoList.length === 0 ? (
              <div className={cn('flex flex-col items-center justify-center py-10 gap-2 text-center', muted)}>
                <Package className="w-8 h-8 opacity-30" />
                <p className="text-sm">Todo el stock en buen nivel</p>
              </div>
            ) : (
              <div className="space-y-2">
                {stockBajoList.map((p) => (
                  <div key={p.id} className={cn('flex items-center justify-between p-3 rounded-lg', isDarkMode ? 'bg-white/3' : 'bg-black/3')}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg flex-shrink-0">{getProductEmoji(p.nombre)}</span>
                      <p className="text-sm font-medium truncate">{p.nombre}</p>
                    </div>
                    <span className={cn(
                      'flex-shrink-0 ml-2 text-xs font-bold px-2 py-0.5 rounded-full',
                      p.cantidad === 0
                        ? 'bg-red-100 text-red-600'
                        : 'bg-amber-100 text-amber-700'
                    )}>
                      {p.cantidad} uds
                    </span>
                  </div>
                ))}
              </div>
            )}
            {inventory.length > 0 && (
              <p className={cn('text-xs mt-3', muted)}>
                {stockBajoList.length}/{inventory.length} productos con alerta
              </p>
            )}
          </div>

          {/* Tu progreso */}
          <div className={card}>
            <h3 className="font-bold text-base mb-2">Tu progreso</h3>
            <div className="flex flex-col items-center">
              <svg viewBox="0 0 200 120" className="w-full max-w-[180px]">
                {/* Background arc */}
                <path
                  d={`M 25 110 A 75 75 0 0 1 175 110`}
                  fill="none"
                  stroke={isDarkMode ? '#ffffff15' : '#00000010'}
                  strokeWidth="12"
                  strokeLinecap="round"
                />
                {/* Score arc */}
                {scoreData.hasEnoughData && gaugeP > 0 && (
                  <path
                    d={`M 25 110 A 75 75 0 0 1 ${gaugeEndX.toFixed(2)} ${gaugeEndY.toFixed(2)}`}
                    fill="none"
                    stroke={scoreData.scoreColor}
                    strokeWidth="12"
                    strokeLinecap="round"
                  />
                )}
                {/* Score text */}
                <text x="100" y="100" textAnchor="middle" fontSize="28" fontWeight="800" fill={scoreData.hasEnoughData ? scoreData.scoreColor : (isDarkMode ? '#ffffff40' : '#00000030')}>
                  {scoreData.hasEnoughData ? scoreData.scoreFinal : '—'}
                </text>
                <text x="100" y="116" textAnchor="middle" fontSize="10" fill={isDarkMode ? '#ffffff50' : '#00000050'}>
                  {scoreData.hasEnoughData ? scoreData.scoreLabel : 'Sin datos'}
                </text>
              </svg>
              {!scoreData.hasEnoughData && (
                <p className={cn('text-xs text-center mt-2', muted)}>Registra al menos 5 movimientos</p>
              )}
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('pasaporte')}
                className={cn(
                  'w-full mt-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors',
                  isDarkMode ? 'bg-white/5 text-white/70 hover:bg-white/10' : 'bg-black/5 text-black/60 hover:bg-black/10'
                )}
              >
                Ver pasaporte <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Fila 4: Perspectiva inteligente ── */}
        <div className={cn(
          'rounded-xl p-5 flex items-start gap-4',
          isDarkMode ? 'bg-[#1A1A1A] border border-[#B8860B]/20' : 'bg-[#FFF8DC] border border-[#B8860B]/15'
        )}>
          <div className="w-9 h-9 rounded-full bg-[#B8860B]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4 text-[#B8860B]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#B8860B] mb-1">Perspectiva inteligente</p>
            <p className={cn('text-sm leading-relaxed', isDarkMode ? 'text-white/70' : 'text-black/70')}>{tipText}</p>
          </div>
        </div>

      </div>
    );
  }

  // ── Mobile CTAs ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Mobile layout ── */}
      <div className="md:hidden">
        <div className="md:grid md:gap-8" style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)' } as React.CSSProperties}>
          <div className="space-y-8">
            {/* Hero Card */}
            <section className={cn(
              'rounded-xl p-8 shadow-[0_8px_32px_rgba(184,134,11,0.15)] relative overflow-hidden transition-all duration-500',
              isDarkMode ? 'bg-gradient-to-br from-[#B8860B] to-[#DAA520] text-black' : 'bg-gradient-to-br from-[#B8860B] to-[#FFD700] text-black'
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
                className="flex-1 h-16 bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] hover:opacity-90 transition-all"
              >
                <Plus className="w-5 h-5" />
                Registrar Venta
              </button>
              <button
                onClick={() => setShowExpenseModal(true)}
                className={cn(
                  'flex-1 h-16 rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] hover:opacity-90 transition-all border-2',
                  isDarkMode ? 'bg-[#1A1A1A] border-red-500/30 text-red-400' : 'bg-white border-red-200 text-red-500 shadow-sm'
                )}
              >
                <TrendingDown className="w-5 h-5" />
                Registrar Gasto
              </button>
            </div>

            {/* Weekly Chart */}
            <section className={cn('rounded-lg p-6 transition-colors duration-500', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f1f1ee]')}>
              <div className="flex justify-between items-end mb-6">
                <div>
                  <h3 className="text-lg font-bold">Ganancias de la semana</h3>
                  <p className={cn('text-sm', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>Rendimiento semanal</p>
                </div>
                <span className="text-[#B8860B] font-bold text-lg">${(weekTotal || 0).toLocaleString('es-CO')}</span>
              </div>
              <div className="w-full h-40 [&_svg]:outline-none [&_svg]:border-none [&>div]:outline-none [&>div]:border-none" style={{ outline: 'none', border: 'none' }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} style={{ outline: 'none', border: 'none' }}>
                  <BarChart data={weeklyData} style={{ outline: 'none', border: 'none' }} barCategoryGap="20%">
                    <Bar dataKey="value" radius={[10, 10, 0, 0]} activeBar={false} isAnimationActive={false}>
                      {weeklyData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.value > 0 && entry.value === maxBar ? '#FFD700'
                              : entry.value > maxBar * 0.6 ? '#DAA520'
                              : isDarkMode ? '#333' : '#ddddd9'
                          }
                        />
                      ))}
                    </Bar>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 500, fill: isDarkMode ? '#FDFBF0' : '#2e2f2d', opacity: 0.6 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* Right column: movements */}
          <div className="space-y-4 mt-8 md:mt-0 md:sticky md:top-24 md:max-h-[calc(100vh-130px)] md:overflow-y-auto md:pr-1">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold">Movimientos recientes</h3>
              <button onClick={() => setShowAllMovements(true)} className="text-[#B8860B] font-bold text-sm hover:underline">Ver todo</button>
            </div>
            <div className="flex gap-2">
              {TIME_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTimeFilter(f.value)}
                  className={cn(
                    'flex-1 py-2 rounded-xl text-xs font-bold transition-all duration-200',
                    timeFilter === f.value
                      ? 'bg-[#B8860B] text-black shadow-sm'
                      : isDarkMode ? 'bg-[#1A1A1A] text-[#FDFBF0]/60' : 'bg-[#f1f1ee] text-[#5b5c5a]'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {filteredMovements.length === 0 ? (
              <div className={cn('p-10 rounded-xl flex flex-col items-center justify-center gap-3 text-center', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
                <div className={cn('w-14 h-14 rounded-full flex items-center justify-center', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#f1f1ee]')}>
                  <BarChart2 className={cn('w-7 h-7', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/40')} />
                </div>
                <p className={cn('font-bold', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>Sin movimientos en este período</p>
                <p className={cn('text-xs', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/60')}>Registra tu primera venta para verla aquí</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredMovements.map((m) => {
                  if (m.kind === 'sale') {
                    const s = m.data;
                    return (
                      <button key={`s-${s.id}`} onClick={() => setSelectedSale(s)}
                        className={cn('w-full p-5 rounded-lg flex items-center justify-between shadow-sm active:scale-[0.98] hover:scale-[1.01] transition-all duration-200 text-left', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
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
                      <button key={`e-${e.id}`} onClick={() => setSelectedExpense(e)}
                        className={cn('w-full p-5 rounded-lg flex items-center justify-between shadow-sm active:scale-[0.98] hover:scale-[1.01] transition-all duration-200 text-left', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
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
          </div>
        </div>
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden md:block">
        {renderDesktop()}
      </div>

      {showSaleModal && <RegisterSaleModal userId={userId} isDarkMode={isDarkMode} onClose={() => setShowSaleModal(false)} />}
      {showExpenseModal && <RegisterExpenseModal userId={userId} isDarkMode={isDarkMode} onClose={() => setShowExpenseModal(false)} />}
      {showAllMovements && <AllMovementsModal isDarkMode={isDarkMode} sales={sales} expenses={expenses} onClose={() => setShowAllMovements(false)} />}
      {selectedSale && <MovementDetailModal item={{ kind: 'sale', data: selectedSale }} isDarkMode={isDarkMode} onClose={() => setSelectedSale(null)} />}
      {selectedExpense && <MovementDetailModal item={{ kind: 'expense', data: selectedExpense }} isDarkMode={isDarkMode} onClose={() => setSelectedExpense(null)} />}
    </>
  );
};
