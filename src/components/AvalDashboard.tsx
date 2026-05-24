import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck, FileText, Upload, CheckCircle2,
  Lock, X,
  FileCheck, AlertCircle, Sparkles, Loader2,
  TrendingUp, TrendingDown, ChevronDown, ChevronUp, Smartphone,
  Info, LogOut,
} from 'lucide-react';
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import { analyzeExtracto, ExtractoAnalysis } from '../services/extractoService';

interface Props {
  isDarkMode: boolean;
  cedula: string;
  userName?: string;
  userId: string;
  onBack: () => void;
}

interface UploadedFile {
  id: string;
  docId?: string;
  name: string;
  size: string;
  status: 'analizando' | 'analizado' | 'error';
  analysis?: ExtractoAnalysis;
  errorMsg?: string;
}


interface BankTip {
  name: string;
  brandColor: string;
  logoUrl: string;
  mobile: boolean;
  web: boolean;
  format: string;
  steps: string[];
  note?: string;
  warning?: string;
}

const BANK_TIPS: BankTip[] = [
  {
    name: 'Nequi',
    brandColor: '#5D0FD9',
    logoUrl: 'https://www.google.com/s2/favicons?domain=nequi.com.co&sz=128',
    mobile: true,
    web: true,
    format: 'PDF',
    steps: [
      'Abre la app o entra a nequi.com.co',
      'Ve a Tu Perfil → Documentos y Certificados → Certificados',
      'Seleccioná el mes y año que necesitás',
      'Tocá "Enviar" — llega a tu correo registrado',
    ],
    note: 'El PDF llega al correo. La contraseña para abrirlo es tu número de cédula.',
  },
  {
    name: 'Daviplata',
    brandColor: '#E8302A',
    logoUrl: 'https://www.google.com/s2/favicons?domain=daviplata.com&sz=128',
    mobile: true,
    web: true,
    format: 'PDF',
    steps: [
      'Abre la app DaviPlata o entra a daviplata.com',
      'En la pantalla principal, desplazate hacia abajo',
      'Tocá en el resumen de movimientos de tu cuenta',
      'Seleccioná el rango de fechas y descargá',
    ],
    note: 'Disponible desde 5 días hábiles después del corte. Últimos 18 meses.',
  },
  {
    name: 'Davivienda',
    brandColor: '#CC1B22',
    logoUrl: 'https://www.google.com/s2/favicons?domain=davivienda.com&sz=128',
    mobile: true,
    web: true,
    format: 'PDF',
    steps: [
      'Abre la App Davivienda o entra a davivienda.com',
      'Ve a Extractos y Certificaciones',
      'Seleccioná la cuenta y el período',
      'Descargá el PDF (disponible 24/7)',
    ],
    note: 'Los extractos se generan el día 6 de cada mes. Últimos 18 meses disponibles.',
  },
  {
    name: 'Bancolombia',
    brandColor: '#002F87',
    logoUrl: 'https://www.google.com/s2/favicons?domain=bancolombia.com&sz=128',
    mobile: false,
    web: true,
    format: 'PDF o Excel',
    steps: [
      'Entrá a sucursal.bancolombia.com desde un computador',
      'Inicia sesión con tu usuario y Clave Dinámica',
      'Menú (≡) → Documentos → Extractos',
      'Buscá por fecha → tocá los tres puntos (⋮) → Descargar',
    ],
    warning: 'La app móvil NO permite descargar extractos. Solo funciona desde la web.',
  },
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
  cobro_qr:               '🟢 Cobro QR',
  transferencia_recibida: '🟡 Transferencia recibida',
  transferencia_enviada:  '🔴 Enviado',
  retiro:                 '🔴 Retiro',
  pago_servicio:          '🟠 Pago servicio',
  otro:                   '⚪ Otro',
};

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-1.5 rounded-full bg-black/10 overflow-hidden">
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
  const [showTx, setShowTx] = useState(false);
  const label = ENTIDAD_LABEL[analysis.entidad] ?? 'Extracto';

  return (
    <div className={cn('rounded-xl p-4 space-y-4', isDarkMode ? 'bg-[#0D0D0D]' : 'bg-[#FDFBF0]')}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-[#B8860B]">{label}</p>
          <p className={cn('text-sm font-black', text)}>Análisis completado</p>
        </div>
      </div>

      {analysis.passwordUnlocked && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500/10">
          <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-xs font-bold text-green-700">Extracto desbloqueado con tu cédula — autenticidad verificada</p>
        </div>
      )}

      {/* Ingresos vs Gastos */}
      <div className={cn('rounded-xl p-3 space-y-2.5', isDarkMode ? 'bg-white/5' : 'bg-white')}>
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-green-600 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />Ingresos totales
          </span>
          <span className="text-sm font-black text-green-600">{formatCOP(analysis.totalIngresos)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className={cn('text-xs font-bold flex items-center gap-1', 'text-red-500')}>
            <TrendingDown className="w-3 h-3" />Gastos / retiros
          </span>
          <span className="text-sm font-black text-red-500">{formatCOP(analysis.totalGastos)}</span>
        </div>
        {analysis.totalIngresos > 0 && (
          <div className="pt-1">
            <div className="flex justify-between items-center mb-1">
              <span className={cn('text-[10px]', muted)}>Cobros QR / ventas directas</span>
              <span className={cn('text-[10px] font-black', muted)}>{analysis.porcentajeVentas}%</span>
            </div>
            <ScoreBar value={analysis.porcentajeVentas} color="bg-[#B8860B]" />
          </div>
        )}
      </div>

      {/* Mini análisis IA */}
      {analysis.miniAnalisis && (
        <div className={cn('rounded-xl p-3 flex items-start gap-2.5', isDarkMode ? 'bg-white/5' : 'bg-white')}>
          <Sparkles className="w-3.5 h-3.5 text-[#B8860B] flex-shrink-0 mt-0.5" />
          <p className={cn('text-xs leading-relaxed', text)}>{analysis.miniAnalisis}</p>
        </div>
      )}

      {/* Transacciones desplegables */}
      {analysis.transactions.length > 0 && (
        <div>
          <button
            onClick={() => setShowTx(v => !v)}
            className={cn('w-full flex items-center justify-between text-xs font-bold py-1.5', muted)}
          >
            <span>{analysis.transactions.length} transacciones detectadas</span>
            {showTx ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {showTx && (
            <div className="space-y-1.5 mt-2 max-h-52 overflow-y-auto">
              {analysis.transactions.slice(0, 30).map((t, i) => (
                <div key={i} className={cn('flex items-start justify-between gap-2 p-2 rounded-lg text-xs', isDarkMode ? 'bg-white/5' : 'bg-black/3')}>
                  <div className="flex-1 min-w-0">
                    <p className={cn('font-bold truncate', text)}>{t.descripcion}</p>
                    <p className={cn('text-[10px]', muted)}>{t.fecha} · {TIPO_LABEL[t.tipo] ?? t.tipo}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={cn('font-black', t.esVentaProbable ? 'text-green-600' : muted)}>{formatCOP(t.monto)}</p>
                    {t.esVentaProbable && <p className="text-[9px] text-green-600 font-black uppercase">venta</p>}
                  </div>
                </div>
              ))}
              {analysis.transactions.length > 30 && (
                <p className={cn('text-[10px] text-center py-1', muted)}>+{analysis.transactions.length - 30} transacciones más</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const AvalDashboard = ({ isDarkMode, cedula, userName, userId, onBack }: Props) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging]       = useState(false);
  const [showTips, setShowTips]           = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [openBank, setOpenBank]           = useState<string | null>(null);
  const [daysInApp, setDaysInApp]         = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const REQUIRED_DAYS = 30;
  const canUpload = daysInApp === null || daysInApp >= REQUIRED_DAYS;
  const daysLeft  = daysInApp !== null ? Math.max(0, REQUIRED_DAYS - daysInApp) : null;

  // Cargar análisis guardados y días en la app al montar
  useEffect(() => {
    const load = async () => {
      try {
        // Calcular días en la app desde createdAt del usuario
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const raw = userDoc.data().createdAt;
          const createdDate: Date = raw?.toDate ? raw.toDate() : new Date(raw);
          const days = Math.floor((Date.now() - createdDate.getTime()) / 86_400_000);
          setDaysInApp(days);
        } else {
          setDaysInApp(0);
        }
      } catch { setDaysInApp(0); }

      try {
        const col = collection(db, 'users', userId, 'extractos');
        const snap = await getDocs(query(col, orderBy('analyzedAt', 'desc')));
        const loaded: UploadedFile[] = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            docId: d.id,
            name: data.fileName ?? 'extracto.pdf',
            size: data.fileSize ?? '',
            status: 'analizado' as const,
            analysis: {
              entidad:               data.entidad               ?? 'otro',
              totalIngresos:         data.totalIngresos         ?? 0,
              totalGastos:           data.totalGastos           ?? 0,
              ingresosVentas:        data.ingresosVentas        ?? 0,
              ingresosTransferencias:data.ingresosTransferencias?? 0,
              porcentajeVentas:      data.porcentajeVentas      ?? 0,
              transactions:          data.transactions          ?? [],
              miniAnalisis:          data.miniAnalisis          ?? '',
              passwordUnlocked:      data.passwordUnlocked      ?? false,
            },
          };
        });
        setUploadedFiles(loaded);
      } catch { /* silencioso si no hay datos */ }
    };
    load();
  }, [userId]);

  const card  = cn('rounded-2xl p-5', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white');
  const muted = isDarkMode ? 'text-white/40' : 'text-black/40';
  const text  = isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]';

  const maskedCedula = cedula.length > 4 ? '••••••' + cedula.slice(-4) : cedula;
  const completedAnalyses = uploadedFiles.filter(f => f.status === 'analizado' && f.analysis);

  const processFile = async (file: File, id: string) => {
    try {
      const analysis = await analyzeExtracto(file, cedula);
      // Guardar en Firestore
      const col = collection(db, 'users', userId, 'extractos');
      const docRef = await addDoc(col, {
        fileName:              file.name,
        fileSize:              formatBytes(file.size),
        analyzedAt:            serverTimestamp(),
        entidad:               analysis.entidad,
        totalIngresos:         analysis.totalIngresos,
        totalGastos:           analysis.totalGastos,
        ingresosVentas:        analysis.ingresosVentas,
        ingresosTransferencias:analysis.ingresosTransferencias,
        porcentajeVentas:      analysis.porcentajeVentas,
        transactions:          analysis.transactions,
        miniAnalisis:          analysis.miniAnalisis,
        passwordUnlocked:      analysis.passwordUnlocked,
      });
      setUploadedFiles(prev => prev.map(f =>
        f.id === id ? { ...f, status: 'analizado', analysis, docId: docRef.id } : f,
      ));
    } catch (err: any) {
      setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'error', errorMsg: err.message } : f));
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const id = Math.random().toString(36).slice(2);
      setUploadedFiles(prev => [...prev, { id, name: file.name, size: formatBytes(file.size), status: 'analizando' }]);
      processFile(file, id);
    });
  };

  const removeFile = async (id: string) => {
    const file = uploadedFiles.find(f => f.id === id);
    if (file?.docId) {
      try { await deleteDoc(doc(db, 'users', userId, 'extractos', file.docId)); } catch { /* ignora */ }
    }
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="space-y-5 pb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Cerrar sesión del panel */}
      <button
        onClick={() => setShowCloseModal(true)}
        className={cn('flex items-center gap-1.5 text-xs font-bold transition-colors', isDarkMode ? 'text-white/40 hover:text-white/70' : 'text-black/40 hover:text-black/70')}
      >
        <LogOut className="w-3.5 h-3.5" />
        Cerrar sesión del panel
      </button>

      {/* Modal confirmación */}
      {showCloseModal && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCloseModal(false)} />
          <div className={cn(
            'relative w-full max-w-sm rounded-3xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300',
            isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white',
          )}>
            <div className="flex justify-center mb-4">
              <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center', isDarkMode ? 'bg-white/8' : 'bg-[#FFF8DC]')}>
                <LogOut className="w-7 h-7 text-[#B8860B]" />
              </div>
            </div>
            <h3 className={cn("font-black text-lg text-center font-['Plus_Jakarta_Sans'] mb-1", isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>
              ¿Cerrar sesión del panel?
            </h3>
            <p className={cn('text-sm text-center mb-6', isDarkMode ? 'text-white/50' : 'text-[#5b5c5a]')}>
              Tu identidad queda verificada. La próxima vez que entres a Oportunidad para crédito vas directo al panel.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={onBack}
                className="w-full py-3.5 rounded-xl font-black text-sm bg-gradient-to-r from-[#B8860B] to-[#DAA520] text-white shadow-md active:scale-[0.98] transition-all"
              >
                Cerrar sesión
              </button>
              <button
                onClick={() => setShowCloseModal(false)}
                className={cn(
                  'w-full py-3.5 rounded-xl font-black text-sm active:scale-[0.98] transition-all',
                  isDarkMode ? 'bg-white/8 text-white/70' : 'bg-black/5 text-[#2e2f2d]',
                )}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className={cn('relative overflow-hidden rounded-2xl px-6 py-6', isDarkMode ? 'bg-[#1A1A00]' : 'bg-gradient-to-br from-[#FFF8DC] to-[#FFF0A0]')}>
        <div className="absolute -right-6 -top-6 w-36 h-36 rounded-full bg-[#B8860B]/10" />
        <div className="relative z-10">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#B8860B] mb-1">Oportunidad para crédito</p>
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

      {/* ── Extracto upload ────────────────────────────────────────────────── */}
      <div className={cn(card, 'space-y-4')}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', isDarkMode ? 'bg-[#B8860B]/15' : 'bg-[#FFF8DC]')}>
            <FileCheck className="w-5 h-5 text-[#B8860B]" />
          </div>
          <div className="flex-1">
            <p className={cn('font-black text-sm', text)}>Sube tu extracto bancario</p>
            <p className={cn('text-xs', muted)}>Nequi · Daviplata · Davivienda · Bancolombia · Solo PDF</p>
          </div>
          {completedAnalyses.length > 0 && (
            <span className="text-[10px] font-black bg-green-500 text-white px-2 py-0.5 rounded-full">
              {completedAnalyses.length} ✓
            </span>
          )}
        </div>

        {/* How to get statement */}
        <button
          onClick={() => setShowTips(v => !v)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all',
            isDarkMode ? 'bg-white/5 text-white/50 hover:bg-white/8' : 'bg-[#FFF8DC] text-[#B8860B] hover:bg-[#FFF0A0]',
          )}
        >
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 text-left">¿Cómo descargo mi extracto?</span>
          {showTips ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showTips && (
          <div className="space-y-2">
            {BANK_TIPS.map(b => {
              const isOpen = openBank === b.name;
              return (
                <div key={b.name} className={cn('rounded-xl overflow-hidden', isDarkMode ? 'bg-white/5' : 'bg-black/3')}>
                  {/* Accordion header */}
                  <button
                    onClick={() => setOpenBank(prev => prev === b.name ? null : b.name)}
                    className="w-full flex items-center gap-3 px-3 py-3 text-left transition-all active:opacity-80"
                  >
                    {/* Brand logo image */}
                    <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden', isDarkMode ? 'bg-white/10' : 'bg-white')}>
                      <img
                        src={b.logoUrl}
                        alt={b.name}
                        className="w-7 h-7 object-contain"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                    {/* Name */}
                    <span className={cn('font-black text-sm flex-1', text)}>{b.name}</span>
                    {/* Chevron */}
                    <ChevronDown className={cn('w-4 h-4 flex-shrink-0 transition-transform duration-200', muted, isOpen ? 'rotate-180' : 'rotate-0')} />
                  </button>

                  {/* Accordion content */}
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                      {/* Format badge */}
                      <div className="flex items-center gap-1.5">
                        <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-500')}>🌐 Web</span>
                        <span className={cn('text-[9px] font-black px-1.5 py-0.5 rounded-full', isDarkMode ? 'bg-white/10 text-white/50' : 'bg-black/8 text-black/40')}>
                          {b.format}
                        </span>
                      </div>

                      {/* Steps */}
                      <ol className="space-y-1.5">
                        {b.steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-[10px] font-black mt-0.5 flex-shrink-0 w-3.5" style={{ color: b.brandColor }}>{i + 1}.</span>
                            <span className={cn('text-[11px] leading-snug', muted)}>{step}</span>
                          </li>
                        ))}
                      </ol>

                      {/* Note / Warning */}
                      {(b.note || b.warning) && (
                        <div className={cn(
                          'px-2.5 py-2 rounded-lg flex items-start gap-2',
                          b.warning
                            ? isDarkMode ? 'bg-red-500/10' : 'bg-red-50'
                            : isDarkMode ? 'bg-white/5' : 'bg-white',
                        )}>
                          <span className="text-xs flex-shrink-0">{b.warning ? '⚠️' : '💡'}</span>
                          <p className={cn('text-[10px] leading-snug', b.warning ? 'text-red-500' : muted)}>
                            {b.warning ?? b.note}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className={cn('flex items-start gap-2 px-3 py-2.5 rounded-xl', isDarkMode ? 'bg-white/5' : 'bg-black/3')}>
              <Smartphone className={cn('w-3.5 h-3.5 flex-shrink-0 mt-0.5', muted)} />
              <p className={cn('text-[10px] leading-snug', muted)}>
                Todos los extractos de estas entidades se descargan en <strong className={isDarkMode ? 'text-white/60' : 'text-black/50'}>formato PDF</strong>. Ese es el único formato aceptado.
              </p>
            </div>
          </div>
        )}

        {/* Drop zone — bloqueado si no lleva 30 días */}
        {!canUpload ? (
          <div className={cn('rounded-xl p-5 flex flex-col items-center gap-3 text-center border-2 border-dashed', isDarkMode ? 'border-white/10 bg-white/3' : 'border-black/10 bg-black/2')}>
            <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center', isDarkMode ? 'bg-white/8' : 'bg-gray-100')}>
              <Lock className={cn('w-6 h-6', muted)} />
            </div>
            <div>
              <p className={cn('text-sm font-black', text)}>Disponible en {daysLeft} día{daysLeft !== 1 ? 's' : ''}</p>
              <p className={cn('text-xs mt-1 leading-snug', muted)}>
                Necesitas 30 días de historial en Voz Activa para analizar tu extracto.
              </p>
            </div>
            <div className="w-full space-y-1.5">
              <div className="flex justify-between text-[10px] font-bold">
                <span className={muted}>Día {daysInApp ?? 0} de 30</span>
                <span className="text-[#B8860B]">{Math.round(((daysInApp ?? 0) / REQUIRED_DAYS) * 100)}%</span>
              </div>
              <div className={cn('w-full h-2 rounded-full overflow-hidden', isDarkMode ? 'bg-white/10' : 'bg-black/8')}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#B8860B] to-[#FFD700] transition-all duration-700"
                  style={{ width: `${Math.min(((daysInApp ?? 0) / REQUIRED_DAYS) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2.5 cursor-pointer transition-all',
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
              accept=".pdf"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
            <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center', isDarkMode ? 'bg-white/8' : 'bg-[#FFF8DC]')}>
              <Upload className="w-6 h-6 text-[#B8860B]" />
            </div>
            <div className="text-center">
              <p className={cn('text-sm font-black', text)}>Toca para subir o arrastra aquí</p>
              <p className={cn('text-xs mt-0.5', muted)}>Solo archivos PDF</p>
            </div>
          </div>
        )}

        {/* File list */}
        {uploadedFiles.length > 0 && (
          <div className="space-y-2">
            {uploadedFiles.map(f => (
              <div key={f.id} className="space-y-2">
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
                      {f.status === 'analizando' ? '⏳ Analizando con IA...'
                        : f.status === 'analizado' ? `✓ Analizado · ${f.size}`
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
                {f.status === 'analizado' && f.analysis && (
                  <AnalysisCard analysis={f.analysis} isDarkMode={isDarkMode} text={text} muted={muted} />
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

        <div className={cn('rounded-xl p-2.5 flex items-start gap-2', isDarkMode ? 'bg-white/5' : 'bg-black/3')}>
          <Lock className={cn('w-3.5 h-3.5 flex-shrink-0 mt-0.5', muted)} />
          <p className={cn('text-[10px] leading-snug', muted)}>
            Tu extracto se analiza con IA y nunca se almacena. Solo se usa para calcular tu perfil crediticio.
          </p>
        </div>
      </div>

      {/* Requisito 30 días */}
      {daysInApp !== null && daysInApp < REQUIRED_DAYS && (
        <div className={cn('rounded-2xl p-4 space-y-3', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
          <div className="flex items-start gap-3">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', isDarkMode ? 'bg-[#B8860B]/15' : 'bg-[#FFF8DC]')}>
              <FileText className="w-4.5 h-4.5 text-[#B8860B]" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <p className={cn('text-sm font-black', text)}>Análisis de extracto</p>
              <p className={cn('text-xs mt-0.5', muted)}>Disponible cuando completes 30 días en Voz Activa</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className={cn('text-xs font-bold', text)}>Tu progreso</span>
              <span className="text-xs font-black text-[#B8860B]">
                {daysInApp} / {REQUIRED_DAYS} días
              </span>
            </div>
            <div className={cn('w-full h-2.5 rounded-full overflow-hidden', isDarkMode ? 'bg-white/10' : 'bg-black/8')}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#B8860B] to-[#FFD700] transition-all duration-700"
                style={{ width: `${Math.min((daysInApp / REQUIRED_DAYS) * 100, 100)}%` }}
              />
            </div>
          </div>
          <p className={cn('text-[11px] leading-snug', muted)}>
            Te faltan <strong className={isDarkMode ? 'text-white/70' : 'text-[#2e2f2d]'}>{REQUIRED_DAYS - daysInApp} días</strong> para poder analizar tu extracto bancario. Sigue registrando tus ventas y gastos en la app.
          </p>
        </div>
      )}

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
