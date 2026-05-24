import * as pdfjsLib from 'pdfjs-dist';
import type { ExtractoTransaction, ExtractoAnalysis } from '../../api/_lib/extractoAnalysis';

// Re-export so existing importers don't break
export type { ExtractoTransaction, ExtractoAnalysis };

// pdfjs worker — use the bundled legacy worker to avoid separate fetch
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

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
    const maxPages = Math.min(pdfDoc.numPages, 6);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx as any, viewport, canvas }).promise;
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob(b => (b ? res(b) : rej(new Error('canvas toBlob failed'))), 'image/jpeg', 0.75),
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function analyzeExtracto(
  file: File,
  cedula = '',
  onStep?: (step: string) => void,
): Promise<ExtractoAnalysis> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf') throw new Error('Solo se aceptan archivos PDF. Descarga el extracto en formato PDF desde tu banco.');

  onStep?.('Leyendo el PDF...');
  const rawBuffer = await file.arrayBuffer();
  const { images, wasLocked } = await pdfToImages(rawBuffer, cedula);

  onStep?.('Analizando con IA...');
  const imageParts = await Promise.all(
    images.map(async (blob) => ({
      data: await blobToBase64(blob),
      mimeType: 'image/jpeg',
    })),
  );

  const response = await fetch('/api/extracto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images: imageParts, wasLocked }),
  });

  const payload = await response.json().catch(() => ({ error: 'Respuesta inválida del servidor' }));

  if (!response.ok) {
    throw new Error(payload?.error ?? 'Error al analizar el extracto. Intenta de nuevo.');
  }

  return payload as ExtractoAnalysis;
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
    consistenciaVentas: 0,
    mesesConActividad: 0,
    promedioMensualIngresos: 0,
  };
}
