import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { processMessage, handlePendingState, looksLikeNewCommand, type HistoryEntry, type PendingState } from './_lib/processMessage.js';
import {
  createWhatsAppService,
  MSG_NOT_LINKED,
  MSG_HELP,
  MSG_ERROR_GENERIC,
  type WhatsAppService,
} from './_lib/whatsapp/index.js';
import { logEvent, getRecentLogs, formatLogsForWhatsApp } from './_lib/logger.js';

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

  const wa = createWhatsAppService(db, from);

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
      await wa.reply(MSG_HELP, 'cmd-ayuda');
      return;
    }

    if (/^(\/logs|\/debug|logs|debug)$/i.test(text)) {
      const logs = await getRecentLogs(db, from, 15);
      await wa.reply(formatLogsForWhatsApp(logs), 'cmd-logs');
      return;
    }

    const vinculaMatch = text.match(/^\/?vincular\s+(\S+)/i);
    if (vinculaMatch) {
      await handleLinking(db, wa, vinculaMatch[1].trim());
      return;
    }

    if (/^cancelar$/i.test(text)) {
      const cancelSnap = await db.collection('users').where('whatsappPhone', '==', from).limit(1).get();
      if (!cancelSnap.empty && cancelSnap.docs[0].data().whatsappPendingState) {
        await cancelSnap.docs[0].ref.update({ whatsappPendingState: FieldValue.delete() });
        await wa.reply('✅ Operación cancelada. ¿Qué deseas registrar?', 'cmd-cancelar');
      } else {
        await wa.reply('ℹ️ No hay ninguna operación en curso.', 'cmd-cancelar-noop');
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
      await wa.reply(
        '✅ Conversación reiniciada. Ya puedes registrar normalmente.\n\nEjemplo: _"vendí 3 jugos a 3000"_',
        'cmd-limpiar',
      );
      return;
    }

    const snap = await db.collection('users')
      .where('whatsappPhone', '==', from)
      .limit(1)
      .get();

    if (snap.empty) {
      await wa.reply(MSG_NOT_LINKED, 'not-linked', 'warn');
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

    // SendFn adapter for processMessage / handlePendingState
    const send = async (t: string) => {
      await wa.reply(t, 'processMessage-reply');
    };

    if (pendingState && looksLikeNewCommand(text)) {
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
    await wa.replyError(`${MSG_ERROR_GENERIC}\n\n${debugBlock}`, 'handler-catch-reply', { stack: errStack });
  } finally {
    res.status(200).end();
  }
}

// ─── Linking ──────────────────────────────────────────────────────────────────
async function handleLinking(
  db: ReturnType<typeof getFirestore>,
  wa: WhatsAppService,
  code: string,
) {
  const snap = await db.collection('users')
    .where('linkCode.code', '==', code)
    .limit(1)
    .get();

  if (snap.empty) {
    await wa.reply(
      '❌ Código inválido.\n\nGenera uno nuevo en *Perfil → Vincular con WhatsApp*.',
      'linking-invalid-code',
      'warn',
    );
    return;
  }

  const userDoc = snap.docs[0];
  const data = userDoc.data();
  const expiresAt: Timestamp | Date = data.linkCode?.expiresAt;
  const expiresMs = expiresAt instanceof Timestamp ? expiresAt.toMillis() : (expiresAt as Date).getTime();

  if (Date.now() > expiresMs) {
    await wa.reply(
      '❌ El código expiró (válido 10 min).\n\nGenera uno nuevo desde la app.',
      'linking-expired-code',
      'warn',
    );
    return;
  }

  await userDoc.ref.update({ whatsappPhone: wa.to, linkCode: FieldValue.delete() });

  const firstName = (data.firstName as string | undefined) ?? 'amigo';
  await wa.reply(
    `✅ *¡Listo, ${firstName}!* Tu cuenta está vinculada.\n\n${MSG_HELP}`,
    'linking-success',
  );
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
