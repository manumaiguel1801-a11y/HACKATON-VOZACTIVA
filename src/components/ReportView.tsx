import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown, Lock, Download, Loader2, TrendingUp, TrendingDown, DollarSign,
  ShoppingCart, Star, ChevronRight, CheckCircle2, Bell, BellOff, Check,
  AlertCircle, RefreshCcw, FileText, Lightbulb, Target, AlertTriangle,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import jsPDF from 'jspdf';
import { cn } from '../lib/utils';
import { Sale, Expense, getSaleLabel } from '../types';
import {
  generateFinancialReport, ReportPeriod, ParsedReport, PERIOD_CONFIG,
  detectAvailablePeriod, filterByPeriod,
} from '../services/reportService';

interface Props {
  isDarkMode: boolean;
  sales: Sale[];
  expenses: Expense[];
  userId: string;
  userName?: string;
}

// ── Notification helpers ──────────────────────────────────────────────────────
type NotifInterval = '1d' | '7d' | '14d' | 'mes';
const NOTIF_OPTIONS: { value: NotifInterval; label: string; days: number }[] = [
  { value: '1d',  label: 'Cada día',      days: 1  },
  { value: '7d',  label: 'Cada semana',   days: 7  },
  { value: '14d', label: 'Cada 2 semanas', days: 14 },
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
function setNotifIntervalLS(v: NotifInterval | null) {
  if (v) localStorage.setItem(LS_NOTIF, v); else localStorage.removeItem(LS_NOTIF);
}
function isDue(days: number): boolean {
  try {
    const raw = localStorage.getItem(LS_LAST);
    if (!raw) return true;
    return (Date.now() - new Date(JSON.parse(raw).date).getTime()) / 86_400_000 >= days;
  } catch { return true; }
}

// ── PDF helpers ───────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
function fmtPDF(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}
function fmtFull(v: number): string {
  return '$' + Math.round(v).toLocaleString('es-CO');
}
function maybeNewPage(doc: jsPDF, y: number, needed: number, top = 22): number {
  return y + needed > 275 ? (doc.addPage(), top) : y;
}

function exportToPDF(
  report: ParsedReport,
  fSales: Sale[],
  fExpenses: Expense[],
  userName?: string,
  period?: ReportPeriod,
) {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = 210;
  const M    = 16;
  const CW   = W - M * 2;

  const C = {
    gold   : [184, 134, 11]  as [number, number, number],
    dark   : [26,  26,  26]  as [number, number, number],
    light  : [60,  60,  60]  as [number, number, number],
    gray   : [130, 130, 130] as [number, number, number],
    cream  : [253, 251, 240] as [number, number, number],
    white  : [255, 255, 255] as [number, number, number],
    green  : [22,  163, 74]  as [number, number, number],
    red    : [239, 68,  68]  as [number, number, number],
    altRow : [248, 247, 243] as [number, number, number],
  };

  let y = 0;

  // ── PAGE 1: HEADER ───────────────────────────────────────────────────────
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, W, 44, 'F');
  doc.setFillColor(...C.gold);
  doc.rect(0, 44, W, 2, 'F');

  doc.setTextColor(...C.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('VOZ ACTIVA', M, 12);

  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Reporte Financiero', M, 25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(180, 180, 180);
  const biz = userName ? `Negocio de ${userName}` : 'Mi Negocio';
  const per = period ? PERIOD_CONFIG[period].label : '';
  const dat = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(`${biz}  ·  Periodo: ${per}  ·  ${dat}`, M, 35);
  doc.setTextColor(140, 140, 140);
  doc.setFontSize(7.5);
  doc.text(report.periodoLabel, M, 41);

  y = 54;

  // ── RESUMEN EJECUTIVO ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.gold);
  doc.text('RESUMEN EJECUTIVO', M, y);
  y += 5;

  const boxW = (CW - 6) / 4;
  const boxes = [
    { label: 'INGRESOS',      value: fmtFull(report.metrics.ingresos),      color: C.green },
    { label: 'GASTOS',        value: fmtFull(report.metrics.gastos),         color: C.red   },
    { label: 'UTILIDAD NETA', value: fmtFull(report.metrics.utilidad),       color: report.metrics.utilidad >= 0 ? C.green : C.red },
    { label: 'TRANSACCIONES', value: String(report.metrics.transacciones),   color: C.light },
  ];
  boxes.forEach((b, i) => {
    const bx = M + i * (boxW + 2);
    doc.setFillColor(...C.cream);
    doc.rect(bx, y, boxW, 22, 'F');
    doc.setFillColor(...b.color);
    doc.rect(bx, y, boxW, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...b.color);
    const valueLines = doc.splitTextToSize(b.value, boxW - 4);
    doc.text(valueLines[0], bx + boxW / 2, y + 11, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.gray);
    doc.text(b.label, bx + boxW / 2, y + 17, { align: 'center' });
  });
  y += 26;

  // ── BEST DAY ─────────────────────────────────────────────────────────────
  if (report.bestDay) {
    doc.setFillColor(184, 134, 11, 0.08);
    doc.setFillColor(255, 250, 225);
    doc.rect(M, y, CW, 10, 'F');
    doc.setFillColor(...C.gold);
    doc.rect(M, y, 3, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.text(`Mejor dia de ventas: ${report.bestDay.name} — ${fmtFull(report.bestDay.amount)}`, M + 7, y + 6.5);
    y += 14;
  }

  // ── FLUJO DE CAJA (Bar Chart) ─────────────────────────────────────────────
  y = maybeNewPage(doc, y, 70);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.gold);
  doc.text('FLUJO DE CAJA', M, y);
  y += 4;

  const chartData = report.chartData;
  if (chartData.length > 0) {
    const CHART_H = 48;
    const maxV    = Math.max(...chartData.map(p => Math.max(p.income, p.exp)), 1);

    // Grid lines
    doc.setLineWidth(0.2);
    for (let i = 0; i <= 4; i++) {
      const ly = y + CHART_H - (i / 4) * CHART_H;
      doc.setDrawColor(220, 220, 220);
      doc.line(M + 12, ly, M + CW, ly);
      if (i > 0) {
        doc.setFontSize(6.5);
        doc.setTextColor(...C.gray);
        doc.text(fmtPDF((maxV * i) / 4), M + 11, ly + 1, { align: 'right' });
      }
    }

    // Bars
    const groupW = CW / chartData.length;
    const bW     = Math.max(1.5, Math.min(7, groupW * 0.38));
    const skip   = Math.max(1, Math.ceil(chartData.length / 10));

    chartData.forEach((pt, i) => {
      const bx = M + 12 + i * groupW + (groupW - bW * 2 - 1) / 2;

      if (pt.income > 0) {
        const h = (pt.income / maxV) * CHART_H;
        doc.setFillColor(...C.gold);
        doc.rect(bx, y + CHART_H - h, bW, h, 'F');
      }
      if (pt.exp > 0) {
        const h = (pt.exp / maxV) * CHART_H;
        doc.setFillColor(...C.red);
        doc.rect(bx + bW + 1, y + CHART_H - h, bW, h, 'F');
      }
      if (i % skip === 0) {
        doc.setFontSize(6.5);
        doc.setTextColor(...C.gray);
        doc.text(pt.name.slice(0, 4), bx + bW, y + CHART_H + 4, { align: 'center' });
      }
    });

    // Legend
    doc.setFillColor(...C.gold);
    doc.rect(M + 12, y + CHART_H + 8, 6, 3, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.light);
    doc.text('Ingresos', M + 20, y + CHART_H + 10.5);
    doc.setFillColor(...C.red);
    doc.rect(M + 46, y + CHART_H + 8, 6, 3, 'F');
    doc.text('Gastos', M + 54, y + CHART_H + 10.5);

    y += CHART_H + 18;
  }

  // ── DISTRIBUCION DE GASTOS (Stacked bar) ─────────────────────────────────
  if (report.pieData.length > 0) {
    y = maybeNewPage(doc, y, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.gold);
    doc.text('DISTRIBUCION DE GASTOS', M, y);
    y += 4;

    const BAR_H = 10;
    let xCur = M;
    report.pieData.forEach(slice => {
      const w = (slice.value / 100) * CW;
      doc.setFillColor(...hexToRgb(slice.color));
      doc.rect(xCur, y, Math.max(w, 0.5), BAR_H, 'F');
      xCur += w;
    });
    y += BAR_H + 4;

    // Legend 2-col
    let legX = M;
    let legY = y;
    report.pieData.forEach((slice, i) => {
      if (i > 0 && i % 3 === 0) { legX = M; legY += 6; }
      else if (i > 0) legX += 58;
      doc.setFillColor(...hexToRgb(slice.color));
      doc.rect(legX, legY, 3.5, 3.5, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.light);
      doc.text(`${slice.name} (${slice.value}%)`, legX + 5.5, legY + 3);
    });
    y = legY + 10;
  }

  // ── PAGE 2: TRANSACTION TABLES ────────────────────────────────────────────
  if (fSales.length > 0 || fExpenses.length > 0) {
    doc.addPage();
    y = 22;

    doc.setFillColor(...C.dark);
    doc.rect(0, 0, W, 16, 'F');
    doc.setFillColor(...C.gold);
    doc.rect(0, 16, W, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.white);
    doc.text('Detalle de Movimientos', M, 11);

    const drawTable = (
      title: string,
      rows: { dateStr: string; label: string; amount: number; positive: boolean }[],
    ) => {
      y = maybeNewPage(doc, y, 24);
      // Section label
      doc.setFillColor(...C.cream);
      doc.rect(M, y, CW, 8, 'F');
      doc.setFillColor(...C.gold);
      doc.rect(M, y, 3, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.dark);
      doc.text(title, M + 7, y + 5.5);
      y += 10;

      // Column headers
      doc.setFillColor(210, 210, 210);
      doc.rect(M, y, CW, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.gray);
      doc.text('FECHA', M + 2, y + 3.8);
      doc.text('DESCRIPCION', M + 28, y + 3.8);
      doc.text('MONTO', M + CW - 2, y + 3.8, { align: 'right' });
      y += 5.5;

      rows.slice(0, 30).forEach((row, i) => {
        y = maybeNewPage(doc, y, 7);
        if (i % 2 === 0) {
          doc.setFillColor(...C.altRow);
          doc.rect(M, y, CW, 6, 'F');
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...C.dark);
        doc.text(row.dateStr, M + 2, y + 4.2);
        const lbl = doc.splitTextToSize(row.label, 115)[0];
        doc.text(lbl, M + 28, y + 4.2);
        doc.setTextColor(...(row.positive ? C.green : C.red));
        doc.text((row.positive ? '+' : '-') + fmtFull(row.amount), M + CW - 2, y + 4.2, { align: 'right' });
        y += 6;
      });

      if (rows.length > 30) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.gray);
        doc.text(`... y ${rows.length - 30} registros mas`, M + 2, y + 4);
        y += 7;
      }
      y += 6;
    };

    if (fSales.length > 0) {
      const salesRows = fSales.map(s => ({
        dateStr: s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' }) : '—',
        label: getSaleLabel(s),
        amount: s.total,
        positive: true,
      }));
      drawTable('VENTAS / INGRESOS', salesRows);
    }

    if (fExpenses.length > 0) {
      const expRows = fExpenses.map(e => ({
        dateStr: e.createdAt?.toDate ? e.createdAt.toDate().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' }) : '—',
        label: e.concept,
        amount: e.amount,
        positive: false,
      }));
      drawTable('GASTOS', expRows);
    }
  }

  // ── PAGE 3: AI INSIGHTS ───────────────────────────────────────────────────
  doc.addPage();
  y = 22;

  doc.setFillColor(...C.dark);
  doc.rect(0, 0, W, 16, 'F');
  doc.setFillColor(...C.gold);
  doc.rect(0, 16, W, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...C.white);
  doc.text('Analisis Inteligente — IA', M, 11);

  const addSection = (emoji: string, title: string) => {
    y = maybeNewPage(doc, y, 16);
    doc.setFillColor(...C.cream);
    doc.rect(M, y, CW, 7, 'F');
    doc.setFillColor(...C.gold);
    doc.rect(M, y, 3, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.text(`${emoji}  ${title}`, M + 7, y + 4.8);
    y += 10;
  };

  const addItem = (titulo: string, texto: string, bulletColor: [number, number, number]) => {
    y = maybeNewPage(doc, y, 14);
    doc.setFillColor(...bulletColor);
    doc.circle(M + 3, y + 3, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    doc.text(titulo, M + 7, y + 3.5);
    const wrapped = doc.splitTextToSize(texto, CW - 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.light);
    doc.text(wrapped, M + 7, y + 8.5);
    y += 8 + wrapped.length * 4.5 + 3;
  };

  if (report.descripcion) {
    addSection('', 'DESCRIPCION DEL NEGOCIO');
    const wrapped = doc.splitTextToSize(report.descripcion, CW - 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.light);
    doc.text(wrapped, M + 2, y);
    y += wrapped.length * 4.5 + 6;
  }

  if (report.insights.length > 0) {
    addSection('', 'ANALISIS CLAVE');
    report.insights.forEach(ins => addItem(ins.titulo, ins.texto, C.gold));
    y += 4;
  }

  if (report.recomendaciones.length > 0) {
    addSection('', 'RECOMENDACIONES');
    report.recomendaciones.forEach(rec => addItem(rec.titulo, rec.texto, [59, 130, 246]));
    y += 4;
  }

  if (report.conclusion) {
    y = maybeNewPage(doc, y, 24);
    doc.setFillColor(255, 250, 225);
    doc.rect(M, y, CW, 20, 'F');
    doc.setFillColor(...C.gold);
    doc.rect(M, y, 3, 20, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.gold);
    doc.text('CONCLUSION', M + 7, y + 6);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.dark);
    const cLines = doc.splitTextToSize(`"${report.conclusion}"`, CW - 10);
    doc.text(cLines, M + 7, y + 13);
    y += 24;
  }

  // Footer on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(...C.dark);
    doc.rect(0, 289, W, 8, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('Generado por Voz Activa  ·  vozactiva.app', M, 294);
    doc.text(`Pagina ${p} de ${totalPages}`, W - M, 294, { align: 'right' });
  }

  doc.save(`reporte-${period ?? 'mes'}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Main component ────────────────────────────────────────────────────────────
export const ReportView: React.FC<Props> = ({ isDarkMode, sales, expenses, userName }) => {
  const [period, setPeriod]             = useState<ReportPeriod>('7d');
  const [report, setReport]             = useState<ParsedReport | null>(null);
  const [filteredSales, setFSales]      = useState<Sale[]>([]);
  const [filteredExpenses, setFExpenses]= useState<Expense[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [showPeriodMenu, setShowPeriodMenu] = useState(false);
  const [notifInterval, setNotif]       = useState<NotifInterval | null>(getNotifInterval);
  const [notifGranted, setNotifGranted] = useState(
    typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false,
  );
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const due = notifInterval
    ? isDue(NOTIF_OPTIONS.find(o => o.value === notifInterval)?.days ?? 7)
    : false;

  const availability = detectAvailablePeriod(sales, expenses, period);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPeriodMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const muted = isDarkMode ? 'text-white/40' : 'text-[#5b5c5a]/60';
  const txt   = isDarkMode ? 'text-white'    : 'text-[#2e2f2d]';
  const card  = isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white';

  async function requestNotif() {
    if (!('Notification' in window)) return;
    const p = await Notification.requestPermission();
    setNotifGranted(p === 'granted');
  }

  function handleEnableNotif(v: NotifInterval) {
    setNotifIntervalLS(v);
    setNotif(v);
    if (!notifGranted) requestNotif();
    setShowNotifPanel(false);
  }
  function handleDisableNotif() {
    setNotifIntervalLS(null);
    setNotif(null);
    setShowNotifPanel(false);
  }

  async function handleGenerate() {
    if (!availability.hasData) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const { sales: fs, expenses: fe } = filterByPeriod(sales, expenses, period);
      setFSales(fs);
      setFExpenses(fe);
      const result = await generateFinancialReport(sales, expenses, period, userName);
      setReport(result);
      saveLastReport(period);
      if (notifGranted && notifInterval) {
        new Notification('Reporte generado — Voz Activa', {
          body: `Tu reporte de ${PERIOD_CONFIG[period].label.toLowerCase()} esta listo.`,
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

      {/* Header */}
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
              'absolute right-0 top-12 w-56 rounded-2xl shadow-2xl border z-50 overflow-hidden',
              isDarkMode ? 'bg-[#1A1A1A] border-white/10' : 'bg-white border-gray-200',
            )}>
              <div className="h-1 bg-gradient-to-r from-[#B8860B] to-[#FFD700]" />
              <div className="p-3 space-y-1">
                <p className={cn('text-[10px] font-black uppercase tracking-widest mb-2', muted)}>Recordatorio</p>
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
        <div className="rounded-2xl p-3 bg-[#B8860B]/10 border border-[#B8860B]/30 flex items-center gap-3">
          <Bell className="w-5 h-5 text-[#B8860B] flex-shrink-0" />
          <p className={cn('text-sm font-semibold', txt)}>Es momento de generar tu reporte.</p>
        </div>
      )}

      {/* Period selector card */}
      <div className={cn('rounded-2xl p-4 space-y-4 shadow-sm', card)}>
        <div className="flex items-center justify-between">
          <p className={cn('text-xs font-black uppercase tracking-widest', muted)}>Período a analizar</p>
        </div>

        {/* Dropdown selector */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowPeriodMenu(v => !v)}
            className={cn(
              'w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 transition-all font-semibold text-sm',
              showPeriodMenu
                ? 'border-[#B8860B] bg-[#B8860B]/5'
                : isDarkMode ? 'border-white/15 bg-white/5 hover:border-white/25' : 'border-gray-200 bg-gray-50 hover:border-gray-300',
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#B8860B]" />
              <div className="text-left">
                <p className={cn('font-bold text-sm', txt)}>{PERIOD_CONFIG[period].label}</p>
                <p className={cn('text-[11px]', muted)}>{PERIOD_CONFIG[period].sub}</p>
              </div>
            </div>
            <ChevronDown className={cn(
              'w-4 h-4 transition-transform flex-shrink-0',
              showPeriodMenu ? 'rotate-180 text-[#B8860B]' : muted,
            )} />
          </button>

          {/* Dropdown options */}
          {showPeriodMenu && (
            <div className={cn(
              'absolute left-0 right-0 top-full mt-1.5 rounded-2xl shadow-xl border z-50 overflow-hidden',
              isDarkMode ? 'bg-[#1A1A1A] border-white/10' : 'bg-white border-gray-200',
            )}>
              {(Object.entries(PERIOD_CONFIG) as [ReportPeriod, (typeof PERIOD_CONFIG)[ReportPeriod]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => { setPeriod(key); setReport(null); setError(null); setShowPeriodMenu(false); }}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3 text-sm transition-all',
                    period === key
                      ? 'bg-[#B8860B]/10 text-[#B8860B] font-bold'
                      : isDarkMode
                        ? 'text-white/70 hover:bg-white/5 font-medium'
                        : 'text-[#2e2f2d] hover:bg-gray-50 font-medium',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('w-2 h-2 rounded-full', period === key ? 'bg-[#B8860B]' : isDarkMode ? 'bg-white/20' : 'bg-gray-300')} />
                    <div className="text-left">
                      <p className="leading-tight">{cfg.label}</p>
                      <p className={cn('text-[10px] font-normal leading-tight', period === key ? 'text-[#B8860B]/70' : muted)}>{cfg.sub}</p>
                    </div>
                  </div>
                  {period === key && <Check className="w-4 h-4 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* No-data warning */}
        {!availability.hasData && (
          <div className="rounded-xl p-3 bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className={cn('text-xs font-bold text-amber-600 dark:text-amber-400 mb-1')}>
                Sin datos para "{PERIOD_CONFIG[period].label}"
              </p>
              {availability.suggestion ? (
                <p className={cn('text-xs', muted)}>
                  No hay registros en este período.{' '}
                  <button
                    onClick={() => { setPeriod(availability.suggestion!); setError(null); }}
                    className="text-[#B8860B] font-bold underline"
                  >
                    Ver "{PERIOD_CONFIG[availability.suggestion].label}"
                  </button>
                  {' '}que sí tiene datos.
                </p>
              ) : (
                <p className={cn('text-xs', muted)}>
                  Registra ventas y gastos para generar tu primer reporte.
                </p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading || !availability.hasData}
          className="w-full py-4 rounded-xl font-black text-sm text-black bg-gradient-to-r from-[#B8860B] to-[#FFD700] active:scale-[0.98] transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

      {/* Report preview */}
      {report && (
        <>
          <div className="rounded-2xl p-3 bg-green-500/10 border border-green-500/20 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            <p className={cn('text-sm font-semibold', txt)}>Reporte generado con éxito</p>
          </div>

          <p className={cn('text-xs font-black uppercase tracking-widest px-1', muted)}>Vista previa del reporte</p>

          {/* Document card */}
          <div className={cn('rounded-2xl overflow-hidden shadow-lg border', isDarkMode ? 'bg-[#111] border-white/5' : 'bg-white border-gray-100')}>
            {/* Doc header */}
            <div className="bg-[#1A1A1A] px-5 py-5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[#B8860B] font-black text-base tracking-wide">VOZ ACTIVA</span>
                <span className="text-white/30 text-xs">vozactiva.app</span>
              </div>
              <h3 className="text-white font-black text-lg">Reporte Financiero</h3>
              <p className="text-white/50 text-xs mt-1">{report.periodoLabel}</p>
            </div>
            <div className="h-1 bg-gradient-to-r from-[#B8860B] to-[#FFD700]" />

            <div className="p-5 space-y-6">
              <p className={cn('text-sm font-semibold', muted)}>
                {userName ? `Negocio de ${userName}` : 'Mi Negocio'}
              </p>

              {/* Metrics */}
              <div>
                <DocLabel icon={<DollarSign className="w-3.5 h-3.5" />} title="Resumen financiero" />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <MetricBox label="Ingresos"       value={'$' + report.metrics.ingresos.toLocaleString('es-CO')} color="text-emerald-500" isDarkMode={isDarkMode} icon={<TrendingUp className="w-4 h-4" />} />
                  <MetricBox label="Gastos"         value={'$' + report.metrics.gastos.toLocaleString('es-CO')}   color="text-red-400"     isDarkMode={isDarkMode} icon={<TrendingDown className="w-4 h-4" />} />
                  <MetricBox label="Utilidad neta"  value={'$' + report.metrics.utilidad.toLocaleString('es-CO')} color={report.metrics.utilidad >= 0 ? 'text-emerald-500' : 'text-red-400'} isDarkMode={isDarkMode} icon={<DollarSign className="w-4 h-4" />} highlight />
                  <MetricBox label="Transacciones"  value={String(report.metrics.transacciones)} color={isDarkMode ? 'text-white' : 'text-[#2e2f2d]'} isDarkMode={isDarkMode} icon={<ShoppingCart className="w-4 h-4" />} />
                </div>
              </div>

              {/* Line chart */}
              {report.chartData.length > 0 && (
                <div>
                  <DocLabel icon={<TrendingUp className="w-3.5 h-3.5" />} title="Ingresos vs Gastos" />
                  <div className="mt-3 h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={report.chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 9, fill: isDarkMode ? '#ffffff60' : '#5b5c5a' }}
                          axisLine={false}
                          tickLine={false}
                          interval={report.chartData.length > 14 ? Math.floor(report.chartData.length / 7) : 0}
                        />
                        <YAxis
                          tick={{ fontSize: 8, fill: isDarkMode ? '#ffffff40' : '#5b5c5a90' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={v => `$${v >= 1_000 ? Math.round(v / 1_000) + 'k' : v}`}
                        />
                        <Tooltip
                          contentStyle={{ background: isDarkMode ? '#1A1A1A' : '#fff', border: '1px solid #B8860B30', borderRadius: 12, fontSize: 12 }}
                          formatter={(v: number) => '$' + v.toLocaleString('es-CO')}
                          labelStyle={{ color: isDarkMode ? '#ffffff80' : '#5b5c5a' }}
                        />
                        <Line type="monotone" dataKey="income" stroke="#B8860B" strokeWidth={2.5} dot={false} name="Ingresos" />
                        <Line type="monotone" dataKey="exp"    stroke="#EF4444" strokeWidth={2} dot={false} strokeDasharray="4 2" name="Gastos" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-4 justify-center mt-1">
                    <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-[#B8860B] inline-block rounded" /><span className={cn('text-[10px]', muted)}>Ingresos</span></div>
                    <div className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-red-400 inline-block rounded" /><span className={cn('text-[10px]', muted)}>Gastos</span></div>
                  </div>
                </div>
              )}

              {/* Pie chart */}
              {report.pieData.length > 0 && (
                <div>
                  <DocLabel icon={<ShoppingCart className="w-3.5 h-3.5" />} title="Distribución de gastos" />
                  <div className="mt-3 flex items-center gap-4">
                    <div className="w-36 h-36 flex-shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={report.pieData} dataKey="value" cx="50%" cy="50%" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                            {report.pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
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
                      {report.bestDay.name} — ${report.bestDay.amount.toLocaleString('es-CO')}
                    </p>
                  </div>
                </div>
              )}

              {/* Description */}
              {report.descripcion && (
                <div>
                  <DocLabel icon={<FileText className="w-3.5 h-3.5" />} title="Descripción del negocio" />
                  <p className={cn('text-sm leading-relaxed mt-2', isDarkMode ? 'text-white/70' : 'text-[#444]')}>{report.descripcion}</p>
                </div>
              )}

              {/* Insights */}
              {report.insights.length > 0 && (
                <div>
                  <DocLabel icon={<Lightbulb className="w-3.5 h-3.5" />} title="Análisis inteligente" />
                  <div className="space-y-2.5 mt-2">
                    {report.insights.map((ins, i) => (
                      <InsightBox key={i} titulo={ins.titulo} texto={ins.texto} color="amber" isDarkMode={isDarkMode} />
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {report.recomendaciones.length > 0 && (
                <div>
                  <DocLabel icon={<Target className="w-3.5 h-3.5" />} title="Recomendaciones" />
                  <div className="space-y-2.5 mt-2">
                    {report.recomendaciones.map((rec, i) => (
                      <InsightBox key={i} titulo={rec.titulo} texto={rec.texto} color="blue" isDarkMode={isDarkMode} arrow />
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

              <div className="pt-3 border-t border-dashed border-[#B8860B]/20">
                <p className={cn('text-[10px] text-center', muted)}>
                  Generado por Voz Activa · {new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => exportToPDF(report, filteredSales, filteredExpenses, userName, period)}
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

      {/* Backdrop to close menus */}
      {(showNotifPanel || showPeriodMenu) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setShowNotifPanel(false); setShowPeriodMenu(false); }}
        />
      )}
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const DocLabel: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-[#B8860B]">{icon}</span>
    <span className="text-xs font-black uppercase tracking-widest text-[#B8860B]">{title}</span>
  </div>
);

const MetricBox: React.FC<{
  label: string; value: string; color: string; isDarkMode: boolean;
  icon: React.ReactNode; highlight?: boolean;
}> = ({ label, value, color, isDarkMode, icon, highlight }) => (
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
    <p className={cn('text-sm font-black leading-tight', color)}>{value}</p>
  </div>
);

const InsightBox: React.FC<{
  titulo: string; texto: string; isDarkMode: boolean; color: 'amber' | 'blue'; arrow?: boolean;
}> = ({ titulo, texto, isDarkMode, color, arrow }) => {
  const accent   = color === 'amber' ? '#B8860B' : '#3B82F6';
  const accentBg = color === 'amber' ? 'bg-[#B8860B]/10' : 'bg-blue-500/10';
  return (
    <div className={cn('rounded-xl px-4 py-3 flex items-start gap-3', isDarkMode ? 'bg-white/5' : 'bg-gray-50')}>
      <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', accentBg)}>
        {arrow
          ? <ChevronRight className="w-4 h-4" style={{ color: accent }} />
          : <Lightbulb className="w-4 h-4" style={{ color: accent }} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black mb-0.5" style={{ color: accent }}>{titulo}</p>
        <p className={cn('text-xs leading-relaxed', isDarkMode ? 'text-white/60' : 'text-[#5b5c5a]')}>{texto}</p>
      </div>
    </div>
  );
};
