import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generatePassportReport, type PassportAgentInput } from './_lib/passportAgent.js';

export const maxDuration = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const input = req.body as PassportAgentInput;
  if (!input?.nombre || typeof input.scoreFinal !== 'number') {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  try {
    const report = await generatePassportReport(input);
    return res.status(200).json(report);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? 'Error interno' });
  }
}
