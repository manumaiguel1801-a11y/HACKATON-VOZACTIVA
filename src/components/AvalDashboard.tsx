import React, { useState, useRef } from 'react';
import {
  ShieldCheck, ChevronLeft, FileText, Upload, CheckCircle2,
  Lock, BarChart3, Building2, ChevronRight, X,
  FileCheck, AlertCircle, Sparkles, QrCode, Loader2,
  TrendingUp, TrendingDown, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { analyzeExtracto, ExtractoAnalysis } from '../services/extractoService';
import { Sale } from '../types';

interface Props {
  isDarkMode: boolean;
  cedula: string;
  userName?: string;
  sales: Sale[];
  onBack: () => void;
}

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  status: 'analizando' | 'analizado' | 'error';
  analysis?: ExtractoAnalysis;
  errorMsg?: string;
}

const FEATURE_CARDS = [
  { id: 'certificado', icon: FileText,  title: 'Mi certificado',     desc: 'PDF crediticio con QR verificable',             color: 'text-[#B8860B]',  bg: 'bg-[#B8860B]/10' },
  { id: 'historial',  icon: BarChart3,  title: 'Historial verificado',desc: 'Ventas y gastos con sello de autenticidad',     color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { id: 'bancos',     icon: Building2,  title: 'Conectar con bancos', desc: 'Comparte tu perfil con entidades financieras',  color: 'text-blue-500',   bg: 'bg-blue-500/10' },
  { id: 'qr',         icon: QrCode,     title: 'Mi QR de verificación',desc: 'Código único que valida tu identidad',         color: 'text-green-500',  bg: 'bg-green-500/10' },
];

function formatCOP(n: number): string {
  return '$' + n.toLocaleString('es-CO');
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const ENTIDAD_LABEL: Record<string, string> = {
  nequi: 'Nequi', daviplata: 'Daviplata',
  davivienda: 'Davivienda', bancolombia: 'Bancolombia',
};

const TIPO_LABEL: Record<string, string> = {
  cobro_qr:              '🟢 Cobro QR',
  transferencia_recibida:'🟡 Transferencia recibida',
  transferencia_enviada: '🔴 Enviado',
  retiro:                '🔴 Retiro',
  pago_servicio:         '🟠 Pago servicio',
  otro:                  '⚪ Otro',
};

function NivelBadge({ nivel, isDarkMode }: { nivel: 'alto'|'medio'|'bajo'; isDarkMode: boolean }) {
  const map = {
    alto:  { label: 'Confianza ALTA',  cls: 'bg-green-500/15 text-green-600' },
    medio: { label: 'Confianza MEDIA', cls: 'bg-yellow-500/15 text-yellow-600' },
    bajo:  { label: 'Confianza BAJA',  cls: 'bg-red-500/15 text-red-500' },
  };
  const { label, cls } = map[nivel];
  return (
    <span className={cn('text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full', cls)}>
      {label}
    </span>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs font-black w-8 text-right">{value}%</span>
    </div>
  );
}

function AnalysisCard({ analysis, isDarkMode, text, muted }: {
  analysis: ExtractoAnalysis;
  isDarkMode: boolean;
  text: string;
  muted: string;
}) {
  const [showTransactions, setShowTransactions] = useState(false);
  const ventasLabel   = ENTIDAD_LABEL[analysis.entidad] ?? 'Extracto';
  const ingresosVenta = analysis.transactions.filter(t => t.esVentaProbable);
  const ingresosNoVenta = analysis.transactions.filter(t =>
    ['cobro_qr','transferencia_recibida','otro'].includes(t.tipo) && !t.esVentaProbable
  );

  return (
    <div className={cn('rounded-xl p-4 space-y-4', isDarkMode ? 'bg-[#0D0D0D]' : 'bg-[#FDFBF0]')}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className={cn('text-xs font-black uppercase tracking-widest text-[#B8860B]')}>{ventasLabel}</p>
          <p className={cn('text-sm font-black mt-0.5', text)}>Análisis completado</p>
        </div>
        <NivelBadge nivel={analysis.nivel} isDarkMode={isDarkMode} />
      </div>

      {/* Totals */}
      <div className={cn('rounded-xl p-3 space-y-2.5', isDarkMode ? 'bg-white/5' : 'bg-white')}>
        <div className="flex justify-between items-center">
          <span className={cn('text-xs', muted)}>Ingresos totales</span>
          <span className={cn('text-sm font-black', text)}>{formatCOP(analysis.totalIngresos)}</span>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs font-bold text-green-600 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />Ventas identificadas
            </span>
            <span className="text-sm font-black text-green-600">{formatCOP(analysis.ingresosVentas)}</span>
          </div>
          <ScoreBar value={analysis.porcentajeVentas} color="bg-green-500" />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <span className={cn('text-xs font-bold flex items-center gap-1', muted)}>
              <TrendingDown className="w-3 h-3" />Transferencias / otros
            </span>
            <span className={cn('text-sm font-black', muted)}>{formatCOP(analysis.ingresosTransferencias)}</span>
          </div>
          <ScoreBar value={100 - analysis.porcentajeVentas} color="bg-black/20" />
        </div>
      </div>

      {/* Consistency */}
      <div className={cn('rounded-xl p-3', isDarkMode ? 'bg-white/5' : 'bg-white')}>
        <div className="flex justify-between items-center mb-1.5">
          <span className={cn('text-xs font-bold', text)}>Cruce con Voz-Activa</span>
          <span className={cn('text-xs font-black', analysis.consistenciaConApp >= 60 ? 'text-green-600' : analysis.consistenciaConApp >= 40 ? 'text-yellow-600' : 'text-red-500')}>
            {analysis.consistenciaConApp}%
          </span>
        </div>
        <ScoreBar
          value={analysis.consistenciaConApp}
          color={analysis.consistenciaConApp >= 60 ? 'bg-[#B8860B]' : analysis.consistenciaConApp >= 40 ? 'bg-yellow-500' : 'bg-red-400'}
        />
        <p className={cn('text-[10px] mt-2 leading-snug', muted)}>
          Días donde tus ingresos del extracto coinciden con tus ventas registradas en la app
        </p>
      </div>

      {/* Transactions toggle */}
      {analysis.transactions.length > 0 && (
        <div>
          <button
            onClick={() => setShowTransactions(v => !v)}
            className={cn('w-full flex items-center justify-between text-xs font-bold py-1.5', muted)}
          >
            <span>{analysis.transactions.length} transacciones detectadas</span>
            {showTransactions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showTransactions && (
            <div className="space-y-1.5 mt-2 max-h-52 overflow-y-auto">
              {analysis.transactions.slice(0, 30).map((t, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-start justify-between gap-2 p-2 rounded-lg text-xs',
                    isDarkMode ? 'bg-white/5' : 'bg-black/3',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className={cn('font-bold truncate', text)}>{t.descripcion}</p>
                    <p className={cn('text-[10px]', muted)}>{t.fecha} · {TIPO_LABEL[t.tipo] ?? t.tipo}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={cn('font-black', t.esVentaProbable ? 'text-green-600' : muted)}>
                      {formatCOP(t.monto)}
                    </p>
                    {t.esVentaProbable && (
                      <p className="text-[9px] text-green-600 font-black uppercase">venta</p>
                    )}
                  </div>
                </div>
              ))}
              {analysis.transactions.length > 30 && (
                <p className={cn('text-[10px] text-center py-1', muted)}>
                  +{analysis.transactions.length - 30} transacciones más
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const AvalDashboard = ({ isDarkMode, cedula, userName, sales, onBack }: Props) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging]       = useState(false);
  const [showExtractos, setShowExtractos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const card  = cn('rounded-2xl p-5', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white');
  const muted = isDarkMode ? 'text-white/40' : 'text-black/40';
  const text  = isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]';

  const maskedCedula = cedula.length > 4 ? '••••••' + cedula.slice(-4) : cedula;

  const completedAnalyses = uploadedFiles
    .filter(f => f.status === 'analizado' && f.analysis)
    .map(f => f.analysis!);

  const processFile = async (file: File, id: string) => {
    try {
      const analysis = await analyzeExtracto(file, sales);
      setUploadedFiles(prev => prev.map(f =>
        f.id === id ? { ...f, status: 'analizado', analysis } : f
      ));
    } catch (err: any) {
      setUploadedFiles(prev => prev.map(f =>
        f.id === id ? { ...f, status: 'error', errorMsg: err.message } : f
      ));
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const id = Math.random().toString(36).slice(2);
      const entry: UploadedFile = {
        id,
        name: file.name,
        size: formatBytes(file.size),
        status: 'analizando',
      };
      setUploadedFiles(prev => [...prev, entry]);
      processFile(file, id);
    });
  };

  const removeFile = (id: string) => setUploadedFiles(prev => prev.filter(f => f.id !== id));

  return (
    <div className="space-y-5 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Back */}
      <button
        onClick={onBack}
        className={cn('flex items-center gap-1.5 text-xs font-bold transition-colors', isDarkMode ? 'text-white/40 hover:text-white/70' : 'text-black/40 hover:text-black/70')}
      >
        <ChevronLeft className="w-4 h-4" />
        Salir del panel
      </button>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className={cn('relative overflow-hidden rounded-2xl px-6 py-6', isDarkMode ? 'bg-[#1A1A00]' : 'bg-gradient-to-br from-[#FFF8DC] to-[#FFF0A0]')}>
        <div className="absolute -right-6 -top-6 w-36 h-36 rounded-full bg-[#B8860B]/10" />
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#B8860B] mb-1">Mi Aval</p>
              <h2 className="font-['Plus_Jakarta_Sans'] font-black text-xl leading-tight" style={{ color: '#2e2f2d' }}>
                {userName ? `Hola, ${userName}` : 'Bienvenido'}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: '#5b5c5a' }}>Panel de verificación crediticia</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#B8860B] to-[#FFD700] flex items-center justify-center text-black shadow-md flex-shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4 bg-white/60 rounded-xl px-3 py-2 w-fit">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-green-700">Identidad confirmada</p>
              <p className="text-xs font-bold text-[#2e2f2d]">Cédula {maskedCedula}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Extractos ─────────────────────────────────────────────────────── */}
      <div className={cn(card, 'space-y-4')}>
        <button
          onClick={() => setShowExtractos(v => !v)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', isDarkMode ? 'bg-[#B8860B]/15' : 'bg-[#FFF8DC]')}>
              <FileCheck className="w-5 h-5 text-[#B8860B]" />
            </div>
            <div className="text-left">
              <p className={cn('font-black text-sm', text)}>Extractos bancarios</p>
              <p className={cn('text-xs', muted)}>
                {completedAnalyses.length > 0
                  ? `${completedAnalyses.length} analizado${completedAnalyses.length > 1 ? 's' : ''}`
                  : 'Sube tus extractos para verificar ingresos'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {uploadedFiles.length > 0 && (
              <span className="text-[10px] font-black bg-[#B8860B] text-white px-2 py-0.5 rounded-full">
                {uploadedFiles.length}
              </span>
            )}
            <ChevronRight className={cn('w-4 h-4 transition-transform', showExtractos && 'rotate-90', muted)} />
          </div>
        </button>

        {showExtractos && (
          <div className="space-y-3 pt-1">
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer transition-all',
                isDragging
                  ? 'border-[#B8860B] bg-[#B8860B]/10'
                  : isDarkMode
                    ? 'border-white/10 hover:border-[#B8860B]/40 hover:bg-[#B8860B]/5'
                    : 'border-black/10 hover:border-[#B8860B]/40 hover:bg-[#FFF8DC]/50',
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                multiple
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', isDarkMode ? 'bg-white/8' : 'bg-black/5')}>
                <Upload className={cn('w-5 h-5', muted)} />
              </div>
              <div className="text-center">
                <p className={cn('text-sm font-bold', text)}>Arrastra o toca para subir</p>
                <p className={cn('text-xs mt-0.5', muted)}>PDF, JPG o PNG · Nequi, Daviplata, Davivienda…</p>
              </div>
            </div>

            {/* File list */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                {uploadedFiles.map(f => (
                  <div key={f.id} className="space-y-2">
                    {/* File row */}
                    <div className={cn('flex items-center gap-3 p-3 rounded-xl', isDarkMode ? 'bg-white/5' : 'bg-black/3')}>
                      <div className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                        f.status === 'analizado' ? 'bg-green-500/15' : f.status === 'error' ? 'bg-red-500/15' : isDarkMode ? 'bg-white/8' : 'bg-black/5',
                      )}>
                        {f.status === 'analizando'
                          ? <Loader2 className="w-4 h-4 animate-spin text-[#B8860B]" />
                          : f.status === 'analizado'
                            ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                            : <AlertCircle className="w-4 h-4 text-red-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-xs font-bold truncate', text)}>{f.name}</p>
                        <p className={cn('text-[10px]', f.status === 'analizando' ? 'text-[#B8860B]' : f.status === 'analizado' ? 'text-green-500' : 'text-red-400')}>
                          {f.status === 'analizando'
                            ? '⏳ Analizando con IA...'
                            : f.status === 'analizado'
                              ? `✓ Analizado · ${f.size}`
                              : `✗ ${f.errorMsg ?? 'Error al analizar'}`}
                        </p>
                      </div>
                      <button
                        onClick={() => removeFile(f.id)}
                        className={cn('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0', isDarkMode ? 'hover:bg-white/10 text-white/30' : 'hover:bg-black/8 text-black/30')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Analysis result */}
                    {f.status === 'analizado' && f.analysis && (
                      <AnalysisCard
                        analysis={f.analysis}
                        isDarkMode={isDarkMode}
                        text={text}
                        muted={muted}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {uploadedFiles.length === 0 && (
              <p className={cn('text-[11px] text-center', muted)}>
                Sube los extractos de los últimos 3 meses para el análisis más completo.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Próximamente ──────────────────────────────────────────────────── */}
      <div>
        <p className={cn('text-[10px] font-black uppercase tracking-widest px-1 mb-3', muted)}>Próximamente</p>
        <div className="grid grid-cols-2 gap-3">
          {FEATURE_CARDS.map(fc => (
            <div key={fc.id} className={cn('rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', fc.bg)}>
                <fc.icon className={cn('w-4 h-4', fc.color)} />
              </div>
              <div>
                <p className={cn('text-xs font-black', text)}>{fc.title}</p>
                <p className={cn('text-[10px] leading-snug mt-0.5', muted)}>{fc.desc}</p>
              </div>
              <div className="absolute top-3 right-3">
                <span className={cn('text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full', isDarkMode ? 'bg-white/8 text-white/30' : 'bg-black/5 text-black/30')}>
                  Pronto
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={cn('rounded-2xl p-4 flex gap-3', isDarkMode ? 'bg-white/5' : 'bg-black/3')}>
        <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#B8860B]" />
        <p className={cn('text-xs leading-relaxed', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]')}>
          <strong className={isDarkMode ? 'text-white/70' : 'text-[#2e2f2d]'}>¿Sabías?</strong> A mayor historial de ventas registradas, más sólido es tu perfil crediticio.
        </p>
      </div>

      <div className="flex items-center justify-center gap-1.5">
        <Lock className={cn('w-3.5 h-3.5', muted)} />
        <p className={cn('text-[11px] font-medium', muted)}>Información protegida y encriptada</p>
      </div>
    </div>
  );
};
