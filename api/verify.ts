import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return initializeApp({ credential: cert(JSON.parse(raw)) });
  return initializeApp();
}

const DB_ID = process.env.FIRESTORE_DATABASE_ID ?? 'ai-studio-c7314b5a-dae1-4e68-9a55-87d3b4cfde3e';

function tsToISO(ts: any): string | null {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  return String(ts);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const app = getAdminApp();
  const db = getFirestore(app, DB_ID);

  // ── GET: lectura pública por código ──────────────────────────────────────────
  if (req.method === 'GET') {
    const code = req.query.code as string;
    if (!code) { res.status(400).json({ error: 'Missing code' }); return; }

    try {
      const snap = await db.collection('passportVerifications').doc(code).get();
      if (!snap.exists) { res.status(404).json({ error: 'not_found' }); return; }

      const d = snap.data()!;
      const expiry: Date = d.expiresAt?.toDate ? d.expiresAt.toDate() : new Date(d.expiresAt);
      const status = expiry < new Date() ? 'expired' : 'valid';

      res.status(200).json({
        status,
        name: d.name,
        score: d.score,
        scoreLabel: d.scoreLabel,
        businessAgeDays: d.businessAgeDays ?? 0,
        monthlyProjection: d.monthlyProjection ?? 0,
        generatedAt: tsToISO(d.generatedAt),
        expiresAt: tsToISO(d.expiresAt),
      });
    } catch (e) {
      console.error('[verify] GET error:', e);
      res.status(500).json({ error: 'server_error' });
    }
    return;
  }

  // ── POST: escritura con autenticación Firebase ────────────────────────────────
  if (req.method === 'POST') {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' }); return;
    }

    try {
      await getAuth(app).verifyIdToken(authHeader.slice(7));
    } catch {
      res.status(401).json({ error: 'Invalid token' }); return;
    }

    const { code, data } = req.body as { code: string; data: Record<string, unknown> };
    if (!code || !data) { res.status(400).json({ error: 'Missing code or data' }); return; }

    try {
      const expiresAt = data.expiresAt
        ? Timestamp.fromDate(new Date(data.expiresAt as string))
        : Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

      await db.collection('passportVerifications').doc(code).set({
        name: data.name,
        score: data.score,
        scoreLabel: data.scoreLabel,
        businessAgeDays: data.businessAgeDays ?? 0,
        monthlyProjection: data.monthlyProjection ?? 0,
        generatedAt: Timestamp.now(),
        expiresAt,
      });
      res.status(200).json({ ok: true });
    } catch (e) {
      console.error('[verify] POST error:', e);
      res.status(500).json({ error: 'server_error' });
    }
    return;
  }

  res.status(405).end();
}
