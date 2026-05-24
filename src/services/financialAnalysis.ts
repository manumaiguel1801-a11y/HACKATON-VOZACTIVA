import { Sale, Expense, Debt, InventoryProduct } from '../types';

export interface FiadoPendiente {
  nombre: string;
  monto: number;
  diasPendiente: number;
}

export interface FinancialContext {
  promedioVentasDiario: number;
  promedioGastosDiario: number;
  gananciaNetaDiaria: number;
  ventasEstaSemana: number;
  ventasSemanaAnterior: number;
  tendenciaVentas: 'subiendo' | 'bajando' | 'estable';
  porcentajeCambioVentas: number;
  mejorDia: string;
  peorDia: string;
  productoMasRentable: string | null;
  margenProducto: number;
  fiadosPendientes: FiadoPendiente[];
  totalFiadosPendientes: number;
  capacidadAhorroDiaria: number;
  rachaDiasRegistrando: number;
  ventasBajaron30: boolean;
  fiadoMas30Dias: boolean;
  ratioGastosAlto: boolean;
  rachaPositiva7: boolean;
  diasConActividadSet: Set<string>;
}

function toDateStr(ts: any): string {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toISOString().split('T')[0];
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function computeFinancialContext(
  sales: Sale[],
  expenses: Expense[],
  debts: Debt[],
  inventory: InventoryProduct[]
): FinancialContext {
  const now = new Date();

  // --- Últimos 14 días ---
  const cutoff14 = new Date(now);
  cutoff14.setDate(cutoff14.getDate() - 14);

  const recentSales = sales.filter(s => {
    const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
    return d >= cutoff14;
  });
  const recentExpenses = expenses.filter(e => {
    const d = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.createdAt);
    return d >= cutoff14;
  });

  const salesByDay: Record<string, number> = {};
  recentSales.forEach(s => {
    const key = toDateStr(s.createdAt);
    if (key) salesByDay[key] = (salesByDay[key] || 0) + s.total;
  });

  const expensesByDay: Record<string, number> = {};
  recentExpenses.forEach(e => {
    const key = toDateStr(e.createdAt);
    if (key) expensesByDay[key] = (expensesByDay[key] || 0) + e.amount;
  });

  const salesDayValues = Object.values(salesByDay);
  const expenseDayValues = Object.values(expensesByDay);

  const promedioVentasDiario = salesDayValues.length
    ? Math.round(salesDayValues.reduce((a, b) => a + b, 0) / salesDayValues.length)
    : 0;
  const promedioGastosDiario = expenseDayValues.length
    ? Math.round(expenseDayValues.reduce((a, b) => a + b, 0) / expenseDayValues.length)
    : 0;
  const gananciaNetaDiaria = promedioVentasDiario - promedioGastosDiario;

  // --- Tendencia semanal ---
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - daysFromMonday);
  thisMonday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);

  const ventasEstaSemana = sales
    .filter(s => {
      const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
      return d >= thisMonday;
    })
    .reduce((sum, s) => sum + s.total, 0);

  const ventasSemanaAnterior = sales
    .filter(s => {
      const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
      return d >= lastMonday && d < thisMonday;
    })
    .reduce((sum, s) => sum + s.total, 0);

  let tendenciaVentas: 'subiendo' | 'bajando' | 'estable' = 'estable';
  let porcentajeCambioVentas = 0;
  if (ventasSemanaAnterior > 0) {
    porcentajeCambioVentas = Math.round(
      ((ventasEstaSemana - ventasSemanaAnterior) / ventasSemanaAnterior) * 100
    );
    if (porcentajeCambioVentas <= -15) tendenciaVentas = 'bajando';
    else if (porcentajeCambioVentas >= 15) tendenciaVentas = 'subiendo';
  }

  // --- Mejor / peor día ---
  const ventasPorDow: Record<number, number[]> = {};
  sales.forEach(s => {
    const d = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
    const dow = d.getDay();
    if (!ventasPorDow[dow]) ventasPorDow[dow] = [];
    ventasPorDow[dow].push(s.total);
  });

  let mejorDia = 'lunes';
  let peorDia = 'domingo';
  let maxAvg = -1;
  let minAvg = Infinity;
  Object.entries(ventasPorDow).forEach(([dow, totals]) => {
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    if (avg > maxAvg) { maxAvg = avg; mejorDia = DIAS[parseInt(dow)]; }
    if (avg < minAvg) { minAvg = avg; peorDia = DIAS[parseInt(dow)]; }
  });

  // --- Producto más rentable ---
  let productoMasRentable: string | null = null;
  let margenProducto = 0;
  inventory.forEach(p => {
    const compra = p.precioCompra || 0;
    const venta = p.precioVenta || p.valorUnitario || 0;
    if (compra > 0 && venta > 0) {
      const margen = ((venta - compra) / compra) * 100;
      if (margen > margenProducto) {
        margenProducto = Math.round(margen);
        productoMasRentable = p.nombre;
      }
    }
  });

  // --- Fiados pendientes ---
  const fiadosPendientes: FiadoPendiente[] = debts
    .filter(d => d.type === 'me-deben' && d.status !== 'pagada')
    .map(d => {
      const fecha = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
      return {
        nombre: d.name,
        monto: d.amount - (d.amountPaid || 0),
        diasPendiente: daysBetween(fecha, now),
      };
    })
    .sort((a, b) => b.diasPendiente - a.diasPendiente);

  const totalFiadosPendientes = fiadosPendientes.reduce((s, f) => s + f.monto, 0);

  // --- Capacidad de ahorro estimada (25% de ganancia neta) ---
  const capacidadAhorroDiaria = Math.max(0, Math.round(gananciaNetaDiaria * 0.25));

  // --- Racha de registro ---
  const diasConActividadSet = new Set<string>([
    ...sales.map(s => toDateStr(s.createdAt)),
    ...expenses.map(e => toDateStr(e.createdAt)),
  ].filter(Boolean));

  let rachaDiasRegistrando = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  while (rachaDiasRegistrando < 365) {
    const key = cursor.toISOString().split('T')[0];
    if (!diasConActividadSet.has(key)) break;
    rachaDiasRegistrando++;
    cursor.setDate(cursor.getDate() - 1);
  }

  // --- Alertas booleanas ---
  const ventasBajaron30 = porcentajeCambioVentas <= -30;
  const fiadoMas30Dias = fiadosPendientes.some(f => f.diasPendiente >= 30);
  const ratioGastosAlto =
    promedioVentasDiario > 0 && promedioGastosDiario / promedioVentasDiario >= 0.85;
  const rachaPositiva7 = rachaDiasRegistrando >= 7;

  return {
    promedioVentasDiario,
    promedioGastosDiario,
    gananciaNetaDiaria,
    ventasEstaSemana,
    ventasSemanaAnterior,
    tendenciaVentas,
    porcentajeCambioVentas,
    mejorDia,
    peorDia,
    productoMasRentable,
    margenProducto,
    fiadosPendientes,
    totalFiadosPendientes,
    capacidadAhorroDiaria,
    rachaDiasRegistrando,
    ventasBajaron30,
    fiadoMas30Dias,
    ratioGastosAlto,
    rachaPositiva7,
    diasConActividadSet,
  };
}
