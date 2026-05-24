import { GoogleGenAI, Type } from '@google/genai';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { storage, db } from '../firebase';

export interface VerificationResult {
  ok: boolean;
  extractedCedula?: string;
  extractedName?: string;
  extractedBirthDate?: string;
  confidence: 'alta' | 'media' | 'baja';
  message: string;
}

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('No hay GEMINI_API_KEY configurada');
  return new GoogleGenAI({ apiKey: key });
}

function normalizeNum(s: string): string {
  return s.replace(/[\s.\-,]/g, '');
}

// Parse into {day,month,year} from YYYY-MM-DD or DD/MM/YYYY
function parseDateParts(s: string): { day: string; month: string; year: string } | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { year: iso[1], month: iso[2], day: iso[3] };
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (dmy) return {
    day: dmy[1].padStart(2, '0'),
    month: dmy[2].padStart(2, '0'),
    year: dmy[3].length === 2 ? '19' + dmy[3] : dmy[3],
  };
  return null;
}

function datesMatch(a: string, b: string): boolean {
  const pa = parseDateParts(a);
  const pb = parseDateParts(b);
  if (!pa || !pb) return false;
  return pa.day === pb.day && pa.month === pb.month && pa.year === pb.year;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const CEDULA_SCHEMA = {
  responseMimeType: 'application/json' as const,
  responseSchema: {
    type: Type.OBJECT,
    properties: {
      cedula:           { type: Type.STRING },
      nombre:           { type: Type.STRING },
      fechaNacimiento:  { type: Type.STRING },
      esDocumentoValido:{ type: Type.BOOLEAN },
    },
    required: ['cedula', 'nombre', 'fechaNacimiento', 'esDocumentoValido'],
  },
};

export async function analyzeCedulaImage(
  file: File,
  enteredCedula: string,
  enteredBirthDate: string,
): Promise<VerificationResult> {
  const client  = getClient();
  const base64  = await fileToBase64(file);
  const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/webp';

  const prompt = `Analiza esta imagen de una cédula de ciudadanía colombiana.
Extrae únicamente:
1. El número de cédula (solo dígitos, sin puntos ni espacios)
2. El nombre completo de la persona
3. La fecha de nacimiento en formato DD/MM/YYYY

Si la imagen no es una cédula colombiana válida o no se pueden leer los datos, devuelve esDocumentoValido: false y los demás campos vacíos.`;

  const contents = [{
    role: 'user' as const,
    parts: [
      { inlineData: { mimeType, data: base64 } },
      { text: prompt },
    ],
  }];

  try {
    const client2 = getClient();
    let response: any;
    let lastErr: any;

    for (const model of MODELS) {
      try {
        response = await client2.models.generateContent({ model, contents, config: CEDULA_SCHEMA });
        break;
      } catch (err: any) {
        console.warn(`[IdentityService] ${model} falló:`, err?.message ?? err);
        lastErr = err;
      }
    }
    if (!response) throw lastErr;

    const parsed = JSON.parse(response.text || '{}');

    if (!parsed.esDocumentoValido) {
      return {
        ok: false,
        confidence: 'baja',
        message: 'No pudimos leer el documento. Asegúrate de que la foto sea clara y muestre toda la cédula.',
      };
    }

    const extractedNum  = normalizeNum(parsed.cedula ?? '');
    const enteredNum    = normalizeNum(enteredCedula);
    const cedulaMatch   = extractedNum === enteredNum;

    // If no profile birth date provided, skip the check
    const dateMatch = !enteredBirthDate || datesMatch(parsed.fechaNacimiento ?? '', enteredBirthDate);

    if (!cedulaMatch) {
      return {
        ok: false,
        extractedCedula: extractedNum,
        extractedName: parsed.nombre,
        extractedBirthDate: parsed.fechaNacimiento,
        confidence: 'alta',
        message: `El número de cédula en el documento (${extractedNum}) no coincide con el que ingresaste (${enteredNum}).`,
      };
    }

    if (!dateMatch) {
      return {
        ok: false,
        extractedCedula: extractedNum,
        extractedName: parsed.nombre,
        extractedBirthDate: parsed.fechaNacimiento,
        confidence: 'alta',
        message: `La fecha de nacimiento en el documento (${parsed.fechaNacimiento}) no coincide con la que ingresaste.`,
      };
    }

    return {
      ok: true,
      extractedCedula: extractedNum,
      extractedName: parsed.nombre,
      extractedBirthDate: parsed.fechaNacimiento,
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

export async function saveVerification(
  userId: string,
  file: File,
  result: VerificationResult,
): Promise<void> {
  const storageRef = ref(storage, `users/${userId}/cedula.jpg`);
  await uploadBytes(storageRef, file);
  const photoURL = await getDownloadURL(storageRef);

  await updateDoc(doc(db, 'users', userId), {
    identityVerified: result.ok,
    identityVerifiedAt: result.ok ? serverTimestamp() : null,
    cedulaPhotoURL: photoURL,
    cedulaExtracted: result.extractedCedula ?? '',
    cedulaName: result.extractedName ?? '',
  });
}
