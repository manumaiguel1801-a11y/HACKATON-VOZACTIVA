import { collection, addDoc, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { RegistroDiario } from './types';

function daysAgo(n: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour + Math.floor(Math.random() * 5), Math.floor(Math.random() * 59), 0, 0);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Popula Firestore con datos de prueba realistas:
 * - Ventas 4 semanas con tendencia bajista esta semana (dispara alerta -30%)
 * - Fiado de 38 días sin pagar (dispara alerta >30 días)
 * - Meta activa "Nevera nueva" con 9 días sin_confirmar + 3 de esos con actividad en app
 *   (el agente detecta posible olvido de registro, no solo incumplimiento)
 */
export async function populateTestData(userId: string): Promise<void> {
  // ---- VENTAS (4 semanas) ----
  // Semana -4 y -3: buenas (~$90k/día)
  // Semana -2: regular (~$70k/día)
  // Esta semana: muy baja (~$45k/día) → dispara alerta -30%
  const salesData = [
    // Semana 4 atrás
    { total: 88000, concept: 'Tintos y empanadas', days: 28 },
    { total: 95000, concept: 'Almuerzo corriente ×6', days: 27 },
    { total: 72000, concept: 'Jugos naturales', days: 26 },
    { total: 115000, concept: 'Viernes de mercado', days: 24 },
    // Semana 3 atrás
    { total: 82000, concept: 'Tintos y aromáticas', days: 21 },
    { total: 97000, concept: 'Almuerzo corriente', days: 20 },
    { total: 90000, concept: 'Ventas mixtas', days: 19 },
    { total: 105000, concept: 'Viernes', days: 17 },
    // Semana 2 atrás (empieza a bajar)
    { total: 68000, concept: 'Tintos', days: 14 },
    { total: 74000, concept: 'Almuerzos', days: 13 },
    { total: 61000, concept: 'Ventas lentas', days: 12 },
    { total: 85000, concept: 'Viernes bueno', days: 10 },
    // Esta semana — muy baja (dispara alerta -35%)
    // OJO: estos días SÍ tienen actividad → el agente detecta posible olvido de registro en la meta
    { total: 41000, concept: 'Pocos clientes', days: 6 },
    { total: 38000, concept: 'Poco movimiento', days: 5 },
    { total: 52000, concept: 'Almuerzos del día', days: 4 },
    { total: 45000, concept: 'Tintos y jugo', days: 3 },
    { total: 39000, concept: 'Martes flojo', days: 2 },
  ];

  for (const s of salesData) {
    await addDoc(collection(db, 'users', userId, 'sales'), {
      total: s.total,
      concept: s.concept,
      source: 'manual',
      createdAt: Timestamp.fromDate(daysAgo(s.days)),
    });
  }

  // ---- GASTOS ----
  const expensesData = [
    { amount: 38000, concept: 'Mercado de tintos y café', days: 27 },
    { amount: 30000, concept: 'Insumos almuerzo', days: 20 },
    { amount: 44000, concept: 'Mercado semanal', days: 13 },
    { amount: 18000, concept: 'Gas domicilio', days: 10 },
    { amount: 41000, concept: 'Insumos semana', days: 6 },
    { amount: 25000, concept: 'Arroz y aceite', days: 4 },
  ];

  for (const e of expensesData) {
    await addDoc(collection(db, 'users', userId, 'expenses'), {
      amount: e.amount,
      concept: e.concept,
      source: 'manual',
      createdAt: Timestamp.fromDate(daysAgo(e.days)),
    });
  }

  // ---- FIADO VIEJO (38 días, >30 días → dispara alerta) ----
  await addDoc(collection(db, 'users', userId, 'debts'), {
    name: 'Carlos Rodríguez',
    concept: 'Fiado de almuerzos semana de puente',
    amount: 75000,
    type: 'me-deben',
    status: 'pendiente',
    amountPaid: 0,
    createdAt: Timestamp.fromDate(daysAgo(38)),
  });

  // Fiado reciente (normal)
  await addDoc(collection(db, 'users', userId, 'debts'), {
    name: 'María López',
    concept: 'Almuerzos de la semana',
    amount: 30000,
    type: 'me-deben',
    status: 'pendiente',
    amountPaid: 0,
    createdAt: Timestamp.fromDate(daysAgo(8)),
  });

  // ---- INVENTARIO ----
  await addDoc(collection(db, 'users', userId, 'inventario'), {
    nombre: 'Tintos',
    cantidad: 45,
    precioCompra: 500,
    precioVenta: 1000,
    createdAt: Timestamp.fromDate(daysAgo(30)),
  });

  await addDoc(collection(db, 'users', userId, 'inventario'), {
    nombre: 'Almuerzo corriente',
    cantidad: 0,
    precioCompra: 9000,
    precioVenta: 15000,
    createdAt: Timestamp.fromDate(daysAgo(30)),
  });

  // ---- META ACTIVA ----
  // Creada hace 20 días. Primeros 11 días: cumplido. Últimos 9: sin_confirmar.
  // De los 9 sin_confirmar, los días 6, 5, 4, 3, 2 atrás SÍ tienen ventas registradas
  // → el agente detecta que probablemente el usuario olvidó confirmar el ahorro esos días.
  const fechaInicio = daysAgo(20);
  fechaInicio.setHours(0, 0, 0, 0);
  const fechaObjetivo = new Date();
  fechaObjetivo.setDate(fechaObjetivo.getDate() + 48);
  fechaObjetivo.setHours(23, 59, 0, 0);

  const registros: RegistroDiario[] = [];
  for (let i = 20; i >= 1; i--) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - i);
    const dateStr = toDateStr(fecha);

    if (i > 9) {
      // Días 20 a 10 atrás: el usuario cumplía
      registros.push({ fecha: dateStr, estado: 'cumplido', montoAhorrado: 15000 });
    } else {
      // Últimos 9 días: sin confirmar
      registros.push({ fecha: dateStr, estado: 'sin_confirmar' });
    }
  }

  const metaRef = doc(collection(db, 'users', userId, 'metas'));
  await setDoc(metaRef, {
    nombre: 'Nevera nueva para el negocio',
    montoObjetivo: 500000,
    montoAhorrado: 85000, // 11 días * $15k = $165k menos ajustes; se deja en $85k para mostrar rezago
    ahorroDiario: 15000,
    fechaInicio: Timestamp.fromDate(fechaInicio),
    fechaObjetivo: Timestamp.fromDate(fechaObjetivo),
    estado: 'en-riesgo',
    registros,
    historialAjustes: [],
  });

  console.log('[testData] ✅ Datos de prueba cargados para usuario:', userId);
}
