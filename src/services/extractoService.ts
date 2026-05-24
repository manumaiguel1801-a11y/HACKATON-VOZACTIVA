import { GoogleGenAI, Type } from '@google/genai';
import { Sale } from '../types';

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
  ingresosVentas: number;
  ingresosTransferencias: number;
  porcentajeVentas: number;
  transactions: ExtractoTransaction[];
  consistenciaConApp: number; // 0–100
  scoreGeneral: number;       // 0–100
  nivel: 'alto' | 'medio' | 'bajo';
  resumen: string;
}

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY no configurada');
  return new GoogleGenAI({ apiKey: key });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const SCHEMA = {
  responseMimeType: 'application/json' as const,
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      entidad: { type: Type.STRING },
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
    required: ['entidad','transactions'],
  },
};

const PROMPT = `Analiza este extracto bancario colombiano (Nequi, Daviplata, Davivienda, Bancolombia u otro).

Extrae TODAS las transacciones visibles y clasifica cada una con uno de estos tipos exactos:
- "cobro_qr": pago recibido mediante código QR (el cliente escaneó tu QR para pagarte)
- "transferencia_recibida": alguien te envió dinero directamente por su nombre
- "transferencia_enviada": tú enviaste dinero a alguien
- "retiro": retiro de cajero o efectivo
- "pago_servicio": pago de un servicio (recargas, arriendo, servicios públicos)
- "otro": cualquier otra transacción

Reglas para esVentaProbable:
TRUE (es venta) cuando:
  • Aparece "Cobro QR", "Pago QR", "QR" en la descripción
  • Son pagos pequeños de diferentes personas en el mismo día
  • La descripción menciona "cliente", "cobro de negocio", "pago de cliente"
FALSE (NO es venta) cuando:
  • Aparece un nombre propio específico en "Recibiste de [nombre]" o "Te enviaron"
  • Es un monto redondo grande de una sola persona ($50.000, $100.000, $200.000)
  • La descripción dice "préstamo", "te mando", "ayuda", "pa la comida"
  • Es la misma persona que aparece repetidamente

Monto: número entero en pesos colombianos, sin puntos ni $. Solo positivos.
Solo registra transacciones de ingresos (entradas de dinero) y gastos relevantes.
entidad: escríbela en minúsculas ("nequi", "daviplata", "davivienda", "bancolombia", "otro").`;

function crossReferenceWithApp(transactions: ExtractoTransaction[], sales: Sale[]): number {
  if (sales.length === 0) return 50;

  // Group extracto sales by day (parse DD/MM/YYYY)
  const extractoByDay: Record<string, number> = {};
  transactions
    .filter(t => t.esVentaProbable && t.monto > 0)
    .forEach(t => {
      const parts = t.fecha.split('/');
      if (parts.length === 3) {
        const key = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        extractoByDay[key] = (extractoByDay[key] || 0) + t.monto;
      }
    });

  const days = Object.keys(extractoByDay);
  if (days.length === 0) return 40;

  // Group app sales by day
  const appByDay: Record<string, number> = {};
  sales.forEach(s => {
    try {
      const d: Date = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt);
      const key = d.toISOString().split('T')[0];
      appByDay[key] = (appByDay[key] || 0) + s.total;
    } catch {}
  });

  const shared = days.filter(d => appByDay[d]);
  if (shared.length === 0) return 40; // no overlapping days — no evidence either way

  let matches = 0;
  shared.forEach(d => {
    const ratio = Math.min(extractoByDay[d], appByDay[d]) / Math.max(extractoByDay[d], appByDay[d]);
    if (ratio >= 0.4) matches++; // within 60% tolerance
  });

  return Math.round((matches / shared.length) * 100);
}

export async function analyzeExtracto(file: File, sales: Sale[]): Promise<ExtractoAnalysis> {
  const base64   = await fileToBase64(file);
  const mimeType = file.type as any;

  const contents = [{
    role: 'user' as const,
    parts: [
      { inlineData: { mimeType, data: base64 } },
      { text: PROMPT },
    ],
  }];

  const client = getClient();
  let response: any;
  let lastErr: any;

  for (const model of MODELS) {
    try {
      response = await client.models.generateContent({ model, contents, config: SCHEMA });
      break;
    } catch (err: any) {
      console.warn(`[ExtractoService] ${model} falló:`, err?.message);
      lastErr = err;
    }
  }
  if (!response) throw lastErr ?? new Error('No se pudo analizar el extracto');

  const parsed = JSON.parse(response.text || '{}');
  const transactions: ExtractoTransaction[] = (parsed.transactions ?? []).filter((t: any) => t.monto > 0);

  const ingresos = transactions.filter(t =>
    ['cobro_qr','transferencia_recibida','otro'].includes(t.tipo)
  );

  const totalIngresos         = ingresos.reduce((s, t) => s + t.monto, 0);
  const ingresosVentas        = ingresos.filter(t => t.esVentaProbable).reduce((s, t) => s + t.monto, 0);
  const ingresosTransferencias = totalIngresos - ingresosVentas;
  const porcentajeVentas      = totalIngresos > 0 ? Math.round((ingresosVentas / totalIngresos) * 100) : 0;
  const consistenciaConApp    = crossReferenceWithApp(transactions, sales);
  const scoreGeneral          = Math.round(porcentajeVentas * 0.6 + consistenciaConApp * 0.4);
  const nivel: 'alto' | 'medio' | 'bajo' = scoreGeneral >= 65 ? 'alto' : scoreGeneral >= 40 ? 'medio' : 'bajo';

  const entidadLabel: Record<string, string> = {
    nequi: 'Nequi', daviplata: 'Daviplata',
    davivienda: 'Davivienda', bancolombia: 'Bancolombia',
  };
  const entidad = (parsed.entidad ?? 'otro').toLowerCase();
  const label   = entidadLabel[entidad] ?? 'Extracto bancario';

  const resumen = `El ${porcentajeVentas}% de los ingresos de ${label} corresponden a patrones de venta. Consistencia con Voz-Activa: ${consistenciaConApp}%.`;

  return {
    entidad,
    totalIngresos,
    ingresosVentas,
    ingresosTransferencias,
    porcentajeVentas,
    transactions,
    consistenciaConApp,
    scoreGeneral,
    nivel,
    resumen,
  };
}
