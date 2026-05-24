import React, { useState } from 'react';
import {
  Calendar, Lock, Download, Loader2, TrendingUp, TrendingDown, DollarSign,
  ShoppingCart, Star, ChevronRight, CheckCircle2, Bell, BellOff, Check,
  AlertCircle, RefreshCcw, FileText, Lightbulb, Target,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import jsPDF from 'jspdf';
import { cn } from '../lib/utils';
import { Sale, Expense } from '../types';
import {
  generateFinancialReport, ReportPeriod, ParsedReport, PERIOD_CONFIG,
} from '../services/reportService';

interface Props {
  isDarkMode: boolean;
  sales: Sale[];
  expenses: Expense[];
  userId: string;
  userName?: string;
}

type NotifInterval = '1d' | '7d' | '15d' | 'mes';
const NOTIF_OPTIONS: { value: NotifInterval; label: string; days: number }[] = [
  { value: '1d',  label: 'Cada día',      days: 1  },
  { value: '7d',  label: 'Cada semana',   days: 7  },
  { value: '15d', label: 'Cada 2 semanas', days: 15 },
  { value: 'mes', label: 'Cada mes',      days: 30 },
];

const LS_LAST  = 'voz_last_report';
const LS_NOTIF = 'voz_report_notif_v2';

function saveLastReport(period: ReportPeriod) {
  localStorage.setItem(LS_LAST, JSON.stringify({ date: new Date().toISOString(), period }));
}
function getNotifInterval(): NotifInterval | null {
  return localStorage.getItem(LS_NOTIF) as NotifInterval | null;
}
function setNotifInterval(v: NotifInterval | null) {
  if (v) localStorage.setItem(LS_NOTIF, v); else localStorage.removeItem(LS_NOTIF);
}
function isDue(days: number): boolean {
  try {
    const raw = localStorage.getItem(LS_LAST);
    if (!raw) return true;
    return (Date.now() - new Date(JSON.parse(raw).date).getTime()) / 86_400_000 >= days;
  } catch { return true; }
}

const fmt = (v: number) =>
  '$' + Math.round(v).toLocaleString('es-CO');

function exportToPDF(report: ParsedReport, userName?: string, period?: ReportPeriod) {
  const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W     = 210;
  const M     = 20;
  const CW    = W - M * 2;
  let y       = 0;

  const gold  : [number, number, number] = [184, 134, 11];
  const dark  : [number, number, number] = [26,  26,  26];
  const gray  : [number, number, number] = [91,  92,  90];
  const cream : [number, number, number] = [253, 251, 240];
  const white : [number, number, number] = [255, 255, 255];

  // Header
  doc.setFillColor(...dark);
  doc.rect(0, 0, W, 48, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, 48, W, 2, 'F');
  doc.setTextColor(...white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Reporte Financiero', M, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);
  const biz = userName ? `Negocio de ${userName}` : 'Mi Negocio';
  const per = period ? PERIOD_CONFIG[period].label : 'Período';
  const dat = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(`${biz}  ·  ${per}  ·  ${dat}`, M, 32);
  doc.setTextColor(...white);
  doc.setFontSize(9);
  doc.text(report.periodoLabel, M, 42);
  y = 60;

  const addSection = (title: string, emoji: string) => {
    if (y > 265) { doc.addPage(); y = 20; }
    doc.setFillColor(...cream);
    doc.roundedRect(M, y, CW, 8, 2, 2, 'F');
    doc.setFillColor(...gold);
    doc.roundedRect(M, y, 3, 8, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...dark);
    doc.text(`${emoji}  ${title.toUpperCase()}`, M + 7, y + 5.5);
    y += 13;
  };

  const addText = (text: string, bullet = false) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...(bullet ? dark : gray));
    const wrapped = doc.splitTextToSize((bullet ? '  •  ' : '  ') + text, CW - 4);
    if (y + wrapped.length * 5 > 275) { doc.addPage(); y = 20; }
    doc.text(wrapped, M + 2, y);
    y += wrapped.length * 5 + 1;
  };

  // Metrics
  addSection('Resumen financiero', '📊');
  addText(`Ingresos: ${fmt(report.metrics.ingresos)}`);
  addText(`Gastos: ${fmt(report.metrics.gastos)}`);
  addText(`Utilidad neta: ${fmt(report.metrics.utilidad)}`);
  addText(`Transacciones: ${report.metrics.transacciones}`);
  if (report.bestDay) addText(`Mejor día: ${report.bestDay.name} — ${fmt(report.bestDay.amount)}`);
  y += 4;

  // Description
  addSection('Descripción', '📋');
  addText(report.descripcion);
  y += 4;

  // Insights
  addSection('Análisis inteligente', '💡');
  report.insights.forEach(i => {
    addText(`${i.titulo}: ${i.texto}`, true);
    y += 1;
  });
  y += 4;

  // Recomendaciones
  addSection('Recomendaciones', '🎯');
  report.recomendaciones.forEach(r => {
    addText(`${r.titulo}: ${r.texto}`, true);
    y += 1;
  });
  y += 4;

  // Conclusion
  addSection('Conclusión', '✅');
  addText(report.conclusion);
  y += 6;

  // Footer
  doc.setFillColor(...dark);
  doc.rect(0, 287, W, 10, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Generado por Voz Activa  ·  vozactiva.app', M, 293);

  doc.save(`reporte-${period ?? 'mes'}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export const ReportView: React.FC<Props> = ({ isDarkMode, sales, expenses, userName }) => {
  const [period, setPeriod]             = useState<ReportPeriod>('mes');
  const [report, setReport]             = useState<ParsedReport | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [notifInterval, setNotif]       = useState<NotifInterval | null>(getNotifInterval);
  const [notifGranted, setNotifGranted] = useState(
    typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false,
  );
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const due = notifInterval
    ? isDue(NOTIF_OPTIONS.find(o => o.value === notifInterval)?.days ?? 7)
    : false;

  const bg   = isDarkMode ? 'bg-[#1A1A1A]'              : 'bg-white';
  const muted = isDarkMode ? 'text-white/40'             : 'text-[#5b5c5a]/60';
  const txt  = isDarkMode ? 'text-white'                : 'text-[#2e2f2d]';

  async function requestNotif() {
    if (!('Notification' in window)) return;
    const p = await Notification.requestPermission();
    setNotifGranted(p === 'granted');
  }

  function handleEnableNotif(v: NotifInterval) {
    setNotifInterval(v);
    setNotif(v);
    if (!notifGranted) requestNotif();
    setShowNotifPanel(false);
  }
  function handleDisableNotif() {
    setNotifInterval(null);
    setNotif(null);
    setShowNotifPanel(false);
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const result = await generateFinancialReport(sales, expenses, period, userName);
      setReport(result);
      saveLastReport(period);
      if (notifGranted && notifInterval) {
        new Notification('Reporte generado — Voz Activa', {
          body: `Tu reporte de ${PERIOD_CONFIG[period].label.toLowerCase()} está listo.`,
          icon: '/icon-192.png',
        });
      }
    } catch (e: any) {
      setError(e.message ?? 'Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#B8860B]/15 flex items-center justify-center">
            <FileText className="w-5 h-5 text-[#B8860B]" />
          </div>
          <div>
            <h2 className={cn('font-black text-xl', txt)}>Reporte Financiero</h2>
            <p className={cn('text-xs', muted)}>Análisis generado por inteligencia artificial</p>
          </div>
        </div>

        {/* Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifPanel(v => !v)}
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center transition-colors relative',
              notifInterval
                ? 'bg-[#B8860B]/15 text-[#B8860B]'
                : isDarkMode ? 'bg-white/5 text-white/40 hover:bg-white/10' : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
            )}
          >
            {notifInterval ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
            {due && notifInterval && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
            )}
          </button>

          {showNotifPanel && (
            <div className={cn(
              'absolute right-0 top-12 w-64 rounded-2xl shadow-2xl border z-50 overflow-hidden',
              isDarkMode ? 'bg-[#1A1A1A] border-white/10' : 'bg-white border-gray-200',
            )}>
              <div className="h-1 bg-gradient-to-r from-[#B8860B] to-[#FFD700]" />
              <div className="p-4 space-y-2">
                <p className={cn('text-[10px] font-black uppercase tracking-widest mb-3', muted)}>Recordatorio</p>
                {NOTIF_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => handleEnableNotif(o.value)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-all',
                      notifInterval === o.value
                        ? 'bg-[#B8860B]/15 text-[#B8860B]'
                        : isDarkMode ? 'hover:bg-white/5 text-white/70' : 'hover:bg-gray-50 text-[#2e2f2d]',
                    )}
                  >
                    <span>{o.label}</span>
                    {notifInterval === o.value && <Check className="w-4 h-4" />}
                  </button>
                ))}
                {notifInterval && (
                  <button onClick={handleDisableNotif} className="w-full text-xs text-red-400 font-semibold py-1 hover:text-red-500 transition-colors">
                    Desactivar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Due reminder */}
      {due && notifInterval && (
        <div className="rounded-2xl p-4 bg-[#B8860B]/10 border border-[#B8860B]/30 flex items-center gap-3">
          <Bell className="w-5 h-5 text-[#B8860B] flex-shrink-0" />
          <p className={cn('text-sm font-semibold flex-1', txt)}>
            Es momento de generar tu reporte.
          </p>
        </div>
      )}

      {/* Period selector */}
      <div className={cn('rounded-2xl p-4 space-y-4 shadow-sm', bg)}>
        <p className={cn('text-xs font-black uppercase tracking-widest', muted)}>Período a analizar</p>

        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(PERIOD_CONFIG) as [ReportPeriod, (typeof PERIOD_CONFIG)[ReportPeriod]][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => { setPeriod(key); setReport(null); setError(null); }}
              className={cn(
                'flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all duration-200 text-left',
                period === key
                  ? 'border-[#B8860B] bg-[#B8860B]/10'
                  : isDarkMode ? 'border-white/10 hover:border-white/20' : 'border-gray-200 hover:border-gray-300',
              )}
            >
              <Calendar className={cn('w-4 h-4 flex-shrink-0', period === key ? 'text-[#B8860B]' : muted)} />
              <div>
                <p className={cn('text-sm font-bold leading-tight', period === key ? 'text-[#B8860B]' : txt)}>
                  {cfg.label}
                </p>
                <p className={cn('text-[10px] leading-tight', period === key ? 'text-[#B8860B]/70' : muted)}>
                  {cfg.sub}
                </p>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-4 rounded-xl font-black text-sm text-black bg-gradient-to-r from-[#B8860B] to-[#FFD700] active:scale-[0.98] transition-all duration-200 shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando tu negocio...</>
            : <><FileText className="w-4 h-4" /> Generar reporte PDF</>}
        </button>

        <div className="flex items-center justify-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-[#5b5c5a]/50" />
          <p className={cn('text-[11px]', muted)}>Tu información está protegida y es 100% confidencial.</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-2xl p-4 bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-500">No se pudo generar el reporte</p>
            <p className="text-xs text-red-400 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Report card */}
      {report && (
        <>
          {/* Success banner */}
          <div className="rounded-2xl p-3 bg-green-500/10 border border-green-500/20 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            <p className={cn('text-sm font-semibold', txt)}>Reporte generado con éxito</p>
          </div>

          <p className={cn('text-xs font-black uppercase tracking-widest px-1', muted)}>Vista previa del reporte</p>

          {/* Document card */}
          <div className={cn('rounded-2xl overflow-hidden shadow-lg', isDarkMode ? 'bg-[#111]' : 'bg-white border border-gray-100')}>

            {/* Doc header */}
            <div className="bg-[#1A1A1A] px-5 py-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#B8860B] font-black text-base tracking-wide">VOZ ACTIVA</span>
                <span className="text-white/30 text-xs">vozactiva.app</span>
              </div>
              <h3 className="text-white font-black text-lg leading-tight">Reporte Financiero</h3>
              <p className="text-white/50 text-xs mt-1">{report.periodoLabel}</p>
            </div>
            <div className="h-1 bg-gradient-to-r from-[#B8860B] to-[#FFD700]" />

            <div className="p-5 space-y-6">

              {/* Business name */}
              <p className={cn('text-sm font-semibold', muted)}>
                {userName ? `Negocio de ${userName}` : 'Mi Negocio'}
              </p>

              {/* Description */}
              <div>
                <SectionLabel icon={<FileText className="w-3.5 h-3.5" />} title="Descripción del negocio" />
                <p className={cn('text-sm leading-relaxed mt-2', isDarkMode ? 'text-white/70' : 'text-[#444]')}>
                  {report.descripcion}
                </p>
              </div>

              {/* Metric cards */}
              <div>
                <SectionLabel icon={<DollarSign className="w-3.5 h-3.5" />} title="Resumen financiero" />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <MetricCard
                    label="Ingresos"
                    value={fmt(report.metrics.ingresos)}
                    positive
                    isDarkMode={isDarkMode}
                    icon={<TrendingUp className="w-4 h-4" />}
                  />
                  <MetricCard
                    label="Gastos"
                    value={fmt(report.metrics.gastos)}
                    positive={false}
                    isDarkMode={isDarkMode}
                    icon={<TrendingDown className="w-4 h-4" />}
                  />
                  <MetricCard
                    label="Utilidad neta"
                    value={fmt(report.metrics.utilidad)}
                    positive={report.metrics.utilidad >= 0}
                    isDarkMode={isDarkMode}
                    icon={<DollarSign className="w-4 h-4" />}
                    highlight
                  />
                  <MetricCard
                    label="Transacciones"
                    value={String(report.metrics.transacciones)}
                    isDarkMode={isDarkMode}
                    icon={<ShoppingCart className="w-4 h-4" />}
                    neutral
                  />
                </div>
              </div>

              {/* Line chart */}
              {report.chartData.length > 0 && (
                <div>
                  <SectionLabel icon={<TrendingUp className="w-3.5 h-3.5" />} title="Ingresos vs Gastos" />
                  <div className="mt-3 h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={report.chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: isDarkMode ? '#ffffff60' : '#5b5c5a' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 9, fill: isDarkMode ? '#ffffff40' : '#5b5c5a90' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          contentStyle={{ background: isDarkMode ? '#1A1A1A' : '#fff', border: '1px solid #B8860B30', borderRadius: 12, fontSize: 12 }}
                          formatter={(v: number) => fmt(v)}
                          labelStyle={{ color: isDarkMode ? '#ffffff80' : '#5b5c5a' }}
                        />
                        <Line type="monotone" dataKey="income" stroke="#B8860B" strokeWidth={2.5} dot={false} name="Ingresos" />
                        <Line type="monotone" dataKey="exp"    stroke="#EF4444" strokeWidth={2} dot={false} strokeDasharray="4 2" name="Gastos" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 justify-center mt-2">
                    <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[#B8860B] inline-block rounded" /><span className={cn('text-[10px]', muted)}>Ingresos</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400 inline-block rounded" /><span className={cn('text-[10px]', muted)}>Gastos</span></div>
                  </div>
                </div>
              )}

              {/* Pie chart */}
              {report.pieData.length > 0 && (
                <div>
                  <SectionLabel icon={<ShoppingCart className="w-3.5 h-3.5" />} title="Distribución de gastos" />
                  <div className="mt-3 flex items-center gap-4">
                    <div className="w-36 h-36 flex-shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={report.pieData} dataKey="value" cx="50%" cy="50%" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                            {report.pieData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {report.pieData.map((slice, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: slice.color }} />
                          <span className={cn('text-xs flex-1 truncate', isDarkMode ? 'text-white/70' : 'text-[#444]')}>{slice.name}</span>
                          <span className={cn('text-xs font-bold', isDarkMode ? 'text-white' : 'text-[#2e2f2d]')}>{slice.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Best day */}
              {report.bestDay && (
                <div className="rounded-xl px-4 py-3 bg-[#B8860B]/10 border border-[#B8860B]/20 flex items-center gap-3">
                  <Star className="w-5 h-5 text-[#B8860B] flex-shrink-0" />
                  <div>
                    <p className={cn('text-xs', muted)}>Mejor día de ventas</p>
                    <p className={cn('text-sm font-black', isDarkMode ? 'text-white' : 'text-[#2e2f2d]')}>
                      {report.bestDay.name} — {fmt(report.bestDay.amount)}
                    </p>
                  </div>
                </div>
              )}

              {/* Insights */}
              {report.insights.length > 0 && (
                <div>
                  <SectionLabel icon={<Lightbulb className="w-3.5 h-3.5" />} title="Análisis inteligente" />
                  <div className="space-y-2.5 mt-2">
                    {report.insights.map((ins, i) => (
                      <InsightCard key={i} titulo={ins.titulo} texto={ins.texto} color="amber" isDarkMode={isDarkMode} />
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {report.recomendaciones.length > 0 && (
                <div>
                  <SectionLabel icon={<Target className="w-3.5 h-3.5" />} title="Recomendaciones" />
                  <div className="space-y-2.5 mt-2">
                    {report.recomendaciones.map((rec, i) => (
                      <InsightCard key={i} titulo={rec.titulo} texto={rec.texto} color="blue" isDarkMode={isDarkMode} arrow />
                    ))}
                  </div>
                </div>
              )}

              {/* Conclusion */}
              {report.conclusion && (
                <div className="rounded-xl px-4 py-4 bg-gradient-to-r from-[#B8860B]/15 to-[#FFD700]/10 border border-[#B8860B]/25">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#B8860B] mb-1">Conclusión</p>
                  <p className={cn('text-sm font-semibold leading-relaxed', isDarkMode ? 'text-white' : 'text-[#2e2f2d]')}>
                    "{report.conclusion}"
                  </p>
                </div>
              )}

              {/* Doc footer */}
              <div className="pt-4 border-t border-dashed border-[#B8860B]/20">
                <p className={cn('text-[10px] text-center', muted)}>
                  Generado por Voz Activa · {new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => exportToPDF(report, userName, period)}
              className="flex-1 py-4 rounded-2xl font-black text-sm text-black bg-gradient-to-r from-[#B8860B] to-[#FFD700] flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-200 shadow-lg"
            >
              <Download className="w-4 h-4" />
              Descargar PDF
            </button>
            <button
              onClick={() => { setReport(null); setError(null); }}
              className={cn(
                'flex-1 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-200 border-2',
                isDarkMode ? 'border-white/20 text-white/70 hover:bg-white/5' : 'border-gray-200 text-[#2e2f2d] hover:bg-gray-50',
              )}
            >
              <RefreshCcw className="w-4 h-4" />
              Otro reporte
            </button>
          </div>
        </>
      )}

      {showNotifPanel && (
        <div className="fixed inset-0 z-40" onClick={() => setShowNotifPanel(false)} />
      )}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[#B8860B]">{icon}</span>
    <span className="text-xs font-black uppercase tracking-widest text-[#B8860B]">{title}</span>
  </div>
);

const MetricCard: React.FC<{
  label: string; value: string; isDarkMode: boolean; icon: React.ReactNode;
  positive?: boolean; highlight?: boolean; neutral?: boolean;
}> = ({
  label, value, isDarkMode, icon, positive, highlight, neutral,
}) => {
  const valueColor = neutral
    ? (isDarkMode ? 'text-white' : 'text-[#2e2f2d]')
    : positive ? 'text-emerald-500' : 'text-red-400';

  return (
    <div className={cn(
      'rounded-xl px-3 py-3 space-y-1 border',
      highlight
        ? 'bg-[#B8860B]/10 border-[#B8860B]/25'
        : isDarkMode ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-100',
    )}>
      <div className="flex items-center gap-1.5">
        <span className={cn('opacity-60', isDarkMode ? 'text-white' : 'text-[#5b5c5a]')}>{icon}</span>
        <p className={cn('text-[10px] font-semibold', isDarkMode ? 'text-white/40' : 'text-[#5b5c5a]/70')}>{label}</p>
      </div>
      <p className={cn('text-base font-black leading-tight', valueColor)}>{value}</p>
    </div>
  );
}

const InsightCard: React.FC<{
  titulo: string; texto: string; isDarkMode: boolean; color: 'amber' | 'blue'; arrow?: boolean;
}> = ({
  titulo, texto, isDarkMode, color, arrow,
}) => {
  const accent = color === 'amber' ? '#B8860B' : '#3B82F6';
  const accentBg = color === 'amber' ? 'bg-[#B8860B]/10' : 'bg-blue-500/10';

  return (
    <div className={cn(
      'rounded-xl px-4 py-3 flex items-start gap-3',
      isDarkMode ? 'bg-white/5' : 'bg-gray-50',
    )}>
      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', accentBg)}>
        {arrow
          ? <ChevronRight className="w-4 h-4" style={{ color: accent }} />
          : <Lightbulb className="w-4 h-4" style={{ color: accent }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-black mb-0.5', isDarkMode ? 'text-white' : 'text-[#2e2f2d]')} style={{ color: accent }}>{titulo}</p>
        <p className={cn('text-xs leading-relaxed', isDarkMode ? 'text-white/60' : 'text-[#5b5c5a]')}>{texto}</p>
      </div>
    </div>
  );
}
