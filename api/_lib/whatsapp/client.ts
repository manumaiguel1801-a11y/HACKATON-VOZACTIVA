/**
 * Low-level WhatsApp Cloud API (Meta Graph) client.
 * Pure transport — no logging, no business logic. Returns a structured
 * SendResult so callers can decide how to surface success/failure.
 */

const META_VERSION = 'v22.0';
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 200;

export interface SendResult {
  ok: boolean;
  status?: number;
  messageId?: string;
  error?: string;
  attempts: number;
}

interface ClientEnv {
  token: string;
  phoneNumberId: string;
}

function getEnv(): ClientEnv | null {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId };
}

async function postToMeta(env: ClientEnv, payload: unknown): Promise<Response> {
  return fetch(`https://graph.facebook.com/${META_VERSION}/${env.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.token}`,
    },
    body: JSON.stringify(payload),
  });
}

/**
 * Send a plain text WhatsApp message. Retries on 5xx and network errors
 * with exponential backoff. Returns a structured result instead of throwing.
 */
export async function sendTextMessage(to: string, body: string): Promise<SendResult> {
  const env = getEnv();
  if (!env) {
    return {
      ok: false,
      attempts: 0,
      error: 'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set',
    };
  }

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  };

  let lastError = '';
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const res = await postToMeta(env, payload);
      lastStatus = res.status;

      if (res.ok) {
        const data: any = await res.json().catch(() => ({}));
        return {
          ok: true,
          status: res.status,
          messageId: data?.messages?.[0]?.id,
          attempts: attempt,
        };
      }

      const errText = await res.text();
      lastError = `${res.status}: ${errText.slice(0, 300)}`;

      // Don't retry on 4xx (auth, invalid recipient, etc.)
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, status: res.status, error: lastError, attempts: attempt };
      }
    } catch (err: any) {
      lastError = err?.message ?? String(err);
    }

    if (attempt <= MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * attempt));
    }
  }

  return { ok: false, status: lastStatus, error: lastError, attempts: MAX_RETRIES + 1 };
}
