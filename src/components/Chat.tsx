import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CheckCircle2, Send, Loader2, ShoppingBag, TrendingDown, UserMinus, UserPlus, Mic, Square, AlertCircle, CreditCard, Package, ArrowDownToLine } from 'lucide-react';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { cn, capitalizar, conArticulo, pronombre } from '../lib/utils';
import { sendMessageToGemini, ChatResponse } from '../services/gemini';
import { Debt, InventoryProduct, getPrecioVenta } from '../types';

// Web Speech API — not in standard TS lib; declare minimal types
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
    : null;

interface DebtPaymentResult {
  found: boolean;
  debtorName: string;
  amount: number;
  isPartial: boolean;
  status?: 'pagada' | 'parcial';
  remaining?: number;
  paymentType?: 'pago-deuda-debo' | 'cobro-deuda-me-deben';
}

// State for multi-turn debt flow
type PendingDebtStep = 'asking-nueva-deuda' | 'asking-confirmar-pago';
interface PendingDebt {
  step: PendingDebtStep;
  debtorName: string;
  amount: number;
  debtType: 'pago-deuda-debo' | 'cobro-deuda-me-deben';
  activeDebt?: Debt;
}

// State for multi-turn new-product flow
type PendingProductStep = 'asking-precio-compra' | 'asking-si-vende' | 'asking-precio-venta' | 'asking-stock';
interface PendingProduct {
  concept: string;
  quantity: number;
  isCompra: boolean;   // true if triggered by 'compra' type
  step: PendingProductStep;
  precioCompra?: number;
  precioVenta?: number;
  /** Set when buying existing inventory product but price was not mentioned */
  productId?: string;
  productCurrentStock?: number;
}

interface Message {
  role: 'user' | 'model';
  text: string;
  data?: ChatResponse['data'];
  timestamp: Date;
  saved?: boolean;
  debtResults?: DebtPaymentResult[];
  stockUpdate?: { nombre: string; newStock: number };
}

const TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  'venta':                 { label: 'Venta registrada',    icon: <ShoppingBag className="w-4 h-4" />,       color: 'text-[#B8860B]' },
  'gasto':                 { label: 'Gasto registrado',    icon: <TrendingDown className="w-4 h-4" />,      color: 'text-red-500' },
  'compra':                { label: 'Compra registrada',   icon: <ArrowDownToLine className="w-4 h-4" />,   color: 'text-[#B8860B]' },
  'deuda-me-deben':        { label: 'Deuda a cobrar',      icon: <UserPlus className="w-4 h-4" />,          color: 'text-[#B8860B]' },
  'deuda-debo':            { label: 'Deuda registrada',    icon: <UserMinus className="w-4 h-4" />,         color: 'text-orange-500' },
  'pago-deuda-debo':       { label: 'Pago de deuda',       icon: <CreditCard className="w-4 h-4" />,        color: 'text-green-500' },
  'cobro-deuda-me-deben':  { label: 'Cobro de deuda',      icon: <CreditCard className="w-4 h-4" />,        color: 'text-[#B8860B]' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function matchDebtName(storedName: string, queryName: string): boolean {
  const s = normalizeStr(storedName);
  const q = normalizeStr(queryName);
  if (!q) return false;
  if (s === q || s.includes(q) || q.includes(s)) return true;
  const qWords = q.split(/\s+/).filter(w => w.length > 1);
  const sWords = s.split(/\s+/);
  if (qWords.some(qw => sWords.some(sw => sw.includes(qw) || qw.includes(sw)))) return true;
  return strSimilarity(s, q) > 0.75;
}

function findDebt(debts: Debt[], name: string, debtType: 'me-deben' | 'debo'): Debt | null {
  return debts.find(d =>
    d.type === debtType &&
    (d.status ?? 'pendiente') !== 'pagada' &&
    matchDebtName(d.name, name)
  ) ?? null;
}

function findPaidDebt(debts: Debt[], name: string, debtType: 'me-deben' | 'debo'): Debt | null {
  return debts.find(d =>
    d.type === debtType &&
    d.status === 'pagada' &&
    matchDebtName(d.name, name)
  ) ?? null;
}

function stemEs(s: string): string {
  if (s.endsWith('es') && s.length > 3) return s.slice(0, -2);
  if (s.endsWith('s') && s.length > 2) return s.slice(0, -1);
  return s;
}

function strSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : 1 + Math.min(row[j - 1], row[j], prev);
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return (maxLen - row[b.length]) / maxLen;
}

/** Fuzzy match product name against inventory (4 levels) */
function findInventoryProduct(inventory: InventoryProduct[], name: string): InventoryProduct | null {
  const n = normalizeStr(name);
  if (!n) return null;
  // 1. Exact match
  const exact = inventory.find(p => normalizeStr(p.nombre) === n);
  if (exact) return exact;
  // 2. Contains (handles simple singular/plural since one is a substring of the other)
  const contains = inventory.find(p => {
    const pn = normalizeStr(p.nombre);
    return pn.includes(n) || n.includes(pn);
  });
  if (contains) return contains;
  // 3. Word-level inclusion
  const nWords = n.split(/\s+/).filter(w => w.length > 2);
  const wordMatch = inventory.find(p => {
    const pWords = normalizeStr(p.nombre).split(/\s+/);
    return nWords.some(nw => pWords.some(pw => pw.includes(nw) || nw.includes(pw)));
  });
  if (wordMatch) return wordMatch;
  // 4. Stem + fuzzy similarity (singular/plural, pequeños typos)
  const nStem = stemEs(n);
  return inventory.find(p => {
    const pn = normalizeStr(p.nombre);
    const pStem = stemEs(pn);
    if (nStem === pStem) return true;
    if (strSimilarity(n, pn) > 0.8) return true;
    if (strSimilarity(nStem, pStem) > 0.8) return true;
    const nStems = nWords.map(stemEs);
    const pStems = pn.split(/\s+/).filter(w => w.length > 2).map(stemEs);
    return nStems.some(ns => pStems.some(ps => ns === ps || strSimilarity(ns, ps) > 0.8));
  }) ?? null;
}

/** Parse a number from user's natural-language response (e.g. "5 mil", "5000", "5k") */
function parseUserNumber(text: string): number | null {
  const s = text.toLowerCase().replace(/\./g, '').replace(',', '.');
  const milMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:mil|k)/);
  if (milMatch) return Math.round(parseFloat(milMatch[1]) * 1000);
  const numMatch = s.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) return Math.round(parseFloat(numMatch[1]));
  return null;
}

async function applyDebtPayment(
  userId: string,
  debt: Debt,
  paymentAmount: number,
  isPartial: boolean,
): Promise<{ status: 'pagada' | 'parcial'; remaining: number; effectivePayment: number }> {
  const alreadyPaid = debt.amountPaid ?? 0;
  const effectivePayment = paymentAmount > 0 ? paymentAmount : debt.amount - alreadyPaid;
  const totalPaid = alreadyPaid + effectivePayment;
  const remaining = Math.max(0, debt.amount - totalPaid);
  const newStatus: 'pagada' | 'parcial' = (remaining <= 0 || !isPartial) ? 'pagada' : 'parcial';
  await updateDoc(doc(db, 'users', userId, 'debts', debt.id), {
    status: newStatus,
    amountPaid: totalPaid,
    ...(newStatus === 'pagada' ? { paidAt: serverTimestamp() } : {}),
  });
  return { status: newStatus, remaining, effectivePayment };
}

const esMontoValido = (v: unknown): v is number =>
  typeof v === 'number' && !isNaN(v) && isFinite(v) && v >= 0;

async function saveToFirestore(userId: string, data: NonNullable<ChatResponse['data']>): Promise<void> {
  if (!esMontoValido(data.amount)) {
    console.warn('[Chat] Monto inválido, no se guarda en Firebase:', data);
    return;
  }
  const concept = capitalizar(data.concept);
  const base = { concept, amount: data.amount, createdAt: serverTimestamp(), source: 'chat' };

  const resolveUnitPrice = (qty: number) =>
    esMontoValido(data.unitPrice) && data.unitPrice > 0
      ? data.unitPrice
      : qty > 1 ? Math.round(data.amount / qty) : data.amount;

  if (data.type === 'venta') {
    const qty = data.quantity ?? 1;
    const unitPrice = resolveUnitPrice(qty);
    await addDoc(collection(db, 'users', userId, 'sales'), {
      items: [{ product: concept, quantity: qty, unitPrice, subtotal: data.amount }],
      total: data.amount,
      createdAt: serverTimestamp(),
      source: 'chat',
    });
  } else if (data.type === 'gasto') {
    const qty = data.quantity ?? 1;
    const unitPrice = resolveUnitPrice(qty);
    await addDoc(collection(db, 'users', userId, 'expenses'), {
      ...base,
      items: [{ product: concept, quantity: qty, unitPrice, subtotal: data.amount }],
    });
  } else if (data.type === 'compra') {
    const qty = data.quantity ?? 1;
    const unitPrice = resolveUnitPrice(qty);
    await addDoc(collection(db, 'users', userId, 'expenses'), {
      ...base,
      concept: `Compra: ${concept}`,
      items: [{ product: concept, quantity: qty, unitPrice, subtotal: data.amount }],
    });
  } else if (data.type === 'deuda-me-deben') {
    const name = capitalizar(data.debtorName || data.concept);
    await addDoc(collection(db, 'users', userId, 'debts'), {
      ...base,
      name,
      type: 'me-deben',
      status: 'pendiente',
    });
    await addDoc(collection(db, 'users', userId, 'expenses'), {
      concept: `Préstamo a ${name}`,
      amount: data.amount,
      items: [{ product: `Préstamo a ${name}`, quantity: 1, unitPrice: data.amount, subtotal: data.amount }],
      createdAt: serverTimestamp(),
      source: 'chat',
    });
  } else if (data.type === 'deuda-debo') {
    const name = capitalizar(data.debtorName || data.concept);
    await addDoc(collection(db, 'users', userId, 'debts'), {
      ...base,
      name,
      type: 'debo',
      status: 'pendiente',
    });
    await addDoc(collection(db, 'users', userId, 'sales'), {
      concept: `Préstamo de ${name}`,
      total: data.amount,
      createdAt: serverTimestamp(),
      source: 'chat',
    });
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isDarkMode: boolean;
  userId: string;
  debts: Debt[];
  inventory: InventoryProduct[];
}

export const Chat = ({ isDarkMode, userId, debts, inventory }: Props) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      text: '¡Hola! Soy tu asistente de Voz-Activa. Cuéntame tus ventas, gastos o deudas y las registro al instante.',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<PendingProduct | null>(null);
  const [pendingDebt, setPendingDebt] = useState<PendingDebt | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Voice input state ──────────────────────────────────────────────
  const voiceSupported = SpeechRecognitionAPI !== null;
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) return;
    setMicError('');
    setInput('');

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'es-CO';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput(transcript.trim());
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        setMicError('Permiso de micrófono denegado. Habilítalo en ajustes del navegador.');
      } else if (event.error !== 'no-speech') {
        setMicError('No se pudo usar el micrófono. Intenta de nuevo.');
      }
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  useEffect(() => {
    return () => { recognitionRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Helpers for adding bot messages ───────────────────────────────────────

  const addBotMsg = (text: string, extra?: Partial<Message>) => {
    setMessages(prev => [...prev, { role: 'model', text, timestamp: new Date(), ...extra }]);
  };

  // ── handleSend ───────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userInput = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userInput, timestamp: new Date() }]);
    setInput('');

    // ── Pending debt flow (multi-turn, no Gemini needed) ──────────────────
    if (pendingDebt) {
      const lower = userInput.toLowerCase().trim();
      const isYes = /^(si\b|sí\b|yes\b|claro|dale|obvio|simon\b|simón\b|aja\b|ajá\b|ok\b|okey|sip\b|seguro)/i.test(lower);
      const isNo = /^(no\b|nel\b|nope|negativo)/i.test(lower);
      const isCancel = /^(cancelar|cancel|salir|olvida|no importa)$/i.test(lower);

      if (isCancel) {
        setPendingDebt(null);
        addBotMsg('Ok, cancelado.');
        return;
      }

      if (pendingDebt.step === 'asking-nueva-deuda') {
        const { debtorName, amount, debtType } = pendingDebt;
        const name = capitalizar(debtorName);
        const fireDebtType = debtType === 'cobro-deuda-me-deben' ? 'me-deben' : 'debo';

        if (isYes && amount > 0) {
          setIsLoading(true);
          try {
            await addDoc(collection(db, 'users', userId, 'debts'), {
              name, concept: `Nueva deuda de ${name}`, amount,
              type: fireDebtType, status: 'pagada', amountPaid: amount,
              paidAt: serverTimestamp(), createdAt: serverTimestamp(), source: 'chat',
            });
            if (debtType === 'cobro-deuda-me-deben') {
              await addDoc(collection(db, 'users', userId, 'sales'), {
                items: [{ product: `Cobro deuda: ${name}`, quantity: 1, unitPrice: amount, subtotal: amount }],
                total: amount, createdAt: serverTimestamp(), source: 'chat',
              });
            } else {
              await addDoc(collection(db, 'users', userId, 'expenses'), {
                concept: `Pago deuda: ${name}`, amount, items: [{ product: `Pago deuda: ${name}`, quantity: 1, unitPrice: amount, subtotal: amount }], createdAt: serverTimestamp(), source: 'chat',
              });
            }
            addBotMsg(`✅ Registré nueva deuda de ${name} por $${amount.toLocaleString('es-CO')} y su pago. ¡Todo cuadrado!`, { saved: true });
          } catch (e) {
            addBotMsg('No pude guardar. Revisa tu conexión e intenta de nuevo.');
          } finally {
            setIsLoading(false);
          }
          setPendingDebt(null);
          return;
        }

        if (isNo) {
          addBotMsg('No hay problema, eso ya estaba registrado. ✅');
          setPendingDebt(null);
          return;
        }

        addBotMsg(`No entendí. ¿Registrar nueva deuda de ${capitalizar(debtorName)}? Responde sí o no.`);
        return;
      }

      if (pendingDebt.step === 'asking-confirmar-pago') {
        const { debtorName, amount, debtType, activeDebt } = pendingDebt;
        const name = capitalizar(debtorName);

        if (isYes && activeDebt) {
          setIsLoading(true);
          try {
            const result = await applyDebtPayment(userId, activeDebt, amount, false);
            if (debtType === 'cobro-deuda-me-deben') {
              await addDoc(collection(db, 'users', userId, 'sales'), {
                items: [{ product: `Cobro deuda: ${name}`, quantity: 1, unitPrice: amount, subtotal: amount }],
                total: amount, createdAt: serverTimestamp(), source: 'chat',
              });
              addBotMsg(`✅ ${name} te pagó $${amount.toLocaleString('es-CO')}. ¡Deuda saldada!`, { saved: true });
            } else {
              await addDoc(collection(db, 'users', userId, 'expenses'), {
                concept: `Pago deuda: ${name}`, amount, items: [{ product: `Pago deuda: ${name}`, quantity: 1, unitPrice: amount, subtotal: amount }], createdAt: serverTimestamp(), source: 'chat',
              });
              addBotMsg(`✅ Pagaste $${amount.toLocaleString('es-CO')} a ${name}. ¡Deuda saldada!`, { saved: true });
            }
          } catch (e) {
            addBotMsg('No pude guardar. Revisa tu conexión e intenta de nuevo.');
          } finally {
            setIsLoading(false);
          }
          setPendingDebt(null);
          return;
        }

        if (isNo) {
          addBotMsg('Ok, cancelado. Dime el monto correcto cuando quieras.');
          setPendingDebt(null);
          return;
        }

        addBotMsg(`¿Registrar el pago de $${amount.toLocaleString('es-CO')} de ${capitalizar(debtorName)}? Responde sí o no.`);
        return;
      }
    }

    // ── Pending new-product flow (multi-turn, no Gemini needed) ────────────
    if (pendingProduct) {
      // Step: asking for precioCompra
      if (pendingProduct.step === 'asking-precio-compra') {
        const price = parseUserNumber(userInput);
        if (!price || price <= 0) {
          addBotMsg('No entendí el precio. Dímelo en pesos, ej: 1500 o 5 mil.');
          return;
        }
        if (pendingProduct.isCompra && pendingProduct.productId) {
          // compra de producto EXISTENTE — FIX 1: guardar gasto, preguntar si vende
          const { concept, quantity } = pendingProduct;
          const total = quantity * price;
          setIsLoading(true);
          try {
            await addDoc(collection(db, 'users', userId, 'expenses'), {
              concept: `Compra: ${concept}`,
              amount: total,
              createdAt: serverTimestamp(),
              source: 'chat',
              items: [{ product: concept, quantity, unitPrice: price, subtotal: total }],
            });
            setPendingProduct({ ...pendingProduct, precioCompra: price, step: 'asking-si-vende' });
            addBotMsg(`Listo, gasto de $${total.toLocaleString('es-CO')} por ${quantity} ${conArticulo(concept)} anotado. ¿${pronombre(concept).charAt(0).toUpperCase() + pronombre(concept).slice(1)} vas a vender?`);
          } catch (e) {
            console.error('[Chat] Error al guardar compra:', e);
            addBotMsg('No pude guardar. Revisa tu conexión e intenta de nuevo.');
          } finally {
            setIsLoading(false);
          }
        } else if (pendingProduct.isCompra) {
          // compra de producto NUEVO — preguntar si lo va a vender
          setPendingProduct({ ...pendingProduct, precioCompra: price, step: 'asking-si-vende' });
          addBotMsg(`Listo, costo de $${price.toLocaleString('es-CO')} anotado. ¿${pronombre(pendingProduct.concept).charAt(0).toUpperCase() + pronombre(pendingProduct.concept).slice(1)} vas a vender?`);
        } else {
          // venta de producto nuevo — ya tenemos precioVenta, ahora ir a stock
          setPendingProduct({ ...pendingProduct, precioCompra: price, step: 'asking-stock' });
          addBotMsg(`$${price.toLocaleString('es-CO')} de costo anotado. ¿Cuántas unidades tienes en total ahora?`);
        }
        return;
      }

      // Step: asking si va a vender (producto nuevo en compra)
      if (pendingProduct.step === 'asking-si-vende') {
        const lowerInput = userInput.toLowerCase().trim();
        const isYes = /^(si\b|sí\b|yes\b|claro|dale|obvio|simon\b|simón\b|aja\b|ajá\b|ok\b|okey|sip\b|seguro)/i.test(lowerInput);
        const isNo = /^(no\b|nel\b|nope|negativo|pa mi\b|para mi\b|uso personal|consumo|no lo vendo|no vendo|mi familia)/i.test(lowerInput);
        const isCancel = /^(cancelar|cancel|salir|olvida|no importa)$/i.test(lowerInput);

        if (isCancel) {
          setPendingProduct(null);
          addBotMsg('Ok, cancelado.');
          return;
        }

        if (isNo) {
          if (pendingProduct.productId) {
            // Producto existente — gasto ya guardado, solo confirmar
            addBotMsg(`Entendido 👍 Quedó registrado solo como gasto. No se tocó el inventario.`, { saved: true });
            setPendingProduct(null);
          } else {
            // Producto nuevo — guardar gasto ahora
            const { concept, quantity, precioCompra = 0 } = pendingProduct;
            const total = quantity * precioCompra;
            setIsLoading(true);
            try {
              await addDoc(collection(db, 'users', userId, 'expenses'), {
                concept: `Compra: ${concept}`,
                amount: total,
                createdAt: serverTimestamp(),
                source: 'chat',
                items: [{ product: concept, quantity, unitPrice: precioCompra, subtotal: total }],
              });
              addBotMsg(
                `Entendido 👍 Registré $${total.toLocaleString('es-CO')} de gasto por ${quantity} ${concept}. No se tocó el inventario.`,
                { saved: true, data: { type: 'gasto', amount: total, concept } }
              );
            } catch (e) {
              addBotMsg('No pude guardar. Revisa tu conexión e intenta de nuevo.');
            } finally {
              setIsLoading(false);
              setPendingProduct(null);
            }
          }
          return;
        }

        if (isYes) {
          if (pendingProduct.productId) {
            // Producto existente — actualizar stock
            const { productId, productCurrentStock = 0, quantity, concept, precioCompra } = pendingProduct;
            const newStock = productCurrentStock + quantity;
            const total = quantity * (precioCompra ?? 0);
            setIsLoading(true);
            try {
              await updateDoc(doc(db, 'users', userId, 'inventario', productId), {
                cantidad: newStock,
                ...(precioCompra ? { precioCompra } : {}),
                updatedAt: serverTimestamp(),
              });
              addBotMsg(
                `¡Listo! ${quantity} ${concept} — gasto $${total.toLocaleString('es-CO')} registrado. Stock actualizado: ${newStock} unidades.`,
                { saved: true, stockUpdate: { nombre: concept, newStock }, data: { type: 'compra', amount: total, concept, quantity, unitPrice: precioCompra ?? 0 } }
              );
            } catch (e) {
              addBotMsg('No pude guardar. Revisa tu conexión e intenta de nuevo.');
            } finally {
              setIsLoading(false);
              setPendingProduct(null);
            }
          } else {
            // Producto nuevo — pedir precio de venta
            setPendingProduct({ ...pendingProduct, step: 'asking-precio-venta' });
            addBotMsg(`¿A qué precio vendes ${conArticulo(pendingProduct.concept)}?`);
          }
          return;
        }

        addBotMsg(`No entendí. ¿Vas a vender *${conArticulo(pendingProduct.concept)}*? Responde sí o no.`);
        return;
      }

      // Step: asking for precioVenta
      if (pendingProduct.step === 'asking-precio-venta') {
        // Detect "not selling" before trying to parse a price
        const lowerInput = userInput.toLowerCase();
        const notSelling =
          /\bno\b/.test(lowerInput) ||
          lowerInput.includes('consumo') ||
          lowerInput.includes('personal') ||
          lowerInput.includes('para m') ||
          lowerInput.includes('uso propio') ||
          lowerInput.includes('no vend') ||
          lowerInput.includes('mi casa') ||
          lowerInput.includes('mi familia');

        if (notSelling && pendingProduct.isCompra) {
          // Register only as gasto, skip inventory
          const { concept, quantity, precioCompra = 0 } = pendingProduct;
          const total = quantity * precioCompra;
          setIsLoading(true);
          try {
            await addDoc(collection(db, 'users', userId, 'expenses'), {
              concept: `Compra: ${concept}`,
              amount: total,
              createdAt: serverTimestamp(),
              source: 'chat',
              items: [{ product: concept, quantity, unitPrice: precioCompra, subtotal: total }],
            });
            addBotMsg(
              `Entendido 👍 Registré $${total.toLocaleString('es-CO')} de gasto por ${quantity} ${concept}. No se tocó el inventario.`,
              { saved: true, data: { type: 'gasto', amount: total, concept } }
            );
          } catch (e) {
            console.error('[Chat] Error al guardar compra sin inventario:', e);
            addBotMsg('No pude guardar. Revisa tu conexión e intenta de nuevo.');
          } finally {
            setIsLoading(false);
            setPendingProduct(null);
          }
          return;
        }

        const price = parseUserNumber(userInput);
        if (!price || price <= 0) {
          addBotMsg('No entendí 🤔 Dime el precio de venta (ej: <i>2000</i> o <i>8 mil</i>) o escribe <b>"no lo vendo"</b> si es para uso propio.');
          return;
        }
        if (pendingProduct.isCompra) {
          // compra: tenemos todo — guardar inventario + gasto
          const { concept, quantity, precioCompra = 0 } = pendingProduct;
          const total = quantity * precioCompra;
          setIsLoading(true);
          try {
            await addDoc(collection(db, 'users', userId, 'inventario'), {
              nombre: concept,
              cantidad: quantity,
              precioCompra,
              precioVenta: price,
              createdAt: serverTimestamp(),
            });
            await addDoc(collection(db, 'users', userId, 'expenses'), {
              concept: `Compra: ${concept}`,
              amount: total,
              createdAt: serverTimestamp(),
              source: 'chat',
              items: [{ product: concept, quantity, unitPrice: precioCompra, subtotal: total }],
            });
            addBotMsg(
              `¡Listo! ${quantity} ${concept} guardados — compra a $${precioCompra.toLocaleString('es-CO')}, venta a $${price.toLocaleString('es-CO')}. Gasto de $${total.toLocaleString('es-CO')} registrado.`,
              { saved: true, data: { type: 'compra', amount: total, concept, quantity, unitPrice: precioCompra }, stockUpdate: { nombre: concept, newStock: quantity } }
            );
          } catch (e) {
            console.error('[Chat] Error al guardar compra nueva:', e);
            addBotMsg('No pude guardar. Revisa tu conexión e intenta de nuevo.');
          } finally {
            setIsLoading(false);
            setPendingProduct(null);
          }
        } else {
          // venta de producto nuevo — pedir precio de compra (costo) antes del stock
          setPendingProduct({ ...pendingProduct, precioVenta: price, step: 'asking-precio-compra' });
          addBotMsg(`$${price.toLocaleString('es-CO')} de precio de venta. ¿Y a qué precio lo compraste tú (costo)?`);
        }
        return;
      }

      // Step: asking for total stock (only for venta path)
      if (pendingProduct.step === 'asking-stock') {
        const stockTotal = parseUserNumber(userInput);
        if (stockTotal == null || stockTotal < 0) {
          addBotMsg('Dime cuántas tienes en total, ej: 50.');
          return;
        }

        const { concept, quantity, precioCompra = 0, precioVenta = 0 } = pendingProduct;
        const total = quantity * precioVenta;
        const stockRestante = Math.max(0, stockTotal - quantity);

        setIsLoading(true);
        try {
          await addDoc(collection(db, 'users', userId, 'sales'), {
            items: [{ product: concept, quantity, unitPrice: precioVenta, subtotal: total }],
            total,
            createdAt: serverTimestamp(),
            source: 'chat',
          });
          await addDoc(collection(db, 'users', userId, 'inventario'), {
            nombre: concept,
            cantidad: stockRestante,
            precioCompra,
            precioVenta,
            createdAt: serverTimestamp(),
          });
          addBotMsg(
            `¡Listo! ${quantity} ${concept} a $${precioVenta.toLocaleString('es-CO')} — Total: $${total.toLocaleString('es-CO')} registrado. Guardé "${concept}" en inventario con ${stockRestante} unidades disponibles.`,
            { saved: true, data: { type: 'venta', amount: total, concept, quantity, unitPrice: precioVenta } }
          );
        } catch (e) {
          console.error('[Chat] Error al guardar producto nuevo:', e);
          addBotMsg('No pude guardar. Revisa tu conexión e intenta de nuevo.');
        } finally {
          setIsLoading(false);
          setPendingProduct(null);
        }
        return;
      }
    }

    // ── Normal Gemini flow ───────────────────────────────────────────────────
    setIsLoading(true);
    const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));

    try {
      const response = await sendMessageToGemini(userInput, history);
      const dataType = response.data?.type;
      const isDebtPayment = dataType === 'pago-deuda-debo' || dataType === 'cobro-deuda-me-deben';

      // ── Extra movements (multi-action messages) ─────────────────────────────
      // Save any additional simple actions (gastos, new debts) that Gemini put
      // in response.movements[], then let the primary data flow run as usual.
      if (response.movements && response.movements.length > 0) {
        const extraLines: string[] = [];
        for (const mov of response.movements) {
          if (!esMontoValido(mov.amount)) continue;
          try {
            await saveToFirestore(userId, mov as any);
            if (mov.type === 'deuda-me-deben') extraLines.push(`• ${mov.debtorName ?? mov.concept} te debe $${mov.amount.toLocaleString('es-CO')}`);
            else if (mov.type === 'deuda-debo') extraLines.push(`• Debes $${mov.amount.toLocaleString('es-CO')} a ${mov.debtorName ?? mov.concept}`);
            else if (mov.type === 'gasto') extraLines.push(`• Gasto: ${mov.concept} — $${mov.amount.toLocaleString('es-CO')}`);
            else if (mov.type === 'venta') extraLines.push(`• Venta: ${mov.concept} — $${mov.amount.toLocaleString('es-CO')}`);
          } catch (e) {
            console.error('[Chat] Error guardando movimiento extra:', e);
          }
        }
        if (extraLines.length > 0) {
          addBotMsg(`También registré:\n${extraLines.join('\n')}`);
        }
      }

      // ── Debt payment / collection flow ─────────────────────────────────────
      if (isDebtPayment && response.data) {
        const debtType = dataType === 'pago-deuda-debo' ? 'debo' : 'me-deben';
        const rawPayments = response.data.payments?.length
          ? response.data.payments
          : [{ debtorName: response.data.debtorName ?? response.data.concept ?? '', amount: response.data.amount, isPartial: response.data.isPartial ?? false }];
        const isSingle = rawPayments.length === 1;

        const debtResults: DebtPaymentResult[] = [];
        for (const p of rawPayments) {
          // Guard: negative amount
          if (p.amount < 0) {
            debtResults.push({ found: false, debtorName: p.debtorName, amount: p.amount, isPartial: p.isPartial, paymentType: dataType as 'pago-deuda-debo' | 'cobro-deuda-me-deben' });
            continue;
          }

          const matched = findDebt(debts, p.debtorName, debtType);

          if (!matched) {
            // Check if debt was already paid
            const paidDebt = findPaidDebt(debts, p.debtorName, debtType);
            if (paidDebt && isSingle) {
              const amountForNew = p.amount > 0 ? p.amount : paidDebt.amount;
              setPendingDebt({ step: 'asking-nueva-deuda', debtorName: p.debtorName, amount: amountForNew, debtType: dataType as 'pago-deuda-debo' | 'cobro-deuda-me-deben' });
              addBotMsg(`La deuda de ${capitalizar(p.debtorName)} ya estaba registrada como pagada. ¿Te prestó dinero nuevo? Lo puedo registrar como nueva deuda y pago.`);
              return;
            }
            debtResults.push({ found: false, debtorName: p.debtorName, amount: p.amount, isPartial: p.isPartial, paymentType: dataType as 'pago-deuda-debo' | 'cobro-deuda-me-deben' });
            continue;
          }

          // Guard: overpayment
          const alreadyPaid = matched.amountPaid ?? 0;
          const owed = matched.amount - alreadyPaid;
          if (p.amount > 0 && p.amount > owed) {
            if (isSingle) {
              setPendingDebt({ step: 'asking-confirmar-pago', debtorName: p.debtorName, amount: owed, debtType: dataType as 'pago-deuda-debo' | 'cobro-deuda-me-deben', activeDebt: matched });
              addBotMsg(`${capitalizar(p.debtorName)} solo debe $${owed.toLocaleString('es-CO')}, pero mencionaste $${p.amount.toLocaleString('es-CO')}. ¿Registrar el pago de lo que debe ($${owed.toLocaleString('es-CO')})?`);
              return;
            }
            // Batch: clamp silently
            try {
              const result = await applyDebtPayment(userId, matched, owed, false);
              debtResults.push({ found: true, debtorName: p.debtorName, amount: result.effectivePayment, isPartial: false, paymentType: dataType as 'pago-deuda-debo' | 'cobro-deuda-me-deben', ...result });
              if (dataType === 'pago-deuda-debo') {
                await addDoc(collection(db, 'users', userId, 'expenses'), { concept: `Pago deuda: ${capitalizar(matched.name)}`, amount: owed, items: [{ product: `Pago deuda: ${capitalizar(matched.name)}`, quantity: 1, unitPrice: owed, subtotal: owed }], createdAt: serverTimestamp(), source: 'chat' });
              } else {
                await addDoc(collection(db, 'users', userId, 'sales'), { items: [{ product: `Cobro deuda: ${capitalizar(matched.name)}`, quantity: 1, unitPrice: owed, subtotal: owed }], total: owed, createdAt: serverTimestamp(), source: 'chat' });
              }
            } catch (e) {
              console.error('Error updating debt:', e);
              debtResults.push({ found: true, debtorName: p.debtorName, amount: p.amount, isPartial: p.isPartial, paymentType: dataType as 'pago-deuda-debo' | 'cobro-deuda-me-deben' });
            }
            continue;
          }

          // Normal payment
          try {
            const result = await applyDebtPayment(userId, matched, p.amount, p.isPartial);
            debtResults.push({ found: true, debtorName: p.debtorName, amount: result.effectivePayment, isPartial: p.isPartial, paymentType: dataType as 'pago-deuda-debo' | 'cobro-deuda-me-deben', ...result });
            if (dataType === 'pago-deuda-debo') {
              await addDoc(collection(db, 'users', userId, 'expenses'), {
                concept: `Pago deuda: ${capitalizar(matched.name)}`,
                amount: result.effectivePayment,
                items: [{ product: `Pago deuda: ${capitalizar(matched.name)}`, quantity: 1, unitPrice: result.effectivePayment, subtotal: result.effectivePayment }],
                createdAt: serverTimestamp(),
                source: 'chat',
              });
            } else {
              await addDoc(collection(db, 'users', userId, 'sales'), {
                items: [{ product: `Cobro deuda: ${capitalizar(matched.name)}`, quantity: 1, unitPrice: result.effectivePayment, subtotal: result.effectivePayment }],
                total: result.effectivePayment,
                createdAt: serverTimestamp(),
                source: 'chat',
              });
            }
          } catch (e) {
            console.error('Error updating debt:', e);
            debtResults.push({ found: true, debtorName: p.debtorName, amount: p.amount, isPartial: p.isPartial, paymentType: dataType as 'pago-deuda-debo' | 'cobro-deuda-me-deben' });
          }
        }

        setMessages(prev => [...prev, {
          role: 'model',
          text: response.message,
          data: response.data,
          timestamp: new Date(),
          saved: debtResults.every(r => r.found),
          debtResults,
        }]);
        return;
      }

      // ── Inventory-aware sale handling ───────────────────────────────────────
      if (dataType === 'venta' && response.data) {
        const { concept: rawConcept = '', quantity = 1, amount, unitPrice: geminiUnitPrice } = response.data;
        const concept = capitalizar(rawConcept);
        const foundProduct = findInventoryProduct(inventory, concept);

        if (foundProduct) {
          // CASO 1 — Producto en inventario.
          // Si el usuario mencionó un precio explícito (geminiUnitPrice > 0), se usa ese
          // como "precio especial" solo para esta venta. Si no, se usa precioVenta guardado.
          const storedPrice = getPrecioVenta(foundProduct);
          const unitPrice = (geminiUnitPrice && geminiUnitPrice > 0) ? geminiUnitPrice : storedPrice;
          const isPrecioEspecial = geminiUnitPrice && geminiUnitPrice > 0 && geminiUnitPrice !== storedPrice;
          const total = quantity * unitPrice;
          const newStock = Math.max(0, (foundProduct.cantidad ?? 0) - quantity);
          try {
            await addDoc(collection(db, 'users', userId, 'sales'), {
              items: [{
                product: foundProduct.nombre,
                quantity,
                unitPrice,
                subtotal: total,
                ...(isPrecioEspecial ? { regularUnitPrice: storedPrice } : {}),
              }],
              total,
              createdAt: serverTimestamp(),
              source: 'chat',
            });
            await updateDoc(doc(db, 'users', userId, 'inventario', foundProduct.id), {
              cantidad: newStock,
              updatedAt: serverTimestamp(),
              // precioVenta NO se actualiza — el precio especial es solo para esta venta
            });
            const precioLabel = isPrecioEspecial
              ? `$${unitPrice.toLocaleString('es-CO')} (precio especial)`
              : `$${unitPrice.toLocaleString('es-CO')} c/u`;
            setMessages(prev => [...prev, {
              role: 'model',
              text: `¡Listo! ${quantity} ${foundProduct.nombre} a ${precioLabel} — Total: $${total.toLocaleString('es-CO')} registrado. Stock actualizado: ${newStock} unidades.`,
              timestamp: new Date(),
              saved: true,
              data: { type: 'venta', amount: total, concept: foundProduct.nombre, quantity, unitPrice },
              stockUpdate: { nombre: foundProduct.nombre, newStock },
            }]);
          } catch (e) {
            console.error('[Chat] Error al guardar venta con inventario:', e);
            setMessages(prev => [...prev, {
              role: 'model',
              text: response.message,
              data: response.data,
              timestamp: new Date(),
              saved: false,
            }]);
          }
          return;
        }

        if (amount > 0) {
          // CASO 2 — No está en inventario pero el usuario mencionó el precio: guardar normal
          try {
            await saveToFirestore(userId, response.data);
            setMessages(prev => [...prev, {
              role: 'model',
              text: response.message,
              data: response.data,
              timestamp: new Date(),
              saved: true,
            }]);
          } catch (e) {
            console.error('[Chat] Error al guardar venta:', e);
            setMessages(prev => [...prev, {
              role: 'model',
              text: response.message,
              data: response.data,
              timestamp: new Date(),
              saved: false,
            }]);
          }
          return;
        }

        // CASO 3 — No está en inventario y no se mencionó precio: preguntar precio de venta primero
        setPendingProduct({ concept: concept || 'producto', quantity, isCompra: false, step: 'asking-precio-venta' });
        addBotMsg(`No tengo "${concept || 'ese producto'}" en el inventario. ¿A qué precio lo vendes?`);
        return;
      }

      // ── Compra: suma al stock + registra gasto ─────────────────────────────
      if (dataType === 'compra' && response.data) {
        const { concept: rawConcept = '', quantity = 1, amount, unitPrice: geminiUnitPrice } = response.data;
        const concept = capitalizar(rawConcept);
        const precioCompra = geminiUnitPrice ?? (quantity > 1 ? Math.round(amount / quantity) : amount);
        const total = quantity * precioCompra;
        const foundProduct = findInventoryProduct(inventory, concept);

        if (foundProduct && precioCompra <= 0) {
          // Producto existente pero sin precio mencionado — preguntar precio
          setPendingProduct({
            concept: foundProduct.nombre,
            quantity,
            isCompra: true,
            step: 'asking-precio-compra',
            productId: foundProduct.id,
            productCurrentStock: foundProduct.cantidad ?? 0,
          });
          addBotMsg(`¿A qué precio compraste ${conArticulo(foundProduct.nombre)}?`);
          setIsLoading(false);
          return;
        }

        if (!foundProduct && precioCompra <= 0) {
          // Nuevo producto sin precio — preguntar precio compra y venta
          setPendingProduct({ concept: concept || 'producto', quantity, isCompra: true, step: 'asking-precio-compra' });
          addBotMsg(`¿A qué precio compraste ${conArticulo(concept)}?`);
          setIsLoading(false);
          return;
        }

        try {
          if (foundProduct) {
            // FIX 1: guardar gasto sin tocar inventario, preguntar si vende
            await addDoc(collection(db, 'users', userId, 'expenses'), {
              concept: `Compra: ${foundProduct.nombre}`,
              amount: total,
              createdAt: serverTimestamp(),
              source: 'chat',
              items: [{ product: foundProduct.nombre, quantity, unitPrice: precioCompra, subtotal: total }],
            });
            setPendingProduct({
              concept: foundProduct.nombre,
              quantity,
              isCompra: true,
              step: 'asking-si-vende',
              precioCompra,
              productId: foundProduct.id,
              productCurrentStock: foundProduct.cantidad ?? 0,
            });
            addBotMsg(`Listo, anoté el gasto de $${total.toLocaleString('es-CO')} por ${quantity} ${conArticulo(foundProduct.nombre)}. ¿${pronombre(foundProduct.nombre).charAt(0).toUpperCase() + pronombre(foundProduct.nombre).slice(1)} vas a vender?`);
          } else {
            // Nuevo producto con precio — preguntar si lo va a vender
            setPendingProduct({ concept: concept || 'producto', quantity, isCompra: true, precioCompra, step: 'asking-si-vende' });
            addBotMsg(`Compra de ${quantity} ${conArticulo(concept)} a $${precioCompra.toLocaleString('es-CO')} c/u (total $${total.toLocaleString('es-CO')}). ¿${pronombre(concept).charAt(0).toUpperCase() + pronombre(concept).slice(1)} vas a vender?`);
          }
        } catch (e) {
          console.error('[Chat] Error al guardar compra:', e);
          setMessages(prev => [...prev, {
            role: 'model',
            text: response.message,
            data: response.data,
            timestamp: new Date(),
            saved: false,
          }]);
        }
        return;
      }

      // ── Resto: gasto, deuda nueva, saludo, etc. ─────────────────────────────
      let saved = false;
      if (response.data && userId) {
        try {
          await saveToFirestore(userId, response.data);
          saved = true;
        } catch (e) {
          console.error('Error saving from chat:', e);
        }
      }
      setMessages(prev => [...prev, {
        role: 'model',
        text: response.message,
        data: response.data,
        timestamp: new Date(),
        saved,
      }]);

    } catch (e: any) {
      console.error('Chat error:', e);
      setMessages(prev => [...prev, {
        role: 'model',
        text: `Error: ${e?.message ?? String(e)}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto no-scrollbar pb-10">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              'flex flex-col max-w-[90%] animate-in fade-in slide-in-from-bottom-2 duration-300',
              msg.role === 'user' ? 'items-end self-end' : 'items-start'
            )}
          >
            <div className={cn(
              'p-4 rounded-2xl shadow-sm transition-all duration-500',
              msg.role === 'user'
                ? 'bg-[#FFD700] text-black rounded-tr-none'
                : isDarkMode ? 'bg-[#1A1A1A] text-[#FDFBF0] rounded-tl-none' : 'bg-[#f1f1ee] text-[#2e2f2d] rounded-tl-none'
            )}>
              <p className="text-sm font-medium leading-relaxed">{msg.text}</p>

              {/* Card para ventas / gastos / registro de deudas nuevas */}
              {msg.data && !msg.debtResults && (
                <div className={cn(
                  'mt-3 p-3 rounded-xl border-l-4 flex items-center gap-3',
                  isDarkMode ? 'bg-black/20 border-[#B8860B]' : 'bg-white/60 border-[#B8860B]'
                )}>
                  <div className="w-8 h-8 rounded-full bg-[#B8860B]/20 flex items-center justify-center text-[#B8860B]">
                    {TYPE_LABELS[msg.data.type]?.icon ?? <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                      {TYPE_LABELS[msg.data.type]?.label ?? msg.data.type}
                      {msg.saved ? ' · ✓ Guardado' : ' · ⚠ No guardado'}
                    </p>
                    <p className={cn('text-sm font-black', TYPE_LABELS[msg.data.type]?.color ?? 'text-[#B8860B]')}>
                      ${msg.data.amount.toLocaleString('es-CO')}
                      {msg.data.debtorName && (
                        <span className="text-xs font-bold opacity-60 ml-2">— {msg.data.debtorName}</span>
                      )}
                    </p>
                    <p className="text-[10px] opacity-40 truncate">{msg.data.concept}</p>
                  </div>
                  {/* Stock update badge */}
                  {msg.stockUpdate && (
                    <div className={cn(
                      'flex flex-col items-center justify-center px-2 py-1 rounded-lg text-center',
                      isDarkMode ? 'bg-[#B8860B]/20' : 'bg-[#FFF8DC]'
                    )}>
                      <Package className="w-3 h-3 text-[#B8860B] mb-0.5" />
                      <p className="text-[9px] font-black text-[#B8860B] leading-none">{msg.stockUpdate.newStock}</p>
                      <p className="text-[8px] opacity-50 leading-none">uds.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Cards para resultados de pago/cobro de deudas */}
              {msg.debtResults && msg.debtResults.length > 0 && (
                <div className="mt-3 space-y-2">
                  {msg.debtResults.map((r, i) => (
                    <div
                      key={i}
                      className={cn(
                        'p-3 rounded-xl border-l-4 flex items-center gap-3',
                        r.found
                          ? r.status === 'pagada'
                            ? isDarkMode ? 'bg-green-500/10 border-green-500' : 'bg-green-50 border-green-500'
                            : isDarkMode ? 'bg-amber-500/10 border-amber-400' : 'bg-amber-50 border-amber-400'
                          : isDarkMode ? 'bg-red-500/10 border-red-400' : 'bg-red-50 border-red-400'
                      )}
                    >
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                        r.found
                          ? r.status === 'pagada' ? 'bg-green-500/20 text-green-500' : 'bg-amber-400/20 text-amber-500'
                          : 'bg-red-400/20 text-red-400'
                      )}>
                        {r.found
                          ? <CheckCircle2 className="w-4 h-4" />
                          : <AlertCircle className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                          {r.found
                            ? r.status === 'pagada' ? 'Deuda saldada ✓' : 'Abono registrado ✓'
                            : 'Deuda no encontrada'}
                        </p>
                        <p className="text-sm font-black truncate">{r.debtorName}</p>
                        {r.found && r.status === 'parcial' && r.remaining != null && (
                          <p className="text-[10px] opacity-60">
                            Abono: ${r.amount.toLocaleString('es-CO')} · Pendiente: ${r.remaining.toLocaleString('es-CO')}
                          </p>
                        )}
                        {r.found && r.status === 'pagada' && (
                          <p className="text-[10px] opacity-60">Pagado: ${r.amount.toLocaleString('es-CO')}</p>
                        )}
                        {!r.found && (
                          <p className="text-[10px] opacity-60">
                            Regístrala primero diciéndome:{' '}
                            <span className="font-bold">
                              "{r.paymentType === 'pago-deuda-debo'
                                ? `le debo [monto] a ${r.debtorName}`
                                : `${r.debtorName} me debe [monto]`}"
                            </span>{' '}
                            y luego repite el pago.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <span className={cn(
              'text-[8px] uppercase tracking-widest mt-1 opacity-40 font-bold',
              msg.role === 'user' ? 'mr-1' : 'ml-1'
            )}>
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start max-w-[90%]">
            <div className={cn(
              'p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2',
              isDarkMode ? 'bg-[#1A1A1A]' : 'bg-[#f1f1ee]'
            )}>
              <Loader2 className="w-4 h-4 animate-spin text-[#B8860B]" />
              <span className="text-xs font-bold opacity-50">Procesando...</span>
            </div>
          </div>
        )}
      </div>

      <div className="pt-4 space-y-2">
        {/* Mic permission error */}
        {micError && (
          <p className="text-xs font-medium text-red-400 text-center px-2">{micError}</p>
        )}

        {/* Pending product indicator */}
        {pendingProduct && (
          <div className={cn(
            'flex items-center justify-between px-4 py-2 rounded-xl text-xs font-bold',
            isDarkMode ? 'bg-[#B8860B]/15 text-[#FFD700]' : 'bg-[#FFF8DC] text-[#B8860B]'
          )}>
            <span>
              {pendingProduct.step === 'asking-precio-compra'
                ? `¿A cuánto compraste ${conArticulo(pendingProduct.concept)}?`
                : pendingProduct.step === 'asking-si-vende'
                ? `¿Vas a vender ${conArticulo(pendingProduct.concept)}?`
                : pendingProduct.step === 'asking-precio-venta'
                ? `¿A cuánto vendes ${conArticulo(pendingProduct.concept)}?`
                : `¿Cuánto stock tienes de ${conArticulo(pendingProduct.concept)}?`}
            </span>
            <button
              onClick={() => { setPendingProduct(null); addBotMsg('Ok, cancelado.'); }}
              className="opacity-50 hover:opacity-100 transition-opacity ml-2 underline"
            >
              Cancelar
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className={cn(
            'flex-1 backdrop-blur-xl rounded-2xl h-12 px-4 flex items-center shadow-lg transition-all duration-500',
            isListening
              ? isDarkMode ? 'bg-[#1A1A1A]/90 ring-1 ring-red-500/50' : 'bg-white/90 ring-1 ring-red-400/50'
              : isDarkMode ? 'bg-[#1A1A1A]/90' : 'bg-white/90'
          )}>
            {isListening && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mr-2 shrink-0" />
            )}
            <input
              className={cn(
                'bg-transparent border-none focus:ring-0 w-full text-sm font-medium transition-colors',
                isDarkMode ? 'text-[#FDFBF0] placeholder:text-[#FDFBF0]/30' : 'text-[#2e2f2d] placeholder:text-[#5b5c5a]/50'
              )}
              placeholder={
                pendingProduct?.step === 'asking-precio-compra' || pendingProduct?.step === 'asking-precio-venta'
                  ? 'Escribe el precio, ej: 1500 o 5 mil...'
                  : pendingProduct?.step === 'asking-si-vende'
                  ? 'Responde sí o no...'
                  : pendingProduct?.step === 'asking-stock'
                  ? 'Escribe el total de unidades disponibles...'
                  : isListening
                  ? 'Escuchando...'
                  : 'Ej: vendí 3 almuerzos por 45 mil...'
              }
              type="text"
              value={input}
              onChange={(e) => { if (!isListening) setInput(e.target.value); }}
              onKeyDown={(e) => e.key === 'Enter' && !isListening && handleSend()}
            />
          </div>

          {voiceSupported && (
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isLoading}
              title={isListening ? 'Detener grabación' : 'Dictar mensaje'}
              className={cn(
                'w-12 h-12 rounded-2xl shadow-xl flex items-center justify-center active:scale-90 transition-all shrink-0',
                isListening
                  ? 'bg-red-500 text-white'
                  : isDarkMode
                    ? 'bg-white/10 text-[#FFD700] hover:bg-white/15'
                    : 'bg-black/5 text-[#B8860B] hover:bg-black/10'
              )}
            >
              {isListening
                ? <Square className="w-4 h-4 fill-current" />
                : <Mic className="w-5 h-5" />}
            </button>
          )}

          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim() || isListening}
            className={cn(
              'w-12 h-12 rounded-2xl shadow-xl flex items-center justify-center active:scale-90 transition-all shrink-0',
              input.trim() && !isListening
                ? 'bg-gradient-to-br from-[#B8860B] to-[#FFD700] text-black'
                : 'bg-gray-500/20 text-gray-500 opacity-50'
            )}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
