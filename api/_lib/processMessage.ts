import { FieldValue, type DocumentReference, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { parseMovement, type HistoryEntry } from './gemini.js';
import { conArticulo, pronombre } from './utils.js';

export type { HistoryEntry };
export type MessageSource = 'telegram' | 'whatsapp';
export type SendFn = (text: string) => Promise<void>;

export interface PendingState {
  type: 'compra-nueva' | 'compra-existente' | 'venta-nueva' | 'deuda-ya-pagada' | 'pago-excede-deuda';
  step: 'asking-precio-compra' | 'asking-si-vende' | 'asking-precio-venta' | 'asking-nueva-deuda' | 'asking-confirmar-pago';
  source: MessageSource;
  // compra/venta fields:
  concept?: string;
  quantity?: number;
  precioCompra?: number;
  // debt fields:
  debtorName?: string;
  amount?: number;
  amountOwed?: number;
  debtType?: 'pago-deuda-debo' | 'cobro-deuda-me-deben';
}

export function parseUserPrice(text: string): number | null {
  const s = text.toLowerCase().replace(/\./g, '').replace(',', '.');
  const milMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:mil\b|k\b)/);
  if (milMatch) return Math.round(parseFloat(milMatch[1]) * 1000);
  const numMatch = s.match(/(\d+(?:\.\d+)?)/);
  if (numMatch) return Math.round(parseFloat(numMatch[1]));
  return null;
}

export function looksLikeNewCommand(text: string): boolean {
  return /\b(vend[íi]|gast[eé]|compr[eé]|me debe|le debo|pagu[eé]|cobr[eé]|sagu[eé]|saq[uú][eé]|traje|repuse|recib[íi]|prest[eé]|abono|saldo|debo|deben)\b/i.test(text);
}

export function isAfirmativo(text: string): boolean {
  return /^(si\b|sí\b|yes\b|claro|dale|obvio|afirmativo|simon\b|simón\b|aja\b|ajá\b|ok\b|okey|sip\b|seguro|por supuesto)/i.test(text.trim());
}

export function isNegativo(text: string): boolean {
  return /^(no\b|nel\b|nope|negativo|pa mi\b|para mi\b|uso personal|consumo|no lo vendo|no vendo|mi familia)/i.test(text.trim().toLowerCase());
}

function capitalizeFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface ProcessResult {
  updatedHistory: HistoryEntry[];
  pendingState?: PendingState;
}

interface SaveMovementResult {
  newStock?: number;
  isPrecioEspecial?: boolean;
  price?: number;
  storedPrice?: number;
  needsVentaPrice?: boolean;
  isNewCompra?: boolean;
  isExistingCompra?: boolean;
  needsCompraPrice?: boolean;
  concept?: string;
  quantity?: number;
  precioCompra?: number;
}

const MSG_HELP_FALLBACK = 'No pude entender el mensaje. Ejemplo: "vendí 3 jugos a 3000".';

function normalizeStr(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
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
  // Levenshtein (space-optimised)
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

async function findInventoryProduct(userRef: DocumentReference, name: string) {
  const n = normalizeStr(name);
  if (!n) return null;
  const snap = await userRef.collection('inventario').get();
  const products = snap.docs.map(d => ({ id: d.id, ref: d.ref, ...(d.data() as any) }));
  // 1. Exact
  const exact = products.find((p: any) => normalizeStr(p.nombre) === n);
  if (exact) return exact;
  // 2. Contains (handles simple singular/plural since one is a substring of the other)
  const contains = products.find((p: any) => {
    const pn = normalizeStr(p.nombre);
    return pn.includes(n) || n.includes(pn);
  });
  if (contains) return contains;
  // 3. Word-level inclusion
  const nWords = n.split(/\s+/).filter((w: string) => w.length > 2);
  const wordMatch = products.find((p: any) => {
    const pWords = normalizeStr(p.nombre).split(/\s+/);
    return nWords.some((nw: string) => pWords.some((pw: string) => pw.includes(nw) || nw.includes(pw)));
  });
  if (wordMatch) return wordMatch;
  // 4. Stem + fuzzy similarity (singular/plural, small typos)
  const nStem = stemEs(n);
  return products.find((p: any) => {
    const pn = normalizeStr(p.nombre);
    const pStem = stemEs(pn);
    if (nStem === pStem) return true;
    if (strSimilarity(n, pn) > 0.8) return true;
    if (strSimilarity(nStem, pStem) > 0.8) return true;
    // Word-level stem match
    const nStems = nWords.map(stemEs);
    const pStems = pn.split(/\s+/).filter((w: string) => w.length > 2).map(stemEs);
    return nStems.some((ns: string) => pStems.some((ps: string) => ns === ps || strSimilarity(ns, ps) > 0.8));
  }) ?? null;
}

export async function processMessage(
  uid: string,
  text: string,
  source: MessageSource,
  send: SendFn,
  db: Firestore,
  history: HistoryEntry[] = [],
): Promise<ProcessResult> {
  const result = await parseMovement(text, history);

  const updatedHistory: HistoryEntry[] = [
    ...history,
    { role: 'user', parts: [{ text }] },
    { role: 'model', parts: [{ text: result.message || MSG_HELP_FALLBACK }] },
  ];

  if (!result.data) {
    await send(result.message || MSG_HELP_FALLBACK);
    return { updatedHistory };
  }

  const now = FieldValue.serverTimestamp();
  const userRef = db.collection('users').doc(uid);

  // Secondary movements (multi-action messages)
  if (result.movements && result.movements.length > 0) {
    for (const mov of result.movements) {
      await saveMovement(userRef, uid, mov, source, now);
    }
  }

  const { type, amount, concept, quantity, unitPrice, debtorName, isPartial, payments } = result.data;

  // ── Debt payments ──────────────────────────────────────────────────────────
  if (payments && payments.length > 0) {
    const lines: string[] = [];
    for (const p of payments) {
      if (p.amount < 0) {
        lines.push(`⚠️ Monto inválido para "${p.debtorName}" — debe ser mayor a cero.`);
        continue;
      }
      const r = await handleDebtPayment(userRef, uid, p.debtorName, p.amount, p.isPartial, type as 'pago-deuda-debo' | 'cobro-deuda-me-deben', source, now);
      if (r.invalidAmount) {
        lines.push(`⚠️ Monto inválido para "${p.debtorName}".`);
      } else if (r.alreadyPaid) {
        lines.push(`ℹ️ La deuda de "${p.debtorName}" ya estaba registrada como pagada.`);
      } else if (r.overpayment) {
        lines.push(`⚠️ "${p.debtorName}" solo debe $${r.remaining.toLocaleString('es-CO')} — registré ese monto (mencionaste $${p.amount.toLocaleString('es-CO')}).`);
        // For batch: clamp to owed amount and register it
        await handleDebtPayment(userRef, uid, p.debtorName, r.remaining, false, type as 'pago-deuda-debo' | 'cobro-deuda-me-deben', source, now);
      } else if (r.found) {
        lines.push(formatDebtLine(p.debtorName, r));
      } else {
        lines.push(`❌ No encontré deuda de "${p.debtorName}" — regístrala primero.`);
      }
    }
    await send(lines.join('\n'));
    return { updatedHistory };
  }

  if (type === 'pago-deuda-debo' || type === 'cobro-deuda-me-deben') {
    if (debtorName) {
      const r = await handleDebtPayment(userRef, uid, debtorName, amount, isPartial ?? false, type, source, now);

      if (r.invalidAmount) {
        await send('⚠️ El monto debe ser mayor a cero para registrar un pago.');
        return { updatedHistory };
      }

      if (r.alreadyPaid) {
        const amountForNew = amount > 0 ? amount : (r.originalAmount ?? 0);
        const amtStr = amountForNew > 0 ? ` de $${amountForNew.toLocaleString('es-CO')}` : '';
        await send(`ℹ️ La deuda de *${debtorName}* ya estaba registrada como pagada.\n\n¿Te prestó dinero nuevo${amtStr}? Lo puedo registrar como nueva deuda y pago.`);
        return {
          updatedHistory,
          pendingState: { type: 'deuda-ya-pagada', step: 'asking-nueva-deuda', source, debtorName, amount: amountForNew, debtType: type },
        };
      }

      if (r.overpayment) {
        await send(`⚠️ *${debtorName}* solo debe $${r.remaining.toLocaleString('es-CO')}, pero mencionaste $${amount.toLocaleString('es-CO')}.\n\n¿Registrar el pago de lo que debe ($${r.remaining.toLocaleString('es-CO')})?`);
        return {
          updatedHistory,
          pendingState: { type: 'pago-excede-deuda', step: 'asking-confirmar-pago', source, debtorName, amount: r.remaining, amountOwed: r.remaining, debtType: type },
        };
      }

      if (r.found) {
        await send(formatDebtMsg(debtorName, r, type));
      } else {
        const example = type === 'pago-deuda-debo'
          ? `"le debo [monto] a ${debtorName}"`
          : `"${debtorName} me debe [monto]"`;
        await send(`❌ No encontré una deuda de "${debtorName}".\nPrimero regístrala con: ${example}`);
      }
    } else {
      await send('⚠️ Para pagos de deudas menciona el nombre. Ej: "ya le pagué a Pedro".');
    }
    return { updatedHistory };
  }

  // ── Regular movements ──────────────────────────────────────────────────────
  const sr = await saveMovement(userRef, uid, result.data, source, now);

  // Venta: producto nuevo sin precio — pedir precio
  if (sr.needsVentaPrice && sr.concept) {
    await send(`No tengo "${sr.concept}" en el inventario. ¿A qué precio vendiste ${conArticulo(sr.concept)}?`);
    return {
      updatedHistory,
      pendingState: { type: 'venta-nueva', concept: sr.concept, quantity: sr.quantity ?? 1, step: 'asking-precio-venta', source },
    };
  }

  // Venta: precio especial
  if (sr.isPrecioEspecial) {
    const stockMsg = sr.newStock !== undefined ? `\n📦 Stock: ${sr.newStock} uds.` : '';
    await send(`${result.message}\n⚠️ *Precio especial:* $${sr.price!.toLocaleString('es-CO')} (precio habitual: $${sr.storedPrice!.toLocaleString('es-CO')}).${stockMsg}`);
    return { updatedHistory };
  }

  // Compra: producto nuevo sin precio — pedir precio antes de todo
  if (sr.isNewCompra && sr.needsCompraPrice && sr.concept) {
    await send(`¿A cuánto compraste ${conArticulo(sr.concept)}?`);
    return {
      updatedHistory,
      pendingState: { type: 'compra-nueva', concept: sr.concept, quantity: sr.quantity ?? 1, step: 'asking-precio-compra', source },
    };
  }

  // Compra: producto nuevo con precio — preguntar si va a vender
  if (sr.isNewCompra && sr.concept) {
    const qty = sr.quantity ?? 1;
    const pc = sr.precioCompra ?? 0;
    const totalStr = pc > 0 ? `$${(qty * pc).toLocaleString('es-CO')}` : `$${amount.toLocaleString('es-CO')}`;
    await send(`Listo, anoté el gasto de ${totalStr} por ${qty} ${conArticulo(sr.concept)}. ¿${pronombre(sr.concept).charAt(0).toUpperCase() + pronombre(sr.concept).slice(1)} vas a vender?`);
    return {
      updatedHistory,
      pendingState: { type: 'compra-nueva', concept: sr.concept, quantity: qty, precioCompra: pc, step: 'asking-si-vende', source },
    };
  }

  // Compra: producto existente sin precio — pedir precio primero
  if (sr.needsCompraPrice && sr.concept) {
    await send(`¿A cuánto compraste ${conArticulo(sr.concept)}?`);
    return {
      updatedHistory,
      pendingState: { type: 'compra-existente', concept: sr.concept, quantity: sr.quantity ?? 1, step: 'asking-precio-compra', source },
    };
  }

  // Compra: producto existente con precio — preguntar si va a vender (FIX 1)
  if (sr.isExistingCompra && sr.concept) {
    const qty = sr.quantity ?? 1;
    const pc = sr.precioCompra ?? 0;
    const totalStr = pc > 0 ? `$${(qty * pc).toLocaleString('es-CO')}` : `$${amount.toLocaleString('es-CO')}`;
    await send(`Listo, anoté el gasto de ${totalStr} por ${qty} ${conArticulo(sr.concept)}. ¿${pronombre(sr.concept).charAt(0).toUpperCase() + pronombre(sr.concept).slice(1)} vas a vender?`);
    return {
      updatedHistory,
      pendingState: { type: 'compra-existente', concept: sr.concept, quantity: qty, precioCompra: pc, step: 'asking-si-vende', source },
    };
  }

  // Normal response — añadir info de stock si aplica
  const stockMsg = sr.newStock !== undefined ? `\n📦 Stock: ${sr.newStock} uds.` : '';
  await send(result.message + stockMsg);
  return { updatedHistory };
}

// ─── saveMovement ─────────────────────────────────────────────────────────────

async function saveMovement(
  userRef: DocumentReference,
  uid: string,
  data: NonNullable<import('./gemini.js').GeminiResponse['data']>,
  source: MessageSource,
  now: FieldValue,
): Promise<SaveMovementResult> {
  const { type, amount, concept, quantity, unitPrice, debtorName } = data;

  switch (type) {
    case 'venta': {
      const qty = quantity ?? 1;
      const foundProduct = await findInventoryProduct(userRef, concept);

      if (foundProduct) {
        const storedPrice: number = foundProduct.precioVenta ?? foundProduct.precioCompra ?? 0;
        const price = (unitPrice && unitPrice > 0) ? unitPrice : storedPrice;
        const total = price > 0 ? qty * price : amount;
        const newStock = Math.max(0, (foundProduct.cantidad ?? 0) - qty);
        const isPrecioEspecial = !!(unitPrice && unitPrice > 0 && storedPrice > 0 && unitPrice !== storedPrice);

        await userRef.collection('sales').add({
          items: [{
            product: foundProduct.nombre,
            quantity: qty,
            unitPrice: price,
            subtotal: total,
            ...(isPrecioEspecial ? { regularUnitPrice: storedPrice } : {}),
          }],
          total,
          createdAt: now,
          source,
        });
        await foundProduct.ref.update({ cantidad: newStock, updatedAt: now });
        return { isPrecioEspecial, price, storedPrice, newStock };
      }

      if (!amount || amount === 0) {
        return { needsVentaPrice: true, concept: capitalizeFirst(concept), quantity: qty };
      }

      const price = unitPrice ?? (qty > 1 ? Math.round(amount / qty) : amount);
      const capConceptVenta = capitalizeFirst(concept);
      await userRef.collection('sales').add({
        items: [{ product: capConceptVenta, quantity: qty, unitPrice: price, subtotal: amount }],
        total: amount,
        createdAt: now,
        source,
      });
      return {};
    }

    case 'compra': {
      const qty = quantity ?? 1;
      const precioCompra = unitPrice && unitPrice > 0
        ? unitPrice
        : (amount > 0 ? (qty > 1 ? Math.round(amount / qty) : amount) : 0);
      const total = precioCompra > 0 ? qty * precioCompra : amount;
      const foundProduct = await findInventoryProduct(userRef, concept);
      const capConcept = capitalizeFirst(concept);

      if (foundProduct) {
        if (precioCompra > 0) {
          // FIX 1: guardar gasto sin tocar inventario — preguntar si vende primero
          await userRef.collection('expenses').add({
            concept: `Compra: ${foundProduct.nombre}`,
            amount: total,
            items: [{ product: foundProduct.nombre, quantity: qty, unitPrice: precioCompra, subtotal: total }],
            createdAt: now,
            source,
          });
          return { isExistingCompra: true, concept: foundProduct.nombre, quantity: qty, precioCompra };
        } else {
          // Sin precio — preguntar precio antes de tocar nada
          return { needsCompraPrice: true, concept: foundProduct.nombre, quantity: qty };
        }
      }

      // New product — capitalize name
      if (precioCompra > 0) {
        await userRef.collection('expenses').add({
          concept: `Compra: ${capConcept}`,
          amount: total,
          items: [{ product: capConcept, quantity: qty, unitPrice: precioCompra, subtotal: total }],
          createdAt: now,
          source,
        });
        return { isNewCompra: true, concept: capConcept, quantity: qty, precioCompra };
      } else {
        return { isNewCompra: true, needsCompraPrice: true, concept: capConcept, quantity: qty };
      }
    }

    case 'gasto': {
      const qty = quantity ?? 1;
      const price = unitPrice && unitPrice > 0 ? unitPrice : (qty > 1 ? Math.round(amount / qty) : amount);
      await userRef.collection('expenses').add({
        concept,
        amount,
        items: [{ product: concept, quantity: qty, unitPrice: price, subtotal: amount }],
        createdAt: now,
        source,
      });
      return {};
    }

    case 'deuda-me-deben': {
      const name = capitalizeFirst(debtorName ?? concept);
      await userRef.collection('debts').add({
        name,
        concept: capitalizeFirst(concept),
        amount,
        type: 'me-deben',
        status: 'pendiente',
        createdAt: now,
        source,
      });
      await userRef.collection('expenses').add({
        concept: `Préstamo a ${name}`,
        amount,
        items: [{ product: `Préstamo a ${name}`, quantity: 1, unitPrice: amount, subtotal: amount }],
        createdAt: now,
        source,
      });
      return {};
    }

    case 'deuda-debo': {
      const name = capitalizeFirst(debtorName ?? concept);
      await userRef.collection('debts').add({
        name,
        concept: capitalizeFirst(concept),
        amount,
        type: 'debo',
        status: 'pendiente',
        createdAt: now,
        source,
      });
      await userRef.collection('sales').add({
        concept: `Préstamo de ${name}`,
        total: amount,
        createdAt: now,
        source,
      });
      return {};
    }

    default:
      console.warn(`[processMessage] Unhandled type: ${type} (uid: ${uid})`);
      return {};
  }
}

// ─── handleDebtPayment ────────────────────────────────────────────────────────

interface DebtPaymentResult {
  found: boolean;
  effectivePay: number;
  remaining: number;
  status: 'pagada' | 'parcial';
  alreadyPaid?: boolean;
  overpayment?: boolean;
  invalidAmount?: boolean;
  originalAmount?: number;
}

export async function handleDebtPayment(
  userRef: DocumentReference,
  uid: string,
  debtorName: string,
  amount: number,
  isPartial: boolean,
  type: 'pago-deuda-debo' | 'cobro-deuda-me-deben',
  source: MessageSource,
  now: FieldValue,
): Promise<DebtPaymentResult> {
  if (amount < 0) {
    return { found: false, effectivePay: 0, remaining: 0, status: 'parcial', invalidAmount: true };
  }

  const debtType = type === 'pago-deuda-debo' ? 'debo' : 'me-deben';
  const nameNorm = normalizeStr(debtorName);

  const findByName = (docs: QueryDocumentSnapshot[]) => {
    // 1. Exact normalized match
    const exact = docs.find(d => normalizeStr((d.data().name as string) ?? '') === nameNorm);
    if (exact) return exact;
    // 2. Substring inclusion (handles partial names / compound names)
    const sub = docs.find(d => {
      const n = normalizeStr((d.data().name as string) ?? '');
      return n.includes(nameNorm) || nameNorm.includes(n);
    });
    if (sub) return sub;
    // 3. Any word in the query matches any word in the stored name
    const queryWords = nameNorm.split(/\s+/).filter(w => w.length > 1);
    const wordMatch = docs.find(d => {
      const storedWords = normalizeStr((d.data().name as string) ?? '').split(/\s+/);
      return queryWords.some(qw => storedWords.some(sw => sw.includes(qw) || qw.includes(sw)));
    });
    if (wordMatch) return wordMatch;
    // 4. Fuzzy similarity (typos, diminutives)
    return docs.find(d => {
      const n = normalizeStr((d.data().name as string) ?? '');
      return strSimilarity(nameNorm, n) > 0.75;
    }) ?? null;
  };

  const activeSnap = await userRef.collection('debts')
    .where('type', '==', debtType)
    .where('status', 'in', ['pendiente', 'parcial'])
    .get();

  const matchDoc = findByName(activeSnap.docs);

  if (!matchDoc) {
    const paidSnap = await userRef.collection('debts')
      .where('type', '==', debtType)
      .where('status', '==', 'pagada')
      .get();
    const paidDoc = findByName(paidSnap.docs);
    if (paidDoc) {
      return { found: true, effectivePay: 0, remaining: 0, status: 'pagada', alreadyPaid: true, originalAmount: paidDoc.data().amount as number };
    }
    console.warn(`[handleDebtPayment] No debt found for "${debtorName}" (uid: ${uid})`);
    return { found: false, effectivePay: 0, remaining: 0, status: 'parcial' };
  }

  const debtData = matchDoc.data();
  const prevPaid = (debtData.amountPaid as number | undefined) ?? 0;
  const totalDebt = debtData.amount as number;
  const remaining = Math.max(0, totalDebt - prevPaid);

  if (amount > 0 && amount > remaining) {
    return { found: true, effectivePay: amount, remaining, status: 'parcial', overpayment: true };
  }

  const effectivePay = amount > 0 ? amount : remaining;
  const totalPaid = prevPaid + effectivePay;
  const newRemaining = Math.max(0, totalDebt - totalPaid);
  const isPaidOff = !isPartial && newRemaining <= 0;
  const status: 'pagada' | 'parcial' = isPaidOff ? 'pagada' : 'parcial';

  await matchDoc.ref.update({
    amountPaid: totalPaid,
    status,
    ...(isPaidOff ? { paidAt: now } : {}),
  });

  if (type === 'pago-deuda-debo') {
    await userRef.collection('expenses').add({
      concept: `Pago deuda: ${debtorName}`,
      amount: effectivePay,
      items: [{ product: `Pago deuda: ${debtorName}`, quantity: 1, unitPrice: effectivePay, subtotal: effectivePay }],
      createdAt: now,
      source,
    });
  } else {
    await userRef.collection('sales').add({
      items: [{ product: `Cobro deuda: ${debtorName}`, quantity: 1, unitPrice: effectivePay, subtotal: effectivePay }],
      total: effectivePay,
      createdAt: now,
      source,
    });
  }

  return { found: true, effectivePay, remaining: newRemaining, status };
}

// ─── Message formatters ───────────────────────────────────────────────────────

function formatDebtMsg(name: string, r: DebtPaymentResult, type: string): string {
  if (r.status === 'pagada') {
    const verb = type === 'pago-deuda-debo' ? 'Pagaste' : 'Cobraste';
    return `✅ ¡Deuda con ${name} saldada! ${verb} $${r.effectivePay.toLocaleString('es-CO')}.`;
  }
  const verb = type === 'pago-deuda-debo' ? 'a' : 'de';
  return `✅ Abono de $${r.effectivePay.toLocaleString('es-CO')} ${verb} ${name} registrado.\n💰 Pendiente: $${r.remaining.toLocaleString('es-CO')}`;
}

function formatDebtLine(name: string, r: DebtPaymentResult): string {
  if (r.status === 'pagada') return `✅ ${name}: saldada ($${r.effectivePay.toLocaleString('es-CO')})`;
  return `✅ ${name}: abono $${r.effectivePay.toLocaleString('es-CO')} — pendiente $${r.remaining.toLocaleString('es-CO')}`;
}

// ─── Shared multi-turn pending state handler ──────────────────────────────────

export async function handlePendingState(
  db: Firestore,
  userId: string,
  pendingState: PendingState,
  send: SendFn,
  text: string,
): Promise<PendingState | null> {
  const userRef = db.collection('users').doc(userId);
  const lower = text.trim().toLowerCase();

  if (/^(cancelar|cancel|salir|olvida|no importa)$/i.test(lower)) {
    await send('Ok, cancelado.');
    return null;
  }

  // ── Compra nueva — asking-precio-compra ────────────────────────────────────
  if (pendingState.type === 'compra-nueva' && pendingState.step === 'asking-precio-compra') {
    const price = parseUserPrice(text);
    if (!price || price <= 0) {
      await send('No entendí el precio. Dímelo en pesos, ej: *45000* o *45 mil*.');
      return pendingState;
    }
    const { concept = '', quantity = 1 } = pendingState;
    const total = quantity * price;
    await userRef.collection('expenses').add({
      concept: `Compra: ${concept}`,
      amount: total,
      items: [{ product: concept, quantity, unitPrice: price, subtotal: total }],
      createdAt: FieldValue.serverTimestamp(),
      source: pendingState.source,
    });
    await send(`$${price.toLocaleString('es-CO')} anotado — gasto de $${total.toLocaleString('es-CO')} registrado.\n¿Los vas a vender?`);
    return { ...pendingState, precioCompra: price, step: 'asking-si-vende' };
  }

  // ── Compra nueva — asking-si-vende ─────────────────────────────────────────
  if (pendingState.type === 'compra-nueva' && pendingState.step === 'asking-si-vende') {
    if (isAfirmativo(lower)) {
      await send(`¿A qué precio vendes ${conArticulo(pendingState.concept ?? '')}?`);
      return { ...pendingState, step: 'asking-precio-venta' };
    }
    if (isNegativo(lower)) {
      await send('Entendido. Quedó registrado solo como gasto. 👍');
      return null;
    }
    await send(`No entendí. ¿Vas a vender *${conArticulo(pendingState.concept ?? '')}*? Responde *sí* o *no*.`);
    return pendingState;
  }

  // ── Compra nueva — asking-precio-venta ─────────────────────────────────────
  if (pendingState.type === 'compra-nueva' && pendingState.step === 'asking-precio-venta') {
    const price = parseUserPrice(text);
    if (!price || price <= 0) {
      await send('No entendí el precio de venta. Ej: *80000* o *80 mil*.');
      return pendingState;
    }
    const { concept = '', quantity = 1, precioCompra = 0 } = pendingState;
    const capConcept = capitalizeFirst(concept);

    // Re-check in case product was added between conversation steps
    const existingProduct = await findInventoryProduct(userRef, capConcept);
    if (existingProduct) {
      const newStock = (existingProduct.cantidad ?? 0) + quantity;
      await existingProduct.ref.update({
        cantidad: newStock,
        ...(precioCompra > 0 ? { precioCompra } : {}),
        precioVenta: price,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await send(
        `✅ *${existingProduct.nombre}* actualizado en inventario.\n` +
        `• Stock: ${newStock} uds.\n` +
        `• Precio venta: $${price.toLocaleString('es-CO')}`
      );
    } else {
      await userRef.collection('inventario').add({
        nombre: capConcept,
        cantidad: quantity,
        precioCompra,
        precioVenta: price,
        createdAt: FieldValue.serverTimestamp(),
      });
      await send(
        `✅ *${capConcept}* guardado en inventario.\n` +
        `• Stock: ${quantity} uds.\n` +
        `• Precio compra: $${precioCompra.toLocaleString('es-CO')}\n` +
        `• Precio venta: $${price.toLocaleString('es-CO')}`
      );
    }
    return null;
  }

  // ── Compra existente — asking-precio-compra ────────────────────────────────
  if (pendingState.type === 'compra-existente' && pendingState.step === 'asking-precio-compra') {
    const price = parseUserPrice(text);
    if (!price || price <= 0) {
      await send('No entendí el precio. Ej: *45000* o *45 mil*.');
      return pendingState;
    }
    const { concept = '', quantity = 1 } = pendingState;
    const total = quantity * price;
    await userRef.collection('expenses').add({
      concept: `Compra: ${concept}`,
      amount: total,
      items: [{ product: concept, quantity, unitPrice: price, subtotal: total }],
      createdAt: FieldValue.serverTimestamp(),
      source: pendingState.source,
    });
    await send(`Listo, gasto de $${total.toLocaleString('es-CO')} por ${quantity} ${conArticulo(concept)} anotado. ¿${pronombre(concept).charAt(0).toUpperCase() + pronombre(concept).slice(1)} vas a vender?`);
    return { ...pendingState, precioCompra: price, step: 'asking-si-vende' };
  }

  // ── Compra existente — asking-si-vende (FIX 1) ────────────────────────────
  if (pendingState.type === 'compra-existente' && pendingState.step === 'asking-si-vende') {
    if (isAfirmativo(lower)) {
      const { concept = '', quantity = 1, precioCompra } = pendingState;
      const existingProduct = await findInventoryProduct(userRef, concept);
      if (existingProduct) {
        const newStock = (existingProduct.cantidad ?? 0) + quantity;
        await existingProduct.ref.update({
          cantidad: newStock,
          ...(precioCompra ? { precioCompra } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        await send(`✅ Stock de *${existingProduct.nombre}* actualizado: ${newStock} uds.`);
      } else {
        await send(`✅ Gasto registrado. No encontré "${concept}" en inventario para actualizar el stock.`);
      }
      return null;
    }
    if (isNegativo(lower)) {
      await send('Entendido. Quedó registrado solo como gasto. 👍');
      return null;
    }
    await send(`No entendí. ¿Vas a vender *${conArticulo(pendingState.concept ?? '')}*? Responde *sí* o *no*.`);
    return pendingState;
  }

  // ── Venta nueva — asking-precio-venta ─────────────────────────────────────
  if (pendingState.type === 'venta-nueva' && pendingState.step === 'asking-precio-venta') {
    const price = parseUserPrice(text);
    if (!price || price <= 0) {
      await send('No entendí el precio. Ej: *10000* o *10 mil*.');
      return pendingState;
    }
    const { concept = '', quantity = 1 } = pendingState;
    const capConcept = capitalizeFirst(concept);
    const total = quantity * price;
    await userRef.collection('sales').add({
      items: [{ product: capConcept, quantity, unitPrice: price, subtotal: total }],
      total,
      createdAt: FieldValue.serverTimestamp(),
      source: pendingState.source,
    });
    await send(`✅ ${quantity} *${capConcept}* a $${price.toLocaleString('es-CO')} c/u — Total: $${total.toLocaleString('es-CO')} registrado.`);
    return null;
  }

  // ── Deuda ya pagada — asking-nueva-deuda ──────────────────────────────────
  if (pendingState.type === 'deuda-ya-pagada' && pendingState.step === 'asking-nueva-deuda') {
    const { debtorName = '', amount = 0, debtType = 'cobro-deuda-me-deben' } = pendingState;
    const now = FieldValue.serverTimestamp();

    if (isAfirmativo(lower)) {
      if (amount <= 0) {
        await send(`¿De cuánto es la nueva deuda de *${debtorName}*? Dímelo en pesos.`);
        return pendingState;
      }
      if (debtType === 'cobro-deuda-me-deben') {
        await userRef.collection('debts').add({
          name: debtorName,
          concept: `Nueva deuda de ${debtorName}`,
          amount,
          type: 'me-deben',
          status: 'pagada',
          amountPaid: amount,
          paidAt: now,
          createdAt: now,
          source: pendingState.source,
        });
        await userRef.collection('sales').add({
          items: [{ product: `Cobro deuda: ${debtorName}`, quantity: 1, unitPrice: amount, subtotal: amount }],
          total: amount,
          createdAt: now,
          source: pendingState.source,
        });
        await send(`✅ Registré nueva deuda de *${debtorName}* por $${amount.toLocaleString('es-CO')} y su cobro. ¡Todo cuadrado!`);
      } else {
        await userRef.collection('debts').add({
          name: debtorName,
          concept: `Nueva deuda a ${debtorName}`,
          amount,
          type: 'debo',
          status: 'pagada',
          amountPaid: amount,
          paidAt: now,
          createdAt: now,
          source: pendingState.source,
        });
        await userRef.collection('expenses').add({
          concept: `Pago deuda: ${debtorName}`,
          amount,
          items: [{ product: `Pago deuda: ${debtorName}`, quantity: 1, unitPrice: amount, subtotal: amount }],
          createdAt: now,
          source: pendingState.source,
        });
        await send(`✅ Registré nueva deuda con *${debtorName}* por $${amount.toLocaleString('es-CO')} y su pago.`);
      }
      return null;
    }

    if (isNegativo(lower)) {
      await send(`No te preocupes, eso ya estaba registrado. ✅`);
      return null;
    }

    await send(`No entendí. ¿Registrar como nueva deuda de *${debtorName}*? Responde *sí* o *no*.`);
    return pendingState;
  }

  // ── Pago excede deuda — asking-confirmar-pago ─────────────────────────────
  if (pendingState.type === 'pago-excede-deuda' && pendingState.step === 'asking-confirmar-pago') {
    const { debtorName = '', amountOwed = 0, debtType = 'cobro-deuda-me-deben' } = pendingState;
    const now = FieldValue.serverTimestamp();

    if (isAfirmativo(lower)) {
      const debtTypeInternal = debtType === 'pago-deuda-debo' ? 'debo' : 'me-deben';
      const debtsSnap = await userRef.collection('debts')
        .where('type', '==', debtTypeInternal)
        .where('status', 'in', ['pendiente', 'parcial'])
        .get();

      const nameNorm2 = normalizeStr(debtorName);
      const matchDoc = debtsSnap.docs.find(d => {
        const n = normalizeStr((d.data().name as string) ?? '');
        return n === nameNorm2 || n.includes(nameNorm2) || nameNorm2.includes(n) || strSimilarity(n, nameNorm2) > 0.75;
      });

      if (!matchDoc) {
        await send(`❌ No encontré la deuda activa de "${debtorName}". Puede que ya haya sido registrada.`);
        return null;
      }

      const debtData = matchDoc.data();
      const prevPaid = (debtData.amountPaid as number | undefined) ?? 0;
      await matchDoc.ref.update({ amountPaid: prevPaid + amountOwed, status: 'pagada', paidAt: now });

      if (debtType === 'pago-deuda-debo') {
        await userRef.collection('expenses').add({ concept: `Pago deuda: ${debtorName}`, amount: amountOwed, items: [{ product: `Pago deuda: ${debtorName}`, quantity: 1, unitPrice: amountOwed, subtotal: amountOwed }], createdAt: now, source: pendingState.source });
        await send(`✅ Pagaste $${amountOwed.toLocaleString('es-CO')} a *${debtorName}*. ¡Deuda saldada!`);
      } else {
        await userRef.collection('sales').add({
          items: [{ product: `Cobro deuda: ${debtorName}`, quantity: 1, unitPrice: amountOwed, subtotal: amountOwed }],
          total: amountOwed,
          createdAt: now,
          source: pendingState.source,
        });
        await send(`✅ *${debtorName}* te pagó $${amountOwed.toLocaleString('es-CO')}. ¡Deuda saldada!`);
      }
      return null;
    }

    if (isNegativo(lower)) {
      await send('Ok, cancelado. Dime el monto correcto cuando quieras.');
      return null;
    }

    await send(`¿Registrar el pago de $${amountOwed.toLocaleString('es-CO')} de *${debtorName}*? Responde *sí* o *no*.`);
    return pendingState;
  }

  await send('Algo salió mal. Por favor repite tu mensaje desde el principio.');
  return null;
}
