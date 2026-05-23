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

  // Historial del score + alerta de categoría
  useEffect(() => {
    if (!userId || !hasEnoughData || historyLoaded.current) return;
    historyLoaded.current = true;

    const run = async () => {
      try {
        const histRef = collection(db, 'users', userId, 'scoreHistory');

        // Cargar últimos 12 snapshots
        const snap = await getDocs(query(histRef, orderBy('recordedAt', 'asc'), limit(12)));
        const entries = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScoreHistoryEntry));
        setScoreHistory(entries);

        // Guardar snapshot si esta semana no tiene uno
        const thisWeek = getWeekKey(new Date());
        if (!entries.some((e) => e.weekKey === thisWeek)) {
          await addDoc(histRef, { score: scoreFinal, weekKey: thisWeek, recordedAt: serverTimestamp() });
        }

        // Alerta si la categoría mejoró
        const prevCategory = profile?.lastScoreCategory;
        const prevIdx = CATEGORY_ORDER.indexOf(prevCategory ?? '');
        const currIdx = CATEGORY_ORDER.indexOf(scoreLabel);
        if (currIdx > prevIdx && prevIdx !== -1 && lastAlertedCategory.current !== scoreLabel) {
          lastAlertedCategory.current = scoreLabel;
          setToast(`¡Subiste a ${scoreLabel}! 🎉`);
          setTimeout(() => setToast(null), 4000);
        }

        // Persistir categoría actual si cambió
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
        // Fallback: descargar el PDF directamente
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

  // Donut chart escala colombiana 150–950
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

  // Logros
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
      {
        icon: <Star className="w-7 h-7" />,
        label: 'Vendedor Constante',
        hint: 'Registra ventas ≥20 días',
        unlocked: uniqueSaleDays >= 20,
      },
      {
        icon: <TrendingUp className="w-7 h-7" />,
        label: 'Ahorro Inteligente',
        hint: 'Capacidad de pago > 30%',
        unlocked: capacidadRatio > 0.3,
      },
      {
        icon: <Users className="w-7 h-7" />,
        label: 'Cobrador Eficiente',
        hint: 'Recupera > 70% de fiados',
        unlocked: recuperacion > 0.7,
      },
      {
        icon: <Zap className="w-7 h-7" />,
        label: 'Negocio Activo',
        hint: 'Actividad en los últimos 7 días',
        unlocked: recentActivity,
      },
      {
        icon: <FileCheck className="w-7 h-7" />,
        label: 'Datos Confiables',
        hint: 'Calidad de datos ≥ 7/10',
        unlocked: breakdown.calidadDatos >= 7,
      },
      {
        icon: <ShieldCheck className="w-7 h-7" />,
        label: 'Score Excelente',
        hint: 'Alcanza 750+ puntos',
        unlocked: scoreFinal >= 750,
      },
    ];
  }, [sales, expenses, debts, breakdown, scoreFinal]);

  const historyChartData = scoreHistory.map((h) => ({
    score: h.score,
    semana: h.recordedAt?.toDate
      ? h.recordedAt.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit' })
      : '—',
  }));

  return (
    <div className="space-y-10 pb-4">

      {/* Toast de categoría */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl font-bold text-sm shadow-xl bg-[#1A1A1A] text-[#FFD700] border border-[#B8860B]/40 whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* ── Hero: donut + score ── */}
      <section className="flex flex-col items-center pt-4">
        <div className="relative w-56 h-56">
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
            {/* Tendencia */}
            {hasEnoughData && scoreTrend.trend !== 'stable' && (
              <div className={cn(
                'flex items-center gap-0.5 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-black',
                scoreTrend.trend === 'up'
                  ? 'bg-green-500/15 text-green-500'
                  : 'bg-red-400/15 text-red-400',
              )}>
                {scoreTrend.trend === 'up'
                  ? <TrendingUp className="w-3 h-3" />
                  : <TrendingDown className="w-3 h-3" />}
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

        {/* Pills de stats rápidos */}
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

        {/* Sin datos suficientes */}
        {!hasEnoughData && (
          <div className={cn(
            'mt-6 w-full rounded-2xl p-5 space-y-3',
            isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f1f1ee]',
          )}>
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
              <div
                key={f.label}
                className={cn(
                  'p-4 rounded-2xl space-y-3',
                  isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                      isDarkMode ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'bg-[#FFF8DC] text-[#B8860B]',
                    )}>
                      {f.icon}
                    </div>
                    <div>
                      <p className="font-bold text-sm leading-tight">{f.label}</p>
                      <p className={cn('text-[10px] leading-tight mt-0.5', isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')}>
                        {f.description}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-xs font-black shrink-0 px-2.5 py-1 rounded-full"
                    style={{ color: qlColor, backgroundColor: qlColor + '18' }}
                  >
                    {qlLabel}
                  </span>
                </div>
                <div className={cn('h-1.5 rounded-full overflow-hidden', isDarkMode ? 'bg-white/10' : 'bg-[#f1f1ee]')}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct * 100}%`, backgroundColor: qlColor }}
                  />
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
                <XAxis
                  dataKey="semana"
                  tick={{ fontSize: 10, fill: isDarkMode ? '#FDFBF0' : '#5b5c5a', opacity: 0.6 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis domain={[150, 950]} hide />
                <Tooltip
                  contentStyle={{
                    background: isDarkMode ? '#1A1A1A' : '#fff',
                    border: '1px solid #B8860B44',
                    borderRadius: 12,
                    fontSize: 12,
                    color: isDarkMode ? '#FDFBF0' : '#1A1A1A',
                  }}
                  formatter={(v: number) => [`${v} pts`, 'Score']}
                  labelStyle={{ color: '#B8860B', fontWeight: 700 }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#DAA520"
                  strokeWidth={2.5}
                  dot={{ fill: '#B8860B', r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#FFD700' }}
                />
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
                  <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0',
                    i === 0 ? 'bg-[#FFD700]/20 text-[#B8860B]' : isDarkMode ? 'bg-white/10 text-white/40' : 'bg-[#f1f1ee] text-[#5b5c5a]/60'
                  )}>
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
                Con {scoreFinal} puntos ya tienes un historial financiero real que puedes presentar ante cualquier microfinanciera, cooperativa o banco para explorar opciones de crédito y hacer crecer tu negocio.
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
              className={cn(
                'p-5 rounded-2xl flex flex-col items-center text-center shadow-sm transition-all duration-300',
                isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white',
                !logro.unlocked && 'opacity-40',
              )}
            >
              <div className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center mb-3',
                logro.unlocked
                  ? isDarkMode ? 'bg-[#FFD700]/15 text-[#FFD700]' : 'bg-[#FFF8DC] text-[#B8860B]'
                  : isDarkMode ? 'bg-[#2A2A2A] text-[#FDFBF0]/30' : 'bg-[#f1f1ee] text-[#5b5c5a]/40',
              )}>
                {logro.icon}
              </div>
              <span className="font-bold text-sm leading-tight">{logro.label}</span>
              <span className={cn(
                'text-[10px] mt-1.5 flex items-center gap-1',
                logro.unlocked
                  ? 'text-[#22c55e] font-bold'
                  : isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60',
              )}>
                {logro.unlocked
                  ? '✓ Desbloqueado'
                  : <><Lock className="w-3 h-3" />{logro.hint}</>}
              </span>
            </div>
          ))}
        </div>

        <p className={cn(
          'text-center text-[10px] font-bold uppercase tracking-wider mt-2 flex items-center justify-center gap-1',
          isDarkMode ? 'text-[#FDFBF0]/20' : 'text-[#5b5c5a]/40',
        )}>
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
  );
};
