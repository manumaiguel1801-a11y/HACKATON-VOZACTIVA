import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeExtractoFull, type ImagePart } from './_lib/extractoAnalysis.js';

export const maxDuration = 60;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { images, wasLocked } = req.body as { images: ImagePart[]; wasLocked: boolean };

  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'images array requerido' });
  }

  try {
    const result = await analyzeExtractoFull(images, wasLocked ?? false);
    return res.status(200).json(result);
  } catch (err: any) {
    const msg: string = err?.message ?? 'Error interno';
    const status = msg.includes('no es un extracto bancario') ? 422 : 500;
    return res.status(status).json({ error: msg });
  }
}
