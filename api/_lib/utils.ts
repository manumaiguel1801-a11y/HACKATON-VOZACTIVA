/**
 * Devuelve el nombre del producto con su artículo definido en español.
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
  return `el ${nombre}`; // consonante → masculino por defecto
}

/** Pronombre acusativo que corresponde al artículo del producto.
 * "las Naranjas" → "las", "el Arroz" → "lo", "la Panela" → "la"
 */
export function pronombre(nombre: string): string {
  const art = conArticulo(nombre);
  if (art.startsWith('las ')) return 'las';
  if (art.startsWith('los ')) return 'los';
  if (art.startsWith('la '))  return 'la';
  return 'lo';
}
