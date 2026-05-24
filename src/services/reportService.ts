import Anthropic from '@anthropic-ai/sdk';
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

// ─── Agent tools ──────────────────────────────────────────────────────────────

const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_period_metrics',
    description: 'Obtiene ingresos, gastos, utilidad neta, margen y número de transacciones del período.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'compare_with_previous_period',
    description: 'Compara el período actual con el anterior de la misma duración. Útil para detectar crecimiento o caída.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_expense_breakdown',
    description: 'Desglose de gastos por categoría ordenado de mayor a menor con porcentaje del total.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_sales_trend',
    description: 'Tendencia de ventas: mejor y peor día de la semana, promedio diario y días sin actividad.',
    input_schema: { type: 'object' as const, properties: {} },
  },
];

const STEP_LABELS: Record<string, string> = {
  get_period_metrics:          'Calculando métricas del período...',
  compare_with_previous_period:'Comparando con período anterior...',
  get_expense_breakdown:       'Analizando distribución de gastos...',
  get_sales_trend:             'Detectando tendencias de ventas...',
};

export async function generateFinancialReport(
  sales: Sale[],
  expenses: Expense[],
  period: ReportPeriod,
  userName?: string,
  onStep?: (step: string) => void,
): Promise<ParsedReport> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('No hay ANTHROPIC_API_KEY configurada. Agrégala en .env.local');

  const { start, label: periodoLabel } = getDateRange(period);
  const fSales    = sales.filter(s => getSaleDate(s) >= start);
  const fExpenses = expenses.filter(e => getExpenseDate(e) >= start);

  const chartData = computeChartData(sales, expenses, start, period);
  const pieData   = computePieData(expenses, start);
  const bestDay   = computeBestDay(sales, start);

  // ── Tool handlers ────────────────────────────────────────────────────────
  function runTool(name: string): unknown {
    if (name === 'get_period_metrics') {
      const ingresos      = fSales.reduce((s, x) => s + x.total, 0);
      const gastos        = fExpenses.reduce((s, x) => s + x.amount, 0);
      return {
        ingresos, gastos,
        utilidad:      ingresos - gastos,
        transacciones: fSales.length + fExpenses.length,
        margen_pct:    ingresos > 0 ? Math.round(((ingresos - gastos) / ingresos) * 100) : 0,
      };
    }

    if (name === 'compare_with_previous_period') {
      const days = PERIOD_CONFIG[period].days;
      if (!days) return { disponible: false, motivo: 'El período seleccionado no tiene duración fija para comparar' };

      const prevEnd   = new Date(start);
      const prevStart = new Date(start.getTime() - days * 86_400_000);
      const pSales    = sales.filter(s => { const d = getSaleDate(s);    return d >= prevStart && d < prevEnd; });
      const pExpenses = expenses.filter(e => { const d = getExpenseDate(e); return d >= prevStart && d < prevEnd; });
      const prevIngr  = pSales.reduce((s, x) => s + x.total, 0);
      const prevGast  = pExpenses.reduce((s, x) => s + x.amount, 0);
      const curIngr   = fSales.reduce((s, x) => s + x.total, 0);
      const curGast   = fExpenses.reduce((s, x) => s + x.amount, 0);
      return {
        disponible:              true,
        ingresos_anterior:       prevIngr,
        gastos_anterior:         prevGast,
        variacion_ingresos_pct:  prevIngr > 0 ? Math.round(((curIngr - prevIngr) / prevIngr) * 100) : null,
        variacion_gastos_pct:    prevGast > 0 ? Math.round(((curGast - prevGast) / prevGast) * 100) : null,
      };
    }

    if (name === 'get_expense_breakdown') {
      const map = new Map<string, number>();
      fExpenses.forEach(e => map.set(e.concept, (map.get(e.concept) ?? 0) + e.amount));
      const total = [...map.values()].reduce((a, b) => a + b, 0);
      return {
        total_gastos: total,
        categorias: [...map.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([nombre, monto]) => ({ nombre, monto, pct: total > 0 ? Math.round((monto / total) * 100) : 0 })),
      };
    }

    if (name === 'get_sales_trend') {
      const dayMap = new Map<string, number>();
      fSales.forEach(s => {
        const key = DAY_NAMES[getSaleDate(s).getDay()];
        dayMap.set(key, (dayMap.get(key) ?? 0) + s.total);
      });
      const sorted       = [...dayMap.entries()].sort((a, b) => b[1] - a[1]);
      const totalDays    = Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86_400_000));
      const daysWithSales = new Set(fSales.map(s => getSaleDate(s).toDateString())).size;
      const totalIngr    = fSales.reduce((s, x) => s + x.total, 0);
      return {
        mejor_dia:       sorted[0]                  ? { dia: sorted[0][0],                  monto: sorted[0][1] }                  : null,
        peor_dia:        sorted[sorted.length - 1]  ? { dia: sorted[sorted.length - 1][0],  monto: sorted[sorted.length - 1][1] }  : null,
        dias_con_ventas:  daysWithSales,
        dias_sin_ventas:  totalDays - daysWithSales,
        promedio_diario:  daysWithSales > 0 ? Math.round(totalIngr / daysWithSales) : 0,
      };
    }

    return { error: 'Herramienta no encontrada' };
  }

  // ── Agent loop ────────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const system = `Eres un analista financiero experto en pequeños negocios informales colombianos.
Analiza los datos del negocio${userName ? ` de ${userName}` : ''} para el período: ${periodoLabel}.
Usa las herramientas disponibles para recopilar todos los datos que necesites.
Cuando tengas suficiente información, responde ÚNICAMENTE con un JSON válido con esta estructura:
{
  "descripcion": "2 oraciones sobre el negocio y su comportamiento en el período",
  "insights": [
    {"titulo":"...","texto":"..."},
    {"titulo":"...","texto":"..."},
    {"titulo":"...","texto":"..."},
    {"titulo":"...","texto":"..."}
  ],
  "recomendaciones": [
    {"titulo":"...","texto":"..."},
    {"titulo":"...","texto":"..."},
    {"titulo":"...","texto":"..."},
    {"titulo":"...","texto":"..."}
  ],
  "conclusion": "Una sola oración contundente sobre el estado del negocio"
}
REGLAS: usa cifras reales, sin markdown, sin asteriscos, texto plano, español colombiano directo.`;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Genera el reporte financiero completo.' },
  ];

  onStep?.('Iniciando análisis del negocio...');

  for (let i = 0; i < 10; i++) {
    const resp = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system,
      tools:      AGENT_TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: resp.content });

    if (resp.stop_reason === 'end_turn') {
      onStep?.('Construyendo reporte...');
      const text = (resp.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined)?.text ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('El agente no devolvió un JSON válido. Intenta de nuevo.');

      const ai      = JSON.parse(match[0]);
      const ingr    = fSales.reduce((s, x) => s + x.total, 0);
      const gast    = fExpenses.reduce((s, x) => s + x.amount, 0);

      return {
        periodoLabel,
        metrics: { ingresos: ingr, gastos: gast, utilidad: ingr - gast, transacciones: fSales.length + fExpenses.length },
        chartData,
        pieData,
        bestDay,
        descripcion:     ai.descripcion     ?? '',
        insights:        ai.insights        ?? [],
        recomendaciones: ai.recomendaciones ?? [],
        conclusion:      ai.conclusion      ?? '',
      };
    }

    if (resp.stop_reason === 'tool_use') {
      const toolBlocks = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const results: Anthropic.ToolResultBlockParam[] = toolBlocks.map(b => {
        onStep?.(STEP_LABELS[b.name] ?? `Ejecutando ${b.name}...`);
        return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(runTool(b.name)) };
      });
      messages.push({ role: 'user', content: results });
    }
  }

  throw new Error('El agente no completó el análisis. Intenta de nuevo.');
}
