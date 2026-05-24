import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { sendTelegram } from './_lib/telegram-bot.js';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return initializeApp({ credential: cert(JSON.parse(raw)) });
  return initializeApp();
}

const DB_ID = process.env.FIRESTORE_DATABASE_ID ?? 'ai-studio-c7314b5a-dae1-4e68-9a55-87d3b4cfde3e';

function fmt(n: number) { return `$${Math.round(n).toLocaleString('es-CO')}`; }

// ─── Recopila contexto financiero real del usuario desde Firestore ────────────

interface UserContext {
  firstName: string;
  metaNombre: string;
  montoObjetivo: number;
  montoAhorrado: number;
  pct: number;
  ahorroDiario: number;
  unconfirmedCount: number;
  avgDailySales: number;
  avgDailyExpenses: number;
  netDaily: number;
  totalDebtOwed: number;
}

async function getUserContext(userDoc: FirebaseFirestore.QueryDocumentSnapshot): Promise<UserContext | null> {
  const userData = userDoc.data();

  // Solo usuarios con Telegram vinculado
  if (!userData.telegramChatId) return null;

  // Meta activa
  const metasSnap = await userDoc.ref.collection('metas')
    .where('estado', 'in', ['activa', 'en-riesgo', 'reajustada'])
    .limit(1).get();

  if (metasSnap.empty) return null;

  const meta = metasSnap.docs[0].data();
  const today = new Date().toISOString().split('T')[0];
  const unconfirmedCount = (meta.registros ?? [])
    .filter((r: any) => r.estado === 'sin_confirmar' && r.fecha <= today).length;

  // Si no hay nada pendiente, no mandamos nada
  if (unconfirmedCount === 0) return null;

  // Ventas y gastos últimos 14 días
  const since14 = new Date();
  since14.setDate(since14.getDate() - 14);
  const since14Ts = Timestamp.fromDate(since14);

  const [salesSnap, expensesSnap, debtsSnap] = await Promise.all([
    userDoc.ref.collection('sales').where('createdAt', '>=', since14Ts).get(),
    userDoc.ref.collection('expenses').where('createdAt', '>=', since14Ts).get(),
    userDoc.ref.collection('debts')
      .where('type', '==', 'me-deben')
      .where('status', 'in', ['pendiente', 'parcial']).get(),
  ]);

  const totalSales = salesSnap.docs.reduce((s, d) => s + ((d.data().total as number) ?? 0), 0);
  const totalExpenses = expensesSnap.docs.reduce((s, d) => s + ((d.data().amount as number) ?? 0), 0);
  const totalDebtOwed = debtsSnap.docs.reduce((s, d) => s + ((d.data().amount as number) ?? 0), 0);

  const avgDailySales = Math.round(totalSales / 14);
  const avgDailyExpenses = Math.round(totalExpenses / 14);
  const montoAhorrado: number = meta.montoAhorrado ?? 0;
  const montoObjetivo: number = meta.montoObjetivo ?? 0;

  return {
    firstName: (userData.firstName as string) ?? 'amigo',
    metaNombre: (meta.nombre as string) ?? 'tu meta',
    montoObjetivo,
    montoAhorrado,
    pct: montoObjetivo > 0 ? Math.round((montoAhorrado / montoObjetivo) * 100) : 0,
    ahorroDiario: (meta.ahorroDiario as number) ?? 0,
    unconfirmedCount,
    avgDailySales,
    avgDailyExpenses,
    netDaily: Math.max(0, avgDailySales - avgDailyExpenses),
    totalDebtOwed,
  };
}

// ─── Gemini genera el mensaje personalizado ───────────────────────────────────

const SYSTEM_PROMPT = `Eres el Consejero de Voz-Activa, el asesor financiero de confianza de microempresarios y vendedores informales colombianos.

Tu tarea es escribir UN mensaje corto para Telegram recordándole al usuario que tiene días de ahorro sin confirmar en su meta.

REGLAS ESTRICTAS:
- Máximo 3 oraciones. Directo y útil.
- Usa los datos financieros reales para personalizar: si tuvo buenas ventas → menciona que sí pudo ahorrar. Si las ventas estuvieron bajas → muestra empatía, no regañes.
- Tono cercano, como un asesor de confianza. Español colombiano natural.
- Sin formato markdown ni asteriscos. Solo texto plano y emojis si aplica.
- Termina siempre con una pregunta corta que invite a responder.
- Nunca uses el nombre del usuario más de una vez.`;

async function generateMessage(ctx: UserContext): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('No GEMINI_API_KEY');

  const contextBlock = `
USUARIO: ${ctx.firstName}
META: "${ctx.metaNombre}" — objetivo ${fmt(ctx.montoObjetivo)}, ahorrado ${fmt(ctx.montoAhorrado)} (${ctx.pct}%)
AHORRO ACORDADO: ${fmt(ctx.ahorroDiario)}/día
DÍAS SIN CONFIRMAR: ${ctx.unconfirmedCount}
VENTAS PROMEDIO (14 días): ${fmt(ctx.avgDailySales)}/día
GASTOS PROMEDIO (14 días): ${fmt(ctx.avgDailyExpenses)}/día
GANANCIA NETA ESTIMADA: ${fmt(ctx.netDaily)}/día
FIADOS QUE LE DEBEN: ${fmt(ctx.totalDebtOwed)}`.trim();

  const client = new GoogleGenAI({ apiKey: key });
  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: `Escribe el mensaje de recordatorio para este usuario:\n\n${contextBlock}` }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      thinkingConfig: { thinkingBudget: 0 },
    },
  } as any);

  return response.text?.trim()
    ?? `Hola ${ctx.firstName}, tienes ${ctx.unconfirmedCount} días de ahorro pendientes en "${ctx.metaNombre}". ¿Cómo vas?`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET ?? '';
  const authHeader = req.headers.authorization ?? '';
  const querySecret = (req.query.secret as string) ?? '';
  const isAuthorized =
    !cronSecret ||
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret;

  if (!isAuthorized) return res.status(401).json({ error: 'Unauthorized' });

  const db = getFirestore(getAdminApp(), DB_ID);
  const usersSnap = await db.collection('users').get();

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const userDoc of usersSnap.docs) {
    try {
      const ctx = await getUserContext(userDoc);
      if (!ctx) { skipped++; continue; }

      const message = await generateMessage(ctx);
      const telegramChatId = userDoc.data().telegramChatId;
      await sendTelegram(telegramChatId, message);
      sent++;

      console.log(`[notify] Sent to ${ctx.firstName} (${userDoc.id}): "${message.slice(0, 60)}..."`);
    } catch (err: any) {
      errors.push(`${userDoc.id}: ${err?.message ?? err}`);
      console.error(`[notify] Error for ${userDoc.id}:`, err);
    }
  }

  res.json({ sent, skipped, errors });
}
