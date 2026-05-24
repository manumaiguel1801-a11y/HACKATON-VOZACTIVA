import { GoogleGenAI } from '@google/genai';
import { Sale, Expense } from '../types';

export type ReportPeriod = '1d' | '7d' | '14d' | '21d' | 'mes';

export const PERIOD_CONFIG: Record<ReportPeriod, { label: string; sub: string; days: number | null }> = {
  '1d': { label: 'Hoy', sub: 'Solo hoy', days: 1 },
  '7d': { label: 'Esta semana', sub: 'Últimos 7 días', days: 7 },
  '14d': { label: '2 semanas', sub: 'Últimos 14 días', days: 14 },
  '21d': { label: '3 semanas', sub: 'Últimos 21 días', days: 21 },
  'mes': { label: 'Este mes', sub: 'Mes en curso', days: null },
};

export interface ReportSection {
  title: string;
  emoji: string;
  content: string;
}

export interface ParsedReport {
  sections: ReportSection[];
  raw: string;
}

const SECTION_MAP: { key: string; emoji: string; title: string }[] = [
  { key: 'DESCRIPCIÓN DEL NEGOCIO', emoji: '🧾', title: 'Descripción del negocio' },
  { key: 'RESUMEN FINANCIERO', emoji: '💰', title: 'Resumen financiero' },
  { key: 'ANÁLISIS INTELIGENTE', emoji: '📊', title: 'Análisis inteligente' },
  { key: 'RECOMENDACIONES PERSONALIZADAS', emoji: '🎯', title: 'Recomendaciones' },
  { key: 'CONCLUSIÓN', emoji: '📌', title: 'Conclusión' },
];

export function parseReport(raw: string): ParsedReport {
  const sections: ReportSection[] = [];
  const parts = raw.split(/###\s*/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const lineBreak = trimmed.indexOf('\n');
    const heading = lineBreak === -1 ? trimmed : trimmed.slice(0, lineBreak).trim();
    const content = lineBreak === -1 ? '' : trimmed.slice(lineBreak).trim();
    const match = SECTION_MAP.find(s => heading.toUpperCase().includes(s.key));
    if (match) {
      sections.push({ title: match.title, emoji: match.emoji, content });
    }
  }
  return { sections, raw };
}

function getSaleDate(s: Sale): Date {
  return s.createdAt?.toDate ? s.createdAt.toDate() : new Date();
}
function getExpenseDate(e: Expense): Date {
  return e.createdAt?.toDate ? e.createdAt.toDate() : new Date();
}

function buildPrompt(
  sales: Sale[],
  expenses: Expense[],
  period: ReportPeriod,
  userName?: string,
): string {
  const now = new Date();
  let start: Date;
  let periodoLabel: string;

  const cfg = PERIOD_CONFIG[period];
  if (cfg.days !== null) {
    start = new Date(now.getTime() - cfg.days * 24 * 3600 * 1000);
    periodoLabel = `${cfg.label} (${start.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} – ${now.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })})`;
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    periodoLabel = now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    periodoLabel = periodoLabel.charAt(0).toUpperCase() + periodoLabel.slice(1);
  }

  const filteredSales = sales.filter(s => getSaleDate(s) >= start);
  const filteredExpenses = expenses.filter(e => getExpenseDate(e) >= start);

  const ingresos = filteredSales.reduce((sum, s) => sum + s.total, 0);
  const gastos = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const utilidad = ingresos - gastos;
  const transacciones = filteredSales.length + filteredExpenses.length;

  // Top products
  const productMap = new Map<string, { qty: number; total: number }>();
  filteredSales.forEach(s => {
    if (s.items?.length) {
      s.items.forEach(item => {
        const p = productMap.get(item.product) ?? { qty: 0, total: 0 };
        productMap.set(item.product, { qty: p.qty + item.quantity, total: p.total + item.subtotal });
      });
    } else {
      const name = s.concept ?? s.product ?? 'Producto';
      const p = productMap.get(name) ?? { qty: 0, total: 0 };
      productMap.set(name, { qty: p.qty + 1, total: p.total + s.total });
    }
  });
  const productosText = [...productMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5)
    .map(([name, { qty, total }]) => `- ${name}: ${qty} unidades, $${total.toLocaleString('es-CO')}`)
    .join('\n') || 'Sin ventas registradas en el periodo.';

  // Expense breakdown
  const expenseMap = new Map<string, number>();
  filteredExpenses.forEach(e => {
    expenseMap.set(e.concept, (expenseMap.get(e.concept) ?? 0) + e.amount);
  });
  const gastosDetalleText = [...expenseMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([concept, amount]) => `- ${concept}: $${amount.toLocaleString('es-CO')}`)
    .join('\n') || 'Sin gastos registrados en el periodo.';

  const fmt = (v: number) => `$${v.toLocaleString('es-CO')}`;
  const negocio = userName ? `Negocio de ${userName}` : 'Mi Negocio';

  return `Eres un analista financiero experto en pequeños negocios informales en Latinoamérica.

Tu tarea es generar un REPORTE FINANCIERO PROFESIONAL en español, claro, directo y útil, basado en los datos proporcionados.

El reporte será usado para generar un PDF formal, por lo tanto:
- Usa un tono profesional pero fácil de entender
- No uses lenguaje técnico complicado
- Sé concreto, evita párrafos largos
- Enfócate en ayudar al usuario a tomar decisiones reales

## DATOS DEL NEGOCIO

Nombre del negocio: ${negocio}
Periodo analizado: ${periodoLabel}

Ingresos totales: ${fmt(ingresos)}
Gastos totales: ${fmt(gastos)}
Utilidad neta: ${fmt(utilidad)}
Número de transacciones: ${transacciones}

Detalle de productos más vendidos:
${productosText}

Detalle de gastos (categorías):
${gastosDetalleText}

## INSTRUCCIONES

Genera el reporte con la siguiente estructura EXACTA (usa exactamente estos encabezados ### con sus emojis):

### 🧾 DESCRIPCIÓN DEL NEGOCIO
Escribe un breve párrafo (2-3 líneas) describiendo el tipo de negocio basado en los datos.

### 💰 RESUMEN FINANCIERO
Haz un resumen claro de si el negocio está ganando o perdiendo dinero y qué tan grave o positivo es el resultado. Máximo 2-3 líneas.

### 📊 ANÁLISIS INTELIGENTE
Escribe 3 a 4 insights CLAROS y DIRECTOS como lista con guión (-). Identifica gastos, producto estrella, patrones y posibles problemas.

### 🎯 RECOMENDACIONES PERSONALIZADAS
Escribe 3 recomendaciones PRÁCTICAS y ACCIONABLES como lista con guión (-). Basadas en los datos, concretas, dicen exactamente qué hacer.

### 📌 CONCLUSIÓN
Una sola frase clara y contundente sobre el estado del negocio.

## REGLAS
- No inventes datos
- No repitas información innecesaria
- No escribas párrafos largos
- Sé directo, útil y accionable`;
}

const REPORT_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

export async function generateFinancialReport(
  sales: Sale[],
  expenses: Expense[],
  period: ReportPeriod,
  userName?: string,
): Promise<ParsedReport> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('No hay GEMINI_API_KEY configurada');

  const client = new GoogleGenAI({ apiKey: key });
  const prompt = buildPrompt(sales, expenses, period, userName);

  const contents = [{ role: 'user', parts: [{ text: prompt }] }];

  for (const model of REPORT_MODELS) {
    try {
      const response = await client.models.generateContent({ model, contents } as any);
      const raw = (response.text ?? '').trim();
      if (!raw) continue;
      return parseReport(raw);
    } catch (err: any) {
      console.warn(`[Report] ${model} falló:`, err?.message ?? err);
    }
  }
  throw new Error('No se pudo generar el reporte. Intenta de nuevo.');
}
