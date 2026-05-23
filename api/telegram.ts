import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { processMessage, handlePendingState, type HistoryEntry, type PendingState } from './_lib/processMessage.js';
import { sendTelegram, MSG_NOT_LINKED, MSG_HELP } from './_lib/telegram-bot.js';

// ─── Firebase Admin init ──────────────────────────────────────────────────────
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return initializeApp({ credential: cert(JSON.parse(raw)) });
  return initializeApp();
}

const DB_ID = process.env.FIRESTORE_DATABASE_ID ?? 'ai-studio-c7314b5a-dae1-4e68-9a55-87d3b4cfde3e';
const db = getFirestore(getAdminApp(), DB_ID);
const MAX_HISTORY = 10;

// ─── Types ────────────────────────────────────────────────────────────────────
interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(200).end(); return; }

  const update = req.body as TelegramUpdate;
  const message = update.message;
  if (!message?.text) { res.status(200).end(); return; }

  const updateId = update.update_id;
  const chatId = message.chat.id;
  const text = message.text.trim();

  try {
    if (text === '/start' || text.startsWith('/start ')) {
      await sendTelegram(chatId, MSG_NOT_LINKED);
      return;
    }
    if (text === '/ayuda' || text === '/help') {
      await sendTelegram(chatId, MSG_HELP);
      return;
    }
    if (text.startsWith('/vincular')) {
      const code = text.split(/\s+/)[1]?.trim();
      if (!code) {
        await sendTelegram(chatId, '⚠️ Envía el código así:\n<code>/vincular 123456</code>');
        return;
      }
      await handleLinking(chatId, code);
      return;
    }

    const snap = await db.collection('users')
      .where('telegramChatId', '==', String(chatId))
      .limit(1)
      .get();

    if (snap.empty) {
      await sendTelegram(chatId, MSG_NOT_LINKED);
      return;
    }

    const userDoc = snap.docs[0];
    const userData = userDoc.data();

    // Deduplication: skip if this Telegram update was already processed
    const lastUpdateId = userData.telegramLastUpdateId as number | undefined;
    if (lastUpdateId !== undefined && updateId <= lastUpdateId) {
      return;
    }

    const history: HistoryEntry[] = (userData.telegramHistory as HistoryEntry[] | undefined) ?? [];
    const pendingState = (userData.telegramPendingState as PendingState | undefined) ?? null;
    const send = (t: string) => sendTelegram(chatId, t);

    if (pendingState) {
      const newPending = await handlePendingState(db, userDoc.id, pendingState, send, text);
      await userDoc.ref.update({
        telegramLastUpdateId: updateId,
        telegramPendingState: newPending ?? FieldValue.delete(),
      });
    } else {
      const result = await processMessage(userDoc.id, text, 'telegram', send, db, history);
      const trimmed = result.updatedHistory.slice(-MAX_HISTORY);
      await userDoc.ref.update({
        telegramLastUpdateId: updateId,
        telegramHistory: trimmed,
        ...(result.pendingState
          ? { telegramPendingState: result.pendingState }
          : { telegramPendingState: FieldValue.delete() }),
      });
    }
  } catch (err) {
    console.error('[telegram] Error:', err);
    try { await sendTelegram(chatId, '⚠️ Hubo un error. Intenta de nuevo.'); } catch (_) { /* ignore */ }
  } finally {
    res.status(200).end();
  }
}

// ─── Linking ──────────────────────────────────────────────────────────────────
async function handleLinking(chatId: number, code: string) {
  const snap = await db.collection('users')
    .where('linkCode.code', '==', code)
    .limit(1)
    .get();

  if (snap.empty) {
    await sendTelegram(chatId, '❌ Código inválido.\n\nGenera uno nuevo en <b>Perfil → Vincular con Telegram</b>.');
    return;
  }

  const userDoc = snap.docs[0];
  const data = userDoc.data();
  const expiresAt: Timestamp | Date = data.linkCode?.expiresAt;
  const expiresMs = expiresAt instanceof Timestamp ? expiresAt.toMillis() : (expiresAt as Date).getTime();

  if (Date.now() > expiresMs) {
    await sendTelegram(chatId, '❌ El código expiró (válido 10 min).\n\nGenera uno nuevo desde la app.');
    return;
  }

  await userDoc.ref.update({ telegramChatId: String(chatId), linkCode: FieldValue.delete() });

  const firstName = (data.firstName as string | undefined) ?? 'amigo';
  await sendTelegram(chatId, `✅ <b>¡Listo, ${firstName}!</b> Tu cuenta está vinculada.\n\n${MSG_HELP}`);
}
