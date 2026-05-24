import React, { useState } from 'react';
import {
  FileText, Download, Loader2, TrendingUp, DollarSign,
  BarChart2, Target, BookOpen, AlertCircle,
} from 'lucide-react';
import jsPDF from 'jspdf';
import { cn } from '../lib/utils';
import { Sale, Expense } from '../types';
import { generateFinancialReport, ReportPeriod, ParsedReport } from '../services/reportService';

interface Props {
  isDarkMode: boolean;
  sales: Sale[];
  expenses: Expense[];
  userId: string;
  userName?: string;
}

const PERIOD_OPTIONS: { value: ReportPeriod; label: string; sub: string }[] = [
  { value: 'semanal', label: 'Semanal', sub: 'Últimos 7 días' },
  { value: 'mensual', label: 'Mensual', sub: 'Este mes' },
];

const SECTION_ICONS: Record<string, React.ElementType> = {
  'Descripción del negocio': BookOpen,
  'Resumen financiero':      DollarSign,
  'Análisis inteligente':    BarChart2,
  'Recomendaciones':         Target,
  'Conclusión':              TrendingUp,
};

function renderContent(content: string, isDarkMode: boolean) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ');
        return isBullet ? (
          <div key={i} className="flex gap-2">
            <span className="text-[#B8860B] font-black mt-0.5 flex-shrink-0">·</span>
            <span className={cn('text-sm leading-relaxed', isDarkMode ? 'text-white/80' : 'text-[#2e2f2d]')}>
              {trimmed.replace(/^[-•]\s*/, '')}
            </span>
          </div>
        ) : (
          <p key={i} className={cn('text-sm leading-relaxed', isDarkMode ? 'text-white/80' : 'text-[#2e2f2d]')}>
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

function exportToPDF(report: ParsedReport, userName?: string, period?: ReportPeriod) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const margin = 20;
  const contentW = W - margin * 2;
  let y = 0;

  const C = {
    gold:  [184, 134, 11]  as [number, number, number],
    dark:  [26,  26,  26]  as [number, number, number],
    gray:  [91,  92,  90]  as [number, number, number],
    cream: [253, 251, 240] as [number, number, number],
    white: [255, 255, 255] as [number, number, number],
  };

  doc.setFillColor(...C.dark);
  doc.rect(0, 0, W, 45, 'F');
  doc.setFillColor(...C.gold);
  doc.rect(0, 45, W, 2, 'F');

  doc.setTextColor(...C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Reporte Financiero', margin, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...([200, 200, 200] as [number, number, number]));
  const subtitle = [
    userName ? `Negocio de ${userName}` : 'Mi Negocio',
    period === 'semanal' ? 'Últimos 7 días' : 'Este mes',
    new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }),
  ].join('  ·  ');
  doc.text(subtitle, margin, 32);

  y = 58;

  for (const section of report.sections) {
    doc.setFillColor(...C.cream);
    doc.roundedRect(margin, y, contentW, 8, 2, 2, 'F');
    doc.setFillColor(...C.gold);
    doc.roundedRect(margin, y, 3, 8, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.dark);
    doc.text(`${section.emoji}  ${section.title.toUpperCase()}`, margin + 7, y + 5.5);
    y += 13;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);

    const lines = section.content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ');
      const text = isBullet ? trimmed.replace(/^[-•]\s*/, '') : trimmed;
      const wrapped = doc.splitTextToSize((isBullet ? '  •  ' : '  ') + text, contentW - 4);
      if (y + wrapped.length * 5 > 270) { doc.addPage(); y = 20; }
      doc.setTextColor(...(isBullet ? C.dark : C.gray));
      doc.text(wrapped, margin + 2, y);
      y += wrapped.length * 5 + 1;
    }
    y += 6;
    if (y > 270) { doc.addPage(); y = 20; }
  }

  doc.setFillColor(...C.dark);
  doc.rect(0, 287, W, 10, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...([150, 150, 150] as [number, number, number]));
  doc.text('Generado por Voz Activa  ·  vozactiva.app', margin, 293);

  doc.save(`reporte-${period ?? 'mensual'}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export const ReportView: React.FC<Props> = ({ isDarkMode, sales, expenses, userName }) => {
  const [period, setPeriod] = useState<ReportPeriod>('mensual');
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const card = isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white';
  const muted = isDarkMode ? 'text-white/40' : 'text-[#5b5c5a]/60';

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const result = await generateFinancialReport(sales, expenses, period, userName);
      setReport(result);
    } catch (e: any) {
      setError(e.message ?? 'Error al generar el reporte');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#B8860B]/15 flex items-center justify-center">
          <FileText className="w-5 h-5 text-[#B8860B]" />
        </div>
        <div>
          <h2 className={cn('font-black text-xl', isDarkMode ? 'text-white' : 'text-[#2e2f2d]')}>Reporte Financiero</h2>
          <p className={cn('text-xs', muted)}>Análisis generado por inteligencia artificial</p>
        </div>
      </div>

      {/* Period selector */}
      <div className={cn('rounded-2xl p-4 shadow-sm space-y-3', card)}>
        <p className={cn('text-xs font-bold uppercase tracking-widest', muted)}>Período a analizar</p>
        <div className="grid grid-cols-2 gap-3">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setPeriod(opt.value); setReport(null); setError(null); }}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-3 rounded-xl border-2 transition-all duration-200 font-bold text-sm',
                period === opt.value
                  ? 'border-[#B8860B] bg-[#B8860B]/10 text-[#B8860B]'
                  : isDarkMode
                    ? 'border-white/10 text-white/50 hover:border-white/20'
                    : 'border-gray-200 text-[#5b5c5a] hover:border-gray-300',
              )}
            >
              <span>{opt.label}</span>
              <span className={cn('text-[10px] font-normal', period === opt.value ? 'text-[#B8860B]/70' : muted)}>
                {opt.sub}
              </span>
            </button>
          ))}
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full py-4 rounded-xl font-black text-sm text-black bg-gradient-to-r from-[#B8860B] to-[#FFD700] active:scale-[0.98] transition-all duration-200 shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Analizando tu negocio...</>
          ) : (
            <><FileText className="w-4 h-4" /> {report ? 'Regenerar reporte' : 'Generar reporte'}</>
          )}
        </button>
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

      {/* Report sections */}
      {report && (
        <>
          <div className="space-y-3">
            {report.sections.map(section => {
              const Icon = SECTION_ICONS[section.title] ?? FileText;
              return (
                <div key={section.title} className={cn('rounded-2xl p-5 shadow-sm', card)}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-[#B8860B]/15 flex items-center justify-center text-[#B8860B]">
                      <Icon className="w-4 h-4" />
                    </div>
                    <h3 className={cn('font-black text-sm', isDarkMode ? 'text-white' : 'text-[#2e2f2d]')}>
                      {section.emoji} {section.title}
                    </h3>
                  </div>
                  {renderContent(section.content, isDarkMode)}
                </div>
              );
            })}
          </div>

          {/* Download PDF */}
          <button
            onClick={() => exportToPDF(report, userName, period)}
            className="w-full py-4 rounded-2xl font-black text-sm text-black bg-gradient-to-r from-[#B8860B] to-[#FFD700] flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-200 shadow-lg"
          >
            <Download className="w-4 h-4" />
            Descargar PDF
          </button>
        </>
      )}
    </div>
  );
};
