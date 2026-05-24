import { GoogleGenAI } from '@google/genai';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { storage, db } from '../firebase';

export interface VerificationResult {
  ok: boolean;
  extractedCedula?: string;
  extractedName?: string;
  confidence: 'alta' | 'media' | 'baja';
  message: string;
}

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('No hay GEMINI_API_KEY configurada');
  return new GoogleGenAI({ apiKey: key });
}

function normalizeNum(s: string): string {
  return s.replace(/[\s.\-,]/g, '');
}

/** Convert File to base64 string */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g. "data:image/jpeg;base64,")
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Ask Gemini Vision to read the cédula document */
export async function analyzeCedulaImage(file: File, enteredCedula: string): Promise<VerificationResult> {
  const client = getClient();
  const base64 = await fileToBase64(file);
  const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';

  const prompt = `Analiza esta imagen de una cédula de ciudadanía colombiana.
Extrae únicamente:
1. El número de cédula (solo dígitos, sin puntos ni espacios)
2. El nombre completo de la persona

Responde SOLO con JSON válido, sin markdown, sin explicación:
{"cedula": "1234567890", "nombre": "JUAN CARLOS PEREZ GOMEZ", "esDocumentoValido": true}

Si la imagen no es una cédula o no se pueden leer los datos, responde:
{"cedula": "", "nombre": "", "esDocumentoValido": false}`;

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: prompt },
          ],
        },
      ],
    });

    const raw = response.text?.trim() ?? '';
    const jsonStr = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.esDocumentoValido) {
      return {
        ok: false,
        confidence: 'baja',
        message: 'No pudimos leer el documento. Asegúrate de que la foto sea clara y muestre toda la cédula.',
      };
    }

    const extractedNum = normalizeNum(parsed.cedula ?? '');
    const enteredNum   = normalizeNum(enteredCedula);
    const match = extractedNum === enteredNum;

    if (!match) {
      return {
        ok: false,
        extractedCedula: extractedNum,
        extractedName: parsed.nombre,
        confidence: 'alta',
        message: `El número de la cédula (${extractedNum}) no coincide con el que ingresaste (${enteredNum}). Verifica e intenta de nuevo.`,
      };
    }

    return {
      ok: true,
      extractedCedula: extractedNum,
      extractedName: parsed.nombre,
      confidence: 'alta',
      message: `Identidad verificada. Bienvenido, ${parsed.nombre}.`,
    };

  } catch (e: any) {
    console.error('[IdentityService] Gemini error:', e);
    return {
      ok: false,
      confidence: 'baja',
      message: 'Error al analizar la imagen. Intenta de nuevo.',
    };
  }
}

/** Upload the cédula photo and save verification status to Firestore */
export async function saveVerification(
  userId: string,
  file: File,
  result: VerificationResult,
): Promise<void> {
  // Upload photo to Firebase Storage
  const storageRef = ref(storage, `users/${userId}/cedula.jpg`);
  await uploadBytes(storageRef, file);
  const photoURL = await getDownloadURL(storageRef);

  // Save verification status on user doc
  await updateDoc(doc(db, 'users', userId), {
    identityVerified: result.ok,
    identityVerifiedAt: result.ok ? serverTimestamp() : null,
    cedulaPhotoURL: photoURL,
    cedulaExtracted: result.extractedCedula ?? '',
    cedulaName: result.extractedName ?? '',
  });
}
