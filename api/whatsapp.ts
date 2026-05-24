import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { processMessage, handlePendingState, looksLikeNewCommand, type HistoryEntry, type PendingState } from './_lib/processMessage.js';
import { sendWhatsApp, MSG_NOT_LINKED, MSG_HELP } from './_lib/whatsapp-bot.js';
import { logEvent, getRecentLogs, formatLogsForWhatsApp, type LogLevel } from './_lib/logger.js';

// ─── Firebase Admin init ──────────────────────────────────────────────────────
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) return initializeApp({ credential: cert(JSON.parse(raw)) });
  return initializeApp();
}

const DB_ID = process.env.FIRESTORE_DATABASE_ID ?? 'ai-studio-c7314b5a-dae1-4e68-9a55-87d3b4cfde3e';
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? '';
const MAX_HISTORY = 10;

// ─── Helpers (unused locals removed — imported from processMessage) ───────────

// ─── Webhook handler ──────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'] as string | undefined;
    const token     = req.query['hub.verify_token'] as string | undefined;
    const challenge = req.query['hub.challenge'] as string | undefined;
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      console.warn('[whatsapp] Verify failed — mode:', mode, 'token match:', token === VERIFY_TOKEN);
      res.status(403).end();
    }
    return;
  }

  if (req.method !== 'POST') { res.status(405).end(); return; }

  const db = getFirestore(getAdminApp(), DB_ID);
  const body = req.body as WhatsAppWebhookBody;

  if (body?.object !== 'whatsapp_business_account') { res.status(200).end(); return; }

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value?.messages?.length) { res.status(200).end(); return; }

  const msg = value.messages[0];
  if (msg.type !== 'text' || !msg.text?.body) { res.status(200).end(); return; }

  const from = msg.from;
  const msgId = msg.id as string | undefined;
  const text = msg.text.body.trim();

  // Logged send wrapper — every outgoing message is persisted to whatsappLogs
  const sendAndLog = async (replyText: string, stage: string, level: LogLevel = 'info') => {
    await sendWhatsApp(from, replyText);
    await logEvent(db, { phone: from, direction: 'out', level, stage, text: replyText });
  };

  // Log every incoming webhook message
  await logEvent(db, {
    phone: from,
    direction: 'in',
    level: 'info',
    stage: 'webhook-received',
    text,
    context: { msgId },
  });

  try {
    if (/^(\/ayuda|\/help|ayuda)$/i.test(text)) {
      await sendAndLog(MSG_HELP, 'cmd-ayuda');
      return;
    }

    if (/^(\/logs|\/debug|logs|debug)$/i.test(text)) {
      const logs = await getRecentLogs(db, from, 15);
      await sendAndLog(formatLogsForWhatsApp(logs), 'cmd-logs');
      return;
    }

    const vinculaMatch = text.match(/^\/?vincular\s+(\S+)/i);
    if (vinculaMatch) {
      await handleLinking(db, from, vinculaMatch[1].trim());
      return;
    }
    if (/^cancelar$/i.test(text)) {
      const cancelSnap = await db.collection('users').where('whatsappPhone', '==', from).limit(1).get();
      if (!cancelSnap.empty && cancelSnap.docs[0].data().whatsappPendingState) {
        await cancelSnap.docs[0].ref.update({ whatsappPendingState: FieldValue.delete() });
        await sendAndLog('✅ Operación cancelada. ¿Qué deseas registrar?', 'cmd-cancelar');
      } else {
        await sendAndLog('ℹ️ No hay ninguna operación en curso.', 'cmd-cancelar-noop');
      }
      return;
    }

    if (/^(\/limpiar|limpiar|\/reset|reset|\/reiniciar|reiniciar)$/i.test(text)) {
      const limpiarSnap = await db.collection('users').where('whatsappPhone', '==', from).limit(1).get();
      if (!limpiarSnap.empty) {
        await limpiarSnap.docs[0].ref.update({
          whatsappHistory: FieldValue.delete(),
          whatsappPendingState: FieldValue.delete(),
        });
      }
      await sendAndLog('✅ Conversación reiniciada. Ya puedes registrar normalmente.\n\nEjemplo: _"vendí 3 jugos a 3000"_', 'cmd-limpiar');
      return;
    }

    const snap = await db.collection('users')
      .where('whatsappPhone', '==', from)
      .limit(1)
      .get();

    if (snap.empty) {
      await sendAndLog(MSG_NOT_LINKED, 'not-linked', 'warn');
      return;
    }

    const userDoc = snap.docs[0];
    const userData = userDoc.data();

    // Deduplication: skip if this message was already processed
    if (msgId && userData.whatsappLastMsgId === msgId) {
      await logEvent(db, { phone: from, direction: 'event', level: 'warn', stage: 'dedup-skip', context: { msgId } });
      return;
    }

    const history: HistoryEntry[] = (userData.whatsappHistory as HistoryEntry[] | undefined) ?? [];
    const pendingState = (userData.whatsappPendingState as PendingState | undefined) ?? null;

    const send = async (t: string) => {
      await sendWhatsApp(from, t);
      await logEvent(db, { phone: from, direction: 'out', level: 'info', stage: 'processMessage-reply', text: t });
    };

    if (pendingState && looksLikeNewCommand(text)) {
      // Auto-cancel stale pending state and process as a fresh command
      const result = await processMessage(userDoc.id, text, 'whatsapp', send, db, history);
      const trimmed = result.updatedHistory.slice(-MAX_HISTORY);
      await userDoc.ref.update({
        ...(msgId ? { whatsappLastMsgId: msgId } : {}),
        whatsappHistory: trimmed,
        whatsappPendingState: result.pendingState ?? FieldValue.delete(),
      });
    } else if (pendingState) {
      const newPending = await handlePendingState(db, userDoc.id, pendingState, send, text);
      await userDoc.ref.update({
        ...(msgId ? { whatsappLastMsgId: msgId } : {}),
        whatsappPendingState: newPending ?? FieldValue.delete(),
      });
    } else {
      const result = await processMessage(userDoc.id, text, 'whatsapp', send, db, history);
      const trimmed = result.updatedHistory.slice(-MAX_HISTORY);
      await userDoc.ref.update({
        ...(msgId ? { whatsappLastMsgId: msgId } : {}),
        whatsappHistory: trimmed,
        ...(result.pendingState
          ? { whatsappPendingState: result.pendingState }
          : { whatsappPendingState: FieldValue.delete() }),
      });
    }

  } catch (err: any) {
    console.error('[whatsapp] Error:', err);
    const errMsg = err?.message ?? String(err);
    const errStack = (err?.stack ?? '').split('\n').slice(0, 4).join('\n');
    const debugBlock = `[DEBUG WHATSAPP HANDLER]\n• error: ${errMsg}\n• stack:\n${errStack}`;
    await logEvent(db, {
      phone: from,
      direction: 'event',
      level: 'error',
      stage: 'handler-catch',
      text: errMsg,
      context: { stack: errStack, incomingText: text },
    });
    try {
      await sendWhatsApp(from, `⚠️ Hubo un error. Intenta de nuevo.\n\n${debugBlock}`);
      await logEvent(db, { phone: from, direction: 'out', level: 'error', stage: 'handler-catch-reply', text: debugBlock });
    } catch (sendErr: any) {
      await logEvent(db, {
        phone: from,
        direction: 'event',
        level: 'error',
        stage: 'handler-catch-send-fail',
        text: sendErr?.message ?? String(sendErr),
      });
    }
  } finally {
    res.status(200).end();
  }
}

// ─── Linking ──────────────────────────────────────────────────────────────────
async function handleLinking(db: ReturnType<typeof getFirestore>, from: string, code: string) {
  const snap = await db.collection('users')
    .where('linkCode.code', '==', code)
    .limit(1)
    .get();

  if (snap.empty) {
    await sendWhatsApp(from, '❌ Código inválido.\n\nGenera uno nuevo en *Perfil → Vincular con WhatsApp*.');
    return;
  }

  const userDoc = snap.docs[0];
  const data = userDoc.data();
  const expiresAt: Timestamp | Date = data.linkCode?.expiresAt;
  const expiresMs = expiresAt instanceof Timestamp ? expiresAt.toMillis() : (expiresAt as Date).getTime();

  if (Date.now() > expiresMs) {
    await sendWhatsApp(from, '❌ El código expiró (válido 10 min).\n\nGenera uno nuevo desde la app.');
    return;
  }

  await userDoc.ref.update({ whatsappPhone: from, linkCode: FieldValue.delete() });

  const firstName = (data.firstName as string | undefined) ?? 'amigo';
  await sendWhatsApp(from, `✅ *¡Listo, ${firstName}!* Tu cuenta está vinculada.\n\n${MSG_HELP}`);
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface WhatsAppWebhookBody {
  object: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{ id?: string; from: string; type: string; text?: { body: string } }>;
        statuses?: Array<unknown>;
      };
    }>;
  }>;
}
