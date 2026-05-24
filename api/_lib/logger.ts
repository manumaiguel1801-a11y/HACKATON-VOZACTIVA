import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogDirection = 'in' | 'out' | 'event';

export interface LogEntry {
  phone?: string;
  direction: LogDirection;
  level: LogLevel;
  stage: string;
  text?: string;
  context?: Record<string, unknown>;
}

/**
 * Persist a structured log entry to Firestore `whatsappLogs/` AND mirror it
 * to console for Vercel function log streaming. Failure to write to Firestore
 * is swallowed (logged only) so it never breaks the user-facing flow.
 *
 * TEMPORARY — for production debugging. Remove or gate behind env flag once
 * root cause is identified.
 */
export async function logEvent(db: Firestore, entry: LogEntry): Promise<void> {
  const prefix = `[LOG ${entry.level.toUpperCase()}] ${entry.direction} | ${entry.stage}`;
  const payload = {
    phone: entry.phone,
    text: entry.text ? entry.text.slice(0, 300) : undefined,
    ...(entry.context ?? {}),
  };
  if (entry.level === 'error') console.error(prefix, JSON.stringify(payload));
  else if (entry.level === 'warn') console.warn(prefix, JSON.stringify(payload));
  else console.log(prefix, JSON.stringify(payload));

  try {
    await db.collection('whatsappLogs').add({
      phone: entry.phone ?? null,
      direction: entry.direction,
      level: entry.level,
      stage: entry.stage,
      text: entry.text ?? null,
      context: entry.context ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err: any) {
    console.error('[logger] Firestore write failed:', err?.message ?? err);
  }
}

export async function getRecentLogs(
  db: Firestore,
  phone: string,
  limit = 15,
): Promise<Array<{ id: string; [k: string]: any }>> {
  const snap = await db.collection('whatsappLogs')
    .where('phone', '==', phone)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function formatLogsForWhatsApp(logs: Array<any>): string {
  if (logs.length === 0) return 'ℹ️ No hay logs recientes para tu número.';
  const lines = logs.slice().reverse().map(l => {
    const ts = l.createdAt?.toDate?.()?.toISOString?.()?.slice(11, 19) ?? '?';
    const arrow = l.direction === 'in' ? '⬇️' : l.direction === 'out' ? '⬆️' : '•';
    const lvl = l.level === 'error' ? '❌' : l.level === 'warn' ? '⚠️' : '✅';
    const txt = (l.text ?? '').replace(/\n/g, ' ').slice(0, 90);
    const ctx = l.context ? ` | ${JSON.stringify(l.context).slice(0, 120)}` : '';
    return `\`${ts}\` ${arrow}${lvl} *${l.stage}*\n${txt}${ctx}`;
  });
  return `📋 *Últimos ${logs.length} eventos*\n\n${lines.join('\n\n')}`;
}
