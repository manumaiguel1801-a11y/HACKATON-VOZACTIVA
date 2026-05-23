import React, { useMemo, useEffect, useState, useRef } from 'react';
import {
  Download,
  Lock,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Users,
  Package,
  FileCheck,
  Star,
  Zap,
  ShieldCheck,
  Clock,
  BarChart2,
  CalendarDays,
  ArrowUpCircle,
  Minus,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { collection, addDoc, getDocs, query, orderBy, limit, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import { Sale, Expense, Debt, UserProfile, ScoreHistoryEntry } from '../types';
import {
  calculateScore, getScoreLabel, getScoreColor,
  getBusinessAgeDays, formatBusinessAge,
  getTopProducts, getMonthlyProjection, getNextLevel,
  calculateScoreTrend,
} from '../services/scoringService';
import { generatePassportPDF } from '../services/pdfService';

const CATEGORY_ORDER = ['Riesgo alto', 'En construcción', 'Aceptable', 'Bueno', 'Excelente'];

function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

interface Props {
  isDarkMode: boolean;
  sales: Sale[];
  expenses: Expense[];
  debts: Debt[];
  profile: UserProfile | null;
  userId: string;
}

interface FactorCard {
  label: string;
  description: string;
  icon: React.ReactNode;
  value: number;
  max: number;
  tip: string;
}

function qualitativeLabel(pct: number): { text: string; color: string } {
  if (pct >= 0.8) return { text: 'Excelente', color: '#22c55e' };
  if (pct >= 0.6) return { text: 'Bien',      color: '#DAA520' };
  if (pct >= 0.35) return { text: 'Mejorable', color: '#f97316' };
  return { text: 'Bajo', color: '#ef4444' };
}

function desktopLevel(pct: number): { text: string; bg: string; color: string; bar: string } {
  if (pct >= 0.8) return { text: 'Excelente', bg: '#22c55e18', color: '#22c55e', bar: '#22c55e' };
  if (pct >= 0.6) return { text: 'Bueno',     bg: '#84cc1618', color: '#65a30d', bar: '#84cc16' };
  if (pct >= 0.35) return { text: 'Aceptable', bg: '#DAA52018', color: '#B8860B', bar: '#DAA520' };
  return { text: 'Bajo', bg: '#ef444418', color: '#ef4444', bar: '#ef4444' };
}

function tsToDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

interface Logro {
  icon: React.ReactNode;
  label: string;
  hint: string;
  unlocked: boolean;
}

export const PassportView = ({ isDarkMode, sales, expenses, debts, profile, userId }: Props) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const historyLoaded = useRef(false);
  const lastAlertedCategory = useRef<string | null>(null);

  const breakdown = useMemo(
    () => calculateScore(sales, expenses, debts),
    [sales, expenses, debts],
  );

  const { scoreFinal, hasEnoughData } = breakdown;
  const scoreColor = getScoreColor(scoreFinal);
  const scoreLabel = getScoreLabel(scoreFinal);

  const ageDays = useMemo(() => getBusinessAgeDays(sales, expenses, debts), [sales, expenses, debts]);
  const scoreTrend = useMemo(() => calculateScoreTrend(sales, expenses, debts), [sales, expenses, debts]);
  const topProducts = useMemo(() => getTopProducts(sales), [sales]);
  const monthlyProjection = useMemo(() => getMonthlyProjection(sales), [sales]);
  const nextLevel = useMemo(() => getNextLevel(scoreFinal), [scoreFinal]);

  // Month metrics for desktop
  const monthMetrics = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthSales = sales.filter(s => { const d = tsToDate(s.createdAt); return d && d >= monthStart; });
    const monthExp = expenses.filter(e => { const d = tsToDate(e.createdAt); return d && d >= monthStart; });
    const ingresos = monthSales.reduce((sum, s) => sum + s.total, 0);
    const gastos = monthExp.reduce((sum, e) => sum + e.amount, 0);
    return { ingresos, gastos, utilidad: ingresos - gastos, transactions: monthSales.length + monthExp.length };
  }, [sales, expenses]);

  // Cumplimiento for desktop
  const cumplimiento = useMemo(() => {
    const deboDebts = debts.filter(d => d.type === 'debo');
    return deboDebts.length > 0
      ? Math.round((deboDebts.filter(d => d.status === 'pagada').length / deboDebts.length) * 100)
      : 100;
  }, [debts]);

  // Suggestions for desktop
  const desktopSuggestions = useMemo(() => {
    const list: { icon: React.ReactNode; title: string; desc: string }[] = [];

    const consistPct = breakdown.consistenciaIngresos / 30;
    if (consistPct < 0.35) {
      list.push({ icon: <TrendingUp className="w-4 h-4" />, title: 'Registra tus ventas todos los días', desc: 'La consistencia te ayuda a mejorar tu score.' });
    }

    const debtsPendientes = debts.filter(d => d.type === 'debo' && d.status === 'pendiente');
    if (debtsPendientes.length > 0) {
      list.push({ icon: <AlertTriangle className="w-4 h-4" />, title: 'Reduce tus deudas vencidas', desc: `Tienes ${debtsPendientes.length} ${debtsPendientes.length === 1 ? 'deuda pendiente' : 'deudas pendientes'} que están afectando tu score.` });
    }

    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const oldFiados = debts.filter(d => {
      if (d.type !== 'me-deben' || d.status === 'pagada') return false;
      const dt = tsToDate(d.createdAt);
      return dt && dt.getTime() < thirtyDaysAgo;
    });
    if (oldFiados.length > 0) {
      const totalPending = oldFiados.reduce((sum, d) => sum + Math.max(0, d.amount - (d.amountPaid ?? 0)), 0);
      list.push({ icon: <Users className="w-4 h-4" />, title: 'Recupera tus fiados pendientes', desc: `Tienes $${totalPending.toLocaleString('es-CO')} en fiados pendientes de más de 30 días.` });
    }

    const totalIngresos = sales.reduce((s, v) => s + v.total, 0);
    const totalGastos = expenses.reduce((s, e) => s + e.amount, 0);
    const gastoPct = totalIngresos > 0 ? totalGastos / totalIngresos : 0;
    if (gastoPct > 0.8 && totalIngresos > 0) {
      list.push({ icon: <BarChart2 className="w-4 h-4" />, title: 'Controla tus gastos', desc: `Tus gastos representan el ${Math.round(gastoPct * 100)}% de tus ingresos.` });
    }

    if (list.length === 0) {
      list.push({ icon: <CheckCircle2 className="w-4 h-4" />, title: '¡Vas muy bien!', desc: 'Tu negocio está en buen estado. Sigue registrando tus movimientos.' });
    }

    return list.slice(0, 3);
  }, [breakdown, debts, sales, expenses]);

  // Historial del score + alerta de categoría
  useEffect(() => {
    if (!userId || !hasEnoughData || historyLoaded.current) return;
    historyLoaded.current = true;

    const run = async () => {
      try {
        const histRef = collection(db, 'users', userId, 'scoreHistory');
        const snap = await getDocs(query(histRef, orderBy('recordedAt', 'asc'), limit(12)));
        const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScoreHistoryEntry));
        setScoreHistory(entries);

        const thisWeek = getWeekKey(new Date());
        if (!entries.some((e) => e.weekKey === thisWeek)) {
          await addDoc(histRef, { score: scoreFinal, weekKey: thisWeek, recordedAt: serverTimestamp() });
        }

        const prevCategory = profile?.lastScoreCategory;
        const prevIdx = CATEGORY_ORDER.indexOf(prevCategory ?? '');
        const currIdx = CATEGORY_ORDER.indexOf(scoreLabel);
        if (currIdx > prevIdx && prevIdx !== -1 && lastAlertedCategory.current !== scoreLabel) {
          lastAlertedCategory.current = scoreLabel;
          setToast(`¡Subiste a ${scoreLabel}! 🎉`);
          setTimeout(() => setToast(null), 4000);
        }

        if (prevCategory !== scoreLabel) {
          await updateDoc(doc(db, 'users', userId), { lastScoreCategory: scoreLabel });
        }
      } catch (e) {
        console.error('Score history error:', e);
      }
    };
    run();
  }, [userId, hasEnoughData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async () => {
    if (!hasEnoughData) return;
    setIsGenerating(true);
    try {
      const { blob, filename } = await generatePassportPDF(profile, sales, expenses, debts, userId, window.location.origin);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    if (!hasEnoughData) return;
    setIsSharing(true);
    try {
      const { blob, filename } = await generatePassportPDF(profile, sales, expenses, debts, userId, window.location.origin);
      const file = new File([blob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Mi Pasaporte Financiero Voz-Activa' });
      } else if (navigator.share) {
        await navigator.share({
          title: 'Mi Pasaporte Financiero Voz-Activa',
          text: `Mi score es ${scoreFinal}/950 — ${scoreLabel}. Generado con Voz-Activa.`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (_) { /* share cancelado */ }
    finally {
      setIsSharing(false);
    }
  };

  // Mobile donut chart data
  const scoreRange = 950 - 150;
  const scoreValue = scoreFinal - 150;
  const chartData = [
    { name: 'Score', value: scoreValue },
    { name: 'Resto', value: scoreRange - scoreValue },
  ];

  const factors: FactorCard[] = useMemo(() => [
    {
      label: 'Consistencia de ingresos',
      description: 'Regularidad con la que registras ventas',
      icon: <TrendingUp className="w-5 h-5" />,
      value: breakdown.consistenciaIngresos,
      max: 30,
      tip: 'Registra tus ventas con más frecuencia, idealmente cada día que vendas.',
    },
    {
      label: 'Capacidad de pago',
      description: 'Ingresos netos después de cubrir gastos',
      icon: <CreditCard className="w-5 h-5" />,
      value: breakdown.capacidadPago,
      max: 25,
      tip: 'Tus gastos son altos vs tus ingresos. Intenta reducir costos o aumentar ventas.',
    },
    {
      label: 'Gestión de fiados',
      description: 'Recuperación de fiados y cumplimiento de deudas',
      icon: <Users className="w-5 h-5" />,
      value: breakdown.gestionFiados,
      max: 20,
      tip: 'Registra cuando te paguen los fiados y cuando pagues tus deudas.',
    },
    {
      label: 'Salud de inventario',
      description: 'Flujo coherente entre compras y ventas',
      icon: <Package className="w-5 h-5" />,
      value: breakdown.saludInventario,
      max: 15,
      tip: 'Registra también tus compras e insumos del negocio.',
    },
    {
      label: 'Calidad de datos',
      description: 'Frecuencia y claridad de tus registros',
      icon: <FileCheck className="w-5 h-5" />,
      value: breakdown.calidadDatos,
      max: 10,
      tip: 'Registra tus movimientos con descripciones claras y de forma regular.',
    },
  ], [breakdown]);

  const logros: Logro[] = useMemo(() => {
    const uniqueSaleDays = new Set(
      sales.map((s) => {
        const d = s.createdAt?.toDate ? s.createdAt.toDate() : null;
        return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : null;
      }).filter(Boolean),
    ).size;

    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const recentActivity = [...sales, ...expenses].some((r) => {
      const d = r.createdAt?.toDate ? r.createdAt.toDate() : null;
      return d && d.getTime() >= sevenDaysAgo;
    });

    const totalIngresos = sales.reduce((s, v) => s + v.total, 0);
    const totalGastos = expenses.reduce((s, e) => s + e.amount, 0);
    const capacidadRatio = totalIngresos > 0 ? (totalIngresos - totalGastos) / totalIngresos : 0;

    const meDeben = debts.filter((d) => d.type === 'me-deben');
    const fiadoTotal = meDeben.reduce((s, d) => s + d.amount, 0);
    const fiadoRecuperado = meDeben.reduce((s, d) => s + (d.amountPaid ?? 0), 0);
    const recuperacion = fiadoTotal > 0 ? fiadoRecuperado / fiadoTotal : 0;

    return [
      { icon: <Star className="w-7 h-7" />, label: 'Vendedor Constante', hint: 'Registra ventas ≥20 días', unlocked: uniqueSaleDays >= 20 },
      { icon: <TrendingUp className="w-7 h-7" />, label: 'Ahorro Inteligente', hint: 'Capacidad de pago > 30%', unlocked: capacidadRatio > 0.3 },
      { icon: <Users className="w-7 h-7" />, label: 'Cobrador Eficiente', hint: 'Recupera > 70% de fiados', unlocked: recuperacion > 0.7 },
      { icon: <Zap className="w-7 h-7" />, label: 'Negocio Activo', hint: 'Actividad en los últimos 7 días', unlocked: recentActivity },
      { icon: <FileCheck className="w-7 h-7" />, label: 'Datos Confiables', hint: 'Calidad de datos ≥ 7/10', unlocked: breakdown.calidadDatos >= 7 },
      { icon: <ShieldCheck className="w-7 h-7" />, label: 'Score Excelente', hint: 'Alcanza 750+ puntos', unlocked: scoreFinal >= 750 },
    ];
  }, [sales, expenses, debts, breakdown, scoreFinal]);

  const historyChartData = scoreHistory.map((h) => ({
    score: h.score,
    semana: h.recordedAt?.toDate
      ? h.recordedAt.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
      : '—',
  }));

  // ─── Desktop desktop factors (spec names) ─────────────────────────────────
  const desktopFactors = useMemo(() => [
    { label: 'Consistencia de ingresos', desc: 'Regularidad con la que registras ventas',         icon: <TrendingUp className="w-4 h-4" />, value: breakdown.consistenciaIngresos, max: 30 },
    { label: 'Capacidad de pago',        desc: 'Ingresos netos después de cubrir gastos',          icon: <CreditCard className="w-4 h-4" />, value: breakdown.capacidadPago,         max: 25 },
    { label: 'Gestión de fiados',        desc: 'Recuperación de fiados y cumplimiento de deudas',  icon: <Users className="w-4 h-4" />,      value: breakdown.gestionFiados,          max: 20 },
    { label: 'Nivel de endeudamiento',   desc: 'Relación entre tus deudas y tus ingresos',         icon: <Clock className="w-4 h-4" />,      value: breakdown.saludInventario,        max: 15 },
    { label: 'Historial financiero',     desc: 'Antigüedad y comportamiento financiero',            icon: <ShieldCheck className="w-4 h-4" />, value: breakdown.calidadDatos,          max: 10 },
  ], [breakdown]);

  // ─── SVG Gauge constants ───────────────────────────────────────────────────
  const GAUGE_R = 80;
  const GAUGE_CX = 100;
  const GAUGE_CY = 115;
  const gaugeP = hasEnoughData ? Math.min((scoreFinal - 150) / (950 - 150), 0.999) : 0;
  const gaugeAngleRad = (180 + gaugeP * 180) * Math.PI / 180;
  const gaugeEndX = GAUGE_CX + GAUGE_R * Math.cos(gaugeAngleRad);
  const gaugeEndY = GAUGE_CY + GAUGE_R * Math.sin(gaugeAngleRad);

  const motivText = !hasEnoughData
    ? 'Registra más movimientos para activar tu score.'
    : scoreFinal < 500 ? 'Comienza registrando ventas y gastos diariamente.'
    : scoreFinal < 650 ? 'Estás construyendo tu historial. ¡Sigue así!'
    : scoreFinal < 750 ? 'Buen progreso. La constancia mejora tu score.'
    : scoreFinal < 850 ? '¡Excelente trabajo! Tu negocio está en buena forma.'
    : '¡Felicitaciones! Score financiero excepcional.';

  const todayStr = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  const next30Str = new Date(Date.now() + 30 * 86400000).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

  // ─── Desktop render ────────────────────────────────────────────────────────
  const renderDesktop = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid gap-5" style={{ gridTemplateColumns: 'minmax(0,13fr) minmax(0,7fr)' }}>

        {/* ── Left column ── */}
        <div className="space-y-5">

          {/* Pasaporte Financiero header */}
          <div className={cn('p-6 rounded-2xl shadow-sm', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={cn('text-xl font-black', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>
                  Pasaporte Financiero
                </h2>
                <p className={cn('text-sm mt-1', isDarkMode ? 'text-white/50' : 'text-gray-500')}>
                  Analizamos tus finanzas y te damos recomendaciones para seguir creciendo.
                </p>
              </div>
              <button
                onClick={handleDownload}
                disabled={isGenerating || !hasEnoughData}
                className={cn(
                  'flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-colors whitespace-nowrap',
                  hasEnoughData
                    ? 'border-[#B8860B] text-[#B8860B] hover:bg-[#B8860B]/8'
                    : isDarkMode ? 'border-white/10 text-white/25 cursor-not-allowed' : 'border-black/10 text-black/25 cursor-not-allowed'
                )}
              >
                <Download className="w-4 h-4" />
                {isGenerating ? 'Generando...' : 'Descargar PDF'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border', isDarkMode ? 'border-white/10 text-white/50' : 'border-black/10 text-gray-500')}>
                📅 Actualizado hoy, {todayStr}
              </span>
              <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border', isDarkMode ? 'border-white/10 text-white/50' : 'border-black/10 text-gray-500')}>
                🛡 Próxima actualización: {next30Str}
              </span>
            </div>
          </div>

          {/* Desglose del score */}
          <div className={cn('rounded-2xl shadow-sm overflow-hidden', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <div className={cn('px-6 py-4 border-b', isDarkMode ? 'border-white/5' : 'border-black/5')}>
              <h3 className={cn('font-bold text-base', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>Desglose del score</h3>
            </div>
            {desktopFactors.map((f, i) => {
              const pct = f.value / f.max;
              const lv = desktopLevel(pct);
              return (
                <div key={i} className={cn('px-6 py-4', i > 0 && (isDarkMode ? 'border-t border-white/5' : 'border-t border-black/5'))}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', isDarkMode ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'bg-[#FFF8DC] text-[#B8860B]')}>
                        {f.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm">{f.label}</p>
                        <p className={cn('text-xs mt-0.5', isDarkMode ? 'text-white/40' : 'text-gray-400')}>{f.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: lv.color, backgroundColor: lv.bg }}>
                        {lv.text}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>
                  <div className={cn('h-1.5 rounded-full overflow-hidden mt-3', isDarkMode ? 'bg-white/10' : 'bg-[#f1f1ee]')}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct * 100, 2)}%`, backgroundColor: lv.bar }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resumen financiero */}
          <div className={cn('p-6 rounded-2xl shadow-sm', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <h3 className={cn('font-bold text-base mb-5', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>Resumen financiero</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-gray-400">Ingresos (mes)</p>
                </div>
                <p className="text-lg font-black text-green-500">${monthMetrics.ingresos.toLocaleString('es-CO')}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <p className="text-xs text-gray-400">Gastos (mes)</p>
                </div>
                <p className="text-lg font-black text-red-400">${monthMetrics.gastos.toLocaleString('es-CO')}</p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <BarChart2 className="w-4 h-4 text-gray-400" />
                  <p className="text-xs text-gray-400">Utilidad (mes)</p>
                </div>
                <p className={cn('text-lg font-black', monthMetrics.utilidad >= 0 ? (isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]') : 'text-red-400')}>
                  ${monthMetrics.utilidad.toLocaleString('es-CO')}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CheckCircle2 className="w-4 h-4 text-gray-400" />
                  <p className="text-xs text-gray-400">Transacciones</p>
                </div>
                <p className={cn('text-lg font-black', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>{monthMetrics.transactions}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-5">

          {/* Tu score actual */}
          <div className={cn('p-6 rounded-2xl shadow-sm', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <h3 className={cn('font-bold text-base mb-4', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>Tu score actual</h3>

            {/* SVG Gauge — semicircle from left (9 o'clock) to right (3 o'clock) through top (12 o'clock) */}
            <div className="flex justify-center">
              <svg viewBox="0 0 200 120" className="w-56 h-[136px]">
                {/* Background arc */}
                <path
                  d={`M ${GAUGE_CX - GAUGE_R} ${GAUGE_CY} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${GAUGE_CX + GAUGE_R} ${GAUGE_CY}`}
                  fill="none"
                  stroke={isDarkMode ? '#2A2A2A' : '#e8e8e4'}
                  strokeWidth="14"
                  strokeLinecap="round"
                />
                {/* Score arc (only when there's data and p > 0) */}
                {hasEnoughData && gaugeP > 0 && (
                  <path
                    d={`M ${GAUGE_CX - GAUGE_R} ${GAUGE_CY} A ${GAUGE_R} ${GAUGE_R} 0 0 1 ${gaugeEndX.toFixed(2)} ${gaugeEndY.toFixed(2)}`}
                    fill="none"
                    stroke={scoreColor}
                    strokeWidth="14"
                    strokeLinecap="round"
                  />
                )}
                {/* Score number */}
                <text
                  x="100" y="90"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="'Plus Jakarta Sans', sans-serif"
                  fontWeight="800"
                  fontSize="28"
                  fill={hasEnoughData ? scoreColor : (isDarkMode ? '#444' : '#ccc')}
                >
                  {hasEnoughData ? scoreFinal : '—'}
                </text>
                {/* / 950 */}
                <text
                  x="100" y="108"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="sans-serif"
                  fontWeight="600"
                  fontSize="11"
                  fill={isDarkMode ? 'rgba(253,251,240,0.35)' : '#9ca3af'}
                >
                  / 950
                </text>
              </svg>
            </div>

            {/* Level badge */}
            <div className="flex justify-center mt-1">
              <span
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-bold"
                style={{ color: hasEnoughData ? scoreColor : (isDarkMode ? '#888' : '#aaa'), backgroundColor: hasEnoughData ? scoreColor + '18' : 'transparent', border: hasEnoughData ? 'none' : '1px solid #ccc' }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hasEnoughData ? scoreColor : '#ccc' }} />
                {hasEnoughData ? scoreLabel : 'Sin datos suficientes'}
              </span>
            </div>

            {/* Motivational text */}
            <p className={cn('text-xs text-center mt-2 px-2 leading-relaxed', isDarkMode ? 'text-white/40' : 'text-gray-400')}>
              {motivText}
            </p>

            {/* 3 metrics */}
            <div className={cn('grid grid-cols-3 mt-4 pt-4 border-t', isDarkMode ? 'border-white/5' : 'border-black/5')}>
              <div className="text-center px-1">
                <p className={cn('text-sm font-black truncate', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>{formatBusinessAge(ageDays)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Antigüedad</p>
              </div>
              <div className={cn('text-center px-1 border-l border-r', isDarkMode ? 'border-white/5' : 'border-black/5')}>
                <p className={cn('text-sm font-black truncate', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>
                  {monthlyProjection > 0 ? `$${Math.round(monthlyProjection / 1000)}k` : '—'}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">Promedio/mes</p>
              </div>
              <div className="text-center px-1">
                <p className={cn('text-sm font-black', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>{cumplimiento}%</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Cumplimiento</p>
              </div>
            </div>
          </div>

          {/* Sugerencias personalizadas */}
          <div className={cn('rounded-2xl shadow-sm overflow-hidden', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <div className={cn('px-6 py-4 border-b', isDarkMode ? 'border-white/5' : 'border-black/5')}>
              <h3 className={cn('font-bold text-base', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>Sugerencias personalizadas</h3>
            </div>
            {desktopSuggestions.map((s, i) => (
              <div key={i} className={cn('px-6 py-4 flex items-start gap-3', i > 0 && (isDarkMode ? 'border-t border-white/5' : 'border-t border-black/5'))}>
                <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', isDarkMode ? 'bg-[#B8860B]/20 text-[#FFD700]' : 'bg-[#FFD700]/15 text-[#B8860B]')}>
                  {s.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm">{s.title}</p>
                  <p className={cn('text-xs mt-0.5 leading-relaxed', isDarkMode ? 'text-white/40' : 'text-gray-400')}>{s.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Toast de categoría */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl font-bold text-sm shadow-xl bg-[#1A1A1A] text-[#FFD700] border border-[#B8860B]/40 whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* ── Mobile layout ── */}
      <div className="md:hidden space-y-10 pb-4 max-w-xl mx-auto">

        {/* ── Hero: donut + score ── */}
        <section className="flex flex-col items-center pt-4">
          <div className="relative w-56 h-56 md:w-48 md:h-48">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={72}
                  outerRadius={92}
                  startAngle={200}
                  endAngle={-20}
                  paddingAngle={0}
                  dataKey="value"
                  strokeWidth={0}
                >
                  <Cell fill={hasEnoughData ? scoreColor : (isDarkMode ? '#333' : '#e3e3df')} />
                  <Cell fill={isDarkMode ? '#222' : '#e8e8e4'} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <span
                className="font-['Plus_Jakarta_Sans'] font-extrabold text-5xl leading-none"
                style={{ color: hasEnoughData ? scoreColor : undefined }}
              >
                {hasEnoughData ? scoreFinal : '—'}
              </span>
              <span className={cn('text-xs font-bold mt-1', isDarkMode ? 'text-[#FDFBF0]/50' : 'text-[#5b5c5a]')}>
                / 950
              </span>
              {hasEnoughData && scoreTrend.trend !== 'stable' && (
                <div className={cn(
                  'flex items-center gap-0.5 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-black',
                  scoreTrend.trend === 'up' ? 'bg-green-500/15 text-green-500' : 'bg-red-400/15 text-red-400',
                )}>
                  {scoreTrend.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {scoreTrend.trend === 'up' ? '+' : ''}{scoreTrend.delta} pts
                </div>
              )}
              {hasEnoughData && scoreTrend.trend === 'stable' && scoreTrend.delta === 0 && (
                <div className={cn('flex items-center gap-0.5 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-black', isDarkMode ? 'bg-white/10 text-white/40' : 'bg-black/5 text-black/30')}>
                  <Minus className="w-3 h-3" />
                  Estable
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 text-center space-y-1">
            <h2 className="font-['Plus_Jakarta_Sans'] font-black text-2xl">
              {hasEnoughData ? scoreLabel : 'Construyendo tu score'}
            </h2>
            <p className={cn('text-xs font-bold uppercase tracking-widest', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>
              Pasaporte Financiero Voz-Activa
            </p>
          </div>

          {hasEnoughData && (
            <div className="flex gap-2 mt-5 flex-wrap justify-center">
              <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
                <CalendarDays className="w-3.5 h-3.5 text-[#B8860B]" />
                {formatBusinessAge(ageDays)}
              </div>
              {monthlyProjection > 0 && (
                <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
                  <TrendingUp className="w-3.5 h-3.5 text-[#B8860B]" />
                  ${monthlyProjection.toLocaleString('es-CO')}/mes
                </div>
              )}
            </div>
          )}

          {!hasEnoughData && (
            <div className={cn('mt-6 w-full rounded-2xl p-5 space-y-3', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f1f1ee]')}>
              <p className="font-bold text-sm flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-[#B8860B]" />
                Para activar tu score registra:
              </p>
              <ul className={cn('text-xs space-y-1.5 pl-1', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>
                <li>• Al menos 5 ventas o gastos en total</li>
                <li>• Usa el asistente: <span className="font-bold">"Vendí 3 almuerzos a 15 mil"</span></li>
                <li>• O registra un gasto: <span className="font-bold">"Gasté 20 mil en insumos"</span></li>
              </ul>
            </div>
          )}
        </section>

        {/* ── Desglose de factores ── */}
        <section className="space-y-4">
          <h3 className="font-['Plus_Jakarta_Sans'] font-bold text-xl px-1">Desglose del score</h3>
          <div className="space-y-3">
            {factors.map((f) => {
              const pct = f.value / f.max;
              const { text: qlLabel, color: qlColor } = qualitativeLabel(pct);
              const showTip = pct < 0.6;
              return (
                <div key={f.label} className={cn('p-4 rounded-2xl space-y-3', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', isDarkMode ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'bg-[#FFF8DC] text-[#B8860B]')}>
                        {f.icon}
                      </div>
                      <div>
                        <p className="font-bold text-sm leading-tight">{f.label}</p>
                        <p className={cn('text-[10px] leading-tight mt-0.5', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>{f.description}</p>
                      </div>
                    </div>
                    <span className="text-xs font-black shrink-0 px-2.5 py-1 rounded-full" style={{ color: qlColor, backgroundColor: qlColor + '18' }}>
                      {qlLabel}
                    </span>
                  </div>
                  <div className={cn('h-1.5 rounded-full overflow-hidden', isDarkMode ? 'bg-white/10' : 'bg-[#f1f1ee]')}>
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct * 100}%`, backgroundColor: qlColor }} />
                  </div>
                  {showTip && (
                    <p className={cn('text-[10px] leading-snug', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>
                      💡 {f.tip}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Evolución del score ── */}
        {historyChartData.length >= 2 && (
          <section className="space-y-3">
            <h3 className="font-['Plus_Jakarta_Sans'] font-bold text-xl px-1">Evolución de tu score</h3>
            <div className={cn('rounded-2xl p-4', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={historyChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="semana" tick={{ fontSize: 10, fill: isDarkMode ? '#FDFBF0' : '#5b5c5a', opacity: 0.6 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[150, 950]} hide />
                  <Tooltip
                    contentStyle={{ background: isDarkMode ? '#1A1A1A' : '#fff', border: '1px solid #B8860B44', borderRadius: 12, fontSize: 12, color: isDarkMode ? '#FDFBF0' : '#1A1A1A' }}
                    formatter={(v: number) => [`${v} pts`, 'Score']}
                    labelStyle={{ color: '#B8860B', fontWeight: 700 }}
                  />
                  <Line type="monotone" dataKey="score" stroke="#DAA520" strokeWidth={2.5} dot={{ fill: '#B8860B', r: 4, strokeWidth: 0 }} activeDot={{ r: 6, fill: '#FFD700' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* ── Top productos ── */}
        {topProducts.length > 0 && (
          <section className="space-y-3">
            <h3 className="font-['Plus_Jakarta_Sans'] font-bold text-xl px-1">Tus productos estrella</h3>
            <div className="space-y-2">
              {topProducts.map((p, i) => {
                const maxTotal = topProducts[0].total;
                const pct = maxTotal > 0 ? p.total / maxTotal : 0;
                return (
                  <div key={p.name} className={cn('p-4 rounded-2xl flex items-center gap-3', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
                    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0', i === 0 ? 'bg-[#FFD700]/20 text-[#B8860B]' : isDarkMode ? 'bg-white/10 text-white/40' : 'bg-[#f1f1ee] text-[#5b5c5a]/60')}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{p.name}</p>
                      <div className={cn('h-1.5 rounded-full mt-1.5 overflow-hidden', isDarkMode ? 'bg-white/10' : 'bg-[#f1f1ee]')}>
                        <div className="h-full rounded-full bg-[#B8860B]" style={{ width: `${pct * 100}%` }} />
                      </div>
                    </div>
                    <p className="font-black text-sm text-[#B8860B] shrink-0">${p.total.toLocaleString('es-CO')}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Accede a crédito ── */}
        {hasEnoughData && scoreFinal >= 600 && (
          <div className={cn('rounded-2xl p-5 space-y-4', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
            <div className="flex items-start gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5', isDarkMode ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'bg-[#FFF8DC] text-[#B8860B]')}>
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="font-black text-sm leading-snug">¡Tu score abre puertas al crédito!</p>
                <p className={cn('text-xs leading-snug', isDarkMode ? 'text-[#FDFBF0]/50' : 'text-[#5b5c5a]')}>
                  Con {scoreFinal} puntos ya tienes un historial financiero real que puedes presentar ante cualquier microfinanciera, cooperativa o banco.
                </p>
              </div>
            </div>
            <button
              onClick={handleDownload}
              disabled={isGenerating}
              className="w-full h-12 flex items-center justify-center gap-2 rounded-xl font-black text-sm bg-gradient-to-br from-[#B8860B] to-[#FFD700] text-black active:scale-95 transition-all shadow-md"
            >
              <Download className="w-4 h-4" />
              {isGenerating ? 'Generando...' : 'Descargar mi Pasaporte Financiero'}
            </button>
            <p className={cn('text-[10px] text-center leading-snug', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/50')}>
              Presenta este PDF como evidencia alternativa de capacidad de pago
            </p>
          </div>
        )}

        {/* ── Logros ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-['Plus_Jakarta_Sans'] font-bold text-xl">Tus Logros</h3>
            <span className={cn('text-xs font-bold', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>
              {logros.filter((l) => l.unlocked).length}/{logros.length} desbloqueados
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {logros.map((logro) => (
              <div
                key={logro.label}
                className={cn('p-5 rounded-2xl flex flex-col items-center text-center shadow-sm transition-all duration-300', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white', !logro.unlocked && 'opacity-40')}
              >
                <div className={cn('w-14 h-14 rounded-full flex items-center justify-center mb-3', logro.unlocked ? isDarkMode ? 'bg-[#FFD700]/15 text-[#FFD700]' : 'bg-[#FFF8DC] text-[#B8860B]' : isDarkMode ? 'bg-[#2A2A2A] text-[#FDFBF0]/30' : 'bg-[#f1f1ee] text-[#5b5c5a]/40')}>
                  {logro.icon}
                </div>
                <span className="font-bold text-sm leading-tight">{logro.label}</span>
                <span className={cn('text-[10px] mt-1.5 flex items-center gap-1', logro.unlocked ? 'text-[#22c55e] font-bold' : isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>
                  {logro.unlocked ? '✓ Desbloqueado' : <><Lock className="w-3 h-3" />{logro.hint}</>}
                </span>
              </div>
            ))}
          </div>
          <p className={cn('text-center text-[10px] font-bold uppercase tracking-wider mt-2 flex items-center justify-center gap-1', isDarkMode ? 'text-[#FDFBF0]/20' : 'text-[#5b5c5a]/40')}>
            <Clock className="w-3 h-3" />
            Actualizado en tiempo real · datos de tu negocio
          </p>
        </section>

        {/* ── Siguiente nivel ── */}
        {nextLevel && hasEnoughData && (
          <section className={cn('rounded-2xl p-5 space-y-4', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', isDarkMode ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'bg-[#FFF8DC] text-[#B8860B]')}>
                <ArrowUpCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="font-black text-sm">Para llegar a <span className="text-[#B8860B]">{nextLevel.label}</span></p>
                <p className={cn('text-[10px]', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>
                  Meta: {nextLevel.target} puntos · Ahora tienes {scoreFinal}
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {nextLevel.tips.map((tip) => (
                <li key={tip} className={cn('flex items-start gap-2 text-xs', isDarkMode ? 'text-[#FDFBF0]/70' : 'text-[#2e2f2d]')}>
                  <span className="text-[#B8860B] font-black mt-0.5">→</span>
                  {tip}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden md:block">
        {renderDesktop()}
      </div>
    </div>
  );
};
