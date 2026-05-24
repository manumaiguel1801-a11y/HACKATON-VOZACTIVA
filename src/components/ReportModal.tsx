import React, { useState } from 'react';
import {
  X, FileText, Download, Loader2, TrendingUp, DollarSign,
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
  onClose: () => void;
}

const PERIOD_OPTIONS: { value: ReportPeriod; label: string; sub: string }[] = [
  { value: 'semanal', label: 'Semanal',  sub: 'Últimos 7 días' },
  { value: 'mensual', label: 'Mensual',  sub: 'Este mes' },
];

const SECTION_ICONS: Record<string, React.ElementType> = {
  'Descripción del negocio': BookOpen,
  'Resumen financiero':      DollarSign,
  'Análisis inteligente':    BarChart2,
  'Recomendaciones':         Target,
  'Conclusión':              TrendingUp,
};

function SectionIcon({ title }: { title: string }) {
  const Icon = SECTION_ICONS[title] ?? FileText;
  return <Icon className="w-4 h-4" />;
}

function renderContent(content: string, isDarkMode: boolean) {
  const lines = content.split('\n').filter(l => l.trim());
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <div key={i} className="flex gap-2">
              <span className="text-[#B8860B] font-black mt-0.5 flex-shrink-0">·</span>
              <span className={cn('text-sm leading-relaxed', isDarkMode ? 'text-white/80' : 'text-[#2e2f2d]')}>
                {trimmed.replace(/^[-•]\s*/, '')}
              </span>
            </div>
          );
        }
        return (
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
    green: [22,  163, 74]  as [number, number, number],
  };

  // Header background
  doc.setFillColor(...C.dark);
  doc.rect(0, 0, W, 45, 'F');

  // Gold accent line
  doc.setFillColor(...C.gold);
  doc.rect(0, 45, W, 2, 'F');

  // Title
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
    // Section header
    doc.setFillColor(...C.cream);
    doc.roundedRect(margin, y, contentW, 8, 2, 2, 'F');
    doc.setFillColor(...C.gold);
    doc.roundedRect(margin, y, 3, 8, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...C.dark);
    doc.text(`${section.emoji}  ${section.title.toUpperCase()}`, margin + 7, y + 5.5);
    y += 13;

    // Content
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C.gray);

    const lines = section.content.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('• ');
      const text = isBullet ? trimmed.replace(/^[-•]\s*/, '') : trimmed;
      const prefix = isBullet ? '  •  ' : '  ';

      const wrapped = doc.splitTextToSize(prefix + text, contentW - 4);
      if (y + wrapped.length * 5 > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setTextColor(...(isBullet ? C.dark : C.gray));
      doc.text(wrapped, margin + 2, y);
      y += wrapped.length * 5 + 1;
    }
    y += 6;

    if (y > 270) { doc.addPage(); y = 20; }
  }

  // Footer
  doc.setFillColor(...C.dark);
  doc.rect(0, 287, W, 10, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...([150, 150, 150] as [number, number, number]));
  doc.text('Generado por Voz Activa  ·  vozactiva.app', margin, 293);

  const filename = `reporte-${period ?? 'mensual'}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

export const ReportModal: React.FC<Props> = ({ isDarkMode, sales, expenses, userName, onClose }) => {
  const [period, setPeriod] = useState<ReportPeriod>('mensual');
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bg = isDarkMode ? 'bg-[#0D0D0D]' : 'bg-[#FDFBF0]';
  const card = isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white';
  const border = isDarkMode ? 'border-white/10' : 'border-gray-200';
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
    <div className="fixed inset-0 z-[300] flex flex-col">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className={cn(
        'relative z-10 flex flex-col w-full h-full md:m-auto md:h-auto md:max-h-[90vh] md:max-w-2xl md:rounded-3xl shadow-2xl overflow-hidden',
        bg,
      )}>
        {/* Gold top bar */}
        <div className="h-1 w-full bg-gradient-to-r from-[#B8860B] to-[#FFD700] flex-shrink-0" />

        {/* Header */}
        <div className={cn('flex items-center justify-between px-6 py-4 border-b flex-shrink-0', border)}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#B8860B]/15 flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#B8860B]" />
            </div>
            <div>
              <h2 className={cn('font-black text-base', isDarkMode ? 'text-white' : 'text-[#2e2f2d]')}>
                Reporte Financiero IA
              </h2>
              <p className={cn('text-xs', muted)}>Análisis generado por inteligencia artificial</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-colors', isDarkMode ? 'hover:bg-white/10 text-white/60' : 'hover:bg-black/5 text-black/40')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Period selector */}
          <div className="space-y-2">
            <p className={cn('text-xs font-bold uppercase tracking-widest', muted)}>Período del reporte</p>
            <div className="grid grid-cols-2 gap-3">
              {PERIOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setPeriod(opt.value); setReport(null); setError(null); }}
                  className={cn(
                    'flex flex-col items-center gap-1 px-4 py-3 rounded-2xl border-2 transition-all duration-200 font-bold text-sm',
                    period === opt.value
                      ? 'border-[#B8860B] bg-[#B8860B]/10 text-[#B8860B]'
                      : isDarkMode
                        ? 'border-white/10 text-white/50 hover:border-white/20'
                        : 'border-gray-200 text-[#5b5c5a] hover:border-gray-300',
                  )}
                >
                  <span>{opt.label}</span>
                  <span className={cn('text-[10px] font-normal', period === opt.value ? 'text-[#B8860B]/70' : muted)}>{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          {!report && !loading && (
            <button
              onClick={handleGenerate}
              className="w-full py-4 rounded-2xl font-black text-sm text-black bg-gradient-to-r from-[#B8860B] to-[#FFD700] active:scale-[0.98] transition-all duration-200 shadow-lg"
            >
              Generar reporte
            </button>
          )}

          {/* Loading */}
          {loading && (
            <div className={cn('rounded-2xl p-8 flex flex-col items-center gap-4 text-center', card)}>
              <div className="w-14 h-14 rounded-full bg-[#B8860B]/15 flex items-center justify-center">
                <Loader2 className="w-7 h-7 text-[#B8860B] animate-spin" />
              </div>
              <div>
                <p className={cn('font-bold text-sm', isDarkMode ? 'text-white' : 'text-[#2e2f2d]')}>
                  Analizando tu negocio...
                </p>
                <p className={cn('text-xs mt-1', muted)}>Esto puede tardar unos segundos</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-2xl p-4 bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-500">Error al generar</p>
                <p className="text-xs text-red-400 mt-0.5">{error}</p>
                <button onClick={handleGenerate} className="text-xs font-bold text-red-500 mt-2 underline">
                  Intentar de nuevo
                </button>
              </div>
            </div>
          )}

          {/* Report sections */}
          {report && (
            <div className="space-y-3">
              {report.sections.map((section) => (
                <div key={section.title} className={cn('rounded-2xl p-5', card)}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-[#B8860B]/15 flex items-center justify-center text-[#B8860B]">
                      <SectionIcon title={section.title} />
                    </div>
                    <h3 className={cn('font-black text-sm', isDarkMode ? 'text-white' : 'text-[#2e2f2d]')}>
                      {section.emoji} {section.title}
                    </h3>
                  </div>
                  {renderContent(section.content, isDarkMode)}
                </div>
              ))}

              {/* Re-generate */}
              <button
                onClick={handleGenerate}
                className={cn('w-full py-3 rounded-2xl text-sm font-bold border-2 transition-all', isDarkMode ? 'border-white/10 text-white/50 hover:border-white/20' : 'border-gray-200 text-[#5b5c5a] hover:border-gray-300')}
              >
                Regenerar reporte
              </button>
            </div>
          )}
        </div>

        {/* Footer — download button */}
        {report && (
          <div className={cn('px-6 py-4 border-t flex-shrink-0', border)}>
            <button
              onClick={() => exportToPDF(report, userName, period)}
              className="w-full py-4 rounded-2xl font-black text-sm text-black bg-gradient-to-r from-[#B8860B] to-[#FFD700] flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-200 shadow-lg"
            >
              <Download className="w-4 h-4" />
              Descargar PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
