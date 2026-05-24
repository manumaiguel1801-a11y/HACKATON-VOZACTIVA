import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const secretId       = process.env.BELVO_SECRET_ID;
  const secretPassword = process.env.BELVO_SECRET_PASSWORD;

  if (!secretId || !secretPassword) {
    return res.status(503).json({ error: 'Belvo no está configurado en este entorno.' });
  }

  const isSandbox = (process.env.BELVO_ENV ?? 'sandbox') !== 'production';
  const base      = isSandbox ? 'https://sandbox.belvo.com' : 'https://api.belvo.com';
  const auth      = Buffer.from(`${secretId}:${secretPassword}`).toString('base64');

  try {
    const r = await fetch(`${base}/api/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        id: secretId,
        password: secretPassword,
        scopes: 'read_institutions,read_accounts,read_transactions,read_owners',
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data?.detail ?? data?.non_field_errors?.[0]
        ?? data?.message ?? JSON.stringify(data);
      return res.status(r.status).json({ error: `Belvo ${r.status}: ${msg}` });
    }
    return res.status(r.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
