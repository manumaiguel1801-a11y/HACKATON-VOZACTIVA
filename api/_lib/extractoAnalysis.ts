import { GoogleGenAI, Type } from '@google/genai';

export interface ExtractoTransaction {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: 'cobro_qr' | 'transferencia_recibida' | 'transferencia_enviada' | 'retiro' | 'pago_servicio' | 'otro';
  remitente?: string;
  esVentaProbable: boolean;
}

export interface ExtractoAnalysis {
  entidad: string;
  totalIngresos: number;
  totalGastos: number;
  ingresosVentas: number;
  ingresosTransferencias: number;
  porcentajeVentas: number;
  transactions: ExtractoTransaction[];
  miniAnalisis: string;
  passwordUnlocked: boolean;
  consistenciaVentas: number;
  mesesConActividad: number;
  promedioMensualIngresos: number;
}

export interface ImagePart {
  data: string;   // base64 sin prefijo data URI
  mimeType: string;
}

const MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash'];

// ─── Vision: extrae transacciones de imágenes ────────────────────────────────

const VISION_SCHEMA = {
  responseMimeType: 'application/json' as const,
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      esExtractoBancario: { type: Type.BOOLEAN },
      motivoRechazo:      { type: Type.STRING },
      entidad:            { type: Type.STRING },
      miniAnalisis:       { type: Type.STRING },
      transactions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            fecha:           { type: Type.STRING },
            descripcion:     { type: Type.STRING },
            monto:           { type: Type.NUMBER },
            tipo:            { type: Type.STRING, enum: ['cobro_qr','transferencia_recibida','transferencia_enviada','retiro','pago_servicio','otro'] },
            remitente:       { type: Type.STRING },
            esVentaProbable: { type: Type.BOOLEAN },
          },
          required: ['fecha','descripcion','monto','tipo','esVentaProbable'],
        },
      },
    },
    required: ['esExtractoBancario'],
  },
};

const VISION_PROMPT = `Eres un analista financiero especializado en documentos bancarios colombianos.

─── PASO 1: VERIFICACIÓN DEL DOCUMENTO ───
Determina si estas imágenes corresponden a un extracto bancario / estado de cuenta con historial de movimientos (Nequi, Daviplata, Davivienda, Bancolombia u otro banco o billetera digital colombiana).

Un extracto válido contiene:
• Lista de múltiples transacciones con fechas y montos
• Saldo disponible o saldo inicial/final
• Nombre del titular o número de cuenta

NO es un extracto si es: comprobante de pago individual, factura, contrato, foto de producto, etc.

Si NO es extracto válido:
→ esExtractoBancario: false
→ motivoRechazo: describe qué tipo de documento es
→ transactions: []
→ miniAnalisis: ""

─── PASO 2: EXTRACCIÓN (solo si es extracto válido) ───
→ esExtractoBancario: true
→ Extrae TODAS las transacciones visibles

Tipos exactos:
- "cobro_qr": pago recibido por código QR
- "transferencia_recibida": alguien te envió dinero
- "transferencia_enviada": tú enviaste dinero
- "retiro": retiro de cajero o efectivo
- "pago_servicio": pago de servicio
- "otro": cualquier otra transacción

esVentaProbable = true: cobros QR, pagos de clientes, múltiples pagos pequeños en el mismo día
esVentaProbable = false: nombre propio enviando dinero, montos redondos grandes, "préstamo", "ayuda"

monto: entero en pesos colombianos, sin puntos ni $. Solo positivos.
entidad: "nequi", "daviplata", "davivienda", "bancolombia" o "otro".

─── PASO 3: MINI ANÁLISIS (solo si es extracto válido) ───
En el campo miniAnalisis escribe 2-3 oraciones cortas y directas sobre el comportamiento financiero del extracto.
Incluye: total de ingresos vs gastos/retiros, si predominan cobros QR o transferencias, y algún patrón relevante (frecuencia, montos típicos).
Usa cifras reales del extracto. Español colombiano directo, sin rodeos.`;

// ─── Agente: analiza métricas de transacciones ya extraídas ─────────────────

const AGENT_FUNCTION_DECLARATIONS = [
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

function parseTxDates(txs: ExtractoTransaction[]): Date[] {
  return txs
    .map(t => {
      const raw = t.fecha;
      if (!raw) return null;
      const ddmm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (ddmm) return new Date(`${ddmm[3]}-${ddmm[2].padStart(2,'0')}-${ddmm[1].padStart(2,'0')}`);
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    })
    .filter((d): d is Date => d !== null);
}

function buildToolRunner(transactions: ExtractoTransaction[]) {
  const ingresos = transactions.filter(t => ['cobro_qr','transferencia_recibida','otro'].includes(t.tipo));
  const gastos   = transactions.filter(t => ['transferencia_enviada','retiro','pago_servicio'].includes(t.tipo));
  const totalI   = ingresos.reduce((s, t) => s + t.monto, 0);
  const totalG   = gastos.reduce((s, t) => s + t.monto, 0);

  return function runTool(name: string): unknown {
    if (name === 'get_income_metrics') {
      const ventasQR  = ingresos.filter(t => t.esVentaProbable);
      const montosQR  = ventasQR.reduce((s, t) => s + t.monto, 0);
      return {
        total_ingresos:          totalI,
        ingresos_qr_ventas:      montosQR,
        ingresos_transferencias: totalI - montosQR,
        porcentaje_ventas_qr:    totalI > 0 ? Math.round(montosQR / totalI * 100) : 0,
        num_cobros_qr:           ventasQR.length,
        monto_promedio_cobro:    ventasQR.length > 0 ? Math.round(montosQR / ventasQR.length) : 0,
      };
    }
    if (name === 'get_expense_metrics') {
      const retiros   = gastos.filter(t => t.tipo === 'retiro').reduce((s, t) => s + t.monto, 0);
      const enviados  = gastos.filter(t => t.tipo === 'transferencia_enviada').reduce((s, t) => s + t.monto, 0);
      const servicios = gastos.filter(t => t.tipo === 'pago_servicio').reduce((s, t) => s + t.monto, 0);
      return {
        total_gastos:            totalG,
        retiros,
        transferencias_enviadas: enviados,
        pagos_servicios:         servicios,
        ratio_gastos_sobre_ingr: totalI > 0 ? Math.round(totalG / totalI * 100) : 0,
      };
    }
    if (name === 'get_activity_patterns') {
      const allDates   = parseTxDates(transactions);
      const ingDates   = parseTxDates(ingresos);
      const uniqueDays = new Set(allDates.map(d => d.toDateString())).size;
      const ingDays    = new Set(ingDates.map(d => d.toDateString())).size;
      const meses      = new Set(allDates.map(d => `${d.getFullYear()}-${d.getMonth()}`)).size;
      const semanas    = new Set(allDates.map(d => {
        const s = new Date(d); s.setDate(d.getDate() - d.getDay()); return s.toDateString();
      })).size;
      return {
        dias_con_actividad:  uniqueDays,
        dias_con_ingresos:   ingDays,
        meses_con_actividad: meses,
        semanas_activas:     semanas,
        consistencia_pct:    uniqueDays > 0 ? Math.round(ingDays / uniqueDays * 100) : 0,
        total_transacciones: transactions.length,
      };
    }
    if (name === 'get_cash_flow_metrics') {
      const allDates  = parseTxDates(transactions);
      const meses     = new Set(allDates.map(d => `${d.getFullYear()}-${d.getMonth()}`)).size || 1;
      const flujoNeto = totalI - totalG;
      return {
        flujo_neto:                flujoNeto,
        ratio_ahorro_pct:          totalI > 0 ? Math.round(flujoNeto / totalI * 100) : 0,
        promedio_mensual_ingresos: Math.round(totalI / meses),
        meses_cubiertos:           meses,
        evaluacion: flujoNeto / Math.max(totalI, 1) >= 0.3 ? 'saludable' : flujoNeto >= 0 ? 'ajustado' : 'deficit',
      };
    }
    return { error: 'Herramienta no encontrada' };
  };
}

async function runAgentAnalysis(
  transactions: ExtractoTransaction[],
  entidad: string,
  client: GoogleGenAI,
): Promise<{ miniAnalisis: string; consistenciaVentas: number; mesesConActividad: number; promedioMensualIngresos: number }> {
  if (transactions.length === 0) {
    return { miniAnalisis: '', consistenciaVentas: 0, mesesConActividad: 0, promedioMensualIngresos: 0 };
  }

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
            tools: [{ functionDeclarations: AGENT_FUNCTION_DECLARATIONS }],
          },
        });
        break;
      } catch (err: any) {
        console.warn(`[ExtractoAgent] ${model} falló:`, err?.message ?? err);
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

    const functionResponses = functionCalls.map((p: any) => ({
      functionResponse: { name: p.functionCall.name, response: runTool(p.functionCall.name) },
    }));
    contents.push({ role: 'user', parts: functionResponses });
  }

  return { miniAnalisis: '', consistenciaVentas: 0, mesesConActividad: 0, promedioMensualIngresos: 0 };
}

// ─── Punto de entrada público ─────────────────────────────────────────────────

export async function analyzeExtractoFull(
  images: ImagePart[],
  wasLocked: boolean,
): Promise<ExtractoAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada en el servidor');

  const client = new GoogleGenAI({ apiKey });

  // Fase 1: visión — extrae transacciones de las imágenes
  const imageParts = images.map(img => ({
    inlineData: { mimeType: img.mimeType, data: img.data },
  }));
  const contents = [{ role: 'user' as const, parts: [...imageParts, { text: VISION_PROMPT }] }];

  let response: any;
  let lastErr: any;
  for (const model of MODELS) {
    try {
      response = await client.models.generateContent({ model, contents, config: VISION_SCHEMA });
      break;
    } catch (err: any) {
      console.warn(`[ExtractoAnalysis] Vision ${model} falló:`, err?.message);
      lastErr = err;
    }
  }
  if (!response) throw lastErr ?? new Error('No se pudo analizar el extracto. Intenta de nuevo.');

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch {
    throw new Error('La IA no pudo interpretar el archivo. Intenta de nuevo.');
  }

  if (parsed.esExtractoBancario === false) {
    const motivo = parsed.motivoRechazo?.trim() || 'No contiene un historial de movimientos bancarios';
    throw new Error(
      `Este archivo no es un extracto bancario válido. ${motivo}. Sube el PDF de tus movimientos de cuenta.`,
    );
  }

  const transactions: ExtractoTransaction[] = (parsed.transactions ?? []).filter((t: any) => t.monto > 0);
  const entidad = (parsed.entidad ?? 'otro').toLowerCase();

  const ingresos               = transactions.filter(t => ['cobro_qr','transferencia_recibida','otro'].includes(t.tipo));
  const salidas                = transactions.filter(t => ['transferencia_enviada','retiro','pago_servicio'].includes(t.tipo));
  const totalIngresos          = ingresos.reduce((s, t) => s + t.monto, 0);
  const totalGastos            = salidas.reduce((s, t) => s + t.monto, 0);
  const ingresosVentas         = ingresos.filter(t => t.esVentaProbable).reduce((s, t) => s + t.monto, 0);
  const ingresosTransferencias = totalIngresos - ingresosVentas;
  const porcentajeVentas       = totalIngresos > 0 ? Math.round((ingresosVentas / totalIngresos) * 100) : 0;

  // Fase 2: agente — analiza métricas y genera mini análisis
  const agentResult = await runAgentAnalysis(transactions, entidad, client);

  return {
    entidad,
    totalIngresos,
    totalGastos,
    ingresosVentas,
    ingresosTransferencias,
    porcentajeVentas,
    transactions,
    miniAnalisis:            agentResult.miniAnalisis,
    passwordUnlocked:        wasLocked,
    consistenciaVentas:      agentResult.consistenciaVentas,
    mesesConActividad:       agentResult.mesesConActividad,
    promedioMensualIngresos: agentResult.promedioMensualIngresos,
  };
}
