import { GoogleGenAI, Type } from '@google/genai';
import * as pdfjsLib from 'pdfjs-dist';

// pdfjs worker — use the bundled legacy worker to avoid separate fetch
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

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
}

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

function getClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY no configurada');
  return new GoogleGenAI({ apiKey: key });
}

/**
 * Renders every page of a PDF to JPEG blobs.
 * Tries with cedula password first; if it fails, tries without password.
 * Returns the rendered image blobs and whether a password was needed.
 */
async function pdfToImages(
  buffer: ArrayBuffer,
  cedula: string,
): Promise<{ images: Blob[]; wasLocked: boolean }> {
  const cedulaDigits = cedula.replace(/\D/g, '');

  async function render(password?: string): Promise<Blob[]> {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      ...(password ? { password } : {}),
    });
    const pdfDoc = await loadingTask.promise;
    const blobs: Blob[] = [];

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx as any, viewport, canvas }).promise;
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob(b => (b ? res(b) : rej(new Error('canvas toBlob failed'))), 'image/jpeg', 0.92),
      );
      blobs.push(blob);
    }
    return blobs;
  }

  // Try with cédula password first (covers Nequi, Daviplata, etc.)
  if (cedulaDigits) {
    try {
      const images = await render(cedulaDigits);
      return { images, wasLocked: true };
    } catch { /* wrong password or not protected — try next */ }
  }

  // Try without password (unprotected PDF)
  try {
    const images = await render();
    return { images, wasLocked: false };
  } catch (e: any) {
    const msg = (e?.message ?? '').toLowerCase();
    if (msg.includes('password')) {
      throw new Error(
        'El PDF está protegido y tu número de cédula no coincide con la contraseña. ' +
        'Verifica que estás subiendo tu propio extracto.',
      );
    }
    throw new Error('No se pudo leer el PDF. Verifica que el archivo no esté dañado.');
  }
}

const SCHEMA = {
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

const PROMPT = `Eres un analista financiero especializado en documentos bancarios colombianos.

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

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function analyzeExtracto(file: File, cedula = ''): Promise<ExtractoAnalysis> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf') throw new Error('Solo se aceptan archivos PDF. Descarga el extracto en formato PDF desde tu banco.');

  // Render PDF pages to images (handles password-protected PDFs with cédula)
  const rawBuffer = await file.arrayBuffer();
  const { images, wasLocked } = await pdfToImages(rawBuffer, cedula);

  const client = getClient();

  // Build parts: one inlineData per page image + the prompt
  const imageParts = await Promise.all(
    images.map(async (blob) => ({
      inlineData: { mimeType: 'image/jpeg', data: await blobToBase64(blob) },
    })),
  );

  const contents = [{
    role: 'user' as const,
    parts: [...imageParts, { text: PROMPT }],
  }];

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

  if (!response) throw lastErr ?? new Error('No se pudo analizar el extracto. Intenta de nuevo.');

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.text || '{}');
  } catch {
    throw new Error('La IA no pudo interpretar el archivo. Intenta de nuevo.');
  }

  if (parsed.esExtractoBancario === false) {
    const motivo = parsed.motivoRechazo?.trim() || 'No contiene un historial de movimientos bancarios';
    throw new Error(`Este archivo no es un extracto bancario válido. ${motivo}. Sube el PDF de tus movimientos de cuenta.`);
  }

  const transactions: ExtractoTransaction[] = (parsed.transactions ?? []).filter((t: any) => t.monto > 0);

  const ingresos               = transactions.filter(t => ['cobro_qr','transferencia_recibida','otro'].includes(t.tipo));
  const salidas                = transactions.filter(t => ['transferencia_enviada','retiro','pago_servicio'].includes(t.tipo));
  const totalIngresos          = ingresos.reduce((s, t) => s + t.monto, 0);
  const totalGastos            = salidas.reduce((s, t) => s + t.monto, 0);
  const ingresosVentas         = ingresos.filter(t => t.esVentaProbable).reduce((s, t) => s + t.monto, 0);
  const ingresosTransferencias = totalIngresos - ingresosVentas;
  const porcentajeVentas       = totalIngresos > 0 ? Math.round((ingresosVentas / totalIngresos) * 100) : 0;
  const entidad                = (parsed.entidad ?? 'otro').toLowerCase();

  return {
    entidad,
    totalIngresos,
    totalGastos,
    ingresosVentas,
    ingresosTransferencias,
    porcentajeVentas,
    transactions,
    miniAnalisis: parsed.miniAnalisis?.trim() ?? '',
    passwordUnlocked: wasLocked,
  };
}

export function buildAnalysis(
  transactions: ExtractoTransaction[],
  entidad: string,
): ExtractoAnalysis {
  const ingresos               = transactions.filter(t => !['transferencia_enviada','retiro','pago_servicio'].includes(t.tipo));
  const salidas                = transactions.filter(t => ['transferencia_enviada','retiro','pago_servicio'].includes(t.tipo));
  const totalIngresos          = ingresos.reduce((s, t) => s + t.monto, 0);
  const totalGastos            = salidas.reduce((s, t) => s + t.monto, 0);
  const ingresosVentas         = ingresos.filter(t => t.esVentaProbable).reduce((s, t) => s + t.monto, 0);
  const ingresosTransferencias = totalIngresos - ingresosVentas;
  const porcentajeVentas       = totalIngresos > 0 ? Math.round((ingresosVentas / totalIngresos) * 100) : 0;

  return {
    entidad: entidad.toLowerCase(),
    totalIngresos,
    totalGastos,
    ingresosVentas,
    ingresosTransferencias,
    porcentajeVentas,
    transactions,
    miniAnalisis: '',
    passwordUnlocked: false,
  };
}
