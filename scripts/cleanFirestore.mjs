/**
 * cleanFirestore.mjs — elimina documentos con montos inválidos (NaN/null/undefined/Infinity)
 * Colecciones limpiadas: sales (campo: total) y expenses (campo: amount)
 * Uso: node scripts/cleanFirestore.mjs
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ── Cargar credenciales desde .env.local ─────────────────────────────────────
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, '')];
    })
);

const serviceAccount = {
  projectId:   env.FIREBASE_PROJECT_ID,
  privateKey:  env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  clientEmail: env.FIREBASE_CLIENT_EMAIL,
};

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore('ai-studio-c7314b5a-dae1-4e68-9a55-87d3b4cfde3e');

// ── Validación ────────────────────────────────────────────────────────────────
const esMontoValido = (v) =>
  typeof v === 'number' && !isNaN(v) && isFinite(v) && v >= 0;

// ── Limpiar colección grupo ───────────────────────────────────────────────────
async function limpiarColeccion(nombreColeccion, campo) {
  console.log(`\n🔍 Revisando colección "${nombreColeccion}" (campo: ${campo})...`);
  const snap = await db.collectionGroup(nombreColeccion).get();
  console.log(`   ${snap.size} documentos encontrados`);

  const corruptos = snap.docs.filter(d => !esMontoValido(d.data()[campo]));
  console.log(`   ${corruptos.length} documentos con ${campo} inválido`);

  if (corruptos.length === 0) {
    console.log('   ✅ Nada que limpiar');
    return 0;
  }

  // Borrar en lotes de 500 (límite de Firestore batch)
  let eliminados = 0;
  for (let i = 0; i < corruptos.length; i += 500) {
    const batch = db.batch();
    corruptos.slice(i, i + 500).forEach(d => {
      const data = d.data();
      console.log(`   🗑  ${d.ref.path} | ${campo}=${JSON.stringify(data[campo])}`);
      batch.delete(d.ref);
    });
    await batch.commit();
    eliminados += Math.min(500, corruptos.length - i);
  }

  console.log(`   ✅ ${eliminados} documentos eliminados`);
  return eliminados;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const totalSales    = await limpiarColeccion('sales',    'total');
const totalExpenses = await limpiarColeccion('expenses', 'amount');

console.log(`\n✅ Limpieza completa: ${totalSales + totalExpenses} documentos corruptos eliminados.`);
process.exit(0);
