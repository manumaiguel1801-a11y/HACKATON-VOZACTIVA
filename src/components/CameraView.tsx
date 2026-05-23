import React, { useState, useRef, useMemo } from 'react';
import {
  Upload,
  Camera,
  Package,
  ShoppingBag,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  ChevronRight,
  RotateCcw,
  AlertCircle,
  TrendingDown,
  X,
  Check,
  Lightbulb,
  Clock,
} from 'lucide-react';
import { collection, addDoc, serverTimestamp, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { cn, capitalizar } from '../lib/utils';
import { Debt, InventoryProduct } from '../types';
import { analyzeImageOCR, OCRMode, OCRVentasRow, OCRStockRow, OCRFiadoRow } from '../services/gemini';
import { MovementDetailModal } from './MovementDetailModal';

// ─── Row types for the editable table ───────────────────────────────────────

type FlowStep = 'idle' | 'mode-select' | 'analyzing' | 'table' | 'saving' | 'success';

/** Ventas del día: lo que se vendió */
interface VentasEditRow {
  _id: string;
  nombre: string;
  unidadesVendidas: string;
  precioVenta: string;
}

/** Nuevo stock: mercancía comprada */
interface StockEditRow {
  _id: string;
  nombre: string;
  cantidadComprada: string;
  precioCompra: string;
}

interface FiadoEditRow {
  _id: string;
  nombre: string;
  loDebe: string;
  fecha: string;
  estado: 'pagado' | 'pendiente';
}

let _rid = 0;
const rid = () => String(++_rid);

const emptyVentasRow = (): VentasEditRow => ({
  _id: rid(), nombre: '', unidadesVendidas: '0', precioVenta: '0',
});
const emptyStockRow = (): StockEditRow => ({
  _id: rid(), nombre: '', cantidadComprada: '0', precioCompra: '0',
});
const emptyFiadoRow = (): FiadoEditRow => ({
  _id: rid(), nombre: '', loDebe: '0', fecha: '', estado: 'pendiente',
});

function parseNum(s: string): number {
  return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;
}

const esMontoValido = (v: unknown): v is number =>
  typeof v === 'number' && !isNaN(v) && isFinite(v) && v > 0;
function fmtCOP(n: number): string {
  return n.toLocaleString('es-CO');
}
function calcVentasTotal(row: VentasEditRow): number {
  return parseNum(row.unidadesVendidas) * parseNum(row.precioVenta);
}
function calcStockTotal(row: StockEditRow): number {
  return parseNum(row.cantidadComprada) * parseNum(row.precioCompra);
}

// ─── Debt helpers (kept from original) ──────────────────────────────────────

function getDebtDate(debt: Debt): Date {
  return debt.createdAt?.toDate ? debt.createdAt.toDate() : new Date();
}
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (d.getTime() === today.getTime()) return 'Hoy';
  if (d.getTime() === yesterday.getTime()) return 'Ayer';
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

// ─── Inventory helpers ───────────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function findInventoryProduct(inventory: InventoryProduct[], name: string): InventoryProduct | null {
  const n = normalizeStr(name);
  if (!n) return null;
  // 1. Exact match
  const exact = inventory.find(p => normalizeStr(p.nombre) === n);
  if (exact) return exact;
  // 2. Contains match (either direction)
  const contains = inventory.find(p => {
    const pn = normalizeStr(p.nombre);
    return pn.includes(n) || n.includes(pn);
  });
  if (contains) return contains;
  // 3. Word-level match: any significant word in common (>2 chars)
  const nWords = n.split(/\s+/).filter(w => w.length > 2);
  return inventory.find(p => {
    const pWords = normalizeStr(p.nombre).split(/\s+/);
    return nWords.some(nw => pWords.some(pw => pw.includes(nw) || nw.includes(pw)));
  }) ?? null;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  isDarkMode: boolean;
  debts: Debt[];
  userId: string;
  inventory: InventoryProduct[];
}

// ─── Shared cell / input styles ──────────────────────────────────────────────

const cellInput = (dark: boolean) =>
  cn(
    'w-full bg-transparent border-0 outline-none text-sm font-medium px-2 py-2',
    'focus:ring-1 focus:ring-[#FFD700]/60 focus:rounded-md transition-all',
    dark ? 'text-[#FDFBF0] placeholder:text-white/25' : 'text-[#0D0D0D] placeholder:text-black/25',
  );

// ─── Component ───────────────────────────────────────────────────────────────

export const CameraView = ({ isDarkMode, debts, userId, inventory }: Props) => {
  // OCR flow
  const [step, setStep] = useState<FlowStep>('idle');
  const [imageBase64, setImageBase64] = useState('');
  const [imageMime, setImageMime] = useState('image/jpeg');
  const [imagePreview, setImagePreview] = useState('');
  const [ocrMode, setOcrMode] = useState<OCRMode>('inventario');
  const [ocrError, setOcrError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Table data
  const [ventasRows, setVentasRows] = useState<VentasEditRow[]>([]);
  const [stockRows, setStockRows] = useState<StockEditRow[]>([]);
  const [fiadoRows, setFiadoRows] = useState<FiadoEditRow[]>([]);

  // File refs
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Debts section
  const [debtType, setDebtType] = useState<'me-deben' | 'debo'>('me-deben');
  const [showHistory, setShowHistory] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null);
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null);

  // Toast flotante
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Formulario manual de deuda
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [debtFormNombre, setDebtFormNombre] = useState('');
  const [debtFormMonto, setDebtFormMonto] = useState('');
  const [debtFormFecha, setDebtFormFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [savingDebt, setSavingDebt] = useState(false);

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      const [header, data] = result.split(',');
      const mime = header.split(':')[1].split(';')[0];
      setImageBase64(data);
      setImageMime(mime);
      setImagePreview(result);
      setOcrError('');
      setStep('mode-select');
    };
    reader.readAsDataURL(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  // ── Gemini OCR ─────────────────────────────────────────────────────────────

  const handleModeSelect = async (mode: OCRMode) => {
    setOcrMode(mode);
    setStep('analyzing');
    setOcrError('');
    try {
      const rows = await analyzeImageOCR(imageBase64, imageMime, mode);
      if (mode === 'ventas-dia') {
        const mapped = (rows as OCRVentasRow[]).map((r) => ({
          _id: rid(),
          nombre: capitalizar(r.nombre),
          unidadesVendidas: String(r.unidadesVendidas),
          precioVenta: String(r.precioVenta),
        }));
        setVentasRows(mapped.length ? mapped : [emptyVentasRow()]);
      } else if (mode === 'nuevo-stock') {
        const mapped = (rows as OCRStockRow[]).map((r) => ({
          _id: rid(),
          nombre: capitalizar(r.nombre),
          cantidadComprada: String(r.cantidadComprada),
          precioCompra: String(r.precioCompra),
        }));
        setStockRows(mapped.length ? mapped : [emptyStockRow()]);
      } else {
        const mapped = (rows as OCRFiadoRow[]).map((r) => ({
          _id: rid(),
          nombre: capitalizar(r.nombre),
          loDebe: String(r.loDebe),
          fecha: r.fecha,
          estado: r.estado,
        }));
        setFiadoRows(mapped.length ? mapped : [emptyFiadoRow()]);
      }
      setStep('table');
    } catch {
      setOcrError('No se pudo analizar la imagen. Intenta de nuevo.');
      setStep('mode-select');
    }
  };

  // ── Firebase save ──────────────────────────────────────────────────────────

  // Guardar "Ventas del día" — descuenta stock + registra ingreso
  const handleSaveVentas = async () => {
    setStep('saving');
    try {
      const valid = ventasRows.filter((r) => r.nombre.trim());
      let salesCount = 0;
      let updatedCount = 0;
      let createdCount = 0;

      for (const row of valid) {
        const nombre = row.nombre.trim();
        const unidadesVendidas = parseNum(row.unidadesVendidas);
        const precioVenta = parseNum(row.precioVenta);

        const existing = findInventoryProduct(inventory, nombre);

        if (existing) {
          const newCantidad = Math.max(0, (existing.cantidad ?? 0) - unidadesVendidas);
          await updateDoc(doc(db, 'users', userId, 'inventario', existing.id), {
            cantidad: newCantidad,
            ...(precioVenta > 0 ? { precioVenta } : {}),
            updatedAt: serverTimestamp(),
          });
          updatedCount++;
        } else if (unidadesVendidas > 0) {
          // Producto nuevo: si no existe, lo crea con stock = 0 (ya se vendió todo lo visible)
          await addDoc(collection(db, 'users', userId, 'inventario'), {
            nombre,
            cantidad: 0,
            precioVenta,
            precioCompra: 0,
            createdAt: serverTimestamp(),
          });
          createdCount++;
        }

        // Registrar ingreso solo si hubo unidades vendidas y montos válidos
        if (unidadesVendidas > 0 && precioVenta > 0) {
          const total = unidadesVendidas * precioVenta;
          if (!esMontoValido(total)) continue;
          await addDoc(collection(db, 'users', userId, 'sales'), {
            items: [{ product: `Venta: ${nombre}`, quantity: unidadesVendidas, unitPrice: precioVenta, subtotal: total }],
            total,
            createdAt: serverTimestamp(),
          });
          salesCount++;
        }
      }

      const partes: string[] = [];
      if (updatedCount) partes.push(`${updatedCount} stock actualizado`);
      if (createdCount) partes.push(`${createdCount} producto(s) nuevo(s)`);
      if (salesCount) partes.push(`${salesCount} venta(s) registrada(s)`);
      setSuccessMsg(`¡Listo! ${partes.join(', ')}.`);
      setStep('success');
    } catch (e: any) {
      console.error('[OCR-Ventas] Error:', e?.code, e?.message, e);
      setOcrError(`Error: ${e?.code ?? e?.message ?? 'desconocido'}`);
      setStep('table');
    }
  };

  // Guardar "Nuevo stock" — suma al stock + registra gasto
  const handleSaveStock = async () => {
    setStep('saving');
    try {
      const valid = stockRows.filter((r) => r.nombre.trim());
      let updatedCount = 0;
      let createdCount = 0;
      let gastoCount = 0;

      for (const row of valid) {
        const nombre = row.nombre.trim();
        const cantidadComprada = parseNum(row.cantidadComprada);
        const precioCompra = parseNum(row.precioCompra);

        const existing = findInventoryProduct(inventory, nombre);

        if (existing) {
          await updateDoc(doc(db, 'users', userId, 'inventario', existing.id), {
            cantidad: (existing.cantidad ?? 0) + cantidadComprada,
            ...(precioCompra > 0 ? { precioCompra } : {}),
            updatedAt: serverTimestamp(),
          });
          updatedCount++;
        } else {
          await addDoc(collection(db, 'users', userId, 'inventario'), {
            nombre,
            cantidad: cantidadComprada,
            precioCompra,
            precioVenta: 0,
            createdAt: serverTimestamp(),
          });
          createdCount++;
        }

        // Registrar gasto por la compra
        if (cantidadComprada > 0 && precioCompra > 0) {
          const total = cantidadComprada * precioCompra;
          if (!esMontoValido(total)) continue;
          await addDoc(collection(db, 'users', userId, 'expenses'), {
            concept: `Compra: ${nombre}`,
            amount: total,
            createdAt: serverTimestamp(),
          });
          gastoCount++;
        }
      }

      const partes: string[] = [];
      if (updatedCount) partes.push(`${updatedCount} stock repuesto`);
      if (createdCount) partes.push(`${createdCount} producto(s) nuevo(s)`);
      if (gastoCount) partes.push(`${gastoCount} compra(s) registrada(s) como gasto`);
      setSuccessMsg(`¡Listo! ${partes.join(', ')}.`);
      setStep('success');
    } catch (e: any) {
      console.error('[OCR-Stock] Error:', e?.code, e?.message, e);
      setOcrError(`Error: ${e?.code ?? e?.message ?? 'desconocido'}`);
      setStep('table');
    }
  };

  const handleSaveFiados = async () => {
    setStep('saving');
    try {
      const isMeDeben = ocrMode === 'fiados-me-deben';
      const debtType = isMeDeben ? 'me-deben' : 'debo';
      const concept = isMeDeben ? 'Fiado' : 'Deuda';

      const valid = fiadoRows.filter((r) => r.nombre.trim());
      for (const row of valid) {
        const monto = parseNum(row.loDebe);
        if (!esMontoValido(monto) && monto !== 0) continue;
        const isPagado = row.estado === 'pagado';
        await addDoc(collection(db, 'users', userId, 'debts'), {
          name: row.nombre.trim(),
          concept,
          amount: monto,
          type: debtType,
          status: isPagado ? 'pagada' : 'pendiente',
          ...(isPagado ? { amountPaid: monto, paidAt: serverTimestamp() } : {}),
          createdAt: serverTimestamp(),
        });
        if (isPagado && monto > 0) {
          if (isMeDeben) {
            await addDoc(collection(db, 'users', userId, 'sales'), {
              items: [{ product: `Cobro: ${row.nombre.trim()}`, quantity: 1, unitPrice: monto, subtotal: monto }],
              total: monto,
              createdAt: serverTimestamp(),
            });
          } else {
            await addDoc(collection(db, 'users', userId, 'expenses'), {
              concept: `Pago: ${row.nombre.trim()}`,
              amount: monto,
              createdAt: serverTimestamp(),
            });
          }
        }
      }
      const tabLabel = isMeDeben ? '"Me Deben"' : '"Yo Debo"';
      setSuccessMsg(`¡Listo! Guardado — aparece en ${tabLabel}`);
      setStep('success');
    } catch (e: any) {
      console.error('[OCR-Fiados] Error al guardar:', e?.code, e?.message, e);
      setOcrError(`Error: ${e?.code ?? e?.message ?? 'desconocido'}`);
      setStep('table');
    }
  };

  // Marca una deuda como pagada, registra la transacción y muestra toast
  const handleMarkPaid = async (debt: Debt) => {
    if (payingDebtId) return;
    setPayingDebtId(debt.id);
    try {
      const monto = debt.amount - (debt.amountPaid ?? 0);
      await updateDoc(doc(db, 'users', userId, 'debts', debt.id), {
        status: 'pagada',
        amountPaid: debt.amount,
        paidAt: serverTimestamp(),
      });
      if (monto > 0) {
        if (debt.type === 'me-deben') {
          await addDoc(collection(db, 'users', userId, 'sales'), {
            items: [{ product: `Cobro deuda: ${debt.name}`, quantity: 1, unitPrice: monto, subtotal: monto }],
            total: monto,
            createdAt: serverTimestamp(),
            source: 'manual',
          });
          showToast('¡Listo! Ingreso registrado');
        } else {
          await addDoc(collection(db, 'users', userId, 'expenses'), {
            concept: `Pago deuda: ${debt.name}`,
            amount: monto,
            createdAt: serverTimestamp(),
            source: 'manual',
          });
          showToast('¡Listo! Pago registrado');
        }
      }
    } catch (e: any) {
      console.error('[MarkPaid] Error:', e?.code, e?.message, e);
    } finally {
      setPayingDebtId(null);
    }
  };

  const reset = () => {
    setStep('idle');
    setImageBase64('');
    setImagePreview('');
    setVentasRows([]);
    setStockRows([]);
    setFiadoRows([]);
    setOcrError('');
    setSuccessMsg('');
  };

  // ── Debt section data ─────────────────────────────────────────────────────

  const [dismissedDebtTips, setDismissedDebtTips] = useState<Set<string>>(() => new Set());

  const filteredDebts = debts.filter(
    (d) => d.type === debtType && (d.status ?? 'pendiente') !== 'pagada',
  );
  const { totalMeDeben, totalDebo } = useMemo(() => ({
    totalMeDeben: debts
      .filter((d) => d.type === 'me-deben' && (d.status ?? 'pendiente') !== 'pagada')
      .reduce((s, d) => s + (d.amount - (d.amountPaid ?? 0)), 0),
    totalDebo: debts
      .filter((d) => d.type === 'debo' && (d.status ?? 'pendiente') !== 'pagada')
      .reduce((s, d) => s + (d.amount - (d.amountPaid ?? 0)), 0),
  }), [debts]);

  const debtTips = useMemo(() => {
    const now = Date.now();
    const result: { id: string; text: string }[] = [];
    debts
      .filter(d => (d.status ?? 'pendiente') !== 'pagada')
      .forEach(d => {
        const days = Math.floor((now - getDebtDate(d).getTime()) / 86400000);
        if (d.type === 'me-deben' && days > 7) {
          result.push({ id: `tip-${d.id}`, text: `${d.name} te debe desde hace ${days} días. Puede ser buen momento para cobrar.` });
        } else if (d.type === 'debo' && days > 15) {
          result.push({ id: `tip-${d.id}`, text: `Llevas ${days} días debiéndole a ${d.name}. Ojo para no acumular.` });
        }
      });
    return result.filter(t => !dismissedDebtTips.has(t.id)).slice(0, 3);
  }, [debts, dismissedDebtTips]);

  // ── Table styles ──────────────────────────────────────────────────────────

  const thCls = 'px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-white whitespace-nowrap';
  const rowBg = (idx: number) =>
    idx % 2 === 0
      ? isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white'
      : isDarkMode ? 'bg-[#232323]' : 'bg-[#FDFBF0]';

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER SECTIONS
  // ─────────────────────────────────────────────────────────────────────────

  const renderUpload = () => (
    <div className="space-y-4">
      {/* Viewfinder */}
      <div
        className={cn(
          'relative overflow-hidden rounded-[2rem] aspect-[4/3] flex flex-col items-center justify-center gap-5 cursor-pointer border-2 border-dashed transition-all',
          isDarkMode ? 'bg-[#1A1A1A] border-[#B8860B]/30' : 'bg-[#FDFBF0] border-[#B8860B]/20',
        )}
        onClick={() => galleryRef.current?.click()}
      >
        <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-[#FFD700] rounded-tl-xl" />
        <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-[#FFD700] rounded-tr-xl" />
        <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-[#FFD700] rounded-bl-xl" />
        <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-[#FFD700] rounded-br-xl" />

        <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-white shadow-sm')}>
          <Upload className="w-7 h-7 text-[#B8860B]" />
        </div>
        <div className="text-center px-6">
          <p className={cn('font-black text-lg', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>
            Sube o toma una foto
          </p>
          <p className={cn('text-sm mt-1', isDarkMode ? 'text-white/40' : 'text-black/40')}>
            De tu cuaderno, lista o tabla
          </p>
        </div>
      </div>

      {/* Tip de ayuda */}
      <div className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-2xl',
        isDarkMode ? 'bg-[#B8860B]/10 border border-[#B8860B]/20' : 'bg-[#FFF8DC] border border-[#DAA520]/30',
      )}>
        <span className="text-lg flex-shrink-0">💡</span>
        <p className={cn('text-xs leading-relaxed font-medium', isDarkMode ? 'text-[#FFD700]/80' : 'text-[#6B4A00]')}>
          <span className="font-black">Para mejores resultados:</span> buena luz, letra clara y que se vea todo el cuaderno en la foto.
        </p>
      </div>

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => galleryRef.current?.click()}
          className={cn(
            'flex-1 h-14 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-95',
            isDarkMode ? 'bg-[#1A1A1A] text-[#FDFBF0] border border-white/5' : 'bg-white text-[#2e2f2d] shadow-sm',
          )}
        >
          <Upload className="w-5 h-5" />
          Galería
        </button>
        <button
          onClick={() => cameraRef.current?.click()}
          className="flex-[1.4] h-14 bg-gradient-to-br from-[#B8860B] to-[#FFD700] rounded-2xl flex items-center justify-center gap-2 font-bold text-black shadow-lg active:scale-95 transition-all"
        >
          <Camera className="w-5 h-5" />
          Tomar foto
        </button>
      </div>
    </div>
  );

  const renderModeSelect = () => (
    <div className="space-y-4">
      {/* Image preview */}
      <div className="relative rounded-2xl overflow-hidden aspect-[4/3]">
        <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <button
          onClick={reset}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center text-white"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Mode question */}
      <div className="text-center">
        <p className={cn('text-xl font-black font-["Plus_Jakarta_Sans"]', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>
          ¿Qué es esta foto?
        </p>
        <p className={cn('text-sm mt-1', isDarkMode ? 'text-white/40' : 'text-black/50')}>
          Selecciona el tipo para analizar correctamente
        </p>
      </div>

      {ocrError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-500 text-sm font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {ocrError}
        </div>
      )}

      {/* Opción 1 — Ventas del día */}
      <button
        onClick={() => handleModeSelect('ventas-dia')}
        className={cn(
          'w-full p-5 rounded-2xl flex items-center gap-4 text-left transition-all active:scale-[0.98] border-2',
          isDarkMode
            ? 'bg-[#1A1A1A] border-[#B8860B]/30 hover:border-[#B8860B]'
            : 'bg-white border-[#B8860B]/20 hover:border-[#B8860B] shadow-sm',
        )}
      >
        <div className="w-12 h-12 rounded-xl bg-[#FFD700]/20 flex items-center justify-center flex-shrink-0">
          <ShoppingBag className="w-6 h-6 text-[#B8860B]" />
        </div>
        <div>
          <p className="font-black text-base">Ventas del día</p>
          <p className={cn('text-xs mt-0.5', isDarkMode ? 'text-white/40' : 'text-black/40')}>
            Lo que vendiste hoy — descuenta stock automáticamente
          </p>
        </div>
      </button>

      {/* Opción 2 — Nuevo stock */}
      <button
        onClick={() => handleModeSelect('nuevo-stock')}
        className={cn(
          'w-full p-5 rounded-2xl flex items-center gap-4 text-left transition-all active:scale-[0.98] border-2',
          isDarkMode
            ? 'bg-[#1A1A1A] border-blue-400/20 hover:border-blue-400/60'
            : 'bg-white border-blue-400/15 hover:border-blue-400/50 shadow-sm',
        )}
      >
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
          <Package className="w-6 h-6 text-blue-500" />
        </div>
        <div>
          <p className="font-black text-base">Nuevo stock</p>
          <p className={cn('text-xs mt-0.5', isDarkMode ? 'text-white/40' : 'text-black/40')}>
            Mercancía que compraste — suma al inventario
          </p>
        </div>
      </button>

      {/* Opción 3 — Fiados (me deben) */}
      <button
        onClick={() => handleModeSelect('fiados-me-deben')}
        className={cn(
          'w-full p-5 rounded-2xl flex items-center gap-4 text-left transition-all active:scale-[0.98] border-2',
          isDarkMode
            ? 'bg-[#1A1A1A] border-green-500/20 hover:border-green-500/60'
            : 'bg-white border-green-500/15 hover:border-green-500/50 shadow-sm',
        )}
      >
        <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
          <ArrowUpRight className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <p className="font-black text-base">Cuaderno de fiados — Me deben</p>
          <p className={cn('text-xs mt-0.5', isDarkMode ? 'text-white/40' : 'text-black/40')}>
            Clientes que te deben plata
          </p>
        </div>
      </button>

      {/* Opción 4 — Deudas (yo debo) */}
      <button
        onClick={() => handleModeSelect('fiados-debo')}
        className={cn(
          'w-full p-5 rounded-2xl flex items-center gap-4 text-left transition-all active:scale-[0.98] border-2',
          isDarkMode
            ? 'bg-[#1A1A1A] border-red-400/20 hover:border-red-400/60'
            : 'bg-white border-red-400/15 hover:border-red-400/50 shadow-sm',
        )}
      >
        <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
          <ArrowDownRight className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <p className="font-black text-base">Cuaderno de deudas — Yo debo</p>
          <p className={cn('text-xs mt-0.5', isDarkMode ? 'text-white/40' : 'text-black/40')}>
            Proveedores o personas a quienes les debes
          </p>
        </div>
      </button>
    </div>
  );

  const renderAnalyzing = () => (
    <div className={cn(
      'rounded-[2rem] aspect-[4/3] flex flex-col items-center justify-center gap-5',
      isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f8f8f5]',
    )}>
      <div className="w-16 h-16 rounded-2xl bg-[#FFD700]/20 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#B8860B] animate-spin" />
      </div>
      <div className="text-center">
        <p className="font-black text-lg">Analizando tu foto...</p>
        <p className={cn('text-sm mt-1', isDarkMode ? 'text-white/40' : 'text-black/40')}>
          Gemini está extrayendo los datos
        </p>
      </div>
      <div className="h-1.5 w-48 rounded-full overflow-hidden bg-black/10">
        <div className="h-full w-2/3 bg-[#FFD700] animate-pulse rounded-full" />
      </div>
    </div>
  );

  // ── Ventas del día table ─────────────────────────────────────────────────

  const updateVentasRow = (id: string, field: keyof VentasEditRow, value: string) =>
    setVentasRows((prev) => prev.map((r) => r._id === id ? { ...r, [field]: value } : r));

  const renderVentasTable = () => {
    const totalVentas = ventasRows.reduce((s, r) => s + calcVentasTotal(r), 0);
    const isSaving = step === 'saving';
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-lg text-[#B8860B]">Ventas del día detectadas</p>
            <p className={cn('text-xs', isDarkMode ? 'text-white/40' : 'text-black/40')}>
              {ventasRows.length} {ventasRows.length === 1 ? 'producto' : 'productos'} · Edita si es necesario
            </p>
          </div>
          <button onClick={reset} className={cn('text-xs font-bold flex items-center gap-1', isDarkMode ? 'text-white/40' : 'text-black/40')}>
            <RotateCcw className="w-3.5 h-3.5" /> Nueva
          </button>
        </div>

        {ocrError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-500 text-sm font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{ocrError}
          </div>
        )}

        <div className={cn('rounded-2xl overflow-hidden border', isDarkMode ? 'border-white/8' : 'border-black/8')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr className="bg-[#B8860B]">
                  <th className={cn(thCls, 'w-[35%]')}>Producto</th>
                  <th className={cn(thCls, 'w-[18%] text-center')}>Un. Vendidas</th>
                  <th className={cn(thCls, 'w-[22%]')}>Precio Venta</th>
                  <th className={cn(thCls, 'w-[18%]')}>Total</th>
                  <th className="w-[7%]" />
                </tr>
              </thead>
              <tbody>
                {ventasRows.map((row, idx) => (
                  <tr key={row._id} className={cn('border-t', rowBg(idx), isDarkMode ? 'border-white/5' : 'border-black/5')}>
                    <td className="px-1 py-0.5">
                      <input type="text" value={row.nombre} onChange={(e) => updateVentasRow(row._id, 'nombre', e.target.value)} placeholder="Producto" className={cellInput(isDarkMode)} />
                    </td>
                    <td className="px-1 py-0.5">
                      <input type="number" min="0" value={row.unidadesVendidas} onChange={(e) => updateVentasRow(row._id, 'unidadesVendidas', e.target.value)} className={cn(cellInput(isDarkMode), 'text-center')} />
                    </td>
                    <td className="px-1 py-0.5">
                      <div className="relative">
                        <span className={cn('absolute left-2 top-1/2 -translate-y-1/2 text-xs select-none', isDarkMode ? 'text-white/30' : 'text-black/30')}>$</span>
                        <input type="number" min="0" value={row.precioVenta} onChange={(e) => updateVentasRow(row._id, 'precioVenta', e.target.value)} className={cn(cellInput(isDarkMode), 'pl-5')} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('text-sm font-bold', calcVentasTotal(row) > 0 ? 'text-[#B8860B]' : isDarkMode ? 'text-white/20' : 'text-black/20')}>
                        ${fmtCOP(calcVentasTotal(row))}
                      </span>
                    </td>
                    <td className="pr-2 py-0.5 text-center">
                      <button onClick={() => setVentasRows((prev) => prev.filter((r) => r._id !== row._id))} disabled={ventasRows.length === 1}
                        className={cn('w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-all', ventasRows.length === 1 ? 'opacity-20 cursor-not-allowed' : 'bg-red-500/15 text-red-400 hover:bg-red-500/25')}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setVentasRows((prev) => [...prev, emptyVentasRow()])}
            className={cn('w-full py-3 flex items-center justify-center gap-2 text-sm font-bold transition-all border-t', isDarkMode ? 'border-white/5 text-white/30 hover:text-[#B8860B] hover:bg-white/3' : 'border-black/5 text-black/30 hover:text-[#B8860B] hover:bg-black/2')}>
            <Plus className="w-4 h-4" /> Agregar fila
          </button>
        </div>

        <div className={cn('px-5 py-4 rounded-xl flex justify-between items-center', isDarkMode ? 'bg-[#B8860B]/10' : 'bg-[#FFF8DC]')}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Total ingresos</p>
            <p className="text-xs opacity-40 mt-0.5">{ventasRows.filter((r) => parseNum(r.unidadesVendidas) > 0).length} producto(s) vendidos</p>
          </div>
          <span className={cn('text-3xl font-black', totalVentas > 0 ? 'text-[#B8860B]' : isDarkMode ? 'text-white/20' : 'text-black/20')}>${fmtCOP(totalVentas)}</span>
        </div>

        <button onClick={handleSaveVentas} disabled={isSaving || !ventasRows.some((r) => r.nombre.trim())}
          className={cn('w-full h-14 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all duration-300',
            isSaving ? isDarkMode ? 'bg-white/10 text-white/40' : 'bg-black/10 text-black/30'
              : ventasRows.some((r) => r.nombre.trim()) ? 'bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-lg active:scale-[0.98]'
              : isDarkMode ? 'bg-white/8 text-white/25 cursor-not-allowed' : 'bg-black/8 text-black/25 cursor-not-allowed')}>
          {isSaving ? <><Loader2 className="w-5 h-5 animate-spin" /> Guardando...</> : <><CheckCircle2 className="w-5 h-5" /> Confirmar ventas</>}
        </button>
      </div>
    );
  };

  // ── Nuevo stock table ────────────────────────────────────────────────────

  const updateStockRow = (id: string, field: keyof StockEditRow, value: string) =>
    setStockRows((prev) => prev.map((r) => r._id === id ? { ...r, [field]: value } : r));

  const renderStockTable = () => {
    const totalCompra = stockRows.reduce((s, r) => s + calcStockTotal(r), 0);
    const isSaving = step === 'saving';
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-lg text-[#B8860B]">Nuevo stock detectado</p>
            <p className={cn('text-xs', isDarkMode ? 'text-white/40' : 'text-black/40')}>
              {stockRows.length} {stockRows.length === 1 ? 'producto' : 'productos'} · Edita si es necesario
            </p>
          </div>
          <button onClick={reset} className={cn('text-xs font-bold flex items-center gap-1', isDarkMode ? 'text-white/40' : 'text-black/40')}>
            <RotateCcw className="w-3.5 h-3.5" /> Nueva
          </button>
        </div>

        {ocrError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-500 text-sm font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{ocrError}
          </div>
        )}

        <div className={cn('rounded-2xl overflow-hidden border', isDarkMode ? 'border-white/8' : 'border-black/8')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr className="bg-[#B8860B] text-white">
                  <th className={cn(thCls, 'w-[35%]')}>Producto</th>
                  <th className={cn(thCls, 'w-[18%] text-center')}>Cant. Comprada</th>
                  <th className={cn(thCls, 'w-[22%]')}>Precio Compra</th>
                  <th className={cn(thCls, 'w-[18%]')}>Total</th>
                  <th className="w-[7%]" />
                </tr>
              </thead>
              <tbody>
                {stockRows.map((row, idx) => (
                  <tr key={row._id} className={cn('border-t', rowBg(idx), isDarkMode ? 'border-white/5' : 'border-black/5')}>
                    <td className="px-1 py-0.5">
                      <input type="text" value={row.nombre} onChange={(e) => updateStockRow(row._id, 'nombre', e.target.value)} placeholder="Producto" className={cellInput(isDarkMode)} />
                    </td>
                    <td className="px-1 py-0.5">
                      <input type="number" min="0" value={row.cantidadComprada} onChange={(e) => updateStockRow(row._id, 'cantidadComprada', e.target.value)} className={cn(cellInput(isDarkMode), 'text-center')} />
                    </td>
                    <td className="px-1 py-0.5">
                      <div className="relative">
                        <span className={cn('absolute left-2 top-1/2 -translate-y-1/2 text-xs select-none', isDarkMode ? 'text-white/30' : 'text-black/30')}>$</span>
                        <input type="number" min="0" value={row.precioCompra} onChange={(e) => updateStockRow(row._id, 'precioCompra', e.target.value)} className={cn(cellInput(isDarkMode), 'pl-5')} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('text-sm font-bold', calcStockTotal(row) > 0 ? 'text-[#B8860B]' : isDarkMode ? 'text-white/20' : 'text-black/20')}>
                        ${fmtCOP(calcStockTotal(row))}
                      </span>
                    </td>
                    <td className="pr-2 py-0.5 text-center">
                      <button onClick={() => setStockRows((prev) => prev.filter((r) => r._id !== row._id))} disabled={stockRows.length === 1}
                        className={cn('w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-all', stockRows.length === 1 ? 'opacity-20 cursor-not-allowed' : 'bg-red-500/15 text-red-400 hover:bg-red-500/25')}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setStockRows((prev) => [...prev, emptyStockRow()])}
            className={cn('w-full py-3 flex items-center justify-center gap-2 text-sm font-bold transition-all border-t', isDarkMode ? 'border-white/5 text-white/30 hover:text-[#FFD700] hover:bg-white/3' : 'border-black/5 text-black/30 hover:text-[#B8860B] hover:bg-black/2')}>
            <Plus className="w-4 h-4" /> Agregar fila
          </button>
        </div>

        <div className={cn('px-5 py-4 rounded-xl flex justify-between items-center', isDarkMode ? 'bg-[#FFD700]/10' : 'bg-[#FFF8DC]')}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Total compra</p>
            <p className="text-xs opacity-40 mt-0.5">{stockRows.filter((r) => parseNum(r.cantidadComprada) > 0).length} producto(s) a reponer</p>
          </div>
          <span className={cn('text-3xl font-black', totalCompra > 0 ? 'text-[#B8860B]' : isDarkMode ? 'text-white/20' : 'text-black/20')}>${fmtCOP(totalCompra)}</span>
        </div>

        <button onClick={handleSaveStock} disabled={isSaving || !stockRows.some((r) => r.nombre.trim())}
          className={cn('w-full h-14 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all duration-300',
            isSaving ? isDarkMode ? 'bg-white/10 text-white/40' : 'bg-black/10 text-black/30'
              : stockRows.some((r) => r.nombre.trim()) ? 'bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-lg active:scale-[0.98]'
              : isDarkMode ? 'bg-white/8 text-white/25 cursor-not-allowed' : 'bg-black/8 text-black/25 cursor-not-allowed')}>
          {isSaving ? <><Loader2 className="w-5 h-5 animate-spin" /> Guardando...</> : <><TrendingDown className="w-5 h-5" /> Confirmar compra</>}
        </button>
      </div>
    );
  };

  // ── Fiados table ──────────────────────────────────────────────────────────

  const updateFiadoRow = (id: string, field: keyof FiadoEditRow, value: string) =>
    setFiadoRows((prev) => prev.map((r) => r._id === id ? { ...r, [field]: value } : r));

  const renderFiadosTable = () => {
    const totalPendiente = fiadoRows
      .filter((r) => r.estado === 'pendiente')
      .reduce((s, r) => s + parseNum(r.loDebe), 0);
    const isSaving = step === 'saving';

    return (
      <div className="space-y-4">
        {/* Header bar */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-lg text-[#B8860B]">
              {ocrMode === 'fiados-me-deben' ? 'Fiados — Me deben' : 'Deudas — Yo debo'}
            </p>
            <p className={cn('text-xs', isDarkMode ? 'text-white/40' : 'text-black/40')}>
              {fiadoRows.length} {fiadoRows.length === 1 ? 'persona' : 'personas'} · Edita las celdas si es necesario
            </p>
          </div>
          <button onClick={reset} className={cn('text-xs font-bold flex items-center gap-1', isDarkMode ? 'text-white/40' : 'text-black/40')}>
            <RotateCcw className="w-3.5 h-3.5" /> Nueva
          </button>
        </div>

        {ocrError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-500 text-sm font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {ocrError}
          </div>
        )}

        {/* Scrollable table */}
        <div className={cn('rounded-2xl overflow-hidden border', isDarkMode ? 'border-white/8' : 'border-black/8')}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse">
              <thead>
                <tr className="bg-[#B8860B]">
                  <th className={cn(thCls, 'w-[35%]')}>Nombre persona</th>
                  <th className={cn(thCls, 'w-[22%]')}>Lo que debe</th>
                  <th className={cn(thCls, 'w-[22%]')}>Fecha</th>
                  <th className={cn(thCls, 'w-[15%]')}>Estado</th>
                  <th className="w-[6%]" />
                </tr>
              </thead>
              <tbody>
                {fiadoRows.map((row, idx) => (
                  <tr key={row._id} className={cn('border-t', rowBg(idx), isDarkMode ? 'border-white/5' : 'border-black/5')}>
                    <td className="px-1 py-0.5">
                      <input
                        type="text"
                        value={row.nombre}
                        onChange={(e) => updateFiadoRow(row._id, 'nombre', e.target.value)}
                        placeholder="Nombre"
                        className={cellInput(isDarkMode)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <div className="relative">
                        <span className={cn('absolute left-2 top-1/2 -translate-y-1/2 text-xs select-none', isDarkMode ? 'text-white/30' : 'text-black/30')}>$</span>
                        <input
                          type="number"
                          min="0"
                          value={row.loDebe}
                          onChange={(e) => updateFiadoRow(row._id, 'loDebe', e.target.value)}
                          className={cn(cellInput(isDarkMode), 'pl-5')}
                        />
                      </div>
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        type="text"
                        value={row.fecha}
                        onChange={(e) => updateFiadoRow(row._id, 'fecha', e.target.value)}
                        placeholder="DD/MM/AAAA"
                        className={cellInput(isDarkMode)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <select
                        value={row.estado}
                        onChange={(e) => updateFiadoRow(row._id, 'estado', e.target.value)}
                        className={cn(
                          'w-full bg-transparent border-0 outline-none text-xs font-bold px-1 py-2 rounded-md cursor-pointer',
                          row.estado === 'pagado' ? 'text-green-500' : isDarkMode ? 'text-[#FFD700]/80' : 'text-[#B8860B]',
                        )}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="pagado">Pagado</option>
                      </select>
                    </td>
                    <td className="pr-2 py-0.5 text-center">
                      <button
                        onClick={() => setFiadoRows((prev) => prev.filter((r) => r._id !== row._id))}
                        disabled={fiadoRows.length === 1}
                        className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-all',
                          fiadoRows.length === 1
                            ? 'opacity-20 cursor-not-allowed'
                            : 'bg-red-500/15 text-red-400 hover:bg-red-500/25',
                        )}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add row */}
          <button
            onClick={() => setFiadoRows((prev) => [...prev, emptyFiadoRow()])}
            className={cn(
              'w-full py-3 flex items-center justify-center gap-2 text-sm font-bold transition-all border-t',
              isDarkMode
                ? 'border-white/5 text-white/30 hover:text-[#B8860B] hover:bg-white/3'
                : 'border-black/5 text-black/30 hover:text-[#B8860B] hover:bg-black/2',
            )}
          >
            <Plus className="w-4 h-4" />
            Agregar fila
          </button>
        </div>

        {/* Summary */}
        <div className={cn('px-5 py-4 rounded-xl flex justify-between items-center', isDarkMode ? 'bg-[#B8860B]/10' : 'bg-[#FFF8DC]')}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">Total pendiente</p>
            <p className="text-xs opacity-40 mt-0.5">
              {fiadoRows.filter((r) => r.estado === 'pendiente').length} deuda(s) sin cobrar
            </p>
          </div>
          <span className={cn('text-3xl font-black', totalPendiente > 0 ? 'text-[#B8860B]' : isDarkMode ? 'text-white/20' : 'text-black/20')}>
            ${fmtCOP(totalPendiente)}
          </span>
        </div>

        {/* Confirm button */}
        <button
          onClick={handleSaveFiados}
          disabled={isSaving || !fiadoRows.some((r) => r.nombre.trim())}
          className={cn(
            'w-full h-14 rounded-2xl font-black text-base flex items-center justify-center gap-3 transition-all duration-300',
            isSaving
              ? isDarkMode ? 'bg-white/10 text-white/40' : 'bg-black/10 text-black/30'
              : fiadoRows.some((r) => r.nombre.trim())
                ? 'bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-lg active:scale-[0.98]'
                : isDarkMode ? 'bg-white/8 text-white/25 cursor-not-allowed' : 'bg-black/8 text-black/25 cursor-not-allowed',
          )}
        >
          {isSaving ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Guardando...</>
          ) : (
            <><CheckCircle2 className="w-5 h-5" /> Confirmar y Guardar</>
          )}
        </button>
      </div>
    );
  };

  // ── Success screen ────────────────────────────────────────────────────────

  const renderSuccess = () => (
    <div className={cn(
      'rounded-[2rem] p-8 flex flex-col items-center justify-center gap-5 text-center',
      isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm',
    )}>
      <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center">
        <CheckCircle2 className="w-10 h-10 text-green-500" />
      </div>
      <div>
        <p className="font-black text-xl text-green-500">¡Guardado!</p>
        <p className={cn('text-sm mt-2 leading-relaxed', isDarkMode ? 'text-white/60' : 'text-black/50')}>
          {successMsg}
        </p>
      </div>
      <button
        onClick={reset}
        className="mt-2 px-8 py-3 rounded-2xl bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black font-black text-sm flex items-center gap-2 shadow-lg active:scale-95 transition-all"
      >
        <Camera className="w-4 h-4" />
        Analizar otra foto
      </button>
    </div>
  );

  // ── Registro manual de deuda ──────────────────────────────────────────────

  const handleSaveDebtManual = async () => {
    const nombre = capitalizar(debtFormNombre.trim());
    const monto = parseNum(debtFormMonto);
    if (!nombre || !esMontoValido(monto)) return;
    setSavingDebt(true);
    try {
      const concept = debtType === 'me-deben' ? 'Fiado' : 'Deuda';
      const fechaDate = debtFormFecha
        ? new Date(debtFormFecha + 'T12:00:00')
        : new Date();
      await addDoc(collection(db, 'users', userId, 'debts'), {
        name: nombre,
        concept,
        amount: monto,
        type: debtType,
        status: 'pendiente',
        createdAt: Timestamp.fromDate(fechaDate),
      });
      if (debtType === 'me-deben') {
        await addDoc(collection(db, 'users', userId, 'expenses'), {
          concept: `Préstamo a ${nombre}`,
          amount: monto,
          createdAt: Timestamp.fromDate(fechaDate),
          source: 'manual',
        });
      } else {
        await addDoc(collection(db, 'users', userId, 'sales'), {
          items: [{ product: `Préstamo de ${nombre}`, quantity: 1, unitPrice: monto, subtotal: monto }],
          total: monto,
          createdAt: Timestamp.fromDate(fechaDate),
          source: 'manual',
        });
      }
      setDebtFormNombre('');
      setDebtFormMonto('');
      setDebtFormFecha(new Date().toISOString().split('T')[0]);
      setShowDebtForm(false);
      showToast('¡Listo! Deuda registrada');
    } catch (e: any) {
      console.error('[DeudaManual] Error:', e?.code, e?.message, e);
    } finally {
      setSavingDebt(false);
    }
  };

  // ── Debts section (original) ──────────────────────────────────────────────

  const TipCard: React.FC<{ text: string; onDismiss: () => void }> = ({ text, onDismiss }) => (
    <div
      className={cn('flex-shrink-0 w-64 flex items-start justify-between gap-3 px-4 py-3 rounded-xl border-l-4', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#F5F0E8]')}
      style={{ borderLeftColor: '#F5A623' }}
    >
      <p className={cn('text-sm font-medium leading-snug', isDarkMode ? 'text-[#FDFBF0]/70' : 'text-[#5b5c5a]')}>{text}</p>
      <button onClick={onDismiss} className="flex-shrink-0 opacity-40 hover:opacity-70 transition-opacity mt-0.5">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const renderDeudasSection = () => (
    <section className="space-y-6">
      <div className="flex justify-between items-end px-1">
        <div>
          <h2 className="text-2xl font-black text-[#B8860B] font-['Plus_Jakarta_Sans']">Deudas y Fiados</h2>
          <p className="text-xs opacity-50 font-bold uppercase tracking-widest">Control de cartera</p>
        </div>
        <button
          onClick={() => { setShowDebtForm((v) => !v); setDebtFormNombre(''); setDebtFormMonto(''); setDebtFormFecha(new Date().toISOString().split('T')[0]); }}
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95',
            showDebtForm ? 'bg-red-500 text-white' : 'bg-[#B8860B] text-black',
          )}
        >
          {showDebtForm ? <X className="w-5 h-5" /> : <Plus className="w-6 h-6" />}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className={cn('p-4 rounded-xl border-l-4 border-[#B8860B]', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Me deben</p>
          <p className="text-xl font-black text-[#B8860B]">${totalMeDeben.toLocaleString('es-CO')}</p>
        </div>
        <div className={cn('p-4 rounded-xl border-l-4 border-red-400/60', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Debo</p>
          <p className="text-xl font-black opacity-80">${totalDebo.toLocaleString('es-CO')}</p>
        </div>
      </div>

      <div className={cn('flex p-1 rounded-2xl transition-colors', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f1f1ee]')}>
        <button
          onClick={() => { setDebtType('me-deben'); setShowDebtForm(false); setShowHistory(false); }}
          className={cn(
            'flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
            !showHistory && debtType === 'me-deben'
              ? isDarkMode ? 'bg-[#B8860B] text-black shadow-lg' : 'bg-white text-[#B8860B] shadow-sm'
              : 'opacity-50',
          )}
        >
          <ArrowUpRight className="w-4 h-4" />
          Me deben
        </button>
        <button
          onClick={() => { setDebtType('debo'); setShowDebtForm(false); setShowHistory(false); }}
          className={cn(
            'flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
            !showHistory && debtType === 'debo'
              ? isDarkMode ? 'bg-[#B8860B] text-black shadow-lg' : 'bg-white text-[#B8860B] shadow-sm'
              : 'opacity-50',
          )}
        >
          <ArrowDownRight className="w-4 h-4" />
          Debo
        </button>
        <button
          onClick={() => { setShowHistory(true); setShowDebtForm(false); }}
          className={cn(
            'flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
            showHistory
              ? isDarkMode ? 'bg-[#B8860B] text-black shadow-lg' : 'bg-white text-[#B8860B] shadow-sm'
              : 'opacity-50',
          )}
        >
          <Clock className="w-4 h-4" />
          Historial
        </button>
      </div>

      {/* Formulario manual de deuda */}
      {showDebtForm && (
        <div className={cn('p-5 rounded-2xl space-y-4 border', isDarkMode ? 'bg-[#1A1A1A] border-white/8' : 'bg-white shadow-sm border-black/5')}>
          <p className="font-black text-[#B8860B] text-sm uppercase tracking-widest">
            {debtType === 'me-deben' ? 'Nueva deuda a cobrar' : 'Nueva deuda a pagar'}
          </p>
          <div className="space-y-3">
            <input
              type="text"
              value={debtFormNombre}
              onChange={(e) => setDebtFormNombre(e.target.value)}
              placeholder={debtType === 'me-deben' ? 'Nombre de la persona' : 'Nombre de la persona o proveedor'}
              className={cn(
                'w-full h-11 rounded-xl px-4 text-sm outline-none border',
                isDarkMode
                  ? 'bg-[#2A2A2A] border-white/8 text-[#FDFBF0] placeholder:text-white/30'
                  : 'bg-[#FDFBF0] border-black/8 placeholder:text-black/30',
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <label className={cn('absolute -top-2 left-3 text-[10px] font-bold px-1 rounded z-10', isDarkMode ? 'bg-[#1A1A1A] text-white/40' : 'bg-white text-black/40')}>
                  {debtType === 'me-deben' ? 'Monto que me debe' : 'Monto que debo'}
                </label>
                <div className="relative">
                  <span className={cn('absolute left-3 top-1/2 -translate-y-1/2 text-sm select-none', isDarkMode ? 'text-white/30' : 'text-black/30')}>$</span>
                  <input
                    type="number"
                    min="0"
                    value={debtFormMonto}
                    onChange={(e) => setDebtFormMonto(e.target.value)}
                    placeholder="0"
                    className={cn(
                      'w-full h-11 rounded-xl pl-7 pr-2 text-sm outline-none border',
                      isDarkMode
                        ? 'bg-[#2A2A2A] border-white/8 text-[#FDFBF0] placeholder:text-white/30'
                        : 'bg-[#FDFBF0] border-black/8 placeholder:text-black/30',
                    )}
                  />
                </div>
              </div>
              <div className="relative">
                <label className={cn('absolute -top-2 left-3 text-[10px] font-bold px-1 rounded z-10', isDarkMode ? 'bg-[#1A1A1A] text-white/40' : 'bg-white text-black/40')}>
                  Fecha
                </label>
                <input
                  type="date"
                  value={debtFormFecha}
                  onChange={(e) => setDebtFormFecha(e.target.value)}
                  className={cn(
                    'w-full h-11 rounded-xl px-3 text-sm outline-none border',
                    isDarkMode
                      ? 'bg-[#2A2A2A] border-white/8 text-[#FDFBF0]'
                      : 'bg-[#FDFBF0] border-black/8',
                  )}
                />
              </div>
            </div>
          </div>
          <button
            onClick={handleSaveDebtManual}
            disabled={savingDebt || !debtFormNombre.trim() || !esMontoValido(parseNum(debtFormMonto))}
            className={cn(
              'w-full h-12 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all',
              savingDebt || !debtFormNombre.trim() || !esMontoValido(parseNum(debtFormMonto))
                ? isDarkMode ? 'bg-white/8 text-white/25 cursor-not-allowed' : 'bg-black/8 text-black/25 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-lg active:scale-[0.98]',
            )}
          >
            {savingDebt
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
              : <><Check className="w-4 h-4" /> Guardar</>}
          </button>
        </div>
      )}

      {/* Consejos */}
      {debtTips.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Lightbulb className="w-4 h-4" style={{ color: '#F5A623' }} />
            <p className={cn('text-sm font-black', isDarkMode ? 'text-white/60' : 'text-[#5b5c5a]')}>Consejos</p>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {debtTips.map(tip => (
              <TipCard
                key={tip.id}
                text={tip.text}
                onDismiss={() => setDismissedDebtTips(prev => { const s = new Set(prev); s.add(tip.id); return s; })}
              />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {showHistory ? (() => {
          const historyDebts = [...debts].sort((a, b) => getDebtDate(b).getTime() - getDebtDate(a).getTime());
          if (historyDebts.length === 0) return (
            <div className={cn('p-10 rounded-2xl flex flex-col items-center justify-center gap-3 text-center', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
              <Clock className={cn('w-7 h-7', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/40')} />
              <p className={cn('font-bold', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>Sin historial aún</p>
            </div>
          );
          return historyDebts.map((item) => {
            const status = item.status ?? 'pendiente';
            const pending = item.amount - (item.amountPaid ?? 0);
            return (
              <button
                key={item.id}
                onClick={() => setSelectedDebt(item)}
                className={cn(
                  'w-full p-4 rounded-2xl shadow-sm border-l-4 flex items-center justify-between text-left active:scale-[0.98] transition-all',
                  isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white',
                  item.type === 'me-deben' ? 'border-[#B8860B]' : 'border-red-500/50',
                  status === 'pagada' ? 'opacity-60' : '',
                )}
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm">{item.name}</p>
                  <p className={cn('text-[11px] opacity-40 truncate')}>{item.concept} · {formatRelativeDate(getDebtDate(item))}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <p className={cn('font-black text-base', item.type === 'me-deben' ? 'text-[#B8860B]' : 'text-red-500')}>
                      ${item.amount.toLocaleString('es-CO')}
                    </p>
                    <span className={cn(
                      'text-[9px] px-2 py-0.5 rounded-full font-black uppercase',
                      status === 'pagada'
                        ? 'bg-green-500/15 text-green-600'
                        : status === 'parcial'
                          ? 'bg-amber-100 text-amber-700'
                          : item.type === 'me-deben'
                            ? isDarkMode ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'bg-[#FFF8DC] text-[#483000]'
                            : 'bg-red-500/10 text-red-500',
                    )}>
                      {status === 'pagada' ? 'SALDADA' : status === 'parcial' ? `PENDIENTE $${pending.toLocaleString('es-CO')}` : item.type === 'me-deben' ? 'A COBRAR' : 'A PAGAR'}
                    </span>
                  </div>
                  <ChevronRight className={cn('w-4 h-4', isDarkMode ? 'text-white/20' : 'text-black/20')} />
                </div>
              </button>
            );
          });
        })() : filteredDebts.length === 0 ? (
          <div className={cn('p-10 rounded-2xl flex flex-col items-center justify-center gap-3 text-center', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
            <div className={cn('w-14 h-14 rounded-full flex items-center justify-center', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#f1f1ee]')}>
              <Users className={cn('w-7 h-7', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/40')} />
            </div>
            <p className={cn('font-bold', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>
              {debtType === 'me-deben' ? 'Nadie te debe por ahora' : 'No tienes deudas registradas'}
            </p>
            <p className={cn('text-xs', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/60')}>
              Dile al asistente "{debtType === 'me-deben' ? 'Juan me debe 20 mil' : 'le debo 50 mil al proveedor'}"
            </p>
          </div>
        ) : (
          filteredDebts.map((item) => (
            <div
              key={item.id}
              className={cn(
                'w-full rounded-2xl shadow-sm border-l-4 overflow-hidden',
                isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white',
                item.type === 'me-deben' ? 'border-[#B8860B]' : 'border-red-500/50',
              )}
            >
              {/* Fila principal — abre detalle */}
              <button
                onClick={() => setSelectedDebt(item)}
                className="w-full p-5 flex items-center justify-between text-left active:scale-[0.98] transition-all duration-200"
              >
                <div>
                  <p className="font-bold text-lg">{item.name}</p>
                  <p className="text-xs opacity-40">{item.concept} · {formatRelativeDate(getDebtDate(item))}</p>
                </div>
                <div className="flex items-center gap-1">
                  <div className="text-right">
                    <p className={cn('font-black text-xl', item.type === 'me-deben' ? 'text-[#B8860B]' : 'opacity-70')}>
                      ${(item.amount - (item.amountPaid ?? 0)).toLocaleString('es-CO')}
                    </p>
                    {item.status === 'parcial' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-amber-100 text-amber-700">
                        PARCIAL
                      </span>
                    ) : (
                      <span className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase',
                        isDarkMode ? 'bg-[#FFD700]/10 text-[#FFD700]' : 'bg-[#FFF8DC] text-[#483000]',
                      )}>
                        {item.type === 'me-deben' ? 'A COBRAR' : 'A PAGAR'}
                      </span>
                    )}
                  </div>
                  <ChevronRight className={cn('w-4 h-4 flex-shrink-0', isDarkMode ? 'text-white/20' : 'text-black/20')} />
                </div>
              </button>

              {/* Botón de acción según tipo */}
              <div className="px-5 pb-4">
                {item.type === 'me-deben' ? (
                  <button
                    onClick={() => handleMarkPaid(item)}
                    disabled={payingDebtId === item.id}
                    className={cn(
                      'w-full py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]',
                      payingDebtId === item.id
                        ? isDarkMode ? 'bg-white/5 text-white/30' : 'bg-black/5 text-black/30'
                        : 'bg-green-500/15 text-green-600 hover:bg-green-500/25',
                    )}
                  >
                    {payingDebtId === item.id
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</>
                      : <><CheckCircle2 className="w-4 h-4" /> Pago recibido</>}
                  </button>
                ) : (
                  <button
                    onClick={() => handleMarkPaid(item)}
                    disabled={payingDebtId === item.id}
                    className={cn(
                      'w-full py-2.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]',
                      payingDebtId === item.id
                        ? isDarkMode ? 'bg-white/5 text-white/30' : 'bg-black/5 text-black/30'
                        : isDarkMode ? 'bg-[#B8860B]/20 text-[#FFD700] hover:bg-[#B8860B]/30' : 'bg-[#FFF8DC] text-[#B8860B] hover:bg-[#FFD700]/30',
                    )}
                  >
                    {payingDebtId === item.id
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</>
                      : <><CheckCircle2 className="w-4 h-4" /> Pago realizado</>}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

    </section>
  );


  // ─────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Hidden file inputs */}
      <input ref={galleryRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore — capture="environment" is valid HTML but TS types vary */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onFileChange} className="hidden" />

      {/* OCR Flow */}
      {step === 'idle' && renderUpload()}
      {step === 'mode-select' && renderModeSelect()}
      {step === 'analyzing' && renderAnalyzing()}
      {(step === 'table' || step === 'saving') && ocrMode === 'ventas-dia' && renderVentasTable()}
      {(step === 'table' || step === 'saving') && ocrMode === 'nuevo-stock' && renderStockTable()}
      {(step === 'table' || step === 'saving') && (ocrMode === 'fiados-me-deben' || ocrMode === 'fiados-debo') && renderFiadosTable()}
      {step === 'success' && renderSuccess()}

      {/* Deudas section — always visible on idle */}
      {step === 'idle' && renderDeudasSection()}

      {/* Toast flotante */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-3 duration-300">
          <div className={cn(
            'flex items-center gap-2 px-5 py-3 rounded-2xl shadow-2xl font-black text-sm whitespace-nowrap',
            isDarkMode ? 'bg-[#1A1A1A] text-[#FFD700] border border-[#B8860B]/30' : 'bg-white text-[#B8860B] border border-[#DAA520]/20',
          )}>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            {toast}
          </div>
        </div>
      )}

      {selectedDebt && (
        <MovementDetailModal
          item={{ kind: 'debt', data: selectedDebt }}
          isDarkMode={isDarkMode}
          onClose={() => setSelectedDebt(null)}
        />
      )}
    </div>
  );
};
