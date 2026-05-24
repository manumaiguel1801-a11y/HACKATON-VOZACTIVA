/**
 * Agente Consejero Financiero — Voz Activa
 *
 * Usa Claude 3.5 Haiku con herramientas para analizar la situación del usuario,
 * el progreso de sus metas y dar consejos personalizados con empatía.
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  Meta, ConsejeroMessage, Sale, Expense, Debt, InventoryProduct
} from '../types';
import { FinancialContext, computeFinancialContext } from '../services/financialAnalysis';

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_financial_summary',
    description: 'Obtiene un resumen de ventas, gastos, ganancia neta y tendencias de la última semana.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_goal_analysis',
    description: 'Analiza el progreso de la meta actual, días sin confirmar y proyecciones de cumplimiento.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'check_alerts',
    description: 'Detecta alertas críticas como deudas antiguas, caídas de ventas o márgenes muy estrechos.',
    input_schema: { type: 'object' as const, properties: {} },
  },
];

export async function generateConsejeroResponse(
  userMessage: string,
  history: ConsejeroMessage[],
  ctx: FinancialContext,
  meta: Meta | null,
  firstName: string,
  onStep?: (s: string) => void,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('No hay ANTHROPIC_API_KEY configurada.');

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const runTool = (name: string) => {
    if (name === 'get_financial_summary') {
      return {
        ventas_diarias: ctx.promedioVentasDiario,
        gastos_diarios: ctx.promedioGastosDiario,
        ganancia_diaria: ctx.gananciaNetaDiaria,
        tendencia: ctx.tendenciaVentas,
        variacion_pct: ctx.porcentajeCambioVentas,
      };
    }
    if (name === 'get_goal_analysis') {
      if (!meta) return { mensaje: 'No hay meta activa.' };
      const unconfirmed = (meta.registros || []).filter(r => r.estado === 'sin_confirmar').length;
      const pct = Math.round((meta.montoAhorrado / meta.montoObjetivo) * 100);
      return {
        nombre: meta.nombre,
        objetivo: meta.montoObjetivo,
        ahorrado: meta.montoAhorrado,
        porcentaje: pct,
        dias_sin_confirmar: unconfirmed,
        ahorro_diario_acordado: meta.ahorroDiario,
      };
    }
    if (name === 'check_alerts') {
      return {
        ventas_bajaron: ctx.ventasBajaron30,
        deudas_viejas: ctx.fiadoMas30Dias,
        margen_apretado: ctx.ratioGastosAlto,
        racha_positiva: ctx.rachaPositiva7,
        total_fiados: ctx.totalFiadosPendientes,
      };
    }
    return { error: 'Herramienta no encontrada' };
  };

  const system = `Eres el Consejero de ${firstName}, el asesor financiero de confianza de Voz Activa.
REGLAS:
1. Español colombiano natural, cercano y empático.
2. NUNCA regañes por no cumplir metas. Entiende la realidad del vendedor informal.
3. Respuestas directas y accionables con cifras reales.
4. Si hay metas en riesgo (herramienta get_goal_analysis), propón soluciones con calma.
5. Usa las herramientas para dar datos exactos.

ACCIÓN ESPECIAL — CREAR META:
Si el usuario confirma una nueva meta (nombre, monto, plazo), añade al final:
[CREAR_META:{"nombre":"...","montoObjetivo":...,"dias":...}]`;

  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-10).map(m => ({ 
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const, 
      content: m.content 
    })),
    { role: 'user', content: userMessage || 'Dame un resumen de cómo va mi negocio.' },
  ];

  for (let i = 0; i < 6; i++) {
    const resp = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: 'assistant', content: resp.content });

    if (resp.stop_reason === 'end_turn') {
      return (resp.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined)?.text ?? '';
    }

    if (resp.stop_reason === 'tool_use') {
      const toolBlocks = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const results: Anthropic.ToolResultBlockParam[] = toolBlocks.map(b => {
        onStep?.(`Analizando ${b.name}...`);
        return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(runTool(b.name)) };
      });
      messages.push({ role: 'user', content: results });
    }
  }

  return 'Lo siento, tuve un problema procesando tu solicitud.';
}
