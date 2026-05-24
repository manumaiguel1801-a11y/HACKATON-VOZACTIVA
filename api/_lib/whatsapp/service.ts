/**
 * High-level WhatsApp service. Wraps the low-level client with automatic
 * structured logging to Firestore + console. Every outbound message is
 * persisted via logEvent so /logs always reflects what the bot sent.
 *
 * Usage:
 *   const wa = createWhatsAppService(db, fromPhone);
 *   await wa.reply('Hola', 'cmd-greet');
 *   await wa.replyError(debugBlock, 'handler-catch', { stack });
 */

import type { Firestore } from 'firebase-admin/firestore';
import { sendTextMessage, type SendResult } from './client.js';
import { logEvent, type LogLevel } from '../logger.js';

export interface WhatsAppService {
  readonly to: string;
  reply(text: string, stage: string, level?: LogLevel): Promise<SendResult>;
  replyError(text: string, stage: string, context?: Record<string, unknown>): Promise<SendResult>;
}

function buildLogContext(result: SendResult, extra?: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = { attempts: result.attempts };
  if (result.ok) {
    base.messageId = result.messageId;
  } else {
    base.sendError = result.error;
    base.status = result.status;
  }
  return extra ? { ...extra, ...base } : base;
}

export function createWhatsAppService(db: Firestore, to: string): WhatsAppService {
  return {
    to,

    async reply(text, stage, level = 'info'): Promise<SendResult> {
      const result = await sendTextMessage(to, text);
      await logEvent(db, {
        phone: to,
        direction: 'out',
        level: result.ok ? level : 'error',
        stage,
        text,
        context: buildLogContext(result),
      });
      return result;
    },

    async replyError(text, stage, context): Promise<SendResult> {
      const result = await sendTextMessage(to, text);
      await logEvent(db, {
        phone: to,
        direction: 'out',
        level: 'error',
        stage,
        text,
        context: buildLogContext(result, context),
      });
      return result;
    },
  };
}
