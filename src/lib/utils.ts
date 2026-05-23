import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Primera letra de cada palabra en mayúscula. "manuel perez" → "Manuel Perez" */
export const capitalizar = (str: string): string =>
  str.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

/**
 * Detecta el género/número gramatical de un nombre de producto en español
 * analizando la terminación de la ÚLTIMA palabra del nombre.
 *
 * Reglas (por orden de prioridad):
 *   "as"       → 'femenino'  — Manzanas, Gaseosas, Papas
 *   "os" | "es"→ 'masculino' — Tintos, Jugos, Limones
 *   otro       → 'neutro'    — Arroz, Pan, Jugo de Naranja, Leche
 *
 * Uso en consejos de stock bajo:
 *   femenino  → "Te quedan pocas Manzanas, solo 2 unidades."
 *   masculino → "Te quedan pocos Tintos, solo 3 unidades."
 *   neutro    → "Te queda poco Arroz, solo 1 unidad."
 */
export type Genero = 'femenino' | 'masculino' | 'neutro';

export function detectarGenero(nombre: string): Genero {
  const words = nombre.trim().split(/\s+/);
  const lastWord = words[words.length - 1].toLowerCase();
  if (lastWord.endsWith('as')) return 'femenino';
  if (lastWord.endsWith('os') || lastWord.endsWith('es')) return 'masculino';
  return 'neutro';
}

/** Devuelve el nombre del producto con su artículo definido en español.
 * "Naranjas" → "las Naranjas", "Arroz" → "el Arroz", "Panela" → "la Panela"
 */
export function conArticulo(nombre: string): string {
  if (!nombre) return nombre;
  const last = nombre.trim().split(/\s+/).pop()!.toLowerCase();
  if (last.endsWith('as')) return `las ${nombre}`;
  if (last.endsWith('os')) return `los ${nombre}`;
  if (last.endsWith('es')) return `los ${nombre}`;
  if (last.endsWith('a'))  return `la ${nombre}`;
  if (last.endsWith('o'))  return `el ${nombre}`;
  if (last.endsWith('e'))  return `el ${nombre}`;
  return `el ${nombre}`;
}

/** Pronombre acusativo que corresponde al artículo del producto.
 * "Naranjas" → "las", "Arroz" → "lo", "Panela" → "la"
 */
export function pronombre(nombre: string): string {
  const art = conArticulo(nombre);
  if (art.startsWith('las ')) return 'las';
  if (art.startsWith('los ')) return 'los';
  if (art.startsWith('la '))  return 'la';
  return 'lo';
}
