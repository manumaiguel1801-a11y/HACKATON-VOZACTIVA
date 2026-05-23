import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingDown, Check } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';

const CATEGORIES = [
  { label: 'Transporte', emoji: '🚗' },
  { label: 'Insumos',    emoji: '📦' },
  { label: 'Servicios',  emoji: '💡' },
  { label: 'Arriendo',   emoji: '🏠' },
  { label: 'Personal',   emoji: '👤' },
  { label: 'Otro',       emoji: '📝' },
];

interface Props {
  userId: string;
  isDarkMode: boolean;
  onClose: () => void;
}

export const RegisterExpenseModal = ({ userId, isDarkMode, onClose }: Props) => {
  const [concept, setConcept] = useState('');
  const [rawAmount, setRawAmount] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const amount = parseInt(rawAmount.replace(/\D/g, '')) || 0;
  const isValid = concept.trim().length > 0 && amount > 0;

  const handleAmountChange = (val: string) => {
    const digits = val.replace(/\D/g, '');
    setRawAmount(digits ? parseInt(digits).toLocaleString('es-CO') : '');
  };

  const handleSave = async () => {
    if (!isValid || saving) return;
    setError('');
    setSaving(true);
    try {
      await addDoc(collection(db, 'users', userId, 'expenses'), {
        concept: concept.trim(),
        amount,
        category: category || 'Otro',
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
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="text-xl font-black">Registrar Gasto</h2>
            </div>
            <button
              onClick={onClose}
              className={cn('w-9 h-9 rounded-full flex items-center justify-center', isDarkMode ? 'bg-white/10 hover:bg-white/20' : 'bg-black/5 hover:bg-black/10')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Concept */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-widest opacity-50">¿En qué gastaste?</label>
              <input
                type="text"
                placeholder="Ej: Gasolina, Arriendo, Insumos..."
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                className={cn(
                  'w-full h-14 px-4 rounded-xl text-sm font-medium border-0 outline-none transition-all',
                  isDarkMode
                    ? 'bg-[#2A2A2A] text-[#FDFBF0] placeholder:text-white/30'
                    : 'bg-[#f8f8f5] placeholder:text-black/30'
                )}
              />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-widest opacity-50">Monto</label>
              <div className="relative">
                <span className={cn('absolute left-4 top-1/2 -translate-y-1/2 font-bold text-sm select-none', isDarkMode ? 'text-white/40' : 'text-black/40')}>$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={rawAmount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className={cn(
                    'w-full h-14 pl-8 pr-4 rounded-xl text-sm font-medium border-0 outline-none transition-all',
                    isDarkMode
                      ? 'bg-[#2A2A2A] text-[#FDFBF0] placeholder:text-white/30'
                      : 'bg-[#f8f8f5] placeholder:text-black/30'
                  )}
                />
              </div>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-widest opacity-50">Categoría</label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => setCategory(c.label)}
                    className={cn(
                      'py-2.5 px-3 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all',
                      category === c.label
                        ? 'bg-red-500/15 text-red-500'
                        : isDarkMode
                          ? 'bg-[#2A2A2A] text-white/60'
                          : 'bg-[#f8f8f5] text-black/50'
                    )}
                  >
                    <span>{c.emoji}</span>
                    <span className="text-xs">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Total preview */}
            {amount > 0 && (
              <div className={cn('px-5 py-4 rounded-xl flex justify-between items-center', isDarkMode ? 'bg-red-500/10' : 'bg-red-50')}>
                <span className="text-sm font-bold opacity-60">Total gasto</span>
                <span className="text-2xl font-black text-red-500">
                  -${amount.toLocaleString('es-CO')}
                </span>
              </div>
            )}

            {error && <p className="text-red-500 text-sm font-medium text-center">{error}</p>}
          </div>

          {/* Button */}
          <div className={cn('flex-shrink-0 px-6 py-5 border-t', isDarkMode ? 'border-white/10' : 'border-black/5')}>
            <button
              onClick={handleSave}
              disabled={!isValid || saving || done}
              className={cn(
                'w-full h-14 rounded-xl font-black text-base flex items-center justify-center gap-3 transition-all duration-300',
                done
                  ? 'bg-green-500 text-white'
                  : isValid
                    ? 'bg-red-500 text-white shadow-lg active:scale-[0.98]'
                    : isDarkMode ? 'bg-white/8 text-white/25 cursor-not-allowed' : 'bg-black/8 text-black/25 cursor-not-allowed'
              )}
            >
              {done ? (
                <><Check className="w-5 h-5" /> ¡Gasto registrado!</>
              ) : saving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Guardar Gasto'
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
