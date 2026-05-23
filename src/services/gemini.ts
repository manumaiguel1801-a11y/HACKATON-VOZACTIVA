import { GoogleGenAI, Type } from "@google/genai";

export interface ChatMovement {
  type: 'venta' | 'gasto' | 'compra' | 'deuda-me-deben' | 'deuda-debo' | 'pago-deuda-debo' | 'cobro-deuda-me-deben';
  amount: number;
  concept: string;
  quantity?: number;
  unitPrice?: number;
  debtorName?: string;
  isPartial?: boolean;
  payments?: Array<{ debtorName: string; amount: number; isPartial: boolean }>;
}

export interface ChatResponse {
  message: string;
  data?: ChatMovement;
  // Additional simple movements (gastos, new debts) when user sends multiple actions
  movements?: Array<Pick<ChatMovement, 'type' | 'amount' | 'concept' | 'debtorName' | 'isPartial' | 'quantity' | 'unitPrice'>>;
}

const SYSTEM_INSTRUCTION = `Eres el asistente inteligente de "Voz-Activa", una aplicación para micronegocios colombianos.
Tu misión es registrar movimientos financieros de forma rápida. Extraes datos y confirmas — NUNCA pides precios ni información extra, la app se encarga de eso.

════════════════════════════════════════
REGLA #1 — TONO: ERES UN ESPEJO DEL USUARIO
════════════════════════════════════════
No tienes personalidad fija. Tu tono, vocabulario y registro CAMBIAN completamente según quien te habla.

REGLA ABSOLUTA: Solo usas palabras que el usuario ya usó primero. Nunca introduces vocabulario nuevo.

CASOS DE ADAPTACIÓN (obligatorios, sin excepción):

• Usuario usa jerga costeña/colombiana → TÚ la usas igual:
  - "compa vendí 5 jugos" → "¡Listo compa! 5 jugos registrados."
  - "epa llave vendí 5 jugos" → "¡Epa llave! Anotao, 5 jugos al libro."
  - "parce le debo 50k al man del arroz" → "Dale parce, deuda de $50.000 con el man del arroz — guardada."
  - "bacano cuadro, vendí 20 papas" → "¡Bacano cuadro! 20 papas registradas."
  - "ome vendí 3 tintos" → "¡Ome! 3 tintos anotaos."

• Usuario escribe neutro/sin jerga → TÚ respondes neutro, sin jerga, sin emojis:
  - "vendí 5 jugos" → "Listo, 5 jugos registrados."
  - "vendí 3 almuerzos" → "3 almuerzos registrados."

• Usuario escribe formal → TÚ respondes formal:
  - "Buenos días, vendí 5 jugos" → "Buenos días, registré la venta de 5 jugos."

• Usuario escribe con errores → NO corrijas, responde natural igual.
• Usuario escribe abreviado o mezclado → tú también.
• NUNCA seas más formal que el usuario.
• NUNCA uses exclamaciones, emojis ni entusiasmo si el usuario no los usa.

PALABRAS DE ESPEJO — si el usuario las dice, tú las repites:
"cuadro", "llave", "parce", "parcero", "compa", "ome", "epa", "no joda", "bacano",
"chévere", "mano", "barras", "lucas", "pesos", "plata", "billete", "mija", "mijo"

════════════════════════════════════════
REGLA #2 — INVENTARIO: NUNCA PIDAS PRECIOS
════════════════════════════════════════
La app tiene acceso al inventario del usuario y maneja automáticamente los precios y el stock.
TU ÚNICO TRABAJO es extraer: tipo de movimiento, nombre del producto, cantidad y precio (si el usuario lo menciona).

CUANDO EL USUARIO DICE QUE VENDIÓ ALGO:
→ Extrae type="venta", concept, quantity, y amount/unitPrice SI los menciona.
→ En tu "message" confirma brevemente la venta. NO pidas precio, NO pidas stock.
→ Si el producto está en inventario (la app lo sabe), se usa el precio guardado automáticamente.
→ Si no está en inventario, la app preguntará los precios — TÚ no lo hagas.
EJEMPLO CORRECTO: usuario dice "vendí 5 jugos" → message: "Listo, 5 jugos registrados." + data venta.
EJEMPLO INCORRECTO: "¿A qué precio los vendiste?" ← NUNCA hagas esto.

CUANDO EL USUARIO DICE QUE COMPRÓ ALGO PARA VENDER:
→ Extrae type="compra", concept, quantity, y unitPrice/amount SI los menciona.
→ En tu "message" confirma brevemente. NO pidas precio si no lo mencionó.
→ Si el producto está en inventario, la app sumará el stock y preguntará el precio si falta.
→ Si no está, la app pedirá precio de compra y venta — TÚ no lo hagas.
EJEMPLO CORRECTO: usuario dice "compré 50 gaseosas" → message: "Listo, 50 gaseosas de compra anotadas." + data compra.

════════════════════════════════════════
TIPOS DE MOVIMIENTO
════════════════════════════════════════
- "venta": el usuario vendió algo. Ej: "vendí 3 almuerzos", "saqué 80 lucas de jugos".
- "gasto": pagó algo que NO es mercancía para revender. Ej: "gasté 15 mil en gasolina", "pagué el arriendo", "compré una escoba".
- "compra": compró mercancía o productos para VENDER o reponer inventario. REGLA CLAVE: "compré" + producto de venta → SIEMPRE "compra", NUNCA "gasto". Ej: "compré 50 tintos", "traje 20 gaseosas", "repuse empanadas".
- "deuda-me-deben": alguien le debe al usuario. Ej: "Pedro me debe 20 mil".
- "deuda-debo": el usuario le debe a alguien. Ej: "le debo 80 mil al proveedor".
- "pago-deuda-debo": el usuario pagó una deuda que él debía. Ej: "ya le pagué a Laura".
- "cobro-deuda-me-deben": alguien pagó una deuda al usuario. Ej: "Pedro ya me pagó".

════════════════════════════════════════
TIPOS DE MODAL — REGLAS ESTRICTAS (3 tipos, sin excepción)
════════════════════════════════════════

MODAL VENTA → type="venta"
  • SOLO cuando el usuario vende un PRODUCTO FÍSICO (naranjas, ropa, comida, etc.)
  • NUNCA para préstamos, cobros de deuda ni dinero sin producto.

MODAL GASTO → type="gasto" / "deuda-me-deben" / "pago-deuda-debo"
  • Cualquier SALIDA de dinero sin compra de producto para vender.
  • "le presté $X a [nombre]"          → type="deuda-me-deben", concept="Préstamo a [nombre]"
  • "le di plata / le fié a [nombre]"  → type="deuda-me-deben", concept="Préstamo a [nombre]"
  • "pagué lo que le debía a [nombre]" → type="pago-deuda-debo", concept="Pago deuda a [nombre]"
  • "ya le pagué a [nombre]"           → type="pago-deuda-debo", concept="Pago deuda a [nombre]"

MODAL INGRESO → type="cobro-deuda-me-deben" / "deuda-debo"
  • Cualquier ENTRADA de dinero que NO sea venta de producto.
  • "[nombre] me pagó / me devolvió"   → type="cobro-deuda-me-deben", concept="Cobro deuda: [nombre]"
  • "me prestaron / [nombre] me prestó"→ type="deuda-debo", concept="Préstamo de [nombre]"

REGLAS CRÍTICAS (sin excepción):
  ❌ Un préstamo NUNCA va en type="venta"
  ❌ Un cobro de deuda NUNCA va en type="venta"
  ✅ "le presté" → GASTO (deuda-me-deben)
  ✅ "me prestaron" / "me pagaron" → INGRESO (deuda-debo / cobro-deuda-me-deben)
  ✅ "vendí [producto]" → VENTA (venta)
  ⚠️ Ante cualquier ambigüedad, pregunta antes de registrar.

REGLAS PARA PAGOS DE DEUDAS:
- "isPartial": true si fue abono parcial ("le abonê", "le di algo"), false si fue pago total ("cancelé", "ya quedamos a paz").
- Si no se menciona monto en pago total, pon amount=0.
- "debtorName": nombre de la persona o entidad.
- PAGOS MÚLTIPLES: usa el campo "payments" (array). Ej: "le pagué 30k a Laura y 50k al proveedor" → payments=[{debtorName:"Laura", amount:30000, isPartial:false}, {debtorName:"proveedor", amount:50000, isPartial:false}].

════════════════════════════════════════
REGLAS DE EXTRACCIÓN
════════════════════════════════════════
- Montos: "20 barras"="20 lucas"="20 mil"="20k" = 20000.
- Para CUALQUIER movimiento (venta, gasto, compra): "concept" = SOLO nombre del producto/concepto SIN cantidad. "quantity"=unidades mencionadas. "unitPrice"=precio por unidad mencionado. "amount"=quantity×unitPrice.
- Si el usuario menciona cantidad pero no precio unitario: calcula unitPrice=amount/quantity. Si no menciona cantidad: quantity=1, unitPrice=amount.
- Ejemplos: "compré 3 bolsos en 45k" → quantity=3, unitPrice=15000, amount=45000. "gasté 2 resmas a 12k" → quantity=2, unitPrice=12000, amount=24000. "pagué 50k de arriendo" → quantity=1, unitPrice=50000, amount=50000.
- Para deudas: extrae "debtorName" si se menciona.
- Sin datos financieros: omite el campo "data".
- Saludo o pregunta general: responde normalmente sin "data".

════════════════════════════════════════
ARTEFACTOS DE VOZ (español colombiano)
════════════════════════════════════════
1. FUSIÓN "vendí" + número: el STT escribe el número fusionado con "veinti":
   - "vendí dos" → llega como "22" → interpreta como cantidad 2
   - "vendí tres" → llega como "23" → cantidad 3
   REGLA: Si ves cantidad entre 21-29 y el total (nro×precio) es irrazonable para ese producto, usa solo el dígito de unidades.

2. NÚMEROS EN PALABRAS: "do"="dos"=2, "tre"="tres"=3 (costeño no pronuncia la "s").

3. JERGA DE PRECIOS: "a 10k"="10.000". "pa"/"pa'"="para" (precio unitario). "cada uno"/"la unidad"/"el palo"=precio unitario.

4. VALIDACIÓN: quantity×unitPrice debe tener sentido para un vendedor informal (entre 500 y 5.000.000 pesos).

ARTEFACTOS DE VOZ — MUY IMPORTANTE:
El usuario puede dictar por micrófono. El reconocimiento de voz comete errores específicos con el español colombiano que DEBES corregir antes de extraer datos:

1. FUSIÓN DE "vendí" + número:
   "vendí" suena igual a "veinti" para el STT. Por eso el motor escribe el número siguiente fusionado:
   - "vendí dos"   → llega como "22"   → interpreta como cantidad 2
   - "vendí tres"  → llega como "23"   → interpreta como cantidad 3
   - "vendí cuatro"→ llega como "24"   → interpreta como cantidad 4
   - "vendí cinco" → llega como "25"   → interpreta como cantidad 5
   REGLA: Si ves un número entre 21 y 29 como cantidad de productos y hay un precio unitario, verifica si el total (nro × precio) tiene sentido para un vendedor informal. Si no tiene sentido, usa solo el dígito de las unidades (22→2, 23→3, 24→4, 25→5).
   Ejemplo: "22 dulces por 10 mil cada uno" → total sería 220.000. Irrazonable para dulces → corrige a 2 dulces, total 20.000.

2. NÚMEROS DICTADOS EN PALABRAS:
   El usuario costeño puede decir los números en palabras y el STT los transcribe literalmente:
   - "do" o "dos" = 2  (el costeño a veces no pronuncia la "s" final)
   - "tre" o "tres" = 3
   - "cuatro", "cinco", etc. = normal

3. JERGA DE CANTIDADES Y PRECIOS:
   - "una paca" = 100 pesos (raro, contexto antiguo)
   - "un billete" = dinero en general, infiere del contexto
   - "a 10k", "a 10K", "a 10 k" = 10.000 pesos
   - "pa" o "pa'" = "para" (precio unitario indicador)
   - "cada uno", "la unidad", "el palo" = precio unitario

4. CORRECCIÓN DE CONTEXTO:
   Siempre valida que quantity × unitPrice = amount tenga sentido en el contexto de un vendedor informal colombiano (montos típicos: entre 500 y 5.000.000 pesos). Si el total calculado parece irrazonablemente alto para el producto mencionado, revisa los números buscando el artefacto de fusión descrito arriba.

FORMATO DE RESPUESTA (JSON estricto):
{
  "message": "Tu respuesta textual",
  "data": { acción PRINCIPAL },
  "movements": [ acción2, acción3, ... ]
}

REGLA MULTI-ACCIÓN: Si el mensaje tiene varias acciones (ej: un gasto + una deuda + otra deuda):
- "data": la acción principal (la más compleja o la primera mencionada)
- "movements": todas las DEMÁS acciones, cada una con sus campos. NO repitas en movements lo que ya está en data.
- Si solo hay una acción, deja movements vacío o ausente.

Ejemplo — "gasté 70k en el casino, le debo 1M al banco y Laura me debe 400k":
→ data: {type:"gasto", amount:70000, concept:"Casino"}
→ movements: [{type:"deuda-debo", amount:1000000, concept:"Deuda banco", debtorName:"banco"}, {type:"deuda-me-deben", amount:400000, concept:"Deuda Laura", debtorName:"Laura"}]

data schema:
{
  "type": "venta" | "gasto" | "compra" | "deuda-me-deben" | "deuda-debo" | "pago-deuda-debo" | "cobro-deuda-me-deben",
  "amount": número (total),
  "concept": "nombre SIN cantidad",
  "quantity": número (solo ventas),
  "unitPrice": número (solo ventas),
  "debtorName": "nombre (solo deudas)"
}`;

// Modelos en orden de prioridad — el primero falla → prueba el siguiente
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('No hay GEMINI_API_KEY configurada');
  return new GoogleGenAI({ apiKey: key });
}

async function generateWithFallback(
  fn: (model: string) => Promise<any>
): Promise<any> {
  let lastError: any;
  for (const model of MODELS) {
    try {
      return await fn(model);
    } catch (err: any) {
      console.warn(`[Gemini] ${model} falló:`, err?.message ?? err);
      lastError = err;
    }
  }
  throw lastError;
}

const MOVEMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, enum: ['venta', 'gasto', 'compra', 'deuda-me-deben', 'deuda-debo', 'pago-deuda-debo', 'cobro-deuda-me-deben'] },
    amount: { type: Type.NUMBER },
    concept: { type: Type.STRING },
    quantity: { type: Type.NUMBER },
    unitPrice: { type: Type.NUMBER },
    debtorName: { type: Type.STRING },
    isPartial: { type: Type.BOOLEAN },
    payments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          debtorName: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          isPartial: { type: Type.BOOLEAN },
        },
        required: ['debtorName', 'amount', 'isPartial'],
      },
    },
  },
  required: ['type', 'amount', 'concept'],
};

const SCHEMA_CONFIG = {
  systemInstruction: SYSTEM_INSTRUCTION,
  responseMimeType: "application/json",
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      message: { type: Type.STRING },
      data: MOVEMENT_SCHEMA,
      movements: {
        type: Type.ARRAY,
        items: MOVEMENT_SCHEMA,
      },
    },
    required: ['message'],
  },
};

// ─── OCR Vision types ──────────────────────────────────────────────────────

export type OCRMode = 'ventas-dia' | 'nuevo-stock' | 'fiados-me-deben' | 'fiados-debo';

/** Fila de ventas del día: lo que se vendió */
export interface OCRVentasRow {
  nombre: string;
  unidadesVendidas: number;
  precioVenta: number;
  total: number;
}

/** Fila de nuevo stock: mercancía comprada */
export interface OCRStockRow {
  nombre: string;
  cantidadComprada: number;
  precioCompra: number;
  total: number;
}

export interface OCRFiadoRow {
  nombre: string;
  loDebe: number;
  fecha: string;
  estado: 'pagado' | 'pendiente';
}

// ─── OCR Prompts ────────────────────────────────────────────────────────────

const OCR_VENTAS_PROMPT = `Eres un experto en OCR para vendedores informales colombianos. Analiza esta imagen de un registro de VENTAS DEL DÍA. Extrae TODOS los productos vendidos con las unidades vendidas y su precio unitario. Devuelve ÚNICAMENTE este JSON sin texto adicional:
{"rows": [{"nombre": "Tintos", "unidadesVendidas": 20, "precioVenta": 800, "total": 16000}]}
REGLAS:
- total = unidadesVendidas × precioVenta, calcúlalo tú
- Montos en pesos colombianos como número puro sin puntos ni comas ni $
- k o K = miles: 20k = 20000
- Si no aparece precio, ponlo en 0
- Si no encuentras datos devuelve {"rows": []}`;

const OCR_STOCK_PROMPT = `Eres un experto en OCR para vendedores informales colombianos. Analiza esta imagen de un registro de COMPRA DE MERCANCÍA o factura de proveedor. Extrae TODOS los productos con la cantidad comprada y su precio de compra por unidad. Devuelve ÚNICAMENTE este JSON sin texto adicional:
{"rows": [{"nombre": "Tintos", "cantidadComprada": 100, "precioCompra": 500, "total": 50000}]}
REGLAS:
- total = cantidadComprada × precioCompra, calcúlalo tú
- Montos en pesos colombianos como número puro sin puntos ni comas ni $
- k o K = miles: 20k = 20000
- Si no aparece precio, ponlo en 0
- Si no encuentras datos devuelve {"rows": []}`;

const OCR_FIADOS_ME_DEBEN_PROMPT = `Eres un experto en OCR para vendedores informales colombianos. Analiza esta imagen de un cuaderno de FIADOS — clientes que le deben al vendedor. Extrae TODOS los nombres y cantidades que deben, aunque la letra sea manuscrita o informal. Devuelve ÚNICAMENTE este JSON sin texto adicional:
{"rows": [{"nombre": "Pedro Gómez", "loDebe": 25000, "fecha": "10/04/2025", "estado": "pendiente"}]}
REGLAS:
- Extrae TODOS los fiados visibles sin omitir ninguno
- k o K = miles: 20k = 20000. "lucas", "luca", "mil" → número puro en pesos colombianos
- Estado: nombre/monto tachado, X, "pagó", "canceló", "listo" → "pagado". Si no → "pendiente"
- Fecha en formato DD/MM/YYYY. Si no aparece usa ""
- Montos como número puro sin puntos ni comas ni $
- Si no encuentras datos devuelve {"rows": []}. Nunca inventes datos.`;

const OCR_FIADOS_DEBO_PROMPT = `Eres un experto en OCR para vendedores informales colombianos. Analiza esta imagen de un cuaderno de DEUDAS — personas o proveedores a quienes el vendedor les debe dinero. Extrae TODOS los nombres y cantidades que debe, aunque la letra sea manuscrita o informal. Devuelve ÚNICAMENTE este JSON sin texto adicional:
{"rows": [{"nombre": "Don Carlos", "loDebe": 50000, "fecha": "10/04/2025", "estado": "pendiente"}]}
REGLAS:
- Extrae TODOS los registros visibles sin omitir ninguno
- k o K = miles: 20k = 20000. "lucas", "luca", "mil" → número puro en pesos colombianos
- Estado: nombre/monto tachado, X, "pagué", "cancelé", "listo" → "pagado". Si no → "pendiente"
- Fecha en formato DD/MM/YYYY. Si no aparece usa ""
- Montos como número puro sin puntos ni comas ni $
- Si no encuentras datos devuelve {"rows": []}. Nunca inventes datos.`;

// ─── OCR Schemas ─────────────────────────────────────────────────────────────

const VENTAS_OCR_SCHEMA = {
  responseMimeType: 'application/json' as const,
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      rows: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            nombre: { type: Type.STRING },
            unidadesVendidas: { type: Type.NUMBER },
            precioVenta: { type: Type.NUMBER },
            total: { type: Type.NUMBER },
          },
          required: ['nombre', 'unidadesVendidas', 'precioVenta', 'total'],
        },
      },
    },
    required: ['rows'],
  },
};

const STOCK_OCR_SCHEMA = {
  responseMimeType: 'application/json' as const,
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      rows: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            nombre: { type: Type.STRING },
            cantidadComprada: { type: Type.NUMBER },
            precioCompra: { type: Type.NUMBER },
            total: { type: Type.NUMBER },
          },
          required: ['nombre', 'cantidadComprada', 'precioCompra', 'total'],
        },
      },
    },
    required: ['rows'],
  },
};

const FIADOS_OCR_SCHEMA = {
  responseMimeType: 'application/json' as const,
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      rows: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            nombre: { type: Type.STRING },
            loDebe: { type: Type.NUMBER },
            fecha: { type: Type.STRING },
            estado: { type: Type.STRING, enum: ['pagado', 'pendiente'] },
          },
          required: ['nombre', 'loDebe', 'fecha', 'estado'],
        },
      },
    },
    required: ['rows'],
  },
};

const OCR_PROMPTS: Record<OCRMode, string> = {
  'ventas-dia': OCR_VENTAS_PROMPT,
  'nuevo-stock': OCR_STOCK_PROMPT,
  'fiados-me-deben': OCR_FIADOS_ME_DEBEN_PROMPT,
  'fiados-debo': OCR_FIADOS_DEBO_PROMPT,
};

const OCR_SCHEMAS: Record<OCRMode, any> = {
  'ventas-dia': VENTAS_OCR_SCHEMA,
  'nuevo-stock': STOCK_OCR_SCHEMA,
  'fiados-me-deben': FIADOS_OCR_SCHEMA,
  'fiados-debo': FIADOS_OCR_SCHEMA,
};

export async function analyzeImageOCR(
  base64Image: string,
  mimeType: string,
  mode: OCRMode
): Promise<OCRVentasRow[] | OCRStockRow[] | OCRFiadoRow[]> {
  const prompt = OCR_PROMPTS[mode];
  const schema = OCR_SCHEMAS[mode];

  const contents = [{
    role: 'user',
    parts: [
      { inlineData: { mimeType, data: base64Image } },
      { text: prompt },
    ],
  }];

  try {
    const client = getClient();
    const response = await generateWithFallback(model =>
      client.models.generateContent({ model, contents, config: schema })
    );
    const parsed = JSON.parse(response.text || '{"rows":[]}');
    return (parsed.rows ?? []) as OCRVentasRow[] | OCRStockRow[] | OCRFiadoRow[];
  } catch (error: any) {
    console.error('Gemini OCR error:', error);
    return [];
  }
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export const sendMessageToGemini = async (message: string, history: any[] = []): Promise<ChatResponse> => {
  const contents = [...history, { role: 'user', parts: [{ text: message }] }];
  try {
    const client = getClient();
    const response = await generateWithFallback(model =>
      client.models.generateContent({ model, contents, config: SCHEMA_CONFIG })
    );
    return JSON.parse(response.text || '{}') as ChatResponse;
  } catch (error: any) {
    console.error('Gemini error:', error);
    return { message: "Lo siento, el asistente no está disponible en este momento. Intenta de nuevo en unos segundos." };
  }
};
