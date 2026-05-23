const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';

export async function sendWhatsApp(to: string, text: string): Promise<void> {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    console.error('[WhatsApp] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set');
    return;
  }
  const res = await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    console.error('[WhatsApp] sendMessage failed:', res.status, await res.text());
  }
}

export const MSG_NOT_LINKED = `👋 Hola

No tenemos tu cuenta vinculada todavía.

Para empezar:
1. Abre la app *Voz-Activa*
2. Ve a tu *Perfil*
3. Toca *"Vincular con WhatsApp"*
4. Copia el código de 6 dígitos que aparece
5. Envíame ese código así: VINCULAR 123456

Una vez vinculado, podrás registrar ventas y gastos enviándome un mensaje.`;

export const MSG_HELP = `📋 *¿Qué puedo registrar?*

💰 *Ventas:* "vendí 5 almuerzos a 12 mil"
💸 *Gastos:* "gasté 15 mil en gasolina"
📦 *Compras:* "compré 50 gaseosas"
🤝 *Fiados:* "Pedro me debe 20 mil" / "le debo 80 mil al proveedor"

Registra exactamente como hablas — sin formatos especiales.`;
