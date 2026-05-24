import { GoogleGenAI, Type } from '@google/genai';
import { Meta, ConsejeroMessage } from '../types';
import { FinancialContext } from './financialAnalysis';
import { generateConsejeroResponse } from '../agentes/consejeroAgente';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// gemini-2.5-flash para todo — soporta streaming SSE y es gratuito
const MODEL_FAST = 'gemini-2.0-flash';
const MODEL_BEST = 'gemini-1.5-pro';

export function getUnconfirmedDays(meta: Meta): string[] {
  return (meta.registros || [])
    .filter(r => r.estado === 'sin_confirmar')
    .map(r => r.fecha);
}

export function selectModel(
  message: string,
  meta: Meta | null,
  isProactive: boolean
): string {
  if (isProactive) {
    return meta && getUnconfirmedDays(meta).length >= 7 ? MODEL_BEST : MODEL_FAST;
  }

  const lower = message.toLowerCase();

  // Primera vez definiendo meta con intención clara
  const goalKeywords = ['quiero', 'meta', 'ahorrar', 'comprar', 'juntar', 'guardar', 'necesito'];
  if (!meta && goalKeywords.filter(k => lower.includes(k)).length >= 2) return MODEL_BEST;

  // Situación compleja o solicitud de plan
  const complexKeywords = [
    'no pude', 'no alcancé', 'problema', 'difícil', 'bajaron', 'enfermé',
    'gasté', 'complicado', 'no alcanza', 'plan', 'opciones', 'qué hago',
    'reajustar', 'cambiar', 'ajustar',
  ];
  if (complexKeywords.some(k => lower.includes(k))) return MODEL_BEST;

  return MODEL_FAST;
}

function fmt(n: number): string {
  return `$${n.toLocaleString('es-CO')}`;
}

function buildChecklist(meta: Meta | null, ctx: FinancialContext): string {
  if (!meta) return 'Sin meta activa.';

  const today = new Date();
  const fechaObj = meta.fechaObjetivo?.toDate
    ? meta.fechaObjetivo.toDate()
    : new Date(meta.fechaObjetivo);

  const diasRestantes = Math.max(
    0,
    Math.ceil((fechaObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  );
  const pct = Math.round((meta.montoAhorrado / meta.montoObjetivo) * 100);
  const montoFaltante = Math.max(0, meta.montoObjetivo - meta.montoAhorrado);

  const unconfirmed = getUnconfirmedDays(meta);
  const sinConfirmar = unconfirmed.length;
  const conActividad = unconfirmed.filter(f => ctx.diasConActividadSet.has(f));
  const sinActividad = unconfirmed.filter(f => !ctx.diasConActividadSet.has(f));

  const ahorroDiarioNecesario =
    diasRestantes > 0 ? Math.ceil(montoFaltante / diasRestantes) : montoFaltante;

  const diasParaLlegar = meta.ahorroDiario > 0
    ? Math.ceil(montoFaltante / meta.ahorroDiario)
    : 9999;
  const nuevaFechaEstimada = new Date(today);
  nuevaFechaEstimada.setDate(today.getDate() + diasParaLlegar);

  const localDate = (d: Date) =>
    d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long' });

  let checklist = `CHECKLIST DE SEGUIMIENTO (hoy: ${today.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}):
✅ Meta activa: "${meta.nombre}" — ${fmt(meta.montoObjetivo)} objetivo
✅ Ahorrado: ${fmt(meta.montoAhorrado)} (${pct}%) — acordado: ${fmt(meta.ahorroDiario)}/día
${sinConfirmar > 0 ? `❌ Días sin confirmar ahorro: ${sinConfirmar} días consecutivos` : '✅ Ahorro al día'}`;

  if (conActividad.length > 0) {
    checklist += `\n🔍 De esos ${sinConfirmar} días, ${conActividad.length} tuvo actividad en la app → posible olvido de registro, no necesariamente incumplimiento`;
  }
  if (sinActividad.length > 0) {
    checklist += `\n📵 ${sinActividad.length} día(s) sin ninguna actividad en la app`;
  }

  checklist += `\n📉 Para llegar a tiempo: ${fmt(ahorroDiarioNecesario)}/día (acordado: ${fmt(meta.ahorroDiario)}/día)`;

  if (sinConfirmar >= 3) {
    checklist += `\n⏳ Al ritmo actual llegaría el ${localDate(nuevaFechaEstimada)} en vez del ${localDate(fechaObj)}`;
  }

  if (sinConfirmar >= 7) {
    const nuevoPlazoFecha = new Date(fechaObj);
    nuevoPlazoFecha.setDate(fechaObj.getDate() + sinConfirmar + 5);

    const nuevosRest = diasRestantes + sinConfirmar + 10;
    const ahorroCortado = Math.max(
      Math.ceil(montoFaltante / nuevosRest),
      Math.round(ctx.capacidadAhorroDiaria * 0.7)
    );

    checklist += `\n\n📋 OPCIONES DE REAJUSTE:
   → Alargar plazo: nueva fecha ${localDate(nuevoPlazoFecha)} con ${fmt(meta.ahorroDiario)}/día
   → Reducir ahorro: ${fmt(ahorroCortado)}/día (plazo se alarga)`;

    if (ctx.totalFiadosPendientes > 0) {
      const top = ctx.fiadosPendientes[0];
      checklist += `\n   → Cobrar fiados: ${top.nombre} debe ${fmt(top.monto)} (hace ${top.diasPendiente} días)`;
    }

    checklist += `\n❓ PENDIENTE: preguntar con empatía qué pasó. NO regañar.`;
  }

  return checklist;
}

export function buildSystemPrompt(
  firstName: string,
  ctx: FinancialContext,
  meta: Meta | null
): string {
  const f = (n: number) => n.toLocaleString('es-CO');
  const sign = ctx.porcentajeCambioVentas >= 0 ? '+' : '';

  const contextBlock = `CONTEXTO FINANCIERO DE ${firstName.toUpperCase()} (datos reales):
Promedios últimos 14 días:
- Ventas diarias: $${f(ctx.promedioVentasDiario)}
- Gastos diarios: $${f(ctx.promedioGastosDiario)}
- Ganancia neta estimada: $${f(ctx.gananciaNetaDiaria)}/día

Tendencia semanal: ${ctx.tendenciaVentas} (${sign}${ctx.porcentajeCambioVentas}%)
Esta semana: $${f(ctx.ventasEstaSemana)} | Semana pasada: $${f(ctx.ventasSemanaAnterior)}

Mejor día: ${ctx.mejorDia} | Peor día: ${ctx.peorDia}
${ctx.productoMasRentable ? `Producto más rentable: ${ctx.productoMasRentable} (margen ${ctx.margenProducto}%)` : 'Sin inventario registrado aún'}

Fiados pendientes (le deben):
${ctx.fiadosPendientes.length > 0
  ? ctx.fiadosPendientes.map(fp => `- ${fp.nombre}: $${f(fp.monto)} (hace ${fp.diasPendiente} días)`).join('\n')
  : '- Sin fiados pendientes'}
Total: $${f(ctx.totalFiadosPendientes)}

Capacidad estimada de ahorro diario: $${f(ctx.capacidadAhorroDiaria)}
Racha registrando: ${ctx.rachaDiasRegistrando} días consecutivos

ALERTAS:
${ctx.ventasBajaron30 ? '⚠️ Ventas bajaron más del 30% vs semana pasada' : ''}
${ctx.fiadoMas30Dias ? '⚠️ Hay fiado(s) de más de 30 días sin cobrar' : ''}
${ctx.ratioGastosAlto ? '⚠️ Gastos superan el 85% de ingresos — margen muy apretado' : ''}
${ctx.rachaPositiva7 ? '🎉 Lleva 7+ días registrando — racha positiva' : ''}`.trimEnd();

  const checklist = buildChecklist(meta, ctx);

  return `Eres el Consejero de ${firstName}, el asesor financiero de confianza de Voz Activa — una app para microempresarios y vendedores informales colombianos.

${contextBlock}

${checklist}

REGLAS:
1. Español colombiano natural. Cercano y serio — como un asesor de confianza, no un banco ni una app gringa.
2. NUNCA regañes al usuario por no cumplir. La vida del vendedor informal es impredecible.
3. Respuestas cortas en el día a día (máx 3-4 oraciones). Solo detallas cuando piden un plan.
4. Cuando hay malas noticias, di la verdad y SIEMPRE da al menos una salida concreta.
5. Si el usuario explica una dificultad, muestra empatía PRIMERO, luego propone ajustes.
6. Si el checklist indica actividad en días sin confirmar, pregunta si fue olvido de registro — no asumas incumplimiento.
7. Celebra logros con entusiasmo genuino: rachas, hitos 25/50/75%, meta completada.
8. Usa pesos colombianos. Sé específico: no digas "un poco más", di "$12.000 más".
9. Al proponer reajuste, siempre da números reales calculados con el contexto actual.

ACCIÓN ESPECIAL — CREAR META:
Cuando en la conversación quede claro el nombre/propósito, el monto objetivo y el plazo en días de una meta de ahorro, y el usuario lo haya confirmado (o lo haya dicho de una vez), incluye AL FINAL de tu respuesta — después de tu texto normal — exactamente este marcador en una línea aparte:
[CREAR_META:{"nombre":"...","montoObjetivo":...,"dias":...}]
- "nombre": propósito breve, ej: "nevera nueva", "moto", "arriendo del local"
- "montoObjetivo": número entero en pesos colombianos
- "dias": número entero de días
Conversiones: "2 meses"=60, "3 meses"=90, "mes y medio"=45, "500k"/"500 mil"/"500 lucas"=500000, "1 millón"=1000000.
Solo incluye el marcador cuando tengas los 3 datos completos y confirmados. Si el usuario no ha dado el plazo, pregúntaselo antes de incluir el marcador.`;
}

const META_MARKER_RE = /\[CREAR_META:(\{[^}]+\})\]/;

export function parseMetaFromResponse(response: string): {
  cleanText: string;
  meta: { nombre: string; montoObjetivo: number; dias: number } | null;
} {
  const match = response.match(META_MARKER_RE);
  if (!match) return { cleanText: response, meta: null };

  const cleanText = response.replace(match[0], '').trim();
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.nombre && parsed.montoObjetivo > 0 && parsed.dias > 0) {
      return {
        cleanText,
        meta: {
          nombre: String(parsed.nombre),
          montoObjetivo: Number(parsed.montoObjetivo),
          dias: Math.round(Number(parsed.dias)),
        },
      };
    }
  } catch {
    // marcador malformado — ignorar
  }
  return { cleanText, meta: null };
}

export async function sendMessageToConsejero(
  userMessage: string,
  history: ConsejeroMessage[],
  ctx: FinancialContext,
  meta: Meta | null,
  firstName: string,
  isProactive: boolean,
  onChunk: (text: string) => void
): Promise<string> {
  try {
    // Intentamos usar el agente avanzado (Claude)
    const response = await generateConsejeroResponse(
      userMessage,
      history,
      ctx,
      meta,
      firstName,
      (step) => onChunk('') // Opcionalmente podrías mostrar pasos
    );
    
    // Simulamos streaming para el UI
    for (let i = 0; i < response.length; i += 5) {
      onChunk(response.slice(i, i + 5));
      await new Promise(r => setTimeout(r, 10));
    }
    
    return response;
  } catch (err) {
    console.error('Error en agente Claude, usando fallback Gemini:', err);
    
    // FALLBACK: Mantener la lógica original con Gemini
    const model = selectModel(userMessage, meta, isProactive);
    const systemPrompt = buildSystemPrompt(firstName, ctx, meta);

    const contents = [
      ...history.slice(-30).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      ...(userMessage ? [{ role: 'user', parts: [{ text: userMessage }] }] : []),
    ];

    let fullText = '';
    const stream = await ai.models.generateContentStream({
      model,
      contents,
      config: { systemInstruction: systemPrompt },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        fullText += text;
        onChunk(text);
      }
    }
    return fullText;
  }
}
