import React, { useState, useRef } from 'react';
import {
  ShieldCheck, ChevronLeft, FileText, Upload, CheckCircle2,
  Clock, Lock, BarChart3, Building2, ChevronRight, X,
  FileCheck, AlertCircle, Sparkles, QrCode,
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Props {
  isDarkMode: boolean;
  cedula: string;
  userName?: string;
  onBack: () => void;
}

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  status: 'verificando' | 'verificado' | 'error';
}

const FEATURE_CARDS = [
  {
    id: 'certificado',
    icon: FileText,
    title: 'Mi certificado',
    desc: 'Genera tu PDF crediticio con QR verificable',
    status: 'soon' as const,
    color: 'text-[#B8860B]',
    bg: 'bg-[#B8860B]/10',
  },
  {
    id: 'historial',
    icon: BarChart3,
    title: 'Historial verificado',
    desc: 'Tus ventas y gastos con sello de autenticidad',
    status: 'soon' as const,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  {
    id: 'bancos',
    icon: Building2,
    title: 'Conectar con bancos',
    desc: 'Comparte tu perfil directamente con entidades financieras',
    status: 'soon' as const,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  {
    id: 'qr',
    icon: QrCode,
    title: 'Mi QR de verificación',
    desc: 'Código único que valida tu identidad ante cualquier entidad',
    status: 'soon' as const,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AvalDashboard = ({ isDarkMode, cedula, userName, onBack }: Props) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showExtractos, setShowExtractos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const card = cn('rounded-2xl p-5', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white');
  const muted = isDarkMode ? 'text-white/40' : 'text-black/40';
  const text  = isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]';

  const maskedCedula = cedula.length > 4
    ? '••••••' + cedula.slice(-4)
    : cedula;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newFiles: UploadedFile[] = Array.from(files).map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      size: formatBytes(f.size),
      status: 'verificando',
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
    // Simulate verification after 2s
    newFiles.forEach((nf) => {
      setTimeout(() => {
        setUploadedFiles(prev =>
          prev.map(f => f.id === nf.id ? { ...f, status: 'verificado' } : f)
        );
      }, 2000 + Math.random() * 1000);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

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

      {/* ── Hero / Status ──────────────────────────────────────────────── */}
      <div className={cn(
        'relative overflow-hidden rounded-2xl px-6 py-6',
        isDarkMode ? 'bg-[#1A1A00]' : 'bg-gradient-to-br from-[#FFF8DC] to-[#FFF0A0]'
      )}>
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

          {/* Identity verified badge */}
          <div className="flex items-center gap-2 mt-4 bg-white/60 rounded-xl px-3 py-2 w-fit">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-green-700">Identidad confirmada</p>
              <p className="text-xs font-bold text-[#2e2f2d]">Cédula {maskedCedula}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Extractos bancarios (activo) ──────────────────────────────── */}
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
              <p className={cn('text-xs', muted)}>Sube tus extractos para verificar ingresos</p>
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
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-all',
                isDragging
                  ? 'border-[#B8860B] bg-[#B8860B]/10'
                  : isDarkMode
                    ? 'border-white/10 hover:border-[#B8860B]/40 hover:bg-[#B8860B]/5'
                    : 'border-black/10 hover:border-[#B8860B]/40 hover:bg-[#FFF8DC]/50'
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
                <p className={cn('text-xs mt-0.5', muted)}>PDF, JPG o PNG · Máx. 10 MB</p>
              </div>
            </div>

            {/* File list */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                {uploadedFiles.map((f) => (
                  <div
                    key={f.id}
                    className={cn('flex items-center gap-3 p-3 rounded-xl', isDarkMode ? 'bg-white/5' : 'bg-black/3')}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      f.status === 'verificado' ? 'bg-green-500/15' : f.status === 'error' ? 'bg-red-500/15' : isDarkMode ? 'bg-white/8' : 'bg-black/5'
                    )}>
                      {f.status === 'verificado'
                        ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                        : f.status === 'error'
                          ? <AlertCircle className="w-4 h-4 text-red-400" />
                          : <FileText className={cn('w-4 h-4', muted)} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-bold truncate', text)}>{f.name}</p>
                      <div className="flex items-center gap-2">
                        <p className={cn('text-[10px]', muted)}>{f.size}</p>
                        <span className={cn(
                          'text-[9px] font-black uppercase tracking-wide',
                          f.status === 'verificado' ? 'text-green-500' : f.status === 'error' ? 'text-red-400' : 'text-[#B8860B]'
                        )}>
                          {f.status === 'verificando' ? '⏳ Verificando...' : f.status === 'verificado' ? '✓ Verificado' : '✗ Error'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFile(f.id)}
                      className={cn('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors', isDarkMode ? 'hover:bg-white/10 text-white/30' : 'hover:bg-black/8 text-black/30')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {uploadedFiles.length === 0 && (
              <p className={cn('text-[11px] text-center', muted)}>
                Los extractos de los últimos 3 meses son suficientes para el análisis.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Otras funcionalidades ─────────────────────────────────────── */}
      <div>
        <p className={cn('text-[10px] font-black uppercase tracking-widest px-1 mb-3', muted)}>Próximamente</p>
        <div className="grid grid-cols-2 gap-3">
          {FEATURE_CARDS.map((fc) => (
            <div
              key={fc.id}
              className={cn(
                'rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden',
                isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white'
              )}
            >
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

      {/* ── Nota informativa ─────────────────────────────────────────── */}
      <div className={cn('rounded-2xl p-4 flex gap-3', isDarkMode ? 'bg-white/5' : 'bg-black/3')}>
        <Sparkles className={cn('w-4 h-4 flex-shrink-0 mt-0.5 text-[#B8860B]')} />
        <p className={cn('text-xs leading-relaxed', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]')}>
          <strong className={isDarkMode ? 'text-white/70' : 'text-[#2e2f2d]'}>¿Sabías?</strong> A mayor historial de ventas registradas en Voz-Activa, más sólido es tu perfil crediticio. Sigue registrando cada movimiento.
        </p>
      </div>

      {/* ── Privacidad ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-1.5">
        <Lock className={cn('w-3.5 h-3.5', muted)} />
        <p className={cn('text-[11px] font-medium', muted)}>Información protegida y encriptada</p>
      </div>
    </div>
  );
};
