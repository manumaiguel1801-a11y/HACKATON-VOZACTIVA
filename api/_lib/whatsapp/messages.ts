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

Registra exactamente como hablas — sin formatos especiales.

_CANCELAR — cancela cualquier operación en curso_
_/LOGS — últimos 15 eventos desde Firestore (debug)_
_/LOGFILE — tail del archivo whatsapp.log (debug)_`;

export const MSG_ERROR_GENERIC = '⚠️ Hubo un error. Intenta de nuevo.';
export const MSG_HELP_FALLBACK = 'No pude entender el mensaje. Ejemplo: "vendí 3 jugos a 3000".';
