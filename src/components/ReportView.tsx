import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown, Lock, Loader2, TrendingUp, TrendingDown, DollarSign,
  ShoppingCart, Star, CheckCircle2, Bell, BellOff, Check,
  AlertCircle, FileText, Lightbulb, Target, AlertTriangle, Download,
} from 'lucide-react';
import jsPDF from 'jspdf';
import { cn } from '../lib/utils';
import { Sale, Expense, getSaleLabel } from '../types';
import {
  ReportPeriod, ParsedReport, PERIOD_CONFIG,
  checkPeriodCompatibility, filterByPeriod,
} from '../services/reportService';
import { generateFinancialReport } from '../agentes/reporteAgente';

interface Props {
  isDarkMode: boolean;
  sales: Sale[];
  expenses: Expense[];
  userId: string;
  userName?: string;
}

// ── Notification ──────────────────────────────────────────────────────────────
type NotifInterval = '1d' | '7d' | '14d' | 'mes';
const NOTIF_OPTIONS: { value: NotifInterval; label: string; days: number }[] = [
  { value: '1d',  label: 'Cada día',       days: 1  },
  { value: '7d',  label: 'Cada semana',    days: 7  },
  { value: '14d', label: 'Cada 2 semanas', days: 14 },
  { value: 'mes', label: 'Cada mes',       days: 30 },
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

// ── PDF ───────────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}
function fmtK(v: number): string {
  if (v >= 1_000_000) return `$${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${Math.round(v/1_000)}k`;
  return `$${Math.round(v)}`;
}
function fmtFull(v: number): string {
  return '$' + Math.round(v).toLocaleString('es-CO');
}
function newPage(doc: jsPDF, y: number, needed: number, top = 22): number {
  return y + needed > 275 ? (doc.addPage(), top) : y;
}

function exportToPDF(
  report: ParsedReport,
  fSales: Sale[],
  fExpenses: Expense[],
  userName?: string,
  period?: ReportPeriod,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, M = 16, CW = W - M * 2;

  const C = {
    gold : [184,134,11]  as [number,number,number],
    dark : [26,26,26]    as [number,number,number],
    gray : [100,100,100] as [number,number,number],
    light: [50,50,50]    as [number,number,number],
    cream: [253,251,240] as [number,number,number],
    white: [255,255,255] as [number,number,number],
    green: [22,163,74]   as [number,number,number],
    red  : [220,60,60]   as [number,number,number],
    alt  : [248,247,243] as [number,number,number],
  };

  let y = 0;

  // ── HEADER ────────────────────────────────────────────────────────────────
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, W, 44, 'F');
  doc.setFillColor(...C.gold);
  doc.rect(0, 44, W, 2, 'F');

  doc.setTextColor(...C.gold);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('VOZ ACTIVA', M, 11);

  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('Reporte Financiero', M, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(175, 175, 175);
  const biz = userName ? `Negocio de ${userName}` : 'Mi Negocio';
  const per = period ? PERIOD_CONFIG[period].label : '';
  const dat = new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' });
  doc.text(`${biz}  ·  ${per}  ·  ${dat}`, M, 34);
  doc.setTextColor(130,130,130);
  doc.setFontSize(7);
  doc.text(report.periodoLabel, M, 41);

  y = 54;

  // ── METRICS ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...C.gold);
  doc.text('RESUMEN EJECUTIVO', M, y); y += 5;

  const bW = (CW-6)/4;
  const boxes = [
    { label:'INGRESOS',      val: fmtFull(report.metrics.ingresos),    color: C.green },
    { label:'GASTOS',        val: fmtFull(report.metrics.gastos),       color: C.red   },
    { label:'UTILIDAD NETA', val: fmtFull(report.metrics.utilidad),     color: report.metrics.utilidad >= 0 ? C.green : C.red },
    { label:'TRANSACCIONES', val: String(report.metrics.transacciones), color: C.light },
  ];
  boxes.forEach((b,i) => {
    const bx = M + i*(bW+2);
    doc.setFillColor(...C.cream); doc.rect(bx, y, bW, 22, 'F');
    doc.setFillColor(...b.color); doc.rect(bx, y, bW, 1.5, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...b.color);
    doc.text(doc.splitTextToSize(b.val, bW-4)[0], bx+bW/2, y+11, { align:'center' });
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...C.gray);
    doc.text(b.label, bx+bW/2, y+18, { align:'center' });
  });
  y += 27;

  // ── BEST DAY ─────────────────────────────────────────────────────────────
  if (report.bestDay) {
    doc.setFillColor(255,250,225);
    doc.rect(M, y, CW, 9, 'F');
    doc.setFillColor(...C.gold); doc.rect(M, y, 3, 9, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...C.dark);
    doc.text(`Mejor dia de ventas: ${report.bestDay.name}  —  ${fmtFull(report.bestDay.amount)}`, M+7, y+6);
    y += 13;
  }

  // ── BAR CHART ────────────────────────────────────────────────────────────
  y = newPage(doc, y, 72);
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...C.gold);
  doc.text('FLUJO DE CAJA', M, y); y += 4;

  const cd = report.chartData;
  if (cd.length > 0) {
    const CH = 46;
    const maxV = Math.max(...cd.map(p => Math.max(p.income, p.exp)), 1);

    // Grid
    doc.setLineWidth(0.2);
    [0,1,2,3,4].forEach(i => {
      const ly = y + CH - (i/4)*CH;
      doc.setDrawColor(220,220,220); doc.line(M+14, ly, M+CW, ly);
      if (i > 0) {
        doc.setFontSize(6); doc.setTextColor(...C.gray);
        doc.text(fmtK((maxV*i)/4), M+13, ly+1, { align:'right' });
      }
    });

    const gW = CW / cd.length;
    const bW2 = Math.max(1.5, Math.min(7, gW*0.38));
    const skip = Math.max(1, Math.ceil(cd.length/10));

    cd.forEach((pt, i) => {
      const bx = M+14 + i*gW + (gW - bW2*2 - 1)/2;
      if (pt.income > 0) {
        const h = (pt.income/maxV)*CH;
        doc.setFillColor(...C.gold); doc.rect(bx, y+CH-h, bW2, h, 'F');
      }
      if (pt.exp > 0) {
        const h = (pt.exp/maxV)*CH;
        doc.setFillColor(...C.red); doc.rect(bx+bW2+1, y+CH-h, bW2, h, 'F');
      }
      if (i % skip === 0) {
        doc.setFontSize(6); doc.setTextColor(...C.gray);
        doc.text(pt.name.slice(0,4), bx+bW2, y+CH+4, { align:'center' });
      }
    });

    // Legend
    doc.setFillColor(...C.gold); doc.rect(M+14, y+CH+9, 5, 3, 'F');
    doc.setFontSize(7); doc.setTextColor(...C.light); doc.text('Ingresos', M+21, y+CH+11.5);
    doc.setFillColor(...C.red); doc.rect(M+46, y+CH+9, 5, 3, 'F');
    doc.text('Gastos', M+53, y+CH+11.5);
    y += CH + 19;
  }

  // ── EXPENSE DISTRIBUTION ──────────────────────────────────────────────────
  if (report.pieData.length > 0) {
    y = newPage(doc, y, 38);
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...C.gold);
    doc.text('DISTRIBUCION DE GASTOS', M, y); y += 4;

    let xc = M;
    report.pieData.forEach(sl => {
      const w = (sl.value/100)*CW;
      doc.setFillColor(...hexToRgb(sl.color)); doc.rect(xc, y, Math.max(w,0.5), 9, 'F');
      xc += w;
    });
    y += 12;

    let lx = M, ly = y;
    report.pieData.forEach((sl, i) => {
      if (i > 0 && i % 3 === 0) { lx = M; ly += 6; }
      else if (i > 0) lx += 58;
      doc.setFillColor(...hexToRgb(sl.color)); doc.rect(lx, ly, 3, 3, 'F');
      doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...C.light);
      doc.text(`${sl.name} (${sl.value}%)`, lx+5, ly+2.5);
    });
    y = ly + 10;
  }

  // ── PAGE 2: TABLES ────────────────────────────────────────────────────────
  if (fSales.length > 0 || fExpenses.length > 0) {
    doc.addPage(); y = 22;
    doc.setFillColor(...C.dark); doc.rect(0,0,W,16,'F');
    doc.setFillColor(...C.gold); doc.rect(0,16,W,1.5,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...C.white);
    doc.text('Detalle de Movimientos', M, 11);

    const drawTable = (
      title: string,
      rows: { dateStr:string; label:string; amount:number; pos:boolean }[],
    ) => {
      y = newPage(doc, y, 22);
      doc.setFillColor(...C.cream); doc.rect(M,y,CW,7.5,'F');
      doc.setFillColor(...C.gold); doc.rect(M,y,3,7.5,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...C.dark);
      doc.text(title, M+7, y+5.5); y += 9.5;

      doc.setFillColor(210,210,210); doc.rect(M,y,CW,5,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...C.gray);
      doc.text('FECHA', M+2, y+3.5);
      doc.text('DESCRIPCION', M+28, y+3.5);
      doc.text('MONTO', M+CW-2, y+3.5, { align:'right' });
      y += 5;

      rows.slice(0,30).forEach((row,i) => {
        y = newPage(doc, y, 6.5);
        if (i%2===0) { doc.setFillColor(...C.alt); doc.rect(M,y,CW,5.5,'F'); }
        doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...C.dark);
        doc.text(row.dateStr, M+2, y+3.8);
        doc.text(doc.splitTextToSize(row.label, 112)[0], M+28, y+3.8);
        doc.setTextColor(...(row.pos ? C.green : C.red));
        doc.text((row.pos?'+':'-')+fmtFull(row.amount), M+CW-2, y+3.8, { align:'right' });
        y += 5.5;
      });
      if (rows.length > 30) {
        doc.setFont('helvetica','italic'); doc.setFontSize(7); doc.setTextColor(...C.gray);
        doc.text(`... y ${rows.length-30} registros mas`, M+2, y+4); y += 7;
      }
      y += 5;
    };

    if (fSales.length > 0) drawTable('VENTAS / INGRESOS', fSales.map(s => ({
      dateStr: s.createdAt?.toDate ? s.createdAt.toDate().toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'2-digit'}) : '—',
      label: getSaleLabel(s), amount: s.total, pos: true,
    })));

    if (fExpenses.length > 0) drawTable('GASTOS', fExpenses.map(e => ({
      dateStr: e.createdAt?.toDate ? e.createdAt.toDate().toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'2-digit'}) : '—',
      label: e.concept, amount: e.amount, pos: false,
    })));
  }

  // ── PAGE 3: AI ────────────────────────────────────────────────────────────
  doc.addPage(); y = 22;
  doc.setFillColor(...C.dark); doc.rect(0,0,W,16,'F');
  doc.setFillColor(...C.gold); doc.rect(0,16,W,1.5,'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(...C.white);
  doc.text('Analisis con Inteligencia Artificial', M, 11);

  const sect = (title:string) => {
    y = newPage(doc, y, 14);
    doc.setFillColor(...C.cream); doc.rect(M,y,CW,7,'F');
    doc.setFillColor(...C.gold); doc.rect(M,y,3,7,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...C.dark);
    doc.text(title, M+7, y+4.8); y += 10;
  };
  const item = (titulo:string, texto:string, dotColor:[number,number,number]) => {
    y = newPage(doc, y, 12);
    doc.setFillColor(...dotColor); doc.circle(M+3, y+3, 1.4, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.setTextColor(...C.dark);
    doc.text(titulo, M+7, y+3.8);
    const lines = doc.splitTextToSize(texto, CW-8);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...C.light);
    doc.text(lines, M+7, y+8.5);
    y += 8 + lines.length*4.5 + 3;
  };

  if (report.descripcion) {
    sect('DESCRIPCION DEL NEGOCIO');
    const lines = doc.splitTextToSize(report.descripcion, CW-4);
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...C.light);
    doc.text(lines, M+2, y); y += lines.length*4.5 + 6;
  }
  if (report.insights.length > 0) {
    sect('ANALISIS CLAVE');
    report.insights.forEach(ins => item(ins.titulo, ins.texto, C.gold));
    y += 2;
  }
  if (report.recomendaciones.length > 0) {
    sect('RECOMENDACIONES');
    report.recomendaciones.forEach(rec => item(rec.titulo, rec.texto, [59,130,246]));
    y += 2;
  }
  if (report.conclusion) {
    y = newPage(doc, y, 22);
    doc.setFillColor(255,250,225); doc.rect(M,y,CW,18,'F');
    doc.setFillColor(...C.gold); doc.rect(M,y,3,18,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...C.gold);
    doc.text('CONCLUSION', M+7, y+6);
    const cl = doc.splitTextToSize(`"${report.conclusion}"`, CW-10);
    doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(...C.dark);
    doc.text(cl, M+7, y+13);
    y += 22;
  }

  // Footer on all pages
  const total = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setFillColor(...C.dark); doc.rect(0,289,W,8,'F');
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(110,110,110);
    doc.text('Generado por Voz Activa  ·  vozactiva.app', M, 294);
    doc.text(`Pagina ${p} de ${total}`, W-M, 294, { align:'right' });
  }

  doc.save(`reporte-${period??'mes'}-${new Date().toISOString().slice(0,10)}.pdf`);
}

// ── Component ─────────────────────────────────────────────────────────────────
export const ReportView: React.FC<Props> = ({ isDarkMode, sales, expenses, userName }) => {
  const [period, setPeriod]           = useState<ReportPeriod>('7d');
  const [loading, setLoading]         = useState(false);
  const [agentStep, setAgentStep]     = useState<string>('');
  const [error, setError]             = useState<string | null>(null);
  const [generated, setGenerated]     = useState(false);
  const [showPeriodMenu, setMenu]     = useState(false);
  const [notifInterval, setNotif]     = useState<NotifInterval | null>(getNotifInterval);
  const [notifGranted, setGranted]    = useState(
    typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false,
  );
  const [showNotifPanel, setNPanel]   = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const compat = checkPeriodCompatibility(sales, expenses, period);

  const due = notifInterval
    ? isDue(NOTIF_OPTIONS.find(o => o.value === notifInterval)?.days ?? 7)
    : false;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const muted = isDarkMode ? 'text-white/40' : 'text-[#5b5c5a]/60';
  const txt   = isDarkMode ? 'text-white'    : 'text-[#2e2f2d]';
  const card  = isDarkMode ? 'bg-[#1A1A1A] shadow-none' : 'bg-white shadow-sm';

  async function requestNotif() {
    if (!('Notification' in window)) return;
    const p = await Notification.requestPermission();
    setGranted(p === 'granted');
  }

  async function handleGenerate() {
    if (!compat.ok || loading) return;
    setLoading(true);
    setAgentStep('');
    setError(null);
    setGenerated(false);
    try {
      const { sales: fS, expenses: fE } = filterByPeriod(sales, expenses, period);
      const report = await generateFinancialReport(sales, expenses, period, userName, setAgentStep);
      exportToPDF(report, fS, fE, userName, period);
      setGenerated(true);
      saveLastReport(period);
      if (notifGranted && notifInterval) {
        new Notification('Reporte descargado — Voz Activa', {
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
    <div className="space-y-3 pb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#B8860B]/15 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4.5 h-4.5 text-[#B8860B]" style={{ width:18, height:18 }} />
          </div>
          <div>
            <h2 className={cn('font-black text-lg leading-tight', txt)}>Reporte Financiero</h2>
            <p className={cn('text-[11px]', muted)}>Análisis IA · Descarga en PDF</p>
          </div>
        </div>

        {/* Bell */}
        <div className="relative">
          <button
            onClick={() => setNPanel(v => !v)}
            className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center relative',
              notifInterval ? 'bg-[#B8860B]/15 text-[#B8860B]'
                : isDarkMode ? 'bg-white/5 text-white/40' : 'bg-gray-100 text-gray-400',
            )}
          >
            {notifInterval ? <Bell className="w-4.5 h-4.5" style={{width:18,height:18}} /> : <BellOff className="w-4.5 h-4.5" style={{width:18,height:18}} />}
            {due && notifInterval && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />}
          </button>
          {showNotifPanel && (
            <div className={cn(
              'absolute right-0 top-11 w-52 rounded-2xl shadow-2xl border z-50 overflow-hidden',
              isDarkMode ? 'bg-[#1A1A1A] border-white/10' : 'bg-white border-gray-200',
            )}>
              <div className="h-1 bg-gradient-to-r from-[#B8860B] to-[#FFD700]" />
              <div className="p-3 space-y-1">
                <p className={cn('text-[10px] font-black uppercase tracking-widest mb-2', muted)}>Recordatorio</p>
                {NOTIF_OPTIONS.map(o => (
                  <button key={o.value}
                    onClick={() => { setNotifIntervalLS(o.value); setNotif(o.value); if (!notifGranted) requestNotif(); setNPanel(false); }}
                    className={cn('w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all',
                      notifInterval === o.value ? 'bg-[#B8860B]/15 text-[#B8860B]'
                        : isDarkMode ? 'hover:bg-white/5 text-white/70' : 'hover:bg-gray-50 text-[#2e2f2d]')}
                  >
                    {o.label}{notifInterval === o.value && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
                {notifInterval && (
                  <button onClick={() => { setNotifIntervalLS(null); setNotif(null); setNPanel(false); }}
                    className="w-full text-xs text-red-400 font-semibold py-1">
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
        <div className="rounded-xl p-3 bg-[#B8860B]/10 border border-[#B8860B]/25 flex items-center gap-2.5">
          <Bell className="w-4 h-4 text-[#B8860B] flex-shrink-0" />
          <p className={cn('text-xs font-semibold', txt)}>Es momento de generar tu reporte.</p>
        </div>
      )}

      {/* Main card */}
      <div className={cn('rounded-2xl p-4 space-y-3', card)}>
        <p className={cn('text-[10px] font-black uppercase tracking-widest', muted)}>Período a analizar</p>

        {/* Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenu(v => !v)}
            className={cn(
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-sm font-semibold',
              showPeriodMenu
                ? 'border-[#B8860B] bg-[#B8860B]/5'
                : isDarkMode ? 'border-white/15 bg-white/5' : 'border-gray-200 bg-gray-50',
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#B8860B] flex-shrink-0" />
              <div className="text-left leading-tight">
                <span className={cn('block font-bold', txt)}>{PERIOD_CONFIG[period].label}</span>
                <span className={cn('block text-[10px] font-normal', muted)}>{PERIOD_CONFIG[period].sub}</span>
              </div>
            </div>
            <ChevronDown className={cn('w-4 h-4 transition-transform flex-shrink-0', showPeriodMenu ? 'rotate-180 text-[#B8860B]' : muted)} />
          </button>

          {showPeriodMenu && (
            <div className={cn(
              'absolute left-0 right-0 top-full mt-1 rounded-2xl shadow-xl border z-50 overflow-hidden',
              isDarkMode ? 'bg-[#1A1A1A] border-white/10' : 'bg-white border-gray-200',
            )}>
              {(Object.entries(PERIOD_CONFIG) as [ReportPeriod, (typeof PERIOD_CONFIG)[ReportPeriod]][]).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => { setPeriod(key); setError(null); setGenerated(false); setMenu(false); }}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-2.5 text-sm transition-all',
                    period === key
                      ? 'bg-[#B8860B]/10 text-[#B8860B] font-bold'
                      : isDarkMode ? 'text-white/70 hover:bg-white/5 font-medium' : 'text-[#2e2f2d] hover:bg-gray-50 font-medium',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', period===key ? 'bg-[#B8860B]' : isDarkMode ? 'bg-white/20' : 'bg-gray-300')} />
                    <div className="text-left">
                      <span className="block leading-tight">{cfg.label}</span>
                      <span className={cn('block text-[10px] font-normal leading-tight', period===key ? 'text-[#B8860B]/70' : muted)}>{cfg.sub}</span>
                    </div>
                  </div>
                  {period === key && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Compatibility warning */}
        {!compat.ok && (
          <div className={cn(
            'rounded-xl p-3 border flex items-start gap-2.5',
            isDarkMode ? 'bg-amber-900/20 border-amber-500/30' : 'bg-amber-50 border-amber-200',
          )}>
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-600">
                {compat.daysCovered < 1
                  ? 'Aún no tienes registros.'
                  : `Llevas ${Math.round(compat.daysCovered)} día${Math.round(compat.daysCovered)!==1?'s':''} de datos.`}
              </p>
              {compat.bestMatch !== period ? (
                <p className={cn('text-xs mt-0.5', isDarkMode ? 'text-amber-300/70' : 'text-amber-700')}>
                  Te recomendamos{' '}
                  <button
                    onClick={() => { setPeriod(compat.bestMatch); setError(null); setGenerated(false); }}
                    className="font-bold underline"
                  >
                    "{PERIOD_CONFIG[compat.bestMatch].label}"
                  </button>{' '}
                  que sí encaja con tus datos.
                </p>
              ) : (
                <p className={cn('text-xs mt-0.5', isDarkMode ? 'text-amber-300/70' : 'text-amber-700')}>
                  Registra ventas o gastos para generar tu primer reporte.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={loading || !compat.ok}
          className="w-full py-3.5 rounded-xl font-black text-sm text-black bg-gradient-to-r from-[#B8860B] to-[#FFD700] active:scale-[0.98] transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /><span className="truncate">{agentStep || 'Iniciando...'}</span></>
            : <><Download className="w-4 h-4" /> Generar y descargar PDF</>}
        </button>

        <div className="flex items-center justify-center gap-1.5">
          <Lock className="w-3 h-3 text-[#5b5c5a]/40" />
          <p className={cn('text-[10px]', muted)}>Tu información está protegida y es 100% confidencial.</p>
        </div>
      </div>

      {/* Success */}
      {generated && !loading && (
        <div className="rounded-xl p-3 bg-green-500/10 border border-green-500/20 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
          <div>
            <p className={cn('text-xs font-bold text-green-600')}>¡PDF descargado correctamente!</p>
            <p className={cn('text-[11px]', muted)}>Revisa la carpeta de descargas de tu dispositivo.</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-500">No se pudo generar el reporte</p>
            <p className="text-[11px] text-red-400 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Backdrop */}
      {(showNotifPanel || showPeriodMenu) && (
        <div className="fixed inset-0 z-40" onClick={() => { setNPanel(false); setMenu(false); }} />
      )}
    </div>
  );
};
