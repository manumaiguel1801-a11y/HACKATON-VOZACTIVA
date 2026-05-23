const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

export async function sendTelegram(chatId: number | string, text: string): Promise<void> {
  if (!BOT_TOKEN) {
    console.error('[Telegram] TELEGRAM_BOT_TOKEN not set');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    console.error('[Telegram] sendMessage failed:', res.status, await res.text());
  }
}

export const MSG_NOT_LINKED = `👋 <b>Hola</b>

No tenemos tu cuenta vinculada todavía.

Para empezar:
1. Abre la app <b>Voz-Activa</b>
2. Ve a tu <b>Perfil</b>
3. Toca <b>"Vincular con Telegram"</b>
4. Copia el código de 6 dígitos que aparece
5. Envíame ese código así: <code>/vincular 123456</code>

Una vez vinculado, podrás registrar ventas y gastos enviándome un mensaje.`;

export const MSG_HELP = `📋 <b>¿Qué puedo registrar?</b>

💰 <b>Ventas:</b> "vendí 5 almuerzos a 12 mil"
💸 <b>Gastos:</b> "gasté 15 mil en gasolina"
📦 <b>Compras:</b> "compré 50 gaseosas"
🤝 <b>Fiados:</b> "Pedro me debe 20 mil" / "le debo 80 mil al proveedor"

Registra exactamente como hablas — sin formatos especiales.`;
