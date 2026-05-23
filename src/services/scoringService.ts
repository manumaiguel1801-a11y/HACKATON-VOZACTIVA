import { Sale, Expense, Debt } from '../types';

export interface ScoreBreakdown {
  consistenciaIngresos: number;  // 0–30
  capacidadPago: number;         // 0–25
  gestionFiados: number;         // 0–20
  saludInventario: number;       // 0–15
  calidadDatos: number;          // 0–10
  scoreBase: number;             // 0–100
  scoreFinal: number;            // 300–850
  hasEnoughData: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toDate(ts: any): Date | null {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return null;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// ─── Factor 1: Consistencia de ingresos (0–30) ────────────────────────────────
function calcConsistencia(sales: Sale[]): number {
  if (sales.length < 3) return sales.length > 0 ? 5 : 0;

  const dates = sales
    .map((s) => toDate(s.createdAt))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) return 0;

  const uniqueDays = new Set(dates.map(dayKey)).size;
  const spanMs = Math.max(Date.now() - dates[0].getTime(), 30 * 86400000);
  const spanDays = spanMs / 86400000;
  let ratio = uniqueDays / spanDays;

  // Penalizar gaps > 7 días consecutivos (cada gap resta 10% del ratio)
  let gapPenalties = 0;
  for (let i = 1; i < dates.length; i++) {
    const gapDays = (dates[i].getTime() - dates[i - 1].getTime()) / 86400000;
    if (gapDays > 7) gapPenalties++;
  }
  ratio *= Math.pow(0.9, gapPenalties);

  return clamp(ratio * 30, 0, 30);
}

// ─── Factor 2: Capacidad de pago (0–25) ──────────────────────────────────────
function calcCapacidadPago(sales: Sale[], expenses: Expense[]): number {
  const totalIngresos = sales.reduce((s, v) => s + v.total, 0);
  if (totalIngresos === 0) return 0;

  const totalGastos = expenses.reduce((s, e) => s + e.amount, 0);
  const ratio = (totalIngresos - totalGastos) / totalIngresos;

  if (ratio >= 0.4) return 25;
  if (ratio >= 0.2) return 12 + ((ratio - 0.2) / 0.2) * 13;
  if (ratio >= 0) return (ratio / 0.2) * 12;
  return 0;
}

// ─── Factor 3: Gestión de fiados (0–20) ──────────────────────────────────────
function calcGestionFiados(debts: Debt[], totalIngresos: number): number {
  // Lado me-deben (0–10)
  const meDeben = debts.filter((d) => d.type === 'me-deben');
  let scoreMeDeben: number;
  if (meDeben.length === 0) {
    scoreMeDeben = 7; // neutral: no usa fiados
  } else {
    const dado = meDeben.reduce((s, d) => s + d.amount, 0);
    const recuperado = meDeben.reduce((s, d) => s + (d.amountPaid ?? 0), 0);
    const recuperacion = dado > 0 ? recuperado / dado : 1;
    const dependencia = totalIngresos > 0 ? dado / totalIngresos : 0;
    scoreMeDeben = clamp(recuperacion * 6 + (1 - clamp(dependencia, 0, 1)) * 4, 0, 10);
  }

  // Lado debo (0–10)
  const debo = debts.filter((d) => d.type === 'debo');
  let scoreDebo: number;
  if (debo.length === 0) {
    scoreDebo = 7; // neutral: no registra deudas propias
  } else {
    const totalDebo = debo.reduce((s, d) => s + d.amount, 0);
    const pagadoDebo = debo.reduce((s, d) => s + (d.amountPaid ?? 0), 0);
    const pendienteDebo = Math.max(0, totalDebo - pagadoDebo);

    // Tasa de cumplimiento (50%)
    const tasa = totalDebo > 0 ? pagadoDebo / totalDebo : 1;

    // Velocidad de pago (30%) — solo para completamente pagadas con paidAt
    const pagadasConFecha = debo.filter(
      (d) => d.status === 'pagada' && d.paidAt && d.createdAt,
    );
    let velocidadNorm = 0.5; // neutral si no hay datos
    if (pagadasConFecha.length > 0) {
      const avgDias =
        pagadasConFecha.reduce((sum, d) => {
          const created = toDate(d.createdAt);
          const paid = toDate(d.paidAt);
          if (!created || !paid) return sum;
          return sum + (paid.getTime() - created.getTime()) / 86400000;
        }, 0) / pagadasConFecha.length;

      if (avgDias < 15) velocidadNorm = 1.0;
      else if (avgDias < 45) velocidadNorm = 0.7;
      else if (avgDias < 90) velocidadNorm = 0.4;
      else velocidadNorm = 0.2;
    }

    // Carga actual (20%)
    const carga = totalIngresos > 0 ? pendienteDebo / totalIngresos : pendienteDebo > 0 ? 1 : 0;
    const cargaScore = 1 - clamp(carga, 0, 1);

    scoreDebo = clamp((tasa * 0.5 + velocidadNorm * 0.3 + cargaScore * 0.2) * 10, 0, 10);
  }

  return clamp(scoreMeDeben + scoreDebo, 0, 20);
}

// ─── Factor 4: Salud de inventario (0–15) ────────────────────────────────────
function calcSaludInventario(sales: Sale[], expenses: Expense[]): number {
  if (sales.length === 0) return 0;
  if (expenses.length === 0) return 4; // vende pero no registra compras/gastos

  const totalIngresos = sales.reduce((s, v) => s + v.total, 0);
  const totalGastos = expenses.reduce((s, e) => s + e.amount, 0);
  const ratio = totalGastos / Math.max(totalIngresos, 1);

  let base: number;
  if (ratio >= 0.2 && ratio <= 0.8) {
    base = 15; // rango saludable
  } else if (ratio < 0.2) {
    base = clamp((ratio / 0.2) * 10, 0, 10);
  } else {
    // ratio > 0.8
    const excess = ratio - 0.8;
    base = clamp(15 - excess * 30, 2, 15);
  }

  // Bonus de regularidad: actividad en ≥ 3 de los últimos 4 meses
  const now = new Date();
  const activeMonths = new Set<string>();
  [...sales.map((s) => toDate(s.createdAt)), ...expenses.map((e) => toDate(e.createdAt))]
    .filter((d): d is Date => d !== null)
    .forEach((d) => {
      const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      if (monthsAgo < 4) activeMonths.add(`${d.getFullYear()}-${d.getMonth()}`);
    });

  return clamp(activeMonths.size >= 3 ? Math.min(base + 2, 15) : base, 0, 15);
}

// ─── Factor 5: Calidad de datos (0–10) ───────────────────────────────────────
function calcCalidadDatos(sales: Sale[], expenses: Expense[]): number {
  const totalRegistros = sales.length + expenses.length;
  if (totalRegistros === 0) return 0;

  // Frecuencia de registro
  const allDates = [
    ...sales.map((s) => toDate(s.createdAt)),
    ...expenses.map((e) => toDate(e.createdAt)),
  ].filter((d): d is Date => d !== null);

  const primerRegistro = allDates.length > 0
    ? new Date(Math.min(...allDates.map((d) => d.getTime())))
    : new Date();
  const spanDias = Math.max((Date.now() - primerRegistro.getTime()) / 86400000, 7);
  const diasConActividad = new Set(allDates.map(dayKey)).size;
  const ratioActividad = clamp(diasConActividad / spanDias, 0, 1);

  // Calidad de texto: largo promedio de conceptos/productos
  const texts: string[] = [
    ...expenses.map((e) => e.concept ?? ''),
    ...sales.flatMap((s) => s.items?.map((i) => i.product ?? '') ?? [s.product ?? '']),
  ].filter(Boolean);
  const avgLen = texts.length > 0
    ? texts.reduce((s, t) => s + t.length, 0) / texts.length
    : 0;
  const textQuality = clamp(avgLen / 15, 0, 1);

  return clamp((ratioActividad * 0.6 + textQuality * 0.4) * 10, 0, 10);
}

// ─── Función principal ────────────────────────────────────────────────────────
export function calculateScore(
  sales: Sale[],
  expenses: Expense[],
  debts: Debt[],
): ScoreBreakdown {
  const totalRegistros = sales.length + expenses.length + debts.length;
  const hasEnoughData = totalRegistros >= 5;

  const totalIngresos = sales.reduce((s, v) => s + v.total, 0);

  const consistenciaIngresos = Math.round(calcConsistencia(sales) * 10) / 10;
  const capacidadPago = Math.round(calcCapacidadPago(sales, expenses) * 10) / 10;
  const gestionFiados = Math.round(calcGestionFiados(debts, totalIngresos) * 10) / 10;
  const saludInventario = Math.round(calcSaludInventario(sales, expenses) * 10) / 10;
  const calidadDatos = Math.round(calcCalidadDatos(sales, expenses) * 10) / 10;

  const scoreBase = clamp(
    consistenciaIngresos + capacidadPago + gestionFiados + saludInventario + calidadDatos,
    0,
    100,
  );
  // Escala colombiana: 150–950 (DataCrédito / TransUnion)
  const scoreFinal = clamp(Math.round(150 + scoreBase * 8), 150, 950);

  return {
    consistenciaIngresos,
    capacidadPago,
    gestionFiados,
    saludInventario,
    calidadDatos,
    scoreBase: Math.round(scoreBase * 10) / 10,
    scoreFinal,
    hasEnoughData,
  };
}

// ─── Helpers de UI ────────────────────────────────────────────────────────────
// Escala colombiana 150–950
export function getScoreLabel(score: number): string {
  if (score < 500) return 'Riesgo alto';
  if (score < 650) return 'En construcción';
  if (score < 750) return 'Aceptable';
  if (score < 850) return 'Bueno';
  return 'Excelente';
}

export function getScoreColor(score: number): string {
  if (score < 500) return '#ef4444';
  if (score < 650) return '#f97316';
  if (score < 750) return '#DAA520';
  if (score < 850) return '#84cc16';
  return '#22c55e';
}

// ─── Antigüedad del negocio ───────────────────────────────────────────────────
export function getBusinessAgeDays(sales: Sale[], expenses: Expense[], debts: Debt[]): number {
  const allDates = [
    ...sales.map((s) => toDate(s.createdAt)),
    ...expenses.map((e) => toDate(e.createdAt)),
    ...debts.map((d) => toDate(d.createdAt)),
  ].filter((d): d is Date => d !== null);
  if (allDates.length === 0) return 0;
  const first = new Date(Math.min(...allDates.map((d) => d.getTime())));
  return Math.floor((Date.now() - first.getTime()) / 86400000);
}

export function formatBusinessAge(days: number): string {
  if (days === 0) return 'Nuevo';
  if (days < 30) return `${days} días`;
  if (days < 365) return `${Math.floor(days / 30)} ${Math.floor(days / 30) === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0 ? `${years} año${years > 1 ? 's' : ''} y ${months} mes${months > 1 ? 'es' : ''}` : `${years} año${years > 1 ? 's' : ''}`;
}

// ─── Top productos ────────────────────────────────────────────────────────────
export function getTopProducts(sales: Sale[]): { name: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  sales.forEach((s) => {
    const items = s.items?.length ? s.items : [{ product: s.product ?? 'Venta', subtotal: s.total, quantity: 1 }];
    items.forEach((item) => {
      const key = item.product ?? 'Venta';
      const prev = map.get(key) ?? { total: 0, count: 0 };
      map.set(key, { total: prev.total + (item.subtotal ?? 0), count: prev.count + (item.quantity ?? 1) });
    });
  });
  return Array.from(map.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
}

// ─── Proyección mensual ───────────────────────────────────────────────────────
export function getMonthlyProjection(sales: Sale[]): number {
  const ninetyDaysAgo = Date.now() - 90 * 86400000;
  const recent = sales.filter((s) => {
    const d = toDate(s.createdAt);
    return d && d.getTime() >= ninetyDaysAgo;
  });
  if (recent.length === 0) return 0;
  const total = recent.reduce((sum, s) => sum + s.total, 0);
  return Math.round(total / 3);
}

// ─── Tendencia del score (últimos 30 días vs antes) ──────────────────────────
export function calculateScoreTrend(
  sales: Sale[],
  expenses: Expense[],
  debts: Debt[],
): { delta: number; trend: 'up' | 'down' | 'stable' } {
  const thirtyDaysAgo = Date.now() - 30 * 86400000;

  const salesThen     = sales.filter(s => { const d = toDate(s.createdAt); return d && d.getTime() < thirtyDaysAgo; });
  const expensesThen  = expenses.filter(e => { const d = toDate(e.createdAt); return d && d.getTime() < thirtyDaysAgo; });
  const debtsThen     = debts.filter(d => { const dt = toDate(d.createdAt); return dt && dt.getTime() < thirtyDaysAgo; });

  const scoreThen = calculateScore(salesThen, expensesThen, debtsThen);
  const scoreNow  = calculateScore(sales, expenses, debts);

  if (!scoreThen.hasEnoughData) return { delta: 0, trend: 'stable' };

  const delta = scoreNow.scoreFinal - scoreThen.scoreFinal;
  return {
    delta,
    trend: Math.abs(delta) < 5 ? 'stable' : delta > 0 ? 'up' : 'down',
  };
}

// ─── Siguiente nivel ──────────────────────────────────────────────────────────
export function getNextLevel(score: number): { label: string; target: number; tips: string[] } | null {
  if (score < 500) return {
    label: 'En construcción',
    target: 500,
    tips: ['Registra ventas todos los días que vendas', 'Anota también tus gastos del negocio', 'Usa el asistente de voz para registrar más rápido'],
  };
  if (score < 650) return {
    label: 'Aceptable',
    target: 650,
    tips: ['Mantén tus gastos por debajo del 80% de tus ingresos', 'Cobra los fiados pendientes y regístralos', 'Registra actividad mínimo 15 días al mes'],
  };
  if (score < 750) return {
    label: 'Bueno',
    target: 750,
    tips: ['Vende con consistencia más de 20 días al mes', 'Registra compras e insumos del negocio', 'Evita semanas completas sin registrar actividad'],
  };
  if (score < 850) return {
    label: 'Excelente',
    target: 850,
    tips: ['Mantén un margen neto mayor al 40%', 'Paga tus deudas antes de 30 días', 'Registra descripciones claras en cada movimiento'],
  };
  return null; // ya está en Excelente
}
