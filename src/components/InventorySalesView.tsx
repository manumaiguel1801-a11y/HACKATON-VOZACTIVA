import React, { useState, useMemo } from 'react';
import {
  Package, ShoppingBag, Plus, Search,
  TrendingUp, Box, History, ArrowUpRight,
  Pencil, Trash2, Check, X, Loader2, Lightbulb,
  List, LayoutGrid, MoreVertical, DollarSign, AlertTriangle,
  SlidersHorizontal,
} from 'lucide-react';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { cn, capitalizar, detectarGenero } from '../lib/utils';
import { Sale, InventoryProduct, getSaleLabel, getSaleQtyLabel, getPrecioVenta, getPrecioCompra, getMargen } from '../types';
import { MovementDetailModal } from './MovementDetailModal';

function getSaleDate(sale: Sale): Date {
  return sale.createdAt?.toDate ? sale.createdAt.toDate() : new Date();
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const saleDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const timeStr = date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  if (saleDay.getTime() === today.getTime()) return `Hoy, ${timeStr}`;
  if (saleDay.getTime() === yesterday.getTime()) return `Ayer, ${timeStr}`;
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) + `, ${timeStr}`;
}

function generateSKU(nombre: string, index: number): string {
  const letters = nombre.replace(/\s+/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  return `${letters}-${String(index + 1).padStart(3, '0')}`;
}

function getProductEmoji(nombre: string): string {
  const n = nombre.toLowerCase();
  if (/arroz|cereal|granos/.test(n)) return '🌾';
  if (/leche|lácteo|queso|yogur/.test(n)) return '🥛';
  if (/carne|pollo|pescado/.test(n)) return '🥩';
  if (/fruta|manzana|banano|naranja/.test(n)) return '🍎';
  if (/verdura|papa|tomate|cebolla/.test(n)) return '🥦';
  if (/bebida|agua|jugo|gaseosa/.test(n)) return '🥤';
  if (/jabón|detergente|aseo/.test(n)) return '🧴';
  if (/pan|harina|azúcar/.test(n)) return '🍞';
  return '📦';
}

interface Props {
  isDarkMode: boolean;
  sales: Sale[];
  inventory: InventoryProduct[];
  userId: string;
}

const TipCard: React.FC<{ text: string; onDismiss: () => void; isDarkMode: boolean }> = ({ text, onDismiss, isDarkMode }) => (
  <div
    className={cn('flex-shrink-0 w-64 md:w-auto flex items-start justify-between gap-3 px-4 py-3 rounded-xl border-l-4', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#F5F0E8]')}
    style={{ borderLeftColor: '#F5A623' }}
  >
    <p className={cn('text-sm font-medium leading-snug', isDarkMode ? 'text-[#FDFBF0]/70' : 'text-[#5b5c5a]')}>{text}</p>
    <button onClick={onDismiss} className="flex-shrink-0 opacity-40 hover:opacity-70 transition-opacity mt-0.5">
      <X className="w-3.5 h-3.5" />
    </button>
  </div>
);

export const InventorySalesView = ({ isDarkMode, sales, inventory, userId }: Props) => {
  const [activeSubTab, setActiveSubTab] = useState<'inventario' | 'ventas'>('inventario');

  return (
    <div>
      {/* ── Mobile layout ── */}
      <div className="md:hidden space-y-6 max-w-4xl mx-auto">
        <div className={cn('flex p-1 rounded-2xl transition-colors max-w-2xl', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f1f1ee]')}>
          <button
            onClick={() => setActiveSubTab('inventario')}
            className={cn(
              'flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all',
              activeSubTab === 'inventario'
                ? isDarkMode ? 'bg-[#B8860B] text-black shadow-lg' : 'bg-white text-[#B8860B] shadow-sm'
                : 'opacity-50'
            )}
          >
            <Package className="w-5 h-5" />
            Inventario
          </button>
          <button
            onClick={() => setActiveSubTab('ventas')}
            className={cn(
              'flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all',
              activeSubTab === 'ventas'
                ? isDarkMode ? 'bg-[#B8860B] text-black shadow-lg' : 'bg-white text-[#B8860B] shadow-sm'
                : 'opacity-50'
            )}
          >
            <ShoppingBag className="w-5 h-5" />
            Ventas
          </button>
        </div>

        {activeSubTab === 'inventario' ? (
          <InventorySection isDarkMode={isDarkMode} inventory={inventory} userId={userId} />
        ) : (
          <SalesSection isDarkMode={isDarkMode} sales={sales} />
        )}
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden md:block">
        <InventorySection isDarkMode={isDarkMode} inventory={inventory} userId={userId} />
      </div>
    </div>
  );
};

// ─── Inventory Section ─────────────────────────────────────────────────────

interface InventorySectionProps {
  isDarkMode: boolean;
  inventory: InventoryProduct[];
  userId: string;
}

const InventorySection = ({ isDarkMode, inventory, userId }: InventorySectionProps) => {
  // Mobile state
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(() => new Set());
  const [formNombre, setFormNombre] = useState('');
  const [formCantidad, setFormCantidad] = useState('');
  const [formPrecioCompra, setFormPrecioCompra] = useState('');
  const [formPrecioVenta, setFormPrecioVenta] = useState('');
  const [saving, setSaving] = useState(false);

  // Per-product edit state (shared mobile + desktop)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editCantidad, setEditCantidad] = useState('');
  const [editPrecioCompra, setEditPrecioCompra] = useState('');
  const [editPrecioVenta, setEditPrecioVenta] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Desktop-only state
  const [desktopSearch, setDesktopSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [openDesktopDropdownId, setOpenDesktopDropdownId] = useState<string | null>(null);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  const stockBajo = useMemo(() => inventory.filter((p) => (p.cantidad ?? 0) < 5).length, [inventory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? inventory.filter((p) => p.nombre.toLowerCase().includes(q)) : inventory;
  }, [inventory, search]);

  const desktopFiltered = useMemo(() => {
    let list = showLowStockOnly ? inventory.filter(p => (p.cantidad ?? 0) < 5) : inventory;
    const q = desktopSearch.trim().toLowerCase();
    return q ? list.filter(p => p.nombre.toLowerCase().includes(q)) : list;
  }, [inventory, desktopSearch, showLowStockOnly]);

  const totalValue = useMemo(() =>
    inventory.reduce((sum, p) => sum + (getPrecioVenta(p) || 0) * (p.cantidad ?? 0), 0),
  [inventory]);

  const avgMargin = useMemo(() => {
    const withMargin = inventory.filter(p => getPrecioCompra(p) > 0 && getPrecioVenta(p) > 0);
    if (!withMargin.length) return null;
    const total = withMargin.reduce((sum, p) =>
      sum + ((getPrecioVenta(p) - getPrecioCompra(p)) / getPrecioCompra(p)) * 100, 0);
    return Math.round(total / withMargin.length);
  }, [inventory]);

  const handleAdd = async () => {
    const nombre = capitalizar(formNombre.trim());
    const cantidad = parseFloat(formCantidad) || 0;
    const precioCompra = parseFloat(formPrecioCompra) || 0;
    const precioVenta = parseFloat(formPrecioVenta) || 0;
    if (!nombre) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'users', userId, 'inventario'), {
        nombre,
        cantidad,
        precioCompra,
        precioVenta,
        createdAt: serverTimestamp(),
      });
      setFormNombre('');
      setFormCantidad('');
      setFormPrecioCompra('');
      setFormPrecioVenta('');
      setShowForm(false);
    } catch (e) {
      console.error('[Inventario] Error al agregar:', e);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (product: InventoryProduct) => {
    setEditingId(product.id);
    setEditNombre(product.nombre);
    setEditCantidad(String(product.cantidad));
    setEditPrecioCompra(String(getPrecioCompra(product)));
    setEditPrecioVenta(String(getPrecioVenta(product)));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditNombre('');
    setEditCantidad('');
    setEditPrecioCompra('');
    setEditPrecioVenta('');
  };

  const handleSaveEdit = async (product: InventoryProduct) => {
    setUpdatingId(product.id);
    try {
      await updateDoc(doc(db, 'users', userId, 'inventario', product.id), {
        nombre: capitalizar(editNombre.trim()) || product.nombre,
        cantidad: parseFloat(editCantidad) || 0,
        precioCompra: parseFloat(editPrecioCompra) || 0,
        precioVenta: parseFloat(editPrecioVenta) || 0,
        updatedAt: serverTimestamp(),
      });
      setEditingId(null);
    } catch (e) {
      console.error('[Inventario] Error al actualizar:', e);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, 'users', userId, 'inventario', id));
    } catch (e) {
      console.error('[Inventario] Error al eliminar:', e);
    } finally {
      setDeletingId(null);
    }
  };

  const inventoryTips = useMemo(() => {
    const result: { id: string; text: string }[] = [];

    inventory.forEach(p => {
      const qty = p.cantidad ?? 0;
      const nombre = p.nombre;
      const genero = detectarGenero(nombre);

      if (qty === 0) {
        const articulo = nombre.trim().slice(-1).toLowerCase() === 'a' ? 'la' : 'el';
        result.push({ id: `zero-${p.id}`, text: `Se te acabó ${articulo} ${nombre}. Toca reponer.` });
      } else if (qty < 5) {
        const unidad = qty === 1 ? 'unidad' : 'unidades';
        const texto =
          genero === 'femenino'  ? `Te quedan pocas ${nombre}, solo ${qty} ${unidad}. ¿Ya pediste más?` :
          genero === 'masculino' ? `Te quedan pocos ${nombre}, solo ${qty} ${unidad}. ¿Ya pediste más?` :
                                   `Te queda poco ${nombre}, solo ${qty} ${unidad}. ¿Ya pediste más?`;
        result.push({ id: `low-${p.id}`, text: texto });
      }
    });

    if (inventory.length > 0) {
      const ts = inventory.map(p => {
        const d = p.updatedAt?.toDate ? p.updatedAt.toDate() : p.createdAt?.toDate ? p.createdAt.toDate() : null;
        return d ? d.getTime() : 0;
      }).filter(t => t > 0);
      if (ts.length > 0 && (Date.now() - Math.max(...ts)) / 86400000 > 3) {
        result.push({ id: 'sin-actualizar', text: 'Llevas 3 días sin actualizar el inventario. ¿Todo bien con el stock?' });
      }
    }

    return result.filter(t => !dismissedTips.has(t.id)).slice(0, 3);
  }, [inventory, dismissedTips]);

  // ─── Desktop add/edit modal form ───────────────────────────────────────────
  const renderDesktopFormModal = (mode: 'add' | 'edit', product?: InventoryProduct) => (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => mode === 'add' ? setShowForm(false) : cancelEdit()}
    >
      <div
        className={cn('w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-black text-[#B8860B] text-sm uppercase tracking-widest">
            {mode === 'add' ? 'Nuevo producto' : 'Editar producto'}
          </p>
          <button
            onClick={() => mode === 'add' ? setShowForm(false) : cancelEdit()}
            className="opacity-40 hover:opacity-70 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          type="text"
          value={mode === 'add' ? formNombre : editNombre}
          onChange={e => mode === 'add' ? setFormNombre(e.target.value) : setEditNombre(e.target.value)}
          placeholder="Nombre del producto"
          className={cn(
            'w-full h-11 rounded-xl px-4 text-sm outline-none border',
            isDarkMode ? 'bg-[#2A2A2A] border-white/8 text-[#FDFBF0] placeholder:text-white/30' : 'bg-[#FDFBF0] border-black/8 placeholder:text-black/30',
          )}
        />
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Cantidad', value: mode === 'add' ? formCantidad : editCantidad, onChange: (v: string) => mode === 'add' ? setFormCantidad(v) : setEditCantidad(v), prefix: false },
            { label: 'P. compra', value: mode === 'add' ? formPrecioCompra : editPrecioCompra, onChange: (v: string) => mode === 'add' ? setFormPrecioCompra(v) : setEditPrecioCompra(v), prefix: true },
            { label: 'P. venta', value: mode === 'add' ? formPrecioVenta : editPrecioVenta, onChange: (v: string) => mode === 'add' ? setFormPrecioVenta(v) : setEditPrecioVenta(v), prefix: true },
          ].map(({ label, value, onChange, prefix }) => (
            <div key={label} className="relative pt-3">
              <label className={cn('absolute top-1.5 left-3 text-[10px] font-bold px-1 rounded z-10', isDarkMode ? 'bg-[#1A1A1A] text-white/40' : 'bg-white text-black/40')}>
                {label}
              </label>
              <div className="relative">
                {prefix && <span className={cn('absolute left-3 top-1/2 -translate-y-1/2 text-sm select-none', isDarkMode ? 'text-white/30' : 'text-black/30')}>$</span>}
                <input
                  type="number"
                  min="0"
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  placeholder="0"
                  className={cn(
                    'w-full h-11 rounded-xl text-sm outline-none border',
                    prefix ? 'pl-7 pr-2' : 'px-4',
                    isDarkMode ? 'bg-[#2A2A2A] border-white/8 text-[#FDFBF0] placeholder:text-white/30' : 'bg-[#FDFBF0] border-black/8 placeholder:text-black/30',
                  )}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => mode === 'add' ? handleAdd() : product && handleSaveEdit(product)}
          disabled={saving || updatingId === product?.id || (mode === 'add' ? !formNombre.trim() : !editNombre.trim())}
          className={cn(
            'w-full h-12 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all',
            (saving || updatingId === product?.id || (mode === 'add' ? !formNombre.trim() : !editNombre.trim()))
              ? isDarkMode ? 'bg-white/8 text-white/25 cursor-not-allowed' : 'bg-black/8 text-black/25 cursor-not-allowed'
              : 'bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-lg active:scale-[0.98]',
          )}
        >
          {(saving || updatingId === product?.id)
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
            : <><Check className="w-4 h-4" /> {mode === 'add' ? 'Guardar producto' : 'Actualizar producto'}</>
          }
        </button>
      </div>
    </div>
  );

  // ─── Desktop inventory section ──────────────────────────────────────────────
  const renderDesktopInventorySection = () => {
    const lowStockCount = inventory.filter(p => (p.cantidad ?? 0) < 5).length;
    const editingProduct = editingId ? inventory.find(p => p.id === editingId) : undefined;

    return (
      <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500" onClick={() => setOpenDesktopDropdownId(null)}>

        {/* Add modal */}
        {showForm && renderDesktopFormModal('add')}

        {/* Edit modal */}
        {editingId && editingProduct && renderDesktopFormModal('edit', editingProduct)}

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className={cn('text-2xl font-black', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>
            Inventario
          </h2>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#B8860B] text-black font-bold text-sm shadow-md hover:bg-[#D4AF37] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agregar producto
          </button>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-4">
          {/* Productos totales */}
          <div className={cn('p-5 rounded-2xl shadow-sm', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', isDarkMode ? 'bg-[#B8860B]/20' : 'bg-[#FFD700]/15')}>
              <Box className="w-5 h-5 text-[#B8860B]" />
            </div>
            <p className={cn('text-2xl font-black', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>{inventory.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">activos</p>
            <p className={cn('text-xs font-semibold mt-2', isDarkMode ? 'text-white/40' : 'text-gray-500')}>Productos totales</p>
          </div>

          {/* Stock bajo */}
          <div className={cn('p-5 rounded-2xl shadow-sm', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', isDarkMode ? 'bg-red-500/20' : 'bg-red-100')}>
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <p className={cn('text-2xl font-black', lowStockCount > 0 ? 'text-red-500' : isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>{lowStockCount}</p>
            <p className="text-xs text-gray-400 mt-0.5">productos</p>
            <p className={cn('text-xs font-semibold mt-2', isDarkMode ? 'text-white/40' : 'text-gray-500')}>Stock bajo</p>
          </div>

          {/* Valor del inventario */}
          <div className={cn('p-5 rounded-2xl shadow-sm', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', isDarkMode ? 'bg-green-500/20' : 'bg-green-100')}>
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <p className={cn('text-2xl font-black truncate', isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>
              ${totalValue.toLocaleString('es-CO')}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">valor total</p>
            <p className={cn('text-xs font-semibold mt-2', isDarkMode ? 'text-white/40' : 'text-gray-500')}>Valor del inventario</p>
          </div>

          {/* Margen promedio */}
          <div className={cn('p-5 rounded-2xl shadow-sm', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-3', isDarkMode ? 'bg-[#B8860B]/20' : 'bg-[#FFD700]/15')}>
              <TrendingUp className="w-5 h-5 text-[#B8860B]" />
            </div>
            <p className="text-2xl font-black text-green-500">{avgMargin !== null ? `+${avgMargin}%` : '—'}</p>
            <p className="text-xs text-gray-400 mt-0.5">este mes</p>
            <p className={cn('text-xs font-semibold mt-2', isDarkMode ? 'text-white/40' : 'text-gray-500')}>Margen promedio</p>
          </div>
        </div>

        {/* Search + filter bar */}
        <div className={cn('p-3 rounded-2xl shadow-sm flex items-center gap-3', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
          <div className={cn('flex-1 flex items-center gap-2 h-9 rounded-xl border px-3', isDarkMode ? 'border-white/10 bg-[#2A2A2A]' : 'border-black/10 bg-[#FDFBF0]')}>
            <Search className="w-4 h-4 opacity-40 flex-shrink-0" />
            <input
              type="text"
              value={desktopSearch}
              onChange={e => setDesktopSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="bg-transparent border-none focus:ring-0 text-sm w-full outline-none"
            />
          </div>
          <button
            onClick={e => { e.stopPropagation(); setShowLowStockOnly(v => !v); }}
            className={cn(
              'flex items-center gap-2 h-9 px-4 rounded-xl border text-sm font-medium transition-colors',
              showLowStockOnly
                ? 'border-[#B8860B] bg-[#B8860B]/10 text-[#B8860B]'
                : isDarkMode ? 'border-white/10 text-white/60 hover:border-white/30' : 'border-black/10 text-black/60 hover:border-[#B8860B]/40'
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {showLowStockOnly ? 'Stock bajo ✓' : 'Filtrar'}
          </button>
          <div className={cn('flex items-center gap-1 p-1 rounded-xl border', isDarkMode ? 'border-white/10 bg-[#2A2A2A]' : 'border-black/10')}>
            <button
              onClick={() => setViewMode('list')}
              className={cn('w-7 h-7 rounded-lg flex items-center justify-center transition-colors', viewMode === 'list' ? 'bg-[#FFD700]/20 text-[#B8860B]' : isDarkMode ? 'text-white/40 hover:text-white/70' : 'text-black/40 hover:text-black/70')}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn('w-7 h-7 rounded-lg flex items-center justify-center transition-colors', viewMode === 'grid' ? 'bg-[#FFD700]/20 text-[#B8860B]' : isDarkMode ? 'text-white/40 hover:text-white/70' : 'text-black/40 hover:text-black/70')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table / Grid */}
        <div className={cn('rounded-2xl shadow-sm overflow-hidden', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
          {desktopFiltered.length === 0 ? (
            <div className="p-16 flex flex-col items-center gap-3 text-center">
              <div className={cn('w-14 h-14 rounded-full flex items-center justify-center', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#f1f1ee]')}>
                <Package className={cn('w-7 h-7', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/40')} />
              </div>
              <p className={cn('font-bold', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>
                {inventory.length === 0 ? 'Sin productos aún' : 'Sin resultados'}
              </p>
              <p className={cn('text-xs', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/60')}>
                {inventory.length === 0 ? 'Agrega tu primer producto con el botón de arriba' : 'Intenta con otro nombre o quita los filtros'}
              </p>
            </div>
          ) : viewMode === 'list' ? (
            <table className="w-full">
              <thead>
                <tr className={cn('text-xs font-bold uppercase tracking-wider', isDarkMode ? 'bg-[#2A2A2A] text-white/40' : 'bg-[#F9F7EE] text-black/40')}>
                  <th className="px-5 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-right">Precio venta</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3 text-right">Margen</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {desktopFiltered.map((product, idx) => {
                  const lowStock = (product.cantidad ?? 0) < 5;
                  const precioVenta = getPrecioVenta(product);
                  const precioCompra = getPrecioCompra(product);
                  const margen = precioCompra > 0 && precioVenta > 0
                    ? Math.round(((precioVenta - precioCompra) / precioCompra) * 100)
                    : null;
                  const sku = generateSKU(product.nombre, idx);
                  const emoji = getProductEmoji(product.nombre);
                  const isDropOpen = openDesktopDropdownId === product.id;
                  const isDeleting = deletingId === product.id;

                  return (
                    <tr
                      key={product.id}
                      className={cn(
                        'border-t transition-colors',
                        isDarkMode ? 'border-white/5 hover:bg-white/[0.03]' : 'border-black/5 hover:bg-[#FDFBF0]/60'
                      )}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#F9F7EE]')}>
                            {emoji}
                          </div>
                          <div>
                            <p className="font-bold text-sm">{product.nombre}</p>
                            <p className="text-xs text-gray-400">SKU: {sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-sm text-[#B8860B]">
                          ${(precioVenta || 0).toLocaleString('es-CO')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className={cn('font-bold text-sm', lowStock ? 'text-red-500' : isDarkMode ? 'text-[#FDFBF0]' : 'text-[#2e2f2d]')}>
                          {product.cantidad ?? 0}
                        </p>
                        <p className={cn('text-xs', lowStock ? 'text-red-400' : 'text-gray-400')}>
                          {lowStock ? 'Stock bajo' : 'Disponible'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('text-sm', isDarkMode ? 'text-[#FDFBF0]/80' : 'text-[#2e2f2d]')}>
                          ${(precioCompra || 0).toLocaleString('es-CO')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('text-sm font-bold', margen !== null ? 'text-green-500' : 'text-gray-400')}>
                          {margen !== null ? `+${margen}%` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold',
                          isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                        )}>
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Activo
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => startEdit(product)}
                            className={cn(
                              'w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-105',
                              isDarkMode ? 'bg-[#B8860B]/15 text-[#FFD700] hover:bg-[#B8860B]/25' : 'bg-[#FFF8DC] text-[#B8860B] hover:bg-[#FFD700]/30'
                            )}
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <div className="relative">
                            <button
                              onClick={e => { e.stopPropagation(); setOpenDesktopDropdownId(isDropOpen ? null : product.id); }}
                              className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                                isDarkMode ? 'text-white/40 hover:bg-white/8 hover:text-white/70' : 'text-black/40 hover:bg-black/5 hover:text-black/70'
                              )}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                            {isDropOpen && (
                              <div
                                className={cn(
                                  'absolute right-0 top-full mt-1 w-48 rounded-xl shadow-xl border z-20 overflow-hidden',
                                  isDarkMode ? 'bg-[#2A2A2A] border-white/10' : 'bg-white border-black/5'
                                )}
                                onClick={e => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => { startEdit(product); setOpenDesktopDropdownId(null); }}
                                  className={cn('w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors', isDarkMode ? 'hover:bg-white/5' : 'hover:bg-black/5')}
                                >
                                  <Pencil className="w-3.5 h-3.5" /> Editar producto
                                </button>
                                <button
                                  onClick={() => { handleDelete(product.id); setOpenDesktopDropdownId(null); }}
                                  disabled={isDeleting}
                                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left text-red-500 hover:bg-red-50 transition-colors"
                                >
                                  {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                  Eliminar producto
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            /* Grid view */
            <div className="p-4 grid grid-cols-3 gap-4">
              {desktopFiltered.map((product) => {
                const lowStock = (product.cantidad ?? 0) < 5;
                const precioVenta = getPrecioVenta(product);
                const precioCompra = getPrecioCompra(product);
                const margen = precioCompra > 0 && precioVenta > 0
                  ? Math.round(((precioVenta - precioCompra) / precioCompra) * 100)
                  : null;
                const emoji = getProductEmoji(product.nombre);

                return (
                  <div
                    key={product.id}
                    className={cn(
                      'p-4 rounded-xl border transition-colors',
                      isDarkMode ? 'bg-[#2A2A2A] border-white/5' : 'bg-[#FDFBF0] border-black/5',
                      lowStock && 'border-l-4 border-l-red-400'
                    )}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-3xl">{emoji}</span>
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
                        lowStock
                          ? isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600'
                          : isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                      )}>
                        {lowStock ? 'Stock bajo' : 'Activo'}
                      </span>
                    </div>
                    <p className="font-bold text-sm mb-1 truncate">{product.nombre}</p>
                    <p className="text-[#B8860B] font-bold">${(precioVenta || 0).toLocaleString('es-CO')}</p>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                      <span>Stock: <span className={cn('font-bold', lowStock ? 'text-red-500' : '')}>{product.cantidad ?? 0}</span></span>
                      {margen !== null && <span className="text-green-500 font-bold">+{margen}%</span>}
                    </div>
                    <div className="flex gap-1 mt-3">
                      <button
                        onClick={() => startEdit(product)}
                        className={cn('flex-1 h-7 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors', isDarkMode ? 'bg-[#B8860B]/15 text-[#FFD700] hover:bg-[#B8860B]/25' : 'bg-[#FFF8DC] text-[#B8860B] hover:bg-[#FFD700]/30')}
                      >
                        <Pencil className="w-3 h-3" /> Editar
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        disabled={deletingId === product.id}
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        {deletingId === product.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Smart tip footer */}
        {lowStockCount > 0 && (
          <div className={cn('flex items-center justify-between gap-4 px-5 py-4 rounded-2xl shadow-sm', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white')}>
            <div className="flex items-center gap-3">
              <Lightbulb className="w-5 h-5 text-[#B8860B] flex-shrink-0" />
              <div>
                <p className="font-bold text-sm">Consejo inteligente</p>
                <p className={cn('text-xs mt-0.5', isDarkMode ? 'text-white/50' : 'text-black/50')}>
                  Tienes {lowStockCount} {lowStockCount === 1 ? 'producto' : 'productos'} con stock bajo. Revisa tus proveedores para evitar quedarte sin inventario.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowLowStockOnly(true)}
              className="flex-shrink-0 text-sm font-bold text-[#B8860B] hover:text-[#D4AF37] transition-colors whitespace-nowrap"
            >
              Ver productos &gt;
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* ── Mobile layout ── */}
      <div className="md:hidden space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Search + Add button */}
        <div className="flex items-center gap-3 max-w-2xl">
          <div className={cn('flex-1 h-12 rounded-xl flex items-center px-4 gap-2 transition-all', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
            <Search className="w-4 h-4 opacity-40 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar producto..."
              className="bg-transparent border-none focus:ring-0 text-sm w-full outline-none"
            />
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-all active:scale-95',
              showForm ? 'bg-red-500 text-white' : 'bg-[#B8860B] text-black',
            )}
          >
            {showForm ? <X className="w-5 h-5" /> : <Plus className="w-6 h-6" />}
          </button>
        </div>

        {/* Add form (mobile inline) */}
        {showForm && (
          <div className={cn('p-5 rounded-2xl space-y-4 border', isDarkMode ? 'bg-[#1A1A1A] border-white/8' : 'bg-white shadow-sm border-black/5')}>
            <p className="font-black text-[#B8860B] text-sm uppercase tracking-widest">Nuevo producto</p>
            <div className="space-y-3">
              <input
                type="text"
                value={formNombre}
                onChange={(e) => setFormNombre(e.target.value)}
                placeholder="Nombre del producto"
                className={cn(
                  'w-full h-11 rounded-xl px-4 text-sm outline-none border',
                  isDarkMode
                    ? 'bg-[#2A2A2A] border-white/8 text-[#FDFBF0] placeholder:text-white/30'
                    : 'bg-[#FDFBF0] border-black/8 placeholder:text-black/30',
                )}
              />
              <div className="grid grid-cols-3 gap-3">
                <div className="relative pt-3">
                  <label className={cn('absolute top-1.5 left-3 text-[10px] font-bold px-1 rounded z-10', isDarkMode ? 'bg-[#1A1A1A] text-white/40' : 'bg-white text-black/40')}>
                    Cantidad
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formCantidad}
                    onChange={(e) => setFormCantidad(e.target.value)}
                    placeholder="0"
                    className={cn(
                      'w-full h-11 rounded-xl px-4 text-sm outline-none border',
                      isDarkMode
                        ? 'bg-[#2A2A2A] border-white/8 text-[#FDFBF0] placeholder:text-white/30'
                        : 'bg-[#FDFBF0] border-black/8 placeholder:text-black/30',
                    )}
                  />
                </div>
                <div className="relative pt-3">
                  <label className={cn('absolute top-1.5 left-3 text-[10px] font-bold px-1 rounded z-10', isDarkMode ? 'bg-[#1A1A1A] text-white/40' : 'bg-white text-black/40')}>
                    P. compra
                  </label>
                  <div className="relative">
                    <span className={cn('absolute left-3 top-1/2 -translate-y-1/2 text-sm select-none', isDarkMode ? 'text-white/30' : 'text-black/30')}>$</span>
                    <input
                      type="number"
                      min="0"
                      value={formPrecioCompra}
                      onChange={(e) => setFormPrecioCompra(e.target.value)}
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
                <div className="relative pt-3">
                  <label className={cn('absolute top-1.5 left-3 text-[10px] font-bold px-1 rounded z-10', isDarkMode ? 'bg-[#1A1A1A] text-white/40' : 'bg-white text-black/40')}>
                    P. venta
                  </label>
                  <div className="relative">
                    <span className={cn('absolute left-3 top-1/2 -translate-y-1/2 text-sm select-none', isDarkMode ? 'text-white/30' : 'text-black/30')}>$</span>
                    <input
                      type="number"
                      min="0"
                      value={formPrecioVenta}
                      onChange={(e) => setFormPrecioVenta(e.target.value)}
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
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !formNombre.trim()}
              className={cn(
                'w-full h-12 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all',
                saving || !formNombre.trim()
                  ? isDarkMode ? 'bg-white/8 text-white/25 cursor-not-allowed' : 'bg-black/8 text-black/25 cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-lg active:scale-[0.98]',
              )}
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Check className="w-4 h-4" /> Guardar producto</>}
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            label="Productos"
            value={String(inventory.length)}
            icon={<Box className={cn(isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')} />}
            isDarkMode={isDarkMode}
          />
          <StatCard
            label="Stock Bajo"
            value={String(stockBajo)}
            icon={<TrendingUp className={cn(stockBajo > 0 ? 'text-red-400' : isDarkMode ? 'text-[#FDFBF0]/40' : 'text-[#5b5c5a]/60')} />}
            isDarkMode={isDarkMode}
            highlight={stockBajo > 0}
          />
        </div>

        {/* Consejos */}
        {inventoryTips.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Lightbulb className="w-4 h-4" style={{ color: '#F5A623' }} />
              <p className={cn('text-sm font-black', isDarkMode ? 'text-white/60' : 'text-[#5b5c5a]')}>Consejos</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
              {inventoryTips.map(tip => (
                <TipCard
                  key={tip.id}
                  text={tip.text}
                  isDarkMode={isDarkMode}
                  onDismiss={() => setDismissedTips(prev => { const s = new Set(prev); s.add(tip.id); return s; })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Product list */}
        <div className="space-y-3">
          <h3 className="font-bold text-lg px-1 max-w-2xl">Productos en Stock</h3>
          {inventory.length === 0 ? (
            <EmptyState
              icon={<Package className={cn('w-7 h-7', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/40')} />}
              title="Sin productos aún"
              subtitle='Toca "+" para agregar tu primer producto o sube una foto desde Cámara'
              isDarkMode={isDarkMode}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Search className={cn('w-7 h-7', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/40')} />}
              title="Sin resultados"
              subtitle="Intenta con otro nombre"
              isDarkMode={isDarkMode}
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((product) => {
                const isEditing = editingId === product.id;
                const isUpdating = updatingId === product.id;
                const isDeleting = deletingId === product.id;
                const lowStock = (product.cantidad ?? 0) < 5;

                return (
                  <div
                    key={product.id}
                    className={cn(
                      'rounded-xl overflow-hidden transition-colors',
                      isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm',
                      lowStock && !isEditing ? 'border-l-4 border-red-400/70' : '',
                    )}
                  >
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-[#FFD700]/10 rounded-lg flex items-center justify-center text-[#B8860B] flex-shrink-0">
                          <Package className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold truncate">{product.nombre}</p>
                        </div>
                      </div>

                      {!isEditing ? (
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-bold text-[#B8860B]">${(getPrecioVenta(product) || 0).toLocaleString('es-CO')}</p>
                            <p className={cn('text-xs font-bold', lowStock ? 'text-[#DAA520]' : 'opacity-50')}>
                              Stock: {product.cantidad ?? 0}
                            </p>
                            {getPrecioCompra(product) > 0 && (
                              <p className="text-[10px] opacity-40">
                                Costo: ${(getPrecioCompra(product) || 0).toLocaleString('es-CO')}
                              </p>
                            )}
                            {getMargen(product) !== null && (
                              <p className="text-[10px] font-bold text-green-500">
                                +{getMargen(product)}% margen
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => startEdit(product)}
                              className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90',
                                isDarkMode ? 'bg-white/8 text-[#FFD700]/70 hover:bg-white/15' : 'bg-[#FFF8DC] text-[#B8860B] hover:bg-[#FFD700]/30',
                              )}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              disabled={isDeleting}
                              className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90',
                                isDeleting ? 'opacity-30' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
                              )}
                            >
                              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold opacity-40 w-10 text-right">Cant.</span>
                              <input
                                type="number"
                                min="0"
                                value={editCantidad}
                                onChange={(e) => setEditCantidad(e.target.value)}
                                className={cn(
                                  'w-20 h-7 rounded-lg px-2 text-sm font-bold outline-none border',
                                  isDarkMode ? 'bg-[#2A2A2A] border-white/10 text-[#FDFBF0]' : 'bg-[#FDFBF0] border-black/10',
                                )}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold opacity-40 w-10 text-right">$/costo</span>
                              <input
                                type="number"
                                min="0"
                                value={editPrecioCompra}
                                onChange={(e) => setEditPrecioCompra(e.target.value)}
                                className={cn(
                                  'w-20 h-7 rounded-lg px-2 text-sm font-bold outline-none border',
                                  isDarkMode ? 'bg-[#2A2A2A] border-white/10 text-[#FDFBF0]' : 'bg-[#FDFBF0] border-black/10',
                                )}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold opacity-40 w-10 text-right">$/venta</span>
                              <input
                                type="number"
                                min="0"
                                value={editPrecioVenta}
                                onChange={(e) => setEditPrecioVenta(e.target.value)}
                                className={cn(
                                  'w-20 h-7 rounded-lg px-2 text-sm font-bold outline-none border',
                                  isDarkMode ? 'bg-[#2A2A2A] border-white/10 text-[#FDFBF0]' : 'bg-[#FDFBF0] border-black/10',
                                )}
                              />
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => handleSaveEdit(product)}
                              disabled={isUpdating}
                              className="w-8 h-8 rounded-lg bg-green-500/20 text-green-500 flex items-center justify-center transition-all active:scale-90"
                            >
                              {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className={cn(
                                'w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90',
                                isDarkMode ? 'bg-white/8 text-white/50' : 'bg-black/8 text-black/40',
                              )}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden md:block">
        {renderDesktopInventorySection()}
      </div>
    </>
  );
};

// ─── Sales Section ─────────────────────────────────────────────────────────

const SalesSection = ({ isDarkMode, sales }: { isDarkMode: boolean; sales: Sale[] }) => {
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const todayTotal = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return sales.filter((s) => getSaleDate(s) >= midnight).reduce((sum, s) => sum + s.total, 0);
  }, [sales]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-6 rounded-2xl bg-gradient-to-br from-[#B8860B] to-[#FFD700] text-black shadow-xl">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-70">Ventas de Hoy</p>
            <h2 className="text-3xl font-black">${(todayTotal || 0).toLocaleString('es-CO')}</h2>
          </div>
          <div className="p-2 bg-black/10 rounded-lg">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
        <div className="flex gap-2">
          <span className="bg-black/10 px-3 py-1 rounded-full text-[10px] font-bold">
            {sales.filter((s) => {
              const m = new Date(); m.setHours(0,0,0,0);
              return getSaleDate(s) >= m;
            }).length} ventas hoy
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h3 className="font-bold text-lg">Historial de Ventas</h3>
          <History className="w-5 h-5 opacity-40" />
        </div>

        {sales.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className={cn('w-7 h-7', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/40')} />}
            title="Sin ventas aún"
            subtitle="Registra tu primera venta desde el inicio"
            isDarkMode={isDarkMode}
          />
        ) : (
          sales.map((sale) => (
            <div key={sale.id} onClick={() => setSelectedSale(sale)} className={cn('p-4 rounded-xl flex items-center justify-between transition-colors cursor-pointer active:scale-[0.99]', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#B8860B]/10 rounded-lg flex items-center justify-center text-[#B8860B]">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold">{getSaleLabel(sale)}</p>
                  <p className="text-xs opacity-50">
                    {formatRelativeTime(getSaleDate(sale))}
                    {getSaleQtyLabel(sale) && ` · ${getSaleQtyLabel(sale)}`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-[#B8860B]">${(sale.total || 0).toLocaleString('es-CO')}</p>
                <div className="flex items-center justify-end text-[10px] text-green-500 font-bold">
                  <ArrowUpRight className="w-3 h-3" /> EXITOSO
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedSale && (
        <MovementDetailModal
          item={{ kind: 'sale', data: selectedSale }}
          isDarkMode={isDarkMode}
          onClose={() => setSelectedSale(null)}
        />
      )}
    </div>
  );
};

// ─── Shared UI ──────────────────────────────────────────────────────────────

const StatCard = ({
  label, value, icon, isDarkMode, highlight,
}: {
  label: string; value: string; icon: React.ReactNode; isDarkMode: boolean; highlight?: boolean;
}) => (
  <div className={cn(
    'p-4 rounded-xl transition-colors',
    isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm',
    highlight ? 'border-l-4 border-red-400/70' : '',
  )}>
    <div className="flex justify-between items-start mb-2">
      <p className="text-xs opacity-50 font-bold uppercase tracking-widest">{label}</p>
      {icon}
    </div>
    <p className={cn('text-2xl font-black', highlight ? 'text-red-400' : '')}>{value}</p>
  </div>
);

const EmptyState = ({ icon, title, subtitle, isDarkMode }: { icon: React.ReactNode; title: string; subtitle: string; isDarkMode: boolean }) => (
  <div className={cn('p-10 rounded-xl flex flex-col items-center justify-center gap-3 text-center', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-white shadow-sm')}>
    <div className={cn('w-14 h-14 rounded-full flex items-center justify-center', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#f1f1ee]')}>
      {icon}
    </div>
    <p className={cn('font-bold', isDarkMode ? 'text-[#FDFBF0]/60' : 'text-[#5b5c5a]')}>{title}</p>
    <p className={cn('text-xs', isDarkMode ? 'text-[#FDFBF0]/30' : 'text-[#5b5c5a]/60')}>{subtitle}</p>
  </div>
);
