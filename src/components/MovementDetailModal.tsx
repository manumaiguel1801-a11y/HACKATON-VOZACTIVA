import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, TrendingDown, UserPlus, UserMinus, Calendar, Send, MessageCircle, Camera, Pencil, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { Sale, Expense, Debt, getSaleLabel } from '../types';

type DetailItem =
  | { kind: 'sale'; data: Sale }
  | { kind: 'expense'; data: Expense }
  | { kind: 'debt'; data: Debt };

interface Props {
  item: DetailItem;
  isDarkMode: boolean;
  onClose: () => void;
}

const SOURCE_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  telegram: { label: 'Telegram', color: '#229ED9', Icon: Send },
  whatsapp: { label: 'WhatsApp', color: '#25D366', Icon: MessageCircle },
  chat: { label: 'Chat IA', color: '#8B5CF6', Icon: MessageCircle },
  camara: { label: 'Cámara', color: '#F59E0B', Icon: Camera },
  manual: { label: 'Manual', color: '#9CA3AF', Icon: Pencil },
};

function SourceRow({ source, isDarkMode }: { source?: string; isDarkMode: boolean }) {
  if (!source) return null;
  const cfg = SOURCE_CONFIG[source];
  if (!cfg) return null;
  return (
    <div className={cn('flex justify-between items-center py-3 border-b', isDarkMode ? 'border-white/5' : 'border-black/5')}>
      <span className={cn('text-xs font-bold uppercase tracking-widest', isDarkMode ? 'text-white/40' : 'text-black/40')}>Canal</span>
      <span className="inline-flex items-center gap-1.5 text-sm font-black" style={{ color: cfg.color }}>
        <cfg.Icon className="w-3.5 h-3.5" />
        {cfg.label}
      </span>
    </div>
  );
}

function formatDate(ts: any): string {
  const date: Date = ts?.toDate ? ts.toDate() : new Date();
  return date.toLocaleDateString('es-CO', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }) + ' · ' + date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

const Row = ({ label, value, isDarkMode, highlight }: { label: string; value: string; isDarkMode: boolean; highlight?: boolean }) => (
  <div className={cn('flex justify-between items-center py-3 border-b', isDarkMode ? 'border-white/5' : 'border-black/5')}>
    <span className={cn('text-xs font-bold uppercase tracking-widest', isDarkMode ? 'text-white/40' : 'text-black/40')}>{label}</span>
    <span className={cn('text-sm font-black', highlight ? 'text-[#B8860B]' : '')}>{value}</span>
  </div>
);

export const MovementDetailModal = ({ item, isDarkMode, onClose }: Props) => {
  const isSale = item.kind === 'sale';
  const isExpense = item.kind === 'expense';
  const isDebt = item.kind === 'debt';

  // Leer el concept del documento — cubre registros de chat (concept directo)
  // y registros de bots Telegram/WhatsApp (solo guardan items[0].product sin concept raíz)
  const dataConcept: string =
    (item.data as any).concept ??
    (item.data as any).items?.[0]?.product ??
    (item.data as any).product ??
    '';

  // CASO 1 — Gasto simple: préstamo dado o pago de deuda (guardado en sales por error legacy o edge case)
  const isGastoSimple = isSale && /^(préstamo a|pago deuda)/i.test(dataConcept);

  // CASO 2 — Ingreso simple: préstamo recibido o cobro de deuda
  const isIngresoSimple = isSale && (
    /^(préstamo de|cobro deuda)/i.test(dataConcept) ||
    !!(item.data as any).isIngreso
  );

  const accentColor = isIngresoSimple ? '#22c55e'
    : isGastoSimple ? '#ef4444'
    : isSale ? '#B8860B'
    : isExpense ? '#ef4444'
    : item.kind === 'debt' && item.data.type === 'me-deben' ? '#B8860B'
    : '#f97316';

  const headerIcon = isIngresoSimple
    ? <ArrowUp className="w-5 h-5" />
    : isGastoSimple
      ? <ArrowDown className="w-5 h-5" />
      : isSale
        ? <ShoppingBag className="w-5 h-5" />
        : isExpense
          ? <TrendingDown className="w-5 h-5" />
          : item.data.type === 'me-deben'
            ? <UserPlus className="w-5 h-5" />
            : <UserMinus className="w-5 h-5" />;

  const headerTitle = isIngresoSimple
    ? 'Detalle de Ingreso'
    : isGastoSimple
      ? 'Detalle de Gasto'
      : isSale
        ? 'Detalle de Venta'
        : isExpense
          ? 'Detalle de Gasto'
          : item.data.type === 'me-deben'
            ? 'Me deben'
            : 'Debo';

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
            'relative w-full max-w-md rounded-2xl shadow-2xl z-10 flex flex-col',
            'max-h-[90dvh] max-h-[90vh]',
            isDarkMode ? 'bg-[#1A1A1A] text-[#FDFBF0]' : 'bg-white text-[#0D0D0D]'
          )}
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-6 pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${accentColor}20`, color: accentColor }}>
                  {headerIcon}
                </div>
                <div>
                  <h2 className="text-xl font-black">{headerTitle}</h2>
                  <p className="text-[10px] opacity-40 font-bold uppercase tracking-widest flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(item.data.createdAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={cn('w-9 h-9 rounded-full flex items-center justify-center', isDarkMode ? 'bg-white/10' : 'bg-black/5')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-10 space-y-1">

            {/* ── SALE ── */}
            {isSale && (() => {
              const sale = item.data;
              const hasItems = (sale.items?.length ?? 0) > 0;

              // CASO 1 — Gasto simple
              if (isGastoSimple) {
                return (
                  <>
                    <Row label="Concepto" value={dataConcept || '—'} isDarkMode={isDarkMode} />
                    <SourceRow source={sale.source} isDarkMode={isDarkMode} />
                    <div className={cn('flex justify-between items-center p-4 rounded-xl mt-2', isDarkMode ? 'bg-red-500/10' : 'bg-red-50')}>
                      <span className="font-black text-sm opacity-60">Total gasto</span>
                      <span className="text-2xl font-black text-red-500">-${sale.total.toLocaleString('es-CO')}</span>
                    </div>
                  </>
                );
              }

              // CASO 2 — Ingreso simple
              if (isIngresoSimple) {
                return (
                  <>
                    <Row label="Concepto" value={dataConcept || '—'} isDarkMode={isDarkMode} />
                    <SourceRow source={sale.source} isDarkMode={isDarkMode} />
                    <div className={cn('flex justify-between items-center p-4 rounded-xl mt-2', isDarkMode ? 'bg-green-500/10' : 'bg-green-50')}>
                      <span className="font-black text-sm opacity-60">Total Ingreso</span>
                      <span className="text-2xl font-black text-green-500">${sale.total.toLocaleString('es-CO')}</span>
                    </div>
                  </>
                );
              }

              // CASO 3 — Venta normal
              return (
                <>
                  {hasItems ? (
                    <div className="space-y-1 mb-4">
                      <p className={cn('text-[11px] font-black uppercase tracking-widest mb-3', isDarkMode ? 'text-white/40' : 'text-black/40')}>
                        Productos vendidos
                      </p>
                      <div className={cn('grid text-[10px] font-black uppercase tracking-widest opacity-40 px-4 pb-1 gap-2')}
                        style={{ gridTemplateColumns: '1fr 48px 80px 80px' }}>
                        <span>Producto</span>
                        <span className="text-center">Cant.</span>
                        <span className="text-right">P. Unit.</span>
                        <span className="text-right">Subtotal</span>
                      </div>
                      {sale.items!.map((it, i) => {
                        const hasDiscount = !!(it.regularUnitPrice && it.regularUnitPrice !== it.unitPrice);
                        const regularSubtotal = hasDiscount ? it.quantity * it.regularUnitPrice! : null;
                        return (
                          <div
                            key={i}
                            className={cn('px-4 py-3 rounded-xl space-y-1', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#f8f8f5]')}
                          >
                            <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 48px 80px 80px' }}>
                              <span className="font-bold text-sm truncate">{it.product}</span>
                              <span className={cn('text-sm text-center font-bold', isDarkMode ? 'text-white/60' : 'text-black/50')}>×{it.quantity}</span>
                              <div className="text-right">
                                {hasDiscount && (
                                  <p className={cn('text-[10px] line-through', isDarkMode ? 'text-white/30' : 'text-black/30')}>
                                    ${it.regularUnitPrice!.toLocaleString('es-CO')}
                                  </p>
                                )}
                                <p className={cn('text-sm', hasDiscount ? 'text-green-500 font-black' : isDarkMode ? 'text-white/60' : 'text-black/50')}>
                                  ${it.unitPrice.toLocaleString('es-CO')}
                                </p>
                              </div>
                              <div className="text-right">
                                {hasDiscount && (
                                  <p className={cn('text-[10px] line-through', isDarkMode ? 'text-white/30' : 'text-black/30')}>
                                    ${regularSubtotal!.toLocaleString('es-CO')}
                                  </p>
                                )}
                                <p className="text-sm font-black text-[#B8860B]">${it.subtotal.toLocaleString('es-CO')}</p>
                              </div>
                            </div>
                            {hasDiscount && (() => {
                              const isOferta = it.regularUnitPrice! > it.unitPrice;
                              const diff = Math.abs(it.regularUnitPrice! - it.unitPrice) * it.quantity;
                              return (
                                <div className="flex items-center gap-1.5 pt-1">
                                  <span className={cn(
                                    'text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide',
                                    isOferta ? 'bg-green-500/15 text-green-500' : 'bg-amber-500/15 text-amber-500'
                                  )}>
                                    {isOferta
                                      ? `Oferta · Ahorro $${diff.toLocaleString('es-CO')}`
                                      : `Precio especial +$${diff.toLocaleString('es-CO')}`}
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Legacy single-product sale
                    <>
                      <Row label="Producto" value={(sale as any).product ?? getSaleLabel(sale)} isDarkMode={isDarkMode} />
                      <Row label="Cantidad" value={String((sale as any).quantity ?? 1)} isDarkMode={isDarkMode} />
                      <Row label="Precio unitario" value={`$${((sale as any).unitPrice ?? 0).toLocaleString('es-CO')}`} isDarkMode={isDarkMode} />
                    </>
                  )}
                  <SourceRow source={sale.source} isDarkMode={isDarkMode} />
                  <div className={cn('flex justify-between items-center p-4 rounded-xl mt-2', isDarkMode ? 'bg-[#B8860B]/10' : 'bg-[#FFF8DC]')}>
                    <span className="font-black text-sm opacity-60">Total venta</span>
                    <span className="text-2xl font-black text-[#B8860B]">${sale.total.toLocaleString('es-CO')}</span>
                  </div>
                </>
              );
            })()}

            {/* ── EXPENSE ── */}
            {isExpense && (() => {
              const exp = item.data;
              const hasItems = exp.items && exp.items.length > 0;
              const expConcept = exp.concept ?? exp.items?.[0]?.product ?? '';
              const isSimpleDebtOp = /^(préstamo|pago deuda|cobro)/i.test(expConcept);
              return (
                <>
                  {hasItems && !isSimpleDebtOp ? (
                    <div className="space-y-1 mb-4">
                      <p className={cn('text-[11px] font-black uppercase tracking-widest mb-3', isDarkMode ? 'text-white/40' : 'text-black/40')}>
                        Productos comprados
                      </p>
                      <div className={cn('grid text-[10px] font-black uppercase tracking-widest opacity-40 px-4 pb-1 gap-2')}
                        style={{ gridTemplateColumns: '1fr 48px 80px 80px' }}>
                        <span>Producto</span>
                        <span className="text-center">Cant.</span>
                        <span className="text-right">P. Unit.</span>
                        <span className="text-right">Subtotal</span>
                      </div>
                      {exp.items!.map((it, i) => (
                        <div
                          key={i}
                          className={cn('grid gap-2 items-center px-4 py-3 rounded-xl', isDarkMode ? 'bg-[#2A2A2A]' : 'bg-[#f8f8f5]')}
                          style={{ gridTemplateColumns: '1fr 48px 80px 80px' }}
                        >
                          <span className="font-bold text-sm truncate">{it.product}</span>
                          <span className={cn('text-sm text-center font-bold', isDarkMode ? 'text-white/60' : 'text-black/50')}>×{it.quantity}</span>
                          <span className={cn('text-sm text-right', isDarkMode ? 'text-white/60' : 'text-black/50')}>${it.unitPrice.toLocaleString('es-CO')}</span>
                          <span className="text-sm font-black text-right text-red-500">${it.subtotal.toLocaleString('es-CO')}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <Row label="Concepto" value={expConcept || '—'} isDarkMode={isDarkMode} />
                      {(exp as any).category && (
                        <Row label="Categoría" value={(exp as any).category} isDarkMode={isDarkMode} />
                      )}
                    </>
                  )}
                  <SourceRow source={exp.source} isDarkMode={isDarkMode} />
                  <div className={cn('flex justify-between items-center p-4 rounded-xl mt-2', isDarkMode ? 'bg-red-500/10' : 'bg-red-50')}>
                    <span className="font-black text-sm opacity-60">Total gasto</span>
                    <span className="text-2xl font-black text-red-500">-${exp.amount.toLocaleString('es-CO')}</span>
                  </div>
                </>
              );
            })()}

            {/* ── DEBT ── */}
            {isDebt && (() => {
              const debt = item.data;
              const isMeDeben = debt.type === 'me-deben';
              return (
                <>
                  <Row label={isMeDeben ? 'Quién te debe' : 'A quién le debes'} value={debt.name} isDarkMode={isDarkMode} />
                  <Row label="Concepto" value={debt.concept} isDarkMode={isDarkMode} />
                  <Row label="Estado" value={isMeDeben ? 'Por cobrar' : 'Por pagar'} isDarkMode={isDarkMode} />
                  <SourceRow source={(debt as any).source} isDarkMode={isDarkMode} />
                  <div className={cn(
                    'flex justify-between items-center p-4 rounded-xl mt-2',
                    isMeDeben ? isDarkMode ? 'bg-[#B8860B]/10' : 'bg-[#FFF8DC]' : isDarkMode ? 'bg-orange-500/10' : 'bg-orange-50'
                  )}>
                    <span className="font-black text-sm opacity-60">{isMeDeben ? 'Por cobrar' : 'Por pagar'}</span>
                    <span className="text-2xl font-black" style={{ color: accentColor }}>
                      ${debt.amount.toLocaleString('es-CO')}
                    </span>
                  </div>
                </>
              );
            })()}

          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
