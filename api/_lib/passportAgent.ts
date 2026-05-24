import { GoogleGenAI, Type } from '@google/genai';

export interface ExtractoResumen {
  totalIngresos: number;
  totalGastos: number;
  porcentajeVentas: number;
  consistenciaVentas?: number;
  mesesConActividad?: number;
  promedioMensualIngresos?: number;
  passwordUnlocked: boolean;
  miniAnalisis?: string;
}

export interface PassportAgentInput {
  nombre: string;
  scoreFinal: number;
  consistenciaIngresos: number;  // 0–30
  capacidadPago: number;         // 0–25
  gestionFiados: number;         // 0–20
  saludInventario: number;       // 0–15
  calidadDatos: number;          // 0–10
  respaldoBancario: number;      // 0–20
  hasExtracto: boolean;
  totalIngresos: number;
  totalGastos: number;
  businessAgeDays: number;
  extractos: ExtractoResumen[];
}

export interface PassportReport {
  narrativa: string;      // 2-3 oraciones para la sección Certificación del PDF
  fortalezas: string[];   // 2 fortalezas crediticias clave
}

const MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash'];

function scoreLabel(score: number): string {
  if (score < 500) return 'Riesgo alto';
  if (score < 650) return 'En construcción';
  if (score < 750) return 'Aceptable';
  if (score < 850) return 'Bueno';
  return 'Excelente';
}

function pct(v: number, max: number) { return Math.round((v / max) * 100); }

const FUNCTION_DECLARATIONS = [
  {
    name: 'analizar_score',
    description: 'Devuelve el desglose detallado del score crediticio con el nivel de cada factor.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'evaluar_evidencia_bancaria',
    description: 'Devuelve los datos verificados del extracto bancario: ingresos, consistencia y meses de historial.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'calcular_capacidad_credito',
    description: 'Calcula indicadores de capacidad de crédito: margen neto, ingresos mensuales y ratio de endeudamiento.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

function buildToolRunner(input: PassportAgentInput) {
  const best = input.extractos.length > 0
    ? input.extractos.reduce((a, b) => a.totalIngresos > b.totalIngresos ? a : b)
    : null;

  return function runTool(name: string): unknown {
    if (name === 'analizar_score') {
      return {
        score:              input.scoreFinal,
        nivel:              scoreLabel(input.scoreFinal),
        consistencia:       { valor: input.consistenciaIngresos, max: 30, porcentaje: pct(input.consistenciaIngresos, 30) },
        capacidadPago:      { valor: input.capacidadPago,        max: 25, porcentaje: pct(input.capacidadPago, 25) },
        gestionFiados:      { valor: input.gestionFiados,        max: 20, porcentaje: pct(input.gestionFiados, 20) },
        saludInventario:    { valor: input.saludInventario,      max: 15, porcentaje: pct(input.saludInventario, 15) },
        calidadDatos:       { valor: input.calidadDatos,         max: 10, porcentaje: pct(input.calidadDatos, 10) },
        respaldoBancario:   { valor: input.respaldoBancario,     max: 20, porcentaje: pct(input.respaldoBancario, 20) },
        tieneExtracto:      input.hasExtracto,
        antigüedadDias:     input.businessAgeDays,
      };
    }

    if (name === 'evaluar_evidencia_bancaria') {
      if (!best) return { disponible: false };
      return {
        disponible:              true,
        extractosAnalizados:     input.extractos.length,
        pdfsProtegidos:          input.extractos.filter(e => e.passwordUnlocked).length,
        ingresosVerificados:     best.totalIngresos,
        gastosVerificados:       best.totalGastos,
        porcentajeVentas:        best.porcentajeVentas,
        consistenciaVentas:      best.consistenciaVentas ?? null,
        mesesConHistorial:       best.mesesConActividad ?? null,
        promedioMensual:         best.promedioMensualIngresos ?? null,
        analisisAgente:          best.miniAnalisis ?? null,
      };
    }

    if (name === 'calcular_capacidad_credito') {
      const margenNeto = input.totalIngresos > 0
        ? Math.round(((input.totalIngresos - input.totalGastos) / input.totalIngresos) * 100)
        : 0;
      const promedioMensual = best?.promedioMensualIngresos
        ?? (input.totalIngresos > 0 ? Math.round(input.totalIngresos / Math.max(input.businessAgeDays / 30, 1)) : 0);
      const cuotaMaxEstimada = Math.round(promedioMensual * 0.30);
      return {
        margenNetoPct:      margenNeto,
        ingresosMensuales:  promedioMensual,
        cuotaMaxEstimada,
        riesgoAlto:         margenNeto < 10 || input.scoreFinal < 500,
        riesgoMedio:        margenNeto >= 10 && margenNeto < 25 && input.scoreFinal < 650,
        nivelRiesgo:        input.scoreFinal >= 750 ? 'bajo' : input.scoreFinal >= 550 ? 'medio' : 'alto',
      };
    }

    return { error: 'Herramienta no encontrada' };
  };
}

export async function generatePassportReport(input: PassportAgentInput): Promise<PassportReport> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const client = new GoogleGenAI({ apiKey });
  const runTool = buildToolRunner(input);

  const systemInstruction = `Eres un analista crediticio experto en micronegocios colombianos informales.
Tu misión es generar un análisis crediticio personalizado y profesional para el "Pasaporte Financiero Voz-Activa".
El documento se presentará ante bancos, cooperativas y microfinancieras colombianas como prueba alternativa de capacidad de pago.

Usa TODAS las herramientas disponibles para analizar los datos del negocio. Luego responde ÚNICAMENTE con JSON válido:
{
  "narrativa": "2-3 oraciones directas y formales que certifiquen la capacidad crediticia del titular. Incluye: score numérico, ingresos verificados, tiempo de operación y fortaleza principal. No uses markdown.",
  "fortalezas": ["máximo 12 palabras", "máximo 12 palabras"]
}

REGLAS ESTRICTAS:
- Español formal y profesional (es un documento oficial para bancos)
- Menciona el nombre real del titular y cifras reales en COP
- La narrativa debe convencer a un prestamista con datos concretos
- Exactamente 2 fortalezas, cada una ≤ 12 palabras
- Sin markdown, sin asteriscos, sin emojis`;

  const contents: any[] = [
    { role: 'user', parts: [{ text: `Genera el análisis crediticio para ${input.nombre}, score ${input.scoreFinal}.` }] },
  ];

  for (let i = 0; i < 8; i++) {
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
        console.warn(`[PassportAgent] ${model} falló:`, err?.message);
        lastErr = err;
      }
    }
    if (!response) throw lastErr ?? new Error('No se pudo conectar con Gemini');

    const parts: any[] = response.candidates?.[0]?.content?.parts ?? [];
    contents.push({ role: 'model', parts });

    const functionCalls = parts.filter((p: any) => p.functionCall);

    if (functionCalls.length === 0) {
      const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join('');
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const result = JSON.parse(match[0]);
        return {
          narrativa:   result.narrativa  ?? '',
          fortalezas:  Array.isArray(result.fortalezas) ? result.fortalezas.slice(0, 2) : [],
        };
      }
      break;
    }

    const functionResponses = functionCalls.map((p: any) => ({
      functionResponse: { name: p.functionCall.name, response: runTool(p.functionCall.name) },
    }));
    contents.push({ role: 'user', parts: functionResponses });
  }

  // Fallback: narrativa genérica con datos reales
  return {
    narrativa: '',
    fortalezas: [],
  };
}
