import { GoogleGenAI, Type } from '@google/genai';
import { Sale, Expense } from '../types';

export type ReportPeriod = 'hoy' | '7d' | '14d' | '21d' | 'mes' | '3m' | '6m' | 'all';

export const PERIOD_CONFIG: Record<ReportPeriod, { label: string; sub: string; days: number | null; allTime?: boolean }> = {
  'hoy':  { label: 'Hoy',          sub: 'Solo hoy',         days: 1 },
  '7d':   { label: 'Esta semana',   sub: 'Últimos 7 días',   days: 7 },
  '14d':  { label: 'Dos semanas',   sub: 'Últimos 14 días',  days: 14 },
  '21d':  { label: 'Tres semanas',  sub: 'Últimos 21 días',  days: 21 },
  'mes':  { label: '1 mes',         sub: 'Mes en curso',     days: null },
  '3m':   { label: '3 meses',       sub: 'Últimos 3 meses',  days: 90 },
  '6m':   { label: '6 meses',       sub: 'Últimos 6 meses',  days: 180 },
  'all':  { label: 'Todo',          sub: 'Desde el inicio',  days: null, allTime: true },
};

const PERIOD_ORDER: ReportPeriod[] = ['hoy', '7d', '14d', '21d', 'mes', '3m', '6m', 'all'];

export interface ChartPoint  { name: string; income: number; exp: number }
export interface PieSlice    { name: string; value: number;  color: string }
export interface AIInsight   { titulo: string; texto: string }

export interface ParsedReport {
  periodoLabel:    string;
  metrics:         { ingresos: number; gastos: number; utilidad: number; transacciones: number };
  chartData:       ChartPoint[];
  pieData:         PieSlice[];
  bestDay:         { name: string; amount: number } | null;
  descripcion:     string;
  insights:        AIInsight[];
  recomendaciones: AIInsight[];
  conclusion:      string;
}

const PIE_COLORS = ['#B8860B', '#3B82F6', '#8B5CF6', '#EF4444', '#22C55E', '#F59E0B'];
const DAY_NAMES  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function getSaleDate(s: Sale): Date {
  return s.createdAt?.toDate ? s.createdAt.toDate() : new Date();
}
function getExpenseDate(e: Expense): Date {
  return e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
}

function getDateRange(period: ReportPeriod): { start: Date; label: string } {
  const now = new Date();

  if (period === 'hoy') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const label = start.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    return { start, label: label.charAt(0).toUpperCase() + label.slice(1) };
  }

  if (period === 'mes') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const label = now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    return { start, label: label.charAt(0).toUpperCase() + label.slice(1) };
  }

  if (period === 'all') {
    return { start: new Date(2020, 0, 1), label: 'Historial completo' };
  }

  const days = PERIOD_CONFIG[period].days!;
  const start = new Date(now.getTime() - days * 86_400_000);
  return {
    start,
    label: `${PERIOD_CONFIG[period].label} — ${start.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} al ${now.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}`,
  };
}

function computeChartData(sales: Sale[], expenses: Expense[], start: Date, period: ReportPeriod): ChartPoint[] {
  const now = new Date();

  if (period === 'hoy') {
    return [7, 9, 11, 13, 15, 17, 19, 21].map(h => {
      const hStart = new Date(start.getTime() + h * 3_600_000);
      const hEnd   = new Date(hStart.getTime() + 2 * 3_600_000);
      const income = sales.filter(s => { const d = getSaleDate(s); return d >= hStart && d < hEnd; }).reduce((a, x) => a + x.total, 0);
      const exp    = expenses.filter(e => { const d = getExpenseDate(e); return d >= hStart && d < hEnd; }).reduce((a, x) => a + x.amount, 0);
      return { name: `${h}h`, income, exp };
    });
  }

  if (period === '3m' || period === '6m') {
    const weeks = period === '3m' ? 13 : 26;
    return Array.from({ length: weeks }, (_, i) => {
      const wEnd   = new Date(now.getTime() - (weeks - 1 - i) * 7 * 86_400_000);
      const wStart = new Date(wEnd.getTime() - 7 * 86_400_000);
      const income = sales.filter(s => { const d = getSaleDate(s); return d >= wStart && d < wEnd; }).reduce((a, x) => a + x.total, 0);
      const exp    = expenses.filter(e => { const d = getExpenseDate(e); return d >= wStart && d < wEnd; }).reduce((a, x) => a + x.amount, 0);
      return { name: wEnd.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }), income, exp };
    });
  }

  if (period === 'all') {
    return Array.from({ length: 12 }, (_, i) => {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() - (11 - i) + 1, 1);
      const income = sales.filter(s => { const d = getSaleDate(s); return d >= monthStart && d < monthEnd; }).reduce((a, x) => a + x.total, 0);
      const exp    = expenses.filter(e => { const d = getExpenseDate(e); return d >= monthStart && d < monthEnd; }).reduce((a, x) => a + x.amount, 0);
      return { name: monthStart.toLocaleDateString('es-CO', { month: 'short' }), income, exp };
    });
  }

  // Daily grouping
  const days: ChartPoint[] = [];
  let cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  while (cur <= now) {
    const dayEnd = new Date(cur.getTime() + 86_400_000);
    const income = sales.filter(s => { const d = getSaleDate(s); return d >= cur && d < dayEnd; }).reduce((a, x) => a + x.total, 0);
    const exp    = expenses.filter(e => { const d = getExpenseDate(e); return d >= cur && d < dayEnd; }).reduce((a, x) => a + x.amount, 0);
    days.push({ name: DAY_NAMES[cur.getDay()], income, exp });
    cur = new Date(cur.getTime() + 86_400_000);
  }
  return days;
}

function computePieData(expenses: Expense[], start: Date): PieSlice[] {
  const map = new Map<string, number>();
  expenses.filter(e => getExpenseDate(e) >= start).forEach(e => {
    map.set(e.concept, (map.get(e.concept) ?? 0) + e.amount);
  });
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 5);
  const othersTotal = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
  const slices: PieSlice[] = top.map(([name, value], i) => ({
    name, color: PIE_COLORS[i], value: Math.round((value / total) * 100),
  }));
  if (othersTotal > 0) slices.push({ name: 'Otros', color: PIE_COLORS[5], value: Math.round((othersTotal / total) * 100) });
  return slices;
}

function computeBestDay(sales: Sale[], start: Date): { name: string; amount: number } | null {
  const map = new Map<string, number>();
  sales.filter(s => getSaleDate(s) >= start).forEach(s => {
    const key = DAY_NAMES[getSaleDate(s).getDay()];
    map.set(key, (map.get(key) ?? 0) + s.total);
  });
  if (map.size === 0) return null;
  const [name, amount] = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
  return { name, amount };
}

const MIN_COVERAGE: Partial<Record<ReportPeriod, number>> = {
  '7d': 2, '14d': 5, '21d': 7, '3m': 14, '6m': 30,
};

export function checkPeriodCompatibility(
  sales: Sale[],
  expenses: Expense[],
  period: ReportPeriod,
): { ok: boolean; daysCovered: number; bestMatch: ReportPeriod } {
  const allDates = [
    ...sales.map(s => getSaleDate(s)),
    ...expenses.map(e => getExpenseDate(e)),
  ];

  if (allDates.length === 0) return { ok: false, daysCovered: 0, bestMatch: 'hoy' };

  const oldest      = new Date(Math.min(...allDates.map(d => d.getTime())));
  const now         = new Date();
  const daysCovered = (now.getTime() - oldest.getTime()) / 86_400_000;

  const bestMatch: ReportPeriod =
    daysCovered >= 150 ? '6m'
    : daysCovered >= 70  ? '3m'
    : daysCovered >= 25  ? 'mes'
    : daysCovered >= 18  ? '21d'
    : daysCovered >= 11  ? '14d'
    : daysCovered >= 4   ? '7d'
    : 'hoy';

  if (period === 'all') return { ok: true, daysCovered, bestMatch };

  if (period === 'hoy') {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { ok: allDates.some(d => d >= todayStart), daysCovered, bestMatch };
  }

  if (period === 'mes') {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return { ok: allDates.some(d => d >= monthStart), daysCovered, bestMatch };
  }

  const minRequired = MIN_COVERAGE[period] ?? 1;
  return { ok: daysCovered >= minRequired, daysCovered, bestMatch };
}

export function filterByPeriod(sales: Sale[], expenses: Expense[], period: ReportPeriod) {
  const { start } = getDateRange(period);
  return {
    sales:    sales.filter(s => getSaleDate(s) >= start),
    expenses: expenses.filter(e => getExpenseDate(e) >= start),
    start,
  };
}

const AI_CONFIG = {
  responseMimeType: 'application/json',
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      descripcion:     { type: Type.STRING },
      insights: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { titulo: { type: Type.STRING }, texto: { type: Type.STRING } },
          required: ['titulo', 'texto'],
        },
      },
      recomendaciones: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { titulo: { type: Type.STRING }, texto: { type: Type.STRING } },
          required: ['titulo', 'texto'],
        },
      },
      conclusion: { type: Type.STRING },
    },
    required: ['descripcion', 'insights', 'recomendaciones', 'conclusion'],
  },
};

function buildPrompt(
  metrics: ParsedReport['metrics'],
  pieData: PieSlice[],
  bestDay: { name: string; amount: number } | null,
  periodoLabel: string,
  userName?: string,
): string {
  const fmt = (v: number) => `$${v.toLocaleString('es-CO')}`;
  const gastosPie = pieData.map(p => `${p.name}: ${p.value}%`).join(', ') || 'Sin datos';
  return `Eres un analista financiero experto en pequeños negocios informales latinoamericanos.

Analiza estos datos reales y genera un reporte financiero util en español.

DATOS DEL PERIODO: ${periodoLabel}
- Negocio: ${userName ? `Negocio de ${userName}` : 'Mi Negocio'}
- Ingresos: ${fmt(metrics.ingresos)}
- Gastos: ${fmt(metrics.gastos)}
- Utilidad neta: ${fmt(metrics.utilidad)}
- Transacciones: ${metrics.transacciones}
- Distribucion de gastos: ${gastosPie}
- Mejor dia de ventas: ${bestDay ? `${bestDay.name} con ${fmt(bestDay.amount)}` : 'Sin datos suficientes'}

Devuelve JSON con estos campos:
- "descripcion": 2 oraciones describiendo el negocio y su comportamiento en el periodo
- "insights": exactamente 4 objetos {titulo, texto} con hallazgos clave (mezcla positivos y negativos)
- "recomendaciones": exactamente 4 objetos {titulo, texto} con acciones concretas basadas en los numeros reales
- "conclusion": una sola oracion contundente sobre el estado actual del negocio

REGLAS: usa numeros reales del reporte, no inventes datos, no uses markdown (sin asteriscos, hashtags ni guiones decorativos), escribe en texto plano, se directo y concreto.`;
}

export async function generateFinancialReport(
  sales: Sale[],
  expenses: Expense[],
  period: ReportPeriod,
  userName?: string,
): Promise<ParsedReport> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('No hay GEMINI_API_KEY configurada');

  const { start, label: periodoLabel } = getDateRange(period);
  const filteredSales    = sales.filter(s => getSaleDate(s) >= start);
  const filteredExpenses = expenses.filter(e => getExpenseDate(e) >= start);

  const metrics = {
    ingresos:      filteredSales.reduce((s, x) => s + x.total, 0),
    gastos:        filteredExpenses.reduce((s, x) => s + x.amount, 0),
    utilidad:      0,
    transacciones: filteredSales.length + filteredExpenses.length,
  };
  metrics.utilidad = metrics.ingresos - metrics.gastos;

  const chartData = computeChartData(sales, expenses, start, period);
  const pieData   = computePieData(expenses, start);
  const bestDay   = computeBestDay(sales, start);

  const client   = new GoogleGenAI({ apiKey: key });
  const prompt   = buildPrompt(metrics, pieData, bestDay, periodoLabel, userName);
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];

  for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
    try {
      const response = await client.models.generateContent({ model, contents, config: AI_CONFIG } as any);
      const ai = JSON.parse(response.text ?? '{}');
      return {
        periodoLabel,
        metrics,
        chartData,
        pieData,
        bestDay,
        descripcion:     ai.descripcion     ?? '',
        insights:        ai.insights        ?? [],
        recomendaciones: ai.recomendaciones ?? [],
        conclusion:      ai.conclusion      ?? '',
      };
    } catch (err: any) {
      console.warn(`[Report] ${model} fallo:`, err?.message ?? err);
    }
  }
  throw new Error('No se pudo generar el reporte. Intenta de nuevo.');
}
