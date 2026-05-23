import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, Check, Plus, Trash2 } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import { SaleItem } from '../types';

interface Props {
  userId: string;
  isDarkMode: boolean;
  onClose: () => void;
}

interface ItemRow {
  id: number;
  product: string;
  quantity: string;
  rawPrice: string;
}

let nextId = 1;

function emptyRow(): ItemRow {
  return { id: nextId++, product: '', quantity: '1', rawPrice: '' };
}

function parsePrice(raw: string): number {
  return parseInt(raw.replace(/\D/g, '')) || 0;
}

function formatPrice(val: string): string {
  const digits = val.replace(/\D/g, '');
  return digits ? parseInt(digits).toLocaleString('es-CO') : '';
}

function rowSubtotal(row: ItemRow): number {
  return Math.max(0, parseInt(row.quantity) || 0) * parsePrice(row.rawPrice);
}

export const RegisterSaleModal = ({ userId, isDarkMode, onClose }: Props) => {
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const total = rows.reduce((s, r) => s + rowSubtotal(r), 0);
  const isValid = rows.some(
    (r) => r.product.trim().length > 0 && (parseInt(r.quantity) || 0) > 0 && parsePrice(r.rawPrice) > 0
  );

  const updateRow = (id: number, field: keyof ItemRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (field === 'rawPrice') return { ...r, rawPrice: formatPrice(value) };
        return { ...r, [field]: value };
      })
    );
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (id: number) => {
    if (rows.length === 1) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSave = async () => {
    if (!isValid || saving) return;
    setError('');
    setSaving(true);
    try {
      const items: SaleItem[] = rows
        .filter((r) => r.product.trim() && (parseInt(r.quantity) || 0) > 0 && parsePrice(r.rawPrice) > 0)
        .map((r) => ({
          product: r.product.trim(),
          quantity: parseInt(r.quantity),
          unitPrice: parsePrice(r.rawPrice),
          subtotal: rowSubtotal(r),
        }));

      await addDoc(collection(db, 'users', userId, 'sales'), {
        items,
        total,
        createdAt: serverTimestamp(),
        source: 'manual',
      });

      setDone(true);
      setTimeout(onClose, 900);
    } catch (e) {
      console.error(e);
      setError('No se pudo guardar. Verifica tu conexión.');
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className={cn(
            'relative w-full max-w-md rounded-2xl shadow-2xl flex flex-col z-10',
            'max-h-[90dvh] max-h-[90vh]',
            isDarkMode ? 'bg-[#1A1A1A] text-[#FDFBF0]' : 'bg-white text-[#0D0D0D]'
          )}
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        >
          {/* Header */}
          <div className={cn('flex items-center justify-between px-6 py-5 border-b flex-shrink-0', isDarkMode ? 'border-white/10' : 'border-black/5')}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#FFD700]/20 rounded-xl flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-[#B8860B]" />
              </div>
              <div>
                <h2 className="text-xl font-black">Registrar Venta</h2>
                <p className="text-[10px] opacity-40 font-bold uppercase tracking-widest">
                  {rows.length === 1 ? '1 producto' : `${rows.length} productos`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={cn('w-9 h-9 rounded-full flex items-center justify-center', isDarkMode ? 'bg-white/10 hover:bg-white/20' : 'bg-black/5 hover:bg-black/10')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable product rows */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

            {/* Column labels */}
            <div className="grid gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40 px-1"
              style={{ gridTemplateColumns: '1fr 72px 1fr 32px' }}>
              <span>Producto</span>
              <span className="text-center">Cant.</span>
              <span>Precio unit.</span>
              <span />
            </div>

            {rows.map((row, idx) => (
              <div key={row.id} className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 72px 1fr 32px' }}>
                {/* Product name */}
                <input
                  type="text"
                  placeholder={`Producto ${idx + 1}`}
                  value={row.product}
                  onChange={(e) => updateRow(row.id, 'product', e.target.value)}
                  className={cn(
                    'h-12 px-3 rounded-xl text-sm font-medium border-0 outline-none transition-all',
                    isDarkMode
                      ? 'bg-[#2A2A2A] text-[#FDFBF0] placeholder:text-white/25'
                      : 'bg-[#f8f8f5] placeholder:text-black/25'
                  )}
                />
                {/* Quantity */}
                <input
                  type="number"
                  min="1"
                  value={row.quantity}
                  onChange={(e) => updateRow(row.id, 'quantity', e.target.value)}
                  className={cn(
                    'h-12 px-2 rounded-xl text-sm font-medium border-0 outline-none transition-all text-center',
                    isDarkMode
                      ? 'bg-[#2A2A2A] text-[#FDFBF0]'
                      : 'bg-[#f8f8f5]'
                  )}
                />
                {/* Unit price */}
                <div className="relative">
                  <span className={cn('absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold select-none', isDarkMode ? 'text-white/30' : 'text-black/30')}>$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={row.rawPrice}
                    onChange={(e) => updateRow(row.id, 'rawPrice', e.target.value)}
                    className={cn(
                      'w-full h-12 pl-6 pr-2 rounded-xl text-sm font-medium border-0 outline-none transition-all',
                      isDarkMode
                        ? 'bg-[#2A2A2A] text-[#FDFBF0] placeholder:text-white/25'
                        : 'bg-[#f8f8f5] placeholder:text-black/25'
                    )}
                  />
                </div>
                {/* Delete */}
                <button
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1}
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                    rows.length === 1
                      ? 'opacity-20 cursor-not-allowed'
                      : isDarkMode ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-red-50 text-red-400 hover:bg-red-100'
                  )}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* Subtotal row */}
                {rowSubtotal(row) > 0 && (
                  <div className="col-span-4 flex justify-end pr-10">
                    <span className="text-xs font-bold text-[#B8860B] opacity-70">
                      subtotal: ${rowSubtotal(row).toLocaleString('es-CO')}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {/* Add product button */}
            <button
              onClick={addRow}
              className={cn(
                'w-full h-11 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 text-sm font-bold transition-all',
                isDarkMode
                  ? 'border-white/15 text-white/40 hover:border-[#B8860B]/50 hover:text-[#B8860B]'
                  : 'border-black/10 text-black/35 hover:border-[#B8860B]/50 hover:text-[#B8860B]'
              )}
            >
              <Plus className="w-4 h-4" />
              Agregar producto
            </button>

            {/* Total */}
            <div className={cn('px-5 py-4 rounded-xl flex justify-between items-center', isDarkMode ? 'bg-[#B8860B]/10' : 'bg-[#FFF8DC]')}>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest opacity-50 mb-0.5">Total venta</p>
                <p className="text-xs opacity-40">
                  {rows.filter((r) => rowSubtotal(r) > 0).length} producto(s)
                </p>
              </div>
              <span className={cn('text-3xl font-black', total > 0 ? 'text-[#B8860B]' : isDarkMode ? 'text-white/20' : 'text-black/20')}>
                ${total.toLocaleString('es-CO')}
              </span>
            </div>

            {error && <p className="text-red-500 text-sm font-medium text-center">{error}</p>}
          </div>

          {/* Save button */}
          <div className={cn('flex-shrink-0 px-6 py-5 border-t', isDarkMode ? 'border-white/10' : 'border-black/5')}>
            <button
              onClick={handleSave}
              disabled={!isValid || saving || done}
              className={cn(
                'w-full h-14 rounded-xl font-black text-base flex items-center justify-center gap-3 transition-all duration-300',
                done
                  ? 'bg-green-500 text-white'
                  : isValid
                    ? 'bg-gradient-to-r from-[#B8860B] to-[#FFD700] text-black shadow-lg active:scale-[0.98]'
                    : isDarkMode ? 'bg-white/8 text-white/25 cursor-not-allowed' : 'bg-black/8 text-black/25 cursor-not-allowed'
              )}
            >
              {done ? (
                <><Check className="w-5 h-5" /> ¡Venta registrada!</>
              ) : saving ? (
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                'Guardar Venta'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
