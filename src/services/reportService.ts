import { GoogleGenAI, Type } from '@google/genai';
import { Sale, Expense } from '../types';

export type ReportPeriod = '7d' | '15d' | 'mes' | 'all';

export const PERIOD_CONFIG: Record<ReportPeriod, { label: string; sub: string; days: number | null; allTime?: boolean }> = {
  '7d':  { label: '7 días',             sub: 'Últimos 7 días',   days: 7 },
  '15d': { label: '15 días',            sub: 'Últimos 15 días',  days: 15 },
  'mes': { label: '1 mes',              sub: 'Mes en curso',     days: null },
  'all': { label: 'Todo',               sub: 'Desde el inicio',  days: null, allTime: true },
};

export interface ChartPoint  { name: string; income: number; exp: number }
export interface PieSlice    { name: string; value: number;  color: string }
export interface AIInsight   { titulo: string; texto: string }

export interface ParsedReport {
  periodoLabel:   string;
  metrics:        { ingresos: number; gastos: number; utilidad: number; transacciones: number };
  chartData:      ChartPoint[];
  pieData:        PieSlice[];
  bestDay:        { name: string; amount: number } | null;
  descripcion:    string;
  insights:       AIInsight[];
  recomendaciones: AIInsight[];
  conclusion:     string;
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
  if (period === 'mes') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const label = now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    return { start, label: label.charAt(0).toUpperCase() + label.slice(1) };
  }
  if (period === 'all') {
    const start = new Date(2020, 0, 1);
    return { start, label: 'Desde el inicio' };
  }
  const days = PERIOD_CONFIG[period].days!;
  const start = new Date(now.getTime() - days * 86_400_000);
  return {
    start,
    label: `Últimos ${days} días (${start.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} – ${now.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })})`,
  };
}

function computeChartData(sales: Sale[], expenses: Expense[], start: Date, period: ReportPeriod): ChartPoint[] {
  const now = new Date();

  if (period === 'all') {
    // Group by week, last 10 weeks
    const points: ChartPoint[] = [];
    for (let i = 9; i >= 0; i--) {
      const wEnd = new Date(now.getTime() - i * 7 * 86_400_000);
      const wStart = new Date(wEnd.getTime() - 7 * 86_400_000);
      const income = sales.filter(s => { const d = getSaleDate(s); return d >= wStart && d < wEnd; }).reduce((s, x) => s + x.total, 0);
      const exp    = expenses.filter(e => { const d = getExpenseDate(e); return d >= wStart && d < wEnd; }).reduce((s, x) => s + x.amount, 0);
      points.push({ name: wEnd.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }), income, exp });
    }
    return points;
  }

  const days: ChartPoint[] = [];
  let cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  while (cur <= now) {
    const dayEnd = new Date(cur.getTime() + 86_400_000);
    const income = sales.filter(s => { const d = getSaleDate(s); return d >= cur && d < dayEnd; }).reduce((s, x) => s + x.total, 0);
    const exp    = expenses.filter(e => { const d = getExpenseDate(e); return d >= cur && d < dayEnd; }).reduce((s, x) => s + x.amount, 0);
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
  const otrosTotal = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
  const slices: PieSlice[] = top.map(([name, value], i) => ({
    name, color: PIE_COLORS[i], value: Math.round((value / total) * 100),
  }));
  if (otrosTotal > 0) slices.push({ name: 'Otros', color: PIE_COLORS[5], value: Math.round((otrosTotal / total) * 100) });
  return slices;
}

function computeBestDay(sales: Sale[], start: Date): { name: string; amount: number } | null {
  const map = new Map<string, number>();
  sales.filter(s => getSaleDate(s) >= start).forEach(s => {
    const d = getSaleDate(s);
    const key = DAY_NAMES[d.getDay()];
    map.set(key, (map.get(key) ?? 0) + s.total);
  });
  if (map.size === 0) return null;
  const [name, amount] = [...map.entries()].sort((a, b) => b[1] - a[1])[0];
  return { name, amount };
}

const AI_CONFIG = {
  responseMimeType: 'application/json',
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      descripcion: { type: Type.STRING },
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

Analiza estos datos y genera un reporte financiero en español, claro y útil.

DATOS:
- Negocio: ${userName ? `Negocio de ${userName}` : 'Mi Negocio'}
- Período: ${periodoLabel}
- Ingresos: ${fmt(metrics.ingresos)}
- Gastos: ${fmt(metrics.gastos)}
- Utilidad: ${fmt(metrics.utilidad)}
- Transacciones: ${metrics.transacciones}
- Distribución de gastos: ${gastosPie}
- Mejor día de ventas: ${bestDay ? `${bestDay.name} con ${fmt(bestDay.amount)}` : 'Sin datos'}

Devuelve JSON con:
- "descripcion": 2-3 líneas describiendo el tipo de negocio y comportamiento
- "insights": array de exactamente 4 objetos {titulo, texto} con análisis clave (positivos y negativos)
- "recomendaciones": array de exactamente 4 objetos {titulo, texto} con acciones concretas basadas en los datos
- "conclusion": una sola frase contundente sobre el estado del negocio

Reglas: sé concreto, usa los números reales, no inventes datos, no uses lenguaje técnico.`;
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

  const client = new GoogleGenAI({ apiKey: key });
  const prompt  = buildPrompt(metrics, pieData, bestDay, periodoLabel, userName);
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
      console.warn(`[Report] ${model} falló:`, err?.message ?? err);
    }
  }
  throw new Error('No se pudo generar el reporte. Intenta de nuevo.');
}
