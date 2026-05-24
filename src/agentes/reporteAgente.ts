/**
 * Agente de reporte financiero — Voz Activa
 *
 * Loop basado en herramientas (tool_use) usando Anthropic Claude Haiku.
 * El agente decide qué datos necesita, llama las herramientas locales,
 * razona sobre los resultados y genera el reporte final.
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  Sale, Expense, Debt,
} from '../types';
import {
  ReportPeriod, ParsedReport,
  PERIOD_CONFIG, DAY_NAMES,
  getSaleDate, getExpenseDate,
  getDateRange,
  computeChartData, computePieData, computeBestDay,
} from '../services/reportService';

// ─── Herramientas disponibles para el agente ──────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_period_metrics',
    description: 'Obtiene ingresos, gastos, utilidad neta, margen y número de transacciones del período.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'compare_with_previous_period',
    description: 'Compara el período actual con el anterior de la misma duración. Detecta crecimiento o caída.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_expense_breakdown',
    description: 'Desglose de gastos por categoría, ordenado de mayor a menor con porcentaje del total.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_sales_trend',
    description: 'Tendencia de ventas: mejor y peor día de la semana, promedio diario y días sin actividad.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_debt_summary',
    description: 'Obtiene un resumen de deudas pendientes (lo que deben al usuario vs lo que el usuario debe).',
    input_schema: { type: 'object' as const, properties: {} },
  },
];

const STEP_LABELS: Record<string, string> = {
  get_period_metrics:           'Calculando métricas del período...',
  compare_with_previous_period: 'Comparando con período anterior...',
  get_expense_breakdown:        'Analizando distribución de gastos...',
  get_sales_trend:              'Detectando tendencias de ventas...',
  get_debt_summary:             'Analizando saldos de fiados y deudas...',
};

// ─── Implementación de cada herramienta ──────────────────────────────────────

function buildToolRunner(
  sales: Sale[],
  expenses: Expense[],
  fSales: Sale[],
  fExpenses: Expense[],
  debts: Debt[],
  period: ReportPeriod,
  start: Date,
) {
  return function runTool(name: string): unknown {
    if (name === 'get_period_metrics') {
      const ingresos = fSales.reduce((s, x) => s + x.total, 0);
      const gastos   = fExpenses.reduce((s, x) => s + x.amount, 0);
      return {
        ingresos, gastos,
        utilidad:      ingresos - gastos,
        transacciones: fSales.length + fExpenses.length,
        margen_pct:    ingresos > 0 ? Math.round(((ingresos - gastos) / ingresos) * 100) : 0,
      };
    }

    if (name === 'compare_with_previous_period') {
      const days = PERIOD_CONFIG[period].days;
      if (!days) return { disponible: false, motivo: 'Período sin duración fija para comparar' };
      const prevEnd   = new Date(start);
      const prevStart = new Date(start.getTime() - days * 86_400_000);
      const pS  = sales.filter(s => { const d = getSaleDate(s);    return d >= prevStart && d < prevEnd; });
      const pE  = expenses.filter(e => { const d = getExpenseDate(e); return d >= prevStart && d < prevEnd; });
      const pI  = pS.reduce((s, x) => s + x.total, 0);
      const pG  = pE.reduce((s, x) => s + x.amount, 0);
      const cI  = fSales.reduce((s, x) => s + x.total, 0);
      const cG  = fExpenses.reduce((s, x) => s + x.amount, 0);
      return {
        disponible:             true,
        ingresos_anterior:      pI,
        gastos_anterior:        pG,
        variacion_ingresos_pct: pI > 0 ? Math.round(((cI - pI) / pI) * 100) : null,
        variacion_gastos_pct:   pG > 0 ? Math.round(((cG - pG) / pG) * 100) : null,
      };
    }

    if (name === 'get_expense_breakdown') {
      const map = new Map<string, number>();
      fExpenses.forEach(e => map.set(e.concept, (map.get(e.concept) ?? 0) + e.amount));
      const total = [...map.values()].reduce((a, b) => a + b, 0);
      return {
        total_gastos: total,
        categorias: [...map.entries()]
          .sort((a, b) => b[1] - a[1]).slice(0, 6)
          .map(([nombre, monto]) => ({ nombre, monto, pct: total > 0 ? Math.round((monto / total) * 100) : 0 })),
      };
    }

    if (name === 'get_sales_trend') {
      const dayMap = new Map<string, number>();
      fSales.forEach(s => {
        const key = DAY_NAMES[getSaleDate(s).getDay()];
        dayMap.set(key, (dayMap.get(key) ?? 0) + s.total);
      });
      const sorted        = [...dayMap.entries()].sort((a, b) => b[1] - a[1]);
      const totalDays     = Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86_400_000));
      const daysWithSales = new Set(fSales.map(s => getSaleDate(s).toDateString())).size;
      const totalIngr     = fSales.reduce((s, x) => s + x.total, 0);
      return {
        mejor_dia:       sorted[0]                 ? { dia: sorted[0][0],                 monto: sorted[0][1] }                 : null,
        peor_dia:        sorted[sorted.length - 1] ? { dia: sorted[sorted.length - 1][0], monto: sorted[sorted.length - 1][1] } : null,
        dias_con_ventas:  daysWithSales,
        dias_sin_ventas:  totalDays - daysWithSales,
        promedio_diario:  daysWithSales > 0 ? Math.round(totalIngr / daysWithSales) : 0,
      };
    }

    if (name === 'get_debt_summary') {
      const meDeben = debts.filter(d => d.type === 'me-deben' && d.status !== 'pagada');
      const debo    = debts.filter(d => d.type === 'debo' && d.status !== 'pagada');
      return {
        total_me_deben: meDeben.reduce((s, x) => s + x.amount, 0),
        total_debo:     debo.reduce((s, x) => s + x.amount, 0),
        cant_fiados_activos: meDeben.length,
        cant_deudas_activas: debo.length,
      };
    }

    return { error: 'Herramienta no encontrada' };
  };
}

// ─── Punto de entrada del agente ─────────────────────────────────────────────

export async function generateFinancialReport(
  sales: Sale[],
  expenses: Expense[],
  debts: Debt[],
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
  const runTool   = buildToolRunner(sales, expenses, fSales, fExpenses, debts, period, start);

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const system = `Eres un analista financiero experto en pequeños negocios informales colombianos.
Analiza los datos del negocio${userName ? ` de ${userName}` : ''} para el período: ${periodoLabel}.
Usa las herramientas disponibles para recopilar todos los datos que necesites.
Cuando tengas suficiente información, responde ÚNICAMENTE con un JSON válido con esta estructura exacta:
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

  // ── Loop del agente ────────────────────────────────────────────────────────
  for (let i = 0; i < 10; i++) {
    const resp = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 4096,
      system,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: resp.content });

    // El agente terminó — extrae el JSON del reporte
    if (resp.stop_reason === 'end_turn') {
      onStep?.('Construyendo reporte...');
      const text  = (resp.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined)?.text ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('El agente no devolvió un JSON válido. Intenta de nuevo.');

      const ai   = JSON.parse(match[0]);
      const ingr = fSales.reduce((s, x) => s + x.total, 0);
      const gast = fExpenses.reduce((s, x) => s + x.amount, 0);

      return {
        periodoLabel,
        metrics: { ingresos: ingr, gastos: gast, utilidad: ingr - gast, transacciones: fSales.length + fExpenses.length },
        chartData, pieData, bestDay,
        descripcion:     ai.descripcion     ?? '',
        insights:        ai.insights        ?? [],
        recomendaciones: ai.recomendaciones ?? [],
        conclusion:      ai.conclusion      ?? '',
      };
    }

    // El agente quiere usar una herramienta
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
