import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

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
 * File mirror — appends each log entry to whatsapp.log.
 * - Local dev (no VERCEL env): writes to repo root so the file is visible
 *   in the working tree (gitignored via *.log).
 * - Vercel: writes to /tmp which is the only writable path. The file
 *   persists across warm invocations on the same instance but is lost
 *   on cold starts. Useful for tailing within a hot function lifetime.
 */
const LOG_DIR = process.env.VERCEL ? '/tmp' : process.cwd();
const LOG_FILE = join(LOG_DIR, 'whatsapp.log');

function formatLogLine(entry: LogEntry): string {
  const ts = new Date().toISOString();
  const phone = entry.phone ?? '-';
  const text = (entry.text ?? '').replace(/\n/g, '\\n').slice(0, 500);
  const ctx = entry.context ? ' ' + JSON.stringify(entry.context).slice(0, 400) : '';
  return `[${ts}] [${entry.level.toUpperCase()}] ${entry.direction} ${entry.stage} ${phone} | ${text}${ctx}\n`;
}

async function mirrorToFile(entry: LogEntry): Promise<void> {
  try {
    await appendFile(LOG_FILE, formatLogLine(entry), 'utf8');
  } catch (err: any) {
    // Don't break the flow — fs may be read-only or path invalid
    console.error('[logger] file mirror failed:', err?.message ?? err);
  }
}

export async function readLogFileTail(lines = 50): Promise<string> {
  try {
    const content = await readFile(LOG_FILE, 'utf8');
    const all = content.split('\n').filter(Boolean);
    return all.slice(-lines).join('\n');
  } catch (err: any) {
    return `(no log file at ${LOG_FILE}: ${err?.message ?? err})`;
  }
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

  // File mirror (best-effort, never blocks the flow)
  await mirrorToFile(entry);

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
