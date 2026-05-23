import React, { useState, useMemo } from 'react';
import {
  Package, ShoppingBag, Plus, Search,
  TrendingUp, Box, History, ArrowUpRight,
  Pencil, Trash2, Check, X, Loader2, Lightbulb,
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

interface Props {
  isDarkMode: boolean;
  sales: Sale[];
  inventory: InventoryProduct[];
  userId: string;
}

const TipCard: React.FC<{ text: string; onDismiss: () => void; isDarkMode: boolean }> = ({ text, onDismiss, isDarkMode }) => (
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

export const InventorySalesView = ({ isDarkMode, sales, inventory, userId }: Props) => {
  const [activeSubTab, setActiveSubTab] = useState<'inventario' | 'ventas'>('inventario');

  return (
    <div className="space-y-6">
      <div className={cn('flex p-1 rounded-2xl transition-colors', isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f1f1ee]')}>
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
  );
};

// ─── Inventory Section ─────────────────────────────────────────────────────

interface InventorySectionProps {
  isDarkMode: boolean;
  inventory: InventoryProduct[];
  userId: string;
}

const InventorySection = ({ isDarkMode, inventory, userId }: InventorySectionProps) => {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(() => new Set());
  const [formNombre, setFormNombre] = useState('');
  const [formCantidad, setFormCantidad] = useState('');
  const [formPrecioCompra, setFormPrecioCompra] = useState('');
  const [formPrecioVenta, setFormPrecioVenta] = useState('');
  const [saving, setSaving] = useState(false);

  // Per-product edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCantidad, setEditCantidad] = useState('');
  const [editPrecioCompra, setEditPrecioCompra] = useState('');
  const [editPrecioVenta, setEditPrecioVenta] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const stockBajo = useMemo(() => inventory.filter((p) => (p.cantidad ?? 0) < 5).length, [inventory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? inventory.filter((p) => p.nombre.toLowerCase().includes(q)) : inventory;
  }, [inventory, search]);

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
    setEditCantidad(String(product.cantidad));
    setEditPrecioCompra(String(getPrecioCompra(product)));
    setEditPrecioVenta(String(getPrecioVenta(product)));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditCantidad('');
    setEditPrecioCompra('');
    setEditPrecioVenta('');
  };

  const handleSaveEdit = async (product: InventoryProduct) => {
    setUpdatingId(product.id);
    try {
      await updateDoc(doc(db, 'users', userId, 'inventario', product.id), {
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
        // Artículo (el/la) según última letra del nombre completo
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Search + Add button */}
      <div className="flex items-center gap-3">
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

      {/* Add form */}
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
        <h3 className="font-bold text-lg px-1">Productos en Stock</h3>
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
          filtered.map((product) => {
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
                {/* Main row */}
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
                    /* Inline edit */
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
          })
        )}
      </div>

    </div>
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
