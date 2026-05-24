/**
 * Agente de análisis crediticio desde extracto bancario — Voz Activa
 *
 * Computa de forma determinista los 5 factores crediticios a partir de las
 * transacciones ya extraídas del PDF. Luego usa Claude Haiku (tool_use) para
 * generar el análisis narrativo (insights, recomendaciones, conclusión).
 */
import Anthropic from '@anthropic-ai/sdk';
import { ExtractoTransaction } from '../services/extractoService';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CreditScoreBreakdown {
  consistenciaIngresos: number; // 0–30
  capacidadPago:        number; // 0–25
  calidadIngresos:      number; // 0–20 (% cobros QR / digital)
  volumenActividad:     number; // 0–15 (proyección mensual)
  coberturaExtracto:    number; // 0–10 (período y cantidad de transacciones)
  scoreBase:            number; // 0–100
  scoreFinal:           number; // 150–950
}

export interface CreditNarrative {
  resumen:         string;
  insights:        { titulo: string; texto: string }[];
  recomendaciones: { titulo: string; texto: string }[];
  conclusion:      string;
}

export interface CreditAnalysis {
  scores:         CreditScoreBreakdown;
  narrative:      CreditNarrative;
  totalIngresos:  number;
  totalGastos:    number;
  margenPct:      number;
  entidad:        string;
}

// ─── Cómputo determinista de scores ──────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function r1(v: number) { return Math.round(v * 10) / 10; }

function parseFecha(s: string): Date | null {
  if (!s) return null;
  const parts = s.split('/');
  if (parts.length === 3)
    return new Date(`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function computeCreditScores(transactions: ExtractoTransaction[]): CreditScoreBreakdown {
  const incomes  = transactions.filter(t => ['cobro_qr','transferencia_recibida','otro'].includes(t.tipo));
  const outflows = transactions.filter(t => ['transferencia_enviada','retiro','pago_servicio'].includes(t.tipo));

  const totalIngresos = incomes.reduce((s, t) => s + t.monto, 0);
  const totalGastos   = outflows.reduce((s, t) => s + t.monto, 0);

  const allDates    = transactions.map(t => parseFecha(t.fecha)).filter((d): d is Date => d !== null);
  const incomeDates = incomes.map(t => parseFecha(t.fecha)).filter((d): d is Date => d !== null);

  const minTs = allDates.length ? Math.min(...allDates.map(d => d.getTime())) : Date.now();
  const maxTs = allDates.length ? Math.max(...allDates.map(d => d.getTime())) : Date.now();
  const totalDays        = Math.max(1, Math.ceil((maxTs - minTs) / 86_400_000) + 1);
  const uniqueIncomeDays = new Set(incomeDates.map(d => d.toISOString().slice(0,10))).size;
  const densidad         = uniqueIncomeDays / totalDays;

  // 1. Consistencia de ingresos (0–30)
  let consistenciaIngresos: number;
  if (totalDays >= 25) {
    if      (densidad >= 0.4)  consistenciaIngresos = 28;
    else if (densidad >= 0.2)  consistenciaIngresos = 18 + (densidad - 0.2) / 0.2 * 10;
    else if (densidad >= 0.05) consistenciaIngresos = 8  + (densidad - 0.05) / 0.15 * 10;
    else                       consistenciaIngresos = 4;
  } else {
    consistenciaIngresos = Math.min(20, uniqueIncomeDays * 2.5);
  }

  // 2. Capacidad de pago (0–25)
  let capacidadPago: number;
  if (totalIngresos === 0) {
    capacidadPago = 0;
  } else {
    const ratio = (totalIngresos - totalGastos) / totalIngresos;
    if      (ratio >= 0.4) capacidadPago = 25;
    else if (ratio >= 0.2) capacidadPago = 12 + (ratio - 0.2) / 0.2 * 13;
    else if (ratio >= 0)   capacidadPago = (ratio / 0.2) * 12;
    else                   capacidadPago = 0;
  }

  // 3. Calidad de ingresos — QR / digital (0–20)
  const qrIncome = incomes.filter(t => t.tipo === 'cobro_qr').reduce((s, t) => s + t.monto, 0);
  const pctQR    = totalIngresos > 0 ? qrIncome / totalIngresos : 0;
  let calidadIngresos: number;
  if      (pctQR >= 0.7) calidadIngresos = 20;
  else if (pctQR >= 0.4) calidadIngresos = 12 + (pctQR - 0.4) / 0.3 * 8;
  else if (pctQR >= 0.1) calidadIngresos = 4  + (pctQR - 0.1) / 0.3 * 8;
  else                   calidadIngresos = Math.min(6, incomes.length * 0.8);

  // 4. Volumen de actividad — proyección mensual (0–15)
  const monthly = Math.round((totalIngresos / totalDays) * 30);
  let volumenActividad: number;
  if      (monthly >= 5_000_000) volumenActividad = 15;
  else if (monthly >= 2_000_000) volumenActividad = 12;
  else if (monthly >= 1_000_000) volumenActividad = 9;
  else if (monthly >= 500_000)   volumenActividad = 6;
  else if (monthly >= 200_000)   volumenActividad = 3;
  else                           volumenActividad = 1;

  // 5. Cobertura del extracto (0–10)
  let coberturaExtracto: number;
  if      (totalDays >= 60)          coberturaExtracto = 10;
  else if (totalDays >= 30)          coberturaExtracto = 7;
  else if (totalDays >= 14)          coberturaExtracto = 5;
  else if (transactions.length >= 10) coberturaExtracto = 3;
  else                               coberturaExtracto = 2;

  const c = r1(clamp(consistenciaIngresos, 0, 30));
  const p = r1(clamp(capacidadPago,        0, 25));
  const q = r1(clamp(calidadIngresos,      0, 20));
  const v = r1(clamp(volumenActividad,     0, 15));
  const k = r1(clamp(coberturaExtracto,    0, 10));
  const scoreBase  = r1(c + p + q + v + k);
  const scoreFinal = clamp(Math.round(150 + scoreBase * 8), 150, 950);

  return { consistenciaIngresos: c, capacidadPago: p, calidadIngresos: q, volumenActividad: v, coberturaExtracto: k, scoreBase, scoreFinal };
}

// ─── Herramientas del agente ──────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_financial_summary',
    description: 'Resumen financiero: ingresos totales, gastos, margen, proyección mensual de ingresos y número de transacciones.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_income_breakdown',
    description: 'Desglose de ingresos por tipo: cobros QR, transferencias recibidas y otros. Porcentaje de cada fuente.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_credit_scores',
    description: 'Puntuaciones crediticias ya calculadas: consistencia, capacidad de pago, calidad de ingresos, volumen, cobertura. Score final 150–950.',
    input_schema: { type: 'object' as const, properties: {} },
  },
];

const STEP_LABELS: Record<string, string> = {
  get_financial_summary: 'Calculando resumen financiero...',
  get_income_breakdown:  'Analizando fuentes de ingreso...',
  get_credit_scores:     'Calculando score crediticio...',
};

// ─── Punto de entrada del agente ─────────────────────────────────────────────

export async function analyzeCreditFromExtracto(
  transactions: ExtractoTransaction[],
  entidad: string,
  userName?: string,
  onStep?: (s: string) => void,
): Promise<CreditAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('No hay ANTHROPIC_API_KEY configurada. Agrégala en .env.local');

  const scores    = computeCreditScores(transactions);
  const incomes   = transactions.filter(t => ['cobro_qr','transferencia_recibida','otro'].includes(t.tipo));
  const outflows  = transactions.filter(t => ['transferencia_enviada','retiro','pago_servicio'].includes(t.tipo));
  const totalIngresos = incomes.reduce((s, t) => s + t.monto, 0);
  const totalGastos   = outflows.reduce((s, t) => s + t.monto, 0);
  const margenPct     = totalIngresos > 0 ? Math.round(((totalIngresos - totalGastos) / totalIngresos) * 100) : 0;

  const allDates = transactions.map(t => parseFecha(t.fecha)).filter((d): d is Date => d !== null);
  const totalDays = allDates.length > 1
    ? Math.ceil((Math.max(...allDates.map(d => d.getTime())) - Math.min(...allDates.map(d => d.getTime()))) / 86_400_000) + 1
    : 1;
  const monthly    = Math.round((totalIngresos / totalDays) * 30);
  const qrIncome   = incomes.filter(t => t.tipo === 'cobro_qr').reduce((s, t) => s + t.monto, 0);
  const trfIncome  = incomes.filter(t => t.tipo === 'transferencia_recibida').reduce((s, t) => s + t.monto, 0);

  function runTool(name: string): unknown {
    if (name === 'get_financial_summary') {
      return {
        total_ingresos:     totalIngresos,
        total_gastos:       totalGastos,
        margen_pct:         margenPct,
        proyeccion_mensual: monthly,
        transacciones:      transactions.length,
        periodo_dias:       totalDays,
        entidad,
      };
    }
    if (name === 'get_income_breakdown') {
      return {
        cobros_qr:           qrIncome,
        transferencias:      trfIncome,
        otros:               totalIngresos - qrIncome - trfIncome,
        pct_qr:              totalIngresos > 0 ? Math.round((qrIncome  / totalIngresos) * 100) : 0,
        pct_transferencias:  totalIngresos > 0 ? Math.round((trfIncome / totalIngresos) * 100) : 0,
      };
    }
    if (name === 'get_credit_scores') {
      return {
        consistencia_ingresos:   scores.consistenciaIngresos,
        capacidad_pago:          scores.capacidadPago,
        calidad_ingresos_digital:scores.calidadIngresos,
        volumen_actividad:       scores.volumenActividad,
        cobertura_extracto:      scores.coberturaExtracto,
        score_base_100:          scores.scoreBase,
        score_final_150_950:     scores.scoreFinal,
      };
    }
    return { error: 'Herramienta no encontrada' };
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const system = `Eres un analista de crédito experto en microfinanzas colombianas.
Evalúas a${userName ? ` ${userName}` : ' un vendedor informal'} como candidato para un microcrédito usando su extracto de ${entidad}.
Usa las herramientas disponibles para obtener todos los datos del extracto.
El score crediticio calculado es ${scores.scoreFinal}/950. Úsalo en tu análisis.
Cuando tengas suficiente información, responde ÚNICAMENTE con este JSON válido:
{
  "resumen": "2 oraciones sobre el comportamiento financiero visto en el extracto",
  "insights": [
    {"titulo":"...","texto":"..."},
    {"titulo":"...","texto":"..."},
    {"titulo":"...","texto":"..."}
  ],
  "recomendaciones": [
    {"titulo":"...","texto":"..."},
    {"titulo":"...","texto":"..."},
    {"titulo":"...","texto":"..."}
  ],
  "conclusion": "Una oración contundente: ¿es viable el microcrédito y por qué?"
}
REGLAS: usa cifras reales del extracto, español colombiano directo, sin asteriscos ni markdown.`;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Analiza el extracto y evalúa la viabilidad del microcrédito.' },
  ];

  onStep?.('Iniciando análisis crediticio...');

  for (let i = 0; i < 8; i++) {
    const resp = await client.messages.create({
      model:      'claude-3-5-haiku-20241022',
      max_tokens: 2048,
      system,
      tools:      TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: resp.content });

    if (resp.stop_reason === 'end_turn') {
      onStep?.('Generando análisis final...');
      const text  = (resp.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined)?.text ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('El agente no devolvió un JSON válido. Intenta de nuevo.');
      const ai = JSON.parse(match[0]);
      return {
        scores,
        narrative: {
          resumen:         ai.resumen         ?? '',
          insights:        ai.insights        ?? [],
          recomendaciones: ai.recomendaciones ?? [],
          conclusion:      ai.conclusion      ?? '',
        },
        totalIngresos,
        totalGastos,
        margenPct,
        entidad,
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
