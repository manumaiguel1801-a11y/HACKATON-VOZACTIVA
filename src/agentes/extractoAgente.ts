/**
 * Agente de análisis de extracto bancario — Voz Activa
 *
 * Recibe las transacciones ya extraídas por Gemini Vision y corre un loop
 * de function calling para analizar patrones, flujo de caja y consistencia.
 * Devuelve un análisis enriquecido que alimenta el cálculo del score.
 */
import { GoogleGenAI, Type } from '@google/genai';
import { ExtractoTransaction } from '../services/extractoService';

export interface ExtractoAgentResult {
  miniAnalisis: string;
  consistenciaVentas: number;       // 0–100: % de consistencia de ingresos
  mesesConActividad: number;        // meses con transacciones detectados
  promedioMensualIngresos: number;  // promedio mensual en pesos
}

const MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash'];

const STEP_LABELS: Record<string, string> = {
  get_income_metrics:    'Analizando ingresos y cobros...',
  get_expense_metrics:   'Revisando gastos y retiros...',
  get_activity_patterns: 'Detectando patrones de actividad...',
  get_cash_flow_metrics: 'Calculando flujo de caja...',
};

const FUNCTION_DECLARATIONS = [
  {
    name: 'get_income_metrics',
    description: 'Ingresos totales, desglose QR vs transferencias, porcentaje de ventas reales y monto promedio por cobro.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_expense_metrics',
    description: 'Gastos totales, retiros, transferencias enviadas, pagos de servicios y ratio sobre ingresos.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_activity_patterns',
    description: 'Días con actividad, días con ingresos, meses cubiertos, semanas activas y consistencia.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_cash_flow_metrics',
    description: 'Flujo neto (ingresos menos gastos), ratio de ahorro, promedio mensual y evaluación general.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

// ─── Implementación de herramientas ──────────────────────────────────────────

function buildToolRunner(transactions: ExtractoTransaction[]) {
  const ingresos = transactions.filter(t =>
    ['cobro_qr', 'transferencia_recibida', 'otro'].includes(t.tipo),
  );
  const gastos = transactions.filter(t =>
    ['transferencia_enviada', 'retiro', 'pago_servicio'].includes(t.tipo),
  );
  const totalI = ingresos.reduce((s, t) => s + t.monto, 0);
  const totalG = gastos.reduce((s, t) => s + t.monto, 0);

  function parseDates(txs: ExtractoTransaction[]): Date[] {
    return txs
      .map(t => {
        // Intenta varios formatos: DD/MM/YYYY, YYYY-MM-DD, etc.
        const raw = t.fecha;
        if (!raw) return null;
        const ddmm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmm) return new Date(`${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`);
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
      })
      .filter((d): d is Date => d !== null);
  }

  return function runTool(name: string): unknown {
    if (name === 'get_income_metrics') {
      const ventasQR = ingresos.filter(t => t.esVentaProbable);
      const montosQR = ventasQR.reduce((s, t) => s + t.monto, 0);
      return {
        total_ingresos:           totalI,
        ingresos_qr_ventas:       montosQR,
        ingresos_transferencias:  totalI - montosQR,
        porcentaje_ventas_qr:     totalI > 0 ? Math.round(montosQR / totalI * 100) : 0,
        num_cobros_qr:            ventasQR.length,
        monto_promedio_cobro:     ventasQR.length > 0 ? Math.round(montosQR / ventasQR.length) : 0,
      };
    }

    if (name === 'get_expense_metrics') {
      const retiros   = gastos.filter(t => t.tipo === 'retiro').reduce((s, t) => s + t.monto, 0);
      const enviados  = gastos.filter(t => t.tipo === 'transferencia_enviada').reduce((s, t) => s + t.monto, 0);
      const servicios = gastos.filter(t => t.tipo === 'pago_servicio').reduce((s, t) => s + t.monto, 0);
      return {
        total_gastos:              totalG,
        retiros,
        transferencias_enviadas:   enviados,
        pagos_servicios:           servicios,
        ratio_gastos_sobre_ingr:   totalI > 0 ? Math.round(totalG / totalI * 100) : 0,
      };
    }

    if (name === 'get_activity_patterns') {
      const allDates    = parseDates(transactions);
      const ingDates    = parseDates(ingresos);
      const uniqueDays  = new Set(allDates.map(d => d.toDateString())).size;
      const ingDays     = new Set(ingDates.map(d => d.toDateString())).size;
      const meses       = new Set(allDates.map(d => `${d.getFullYear()}-${d.getMonth()}`)).size;
      const semanas     = new Set(allDates.map(d => {
        const s = new Date(d); s.setDate(d.getDate() - d.getDay()); return s.toDateString();
      })).size;
      return {
        dias_con_actividad: uniqueDays,
        dias_con_ingresos:  ingDays,
        meses_con_actividad: meses,
        semanas_activas:    semanas,
        consistencia_pct:   uniqueDays > 0 ? Math.round(ingDays / uniqueDays * 100) : 0,
        total_transacciones: transactions.length,
      };
    }

    if (name === 'get_cash_flow_metrics') {
      const allDates = parseDates(transactions);
      const meses    = new Set(allDates.map(d => `${d.getFullYear()}-${d.getMonth()}`)).size || 1;
      const flujoNeto = totalI - totalG;
      return {
        flujo_neto:                 flujoNeto,
        ratio_ahorro_pct:           totalI > 0 ? Math.round(flujoNeto / totalI * 100) : 0,
        promedio_mensual_ingresos:  Math.round(totalI / meses),
        meses_cubiertos:            meses,
        evaluacion:                 flujoNeto / Math.max(totalI, 1) >= 0.3 ? 'saludable'
                                  : flujoNeto >= 0 ? 'ajustado' : 'deficit',
      };
    }

    return { error: 'Herramienta no encontrada' };
  };
}

// ─── Punto de entrada ─────────────────────────────────────────────────────────

export async function analyzeExtractoWithAgent(
  transactions: ExtractoTransaction[],
  entidad: string,
  onStep?: (step: string) => void,
): Promise<ExtractoAgentResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  if (transactions.length === 0) {
    return { miniAnalisis: '', consistenciaVentas: 0, mesesConActividad: 0, promedioMensualIngresos: 0 };
  }

  const client  = new GoogleGenAI({ apiKey });
  const runTool = buildToolRunner(transactions);

  const systemInstruction = `Eres un analista financiero experto en micronegocios colombianos informales.
Tienes las transacciones bancarias de un vendedor extraídas de su extracto de ${entidad || 'banco colombiano'}.
Usa TODAS las herramientas disponibles para analizar los datos a fondo.
Cuando hayas recopilado suficiente información, responde ÚNICAMENTE con un JSON válido:
{
  "miniAnalisis": "2-3 oraciones directas con cifras reales sobre el comportamiento financiero",
  "consistenciaVentas": número 0-100 (qué tan consistente y frecuente es la actividad de ingresos),
  "mesesConActividad": número de meses con transacciones detectados,
  "promedioMensualIngresos": promedio mensual de ingresos en pesos colombianos entero
}
REGLAS: español colombiano directo, sin markdown, cifras en pesos colombianos.`;

  const contents: any[] = [
    { role: 'user', parts: [{ text: `Analiza las ${transactions.length} transacciones de este extracto bancario.` }] },
  ];

  onStep?.('Iniciando análisis del extracto...');

  for (let i = 0; i < 10; i++) {
    let response: any;
    let lastErr: any;

    for (const model of MODELS) {
      try {
        response = await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
          },
        });
        break;
      } catch (err: any) {
        console.warn(`[ExtractoAgente] ${model} falló:`, err?.message ?? err);
        lastErr = err;
      }
    }
    if (!response) throw lastErr ?? new Error('No se pudo conectar con Gemini');

    const parts: any[] = response.candidates?.[0]?.content?.parts ?? [];
    contents.push({ role: 'model', parts });

    const functionCalls = parts.filter((p: any) => p.functionCall);

    if (functionCalls.length === 0) {
      const text  = parts.filter((p: any) => p.text).map((p: any) => p.text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        // Fallback: devolver análisis básico sin fallar
        return { miniAnalisis: '', consistenciaVentas: 50, mesesConActividad: 1, promedioMensualIngresos: 0 };
      }
      const result = JSON.parse(match[0]);
      return {
        miniAnalisis:            result.miniAnalisis            ?? '',
        consistenciaVentas:      Math.min(100, Math.max(0, Number(result.consistenciaVentas)      || 0)),
        mesesConActividad:       Math.max(0,               Number(result.mesesConActividad)       || 0),
        promedioMensualIngresos: Math.max(0,               Number(result.promedioMensualIngresos) || 0),
      };
    }

    const functionResponses = functionCalls.map((p: any) => {
      const name = p.functionCall.name;
      onStep?.(STEP_LABELS[name] ?? `Ejecutando ${name}...`);
      return { functionResponse: { name, response: runTool(name) } };
    });

    contents.push({ role: 'user', parts: functionResponses });
  }

  return { miniAnalisis: '', consistenciaVentas: 0, mesesConActividad: 0, promedioMensualIngresos: 0 };
}
