import jsPDF from 'jspdf';
import { doc as fsDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Sale, Expense, Debt, UserProfile } from '../types';
import { calculateScore, getScoreLabel, ScoreBreakdown, getBusinessAgeDays, getMonthlyProjection } from './scoringService';

// ─── Paleta ──────────────────────────────────────────���─────────────────────────
const C = {
  gold:      [184, 134, 11]  as [number,number,number],
  goldLight: [255, 215,  0]  as [number,number,number],
  dark:      [ 26,  26, 26]  as [number,number,number],
  gray:      [ 91,  92, 90]  as [number,number,number],
  lightGray: [220, 220, 218] as [number,number,number],
  cream:     [253, 251, 240] as [number,number,number],
  white:     [255, 255, 255] as [number,number,number],
  green:     [ 22, 163, 74]  as [number,number,number],
  orange:    [234,  88, 12]  as [number,number,number],
  red:       [220,  38, 38]  as [number,number,number],
  greenLight:[220, 252, 231] as [number,number,number],
};

function rgb(doc: jsPDF, type: 'fill' | 'text' | 'draw', color: [number,number,number]) {
  if (type === 'fill')  doc.setFillColor(...color);
  if (type === 'text')  doc.setTextColor(...color);
  if (type === 'draw')  doc.setDrawColor(...color);
}

function qualLabel(pct: number): { text: string; color: [number,number,number] } {
  if (pct >= 0.8) return { text: 'EXCELENTE', color: C.green };
  if (pct >= 0.6) return { text: 'BIEN',      color: C.gold };
  if (pct >= 0.35) return { text: 'MEJORABLE', color: C.orange };
  return { text: 'BAJO', color: C.red };
}

function scoreColor(score: number): [number,number,number] {
  if (score >= 750) return C.green;
  if (score >= 700) return [132, 204, 22];
  if (score >= 600) return C.gold;
  if (score >= 500) return C.orange;
  return C.red;
}

function formatCOP(n: number): string {
  return '$' + n.toLocaleString('es-CO');
}

function formatDate(d = new Date()): string {
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
}

function addMonths(d: Date, m: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + m);
  return r;
}

function generateVerifCode(idNumber: string): string {
  const now = new Date();
  const yr = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const last4 = (idNumber ?? '0000').replace(/\D/g, '').slice(-4).padStart(4, '0');
  const rand = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  return `VA-${yr}${mo}-${last4}-${rand}`;
}

// ─── Helpers de dibujo ──────────────────���───────────────────────���─────────────

function sectionTitle(doc: jsPDF, text: string, x: number, y: number, w: number) {
  rgb(doc, 'text', C.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(text.toUpperCase(), x, y);
  rgb(doc, 'draw', C.gold);
  doc.setLineWidth(0.4);
  doc.line(x, y + 1.5, x + w, y + 1.5);
}

function scoreBar(doc: jsPDF, score: number, x: number, y: number, w: number) {
  const min = 150; const max = 950;
  const pct = (score - min) / (max - min);

  // Track background
  rgb(doc, 'fill', C.lightGray);
  doc.roundedRect(x, y, w, 4, 2, 2, 'F');

  // Filled portion — gradient simulation: draw 3 segments
  // 150–500 = rojo (44%), 500–750 = dorado (31%), 750–950 = verde (25%)
  const segments = [
    { from: 0,    to: 0.44, color: C.red },
    { from: 0.44, to: 0.75, color: C.gold },
    { from: 0.75, to: 1.00, color: C.green },
  ];
  segments.forEach(({ from, to, color }) => {
    const segStart = x + w * from;
    const segEnd   = x + w * Math.min(pct, to);
    if (segEnd > segStart) {
      rgb(doc, 'fill', color);
      doc.rect(segStart, y, segEnd - segStart, 4, 'F');
    }
  });

  // Clip bar ends to rounded shape (overdraw corners)
  rgb(doc, 'fill', C.white);
  doc.rect(x - 1, y - 1, 3, 6, 'F');         // left corner mask
  doc.rect(x + w - 2, y - 1, 3, 6, 'F');     // right corner mask
  rgb(doc, 'fill', C.lightGray);
  doc.roundedRect(x, y, w, 4, 2, 2, 'FD');  // re-draw bg outline

  // Re-draw filled portion on top of masks
  segments.forEach(({ from, to, color }) => {
    const segStart = x + w * from;
    const segEnd   = x + w * Math.min(pct, to);
    if (segEnd > segStart) {
      rgb(doc, 'fill', color);
      const rLeft  = from === 0 ? 2 : 0;
      const rRight = to >= pct ? 2 : 0;
      // jsPDF roundedRect only supports symmetric radius — use rect with manual ends
      doc.rect(segStart + rLeft, y, segEnd - segStart - rLeft - rRight, 4, 'F');
      if (rLeft > 0) {
        doc.circle(segStart + rLeft, y + 2, 2, 'F');
      }
      if (rRight > 0 && pct < 1) {
        doc.circle(segEnd - rRight, y + 2, 2, 'F');
      }
    }
  });

  // Marker dot
  const markerX = x + w * pct;
  rgb(doc, 'fill', C.white);
  doc.circle(markerX, y + 2, 2.8, 'F');
  rgb(doc, 'fill', scoreColor(score));
  doc.circle(markerX, y + 2, 2, 'F');

  // Scale labels
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  rgb(doc, 'text', C.gray);
  doc.text('150', x, y + 9);
  doc.text('500', x + w * 0.44, y + 9, { align: 'center' });
  doc.text('750', x + w * 0.75, y + 9, { align: 'center' });
  doc.text('950', x + w, y + 9, { align: 'right' });

  rgb(doc, 'text', C.lightGray);
  doc.text('Riesgo alto', x + w * 0.22, y + 9, { align: 'center' });
  doc.text('Aceptable', x + w * 0.595, y + 9, { align: 'center' });
  doc.text('Excelente', x + w * 0.875, y + 9, { align: 'center' });
}

// ─── Generador principal ──────────────────────────────────────────────────────
export async function generatePassportPDF(
  profile: UserProfile | null,
  sales: Sale[],
  expenses: Expense[],
  debts: Debt[],
  userId?: string,
  baseUrl?: string,
): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 14;           // margen
  const CW = W - M * 2;  // content width
  const now = new Date();

  const bd: ScoreBreakdown = calculateScore(sales, expenses, debts);
  const totalIngresos = sales.reduce((s, v) => s + v.total, 0);
  const totalGastos   = expenses.reduce((s, e) => s + e.amount, 0);
  const margenNeto    = totalIngresos > 0
    ? Math.round(((totalIngresos - totalGastos) / totalIngresos) * 100)
    : 0;

  const nombre   = profile ? `${profile.firstName} ${profile.lastName}` : 'Usuario Voz-Activa';
  const cedula   = profile?.idNumber ?? '—';
  const telefono = profile?.phone    ?? '—';

  // Código de verificación persistente (reusar si no expiró)
  let verifCode: string;
  const existing = profile?.verificationCode;
  if (existing?.code && existing?.expiresAt) {
    const expiry = existing.expiresAt.toDate ? existing.expiresAt.toDate() : new Date(existing.expiresAt);
    verifCode = expiry > now ? existing.code : generateVerifCode(cedula);
  } else {
    verifCode = generateVerifCode(cedula);
  }

  // Persistir datos de verificación via API (Admin SDK — sin restricciones de reglas).
  // No bloquea la descarga si falla.
  if (userId) {
    const newExpiry = addMonths(now, 3);
    const newExpiryTs = Timestamp.fromDate(newExpiry);

    try {
      // Actualizar el doc del usuario con el código (esto sí pasa por cliente SDK)
      if (verifCode !== existing?.code) {
        await updateDoc(fsDoc(db, 'users', userId), {
          verificationCode: { code: verifCode, expiresAt: newExpiryTs },
        });
      }

      // Escribir passportVerifications via API con token de autenticación
      const idToken = await auth.currentUser?.getIdToken();
      if (idToken) {
        const expiresIso = (verifCode === existing?.code && existing?.expiresAt)
          ? (existing.expiresAt.toDate ? existing.expiresAt.toDate().toISOString() : new Date(existing.expiresAt).toISOString())
          : newExpiry.toISOString();

        await fetch('/api/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify({
            code: verifCode,
            data: {
              name: nombre,
              score: bd.scoreFinal,
              scoreLabel: getScoreLabel(bd.scoreFinal),
              businessAgeDays: getBusinessAgeDays(sales, expenses, debts),
              monthlyProjection: getMonthlyProjection(sales),
              expiresAt: expiresIso,
            },
          }),
        });
      }
    } catch (e) {
      console.error('[pdfService] Error guardando verificación:', e);
    }
  }

  const validUntil = formatDate(addMonths(now, 3));
  const sc = scoreColor(bd.scoreFinal);

  let y = 0;

  // ── FRANJA IZQUIERDA DORADA (full height) ─────��───────────────────────────
  rgb(doc, 'fill', C.gold);
  doc.rect(0, 0, 5, 297, 'F');

  // ── 1. HEADER ────────────────��─────────────────────────────────────────────
  rgb(doc, 'fill', C.dark);
  doc.rect(5, 0, W - 5, 38, 'F');

  // Logo wordmark
  rgb(doc, 'text', C.goldLight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('VOZ·ACTIVA', M + 2, 14);

  rgb(doc, 'text', [180, 180, 175]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('SCORING CREDITICIO ALTERNATIVO PARA MICRONEGOCIOS', M + 2, 21);

  // Documento tipo
  rgb(doc, 'fill', C.gold);
  doc.roundedRect(M + 2, 25, 70, 8, 1.5, 1.5, 'F');
  rgb(doc, 'text', C.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('PASAPORTE FINANCIERO EMPRESARIAL', M + 2 + 35, 30.2, { align: 'center' });

  // Número de documento
  rgb(doc, 'text', [180, 180, 175]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`N° ${verifCode}`, W - M, 14, { align: 'right' });
  doc.text('Documento verificado', W - M, 20, { align: 'right' });

  y = 48;

  // ── 2. TITULAR ───────────���──────────────────────────────────────��──────────
  sectionTitle(doc, 'Datos del Titular', M, y, CW);
  y += 7;

  // Col izquierda: nombre + cedula + tel
  rgb(doc, 'text', C.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(nombre, M, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  rgb(doc, 'text', C.gray);
  doc.text(`Cédula de ciudadanía: ${cedula}`, M, y);
  y += 5;
  doc.text(`Teléfono: ${telefono}`, M, y);
  y += 5;

  // Col derecha: fechas
  doc.setFontSize(7.5);
  doc.text('Fecha de emisión:', W - M - 55, y - 10);
  rgb(doc, 'text', C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(formatDate(now), W - M - 55, y - 5);
  doc.setFont('helvetica', 'normal');
  rgb(doc, 'text', C.gray);
  doc.text('Válido hasta:', W - M - 55, y);
  rgb(doc, 'text', C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(validUntil, W - M - 55, y + 5);

  y += 12;

  // ── 3. SCORE HERO ─────────────────────��───────────────────────────────────
  sectionTitle(doc, 'Score de Confianza Empresarial', M, y, CW);
  y += 7;

  // Caja score
  rgb(doc, 'fill', C.cream);
  rgb(doc, 'draw', C.gold);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, CW, 38, 3, 3, 'FD');

  // Número grande
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(42);
  rgb(doc, 'text', sc);
  doc.text(String(bd.scoreFinal), M + CW * 0.28, y + 17, { align: 'center' });

  // /850
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  rgb(doc, 'text', C.gray);
  doc.text('/ 950', M + CW * 0.28 + 16, y + 11);

  // Etiqueta
  const label = getScoreLabel(bd.scoreFinal).toUpperCase();
  rgb(doc, 'fill', sc);
  doc.roundedRect(M + CW * 0.28 - 16, y + 19, 32, 7, 2, 2, 'F');
  rgb(doc, 'text', C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(label, M + CW * 0.28, y + 23.8, { align: 'center' });

  // Barra de score (derecha)
  const barX = M + CW * 0.45;
  const barW = CW * 0.52;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  rgb(doc, 'text', C.gray);
  doc.text('Posición en la escala:', barX, y + 6);
  scoreBar(doc, bd.scoreFinal, barX, y + 9, barW);

  y += 46;

  // ── 4. RESUMEN FINANCIERO ───────────────────────────────────���─────────────
  sectionTitle(doc, 'Resumen Financiero', M, y, CW);
  y += 7;

  const metrics = [
    { label: 'Ingresos totales',    value: formatCOP(totalIngresos) },
    { label: 'Gastos registrados',  value: formatCOP(totalGastos) },
    { label: 'Margen neto',         value: `${margenNeto}%` },
    { label: 'Ventas registradas',  value: `${sales.length} transacciones` },
  ];

  const halfCW = (CW - 4) / 2;
  metrics.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = M + col * (halfCW + 4);
    const cy = y + row * 14;

    rgb(doc, 'fill', col === 0 ? C.cream : [245, 242, 225]);
    rgb(doc, 'draw', C.lightGray);
    doc.setLineWidth(0.2);
    doc.roundedRect(cx, cy, halfCW, 12, 1.5, 1.5, 'FD');

    rgb(doc, 'text', C.gray);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(m.label, cx + halfCW / 2, cy + 4.5, { align: 'center' });

    rgb(doc, 'text', C.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(m.value, cx + halfCW / 2, cy + 10, { align: 'center' });
  });

  y += 30;

  // ── 5. ANÁLISIS DE COMPORTAMIENTO ─────────────────────────────────────────
  sectionTitle(doc, 'Análisis de Comportamiento del Negocio', M, y, CW);
  y += 7;

  const factors = [
    { label: 'Consistencia de ingresos',        value: bd.consistenciaIngresos, max: 30 },
    { label: 'Capacidad de pago',                value: bd.capacidadPago,        max: 25 },
    { label: 'Gestión de fiados y deudas',       value: bd.gestionFiados,        max: 20 },
    { label: 'Salud de inventario',              value: bd.saludInventario,      max: 15 },
    { label: 'Calidad y confiabilidad de datos', value: bd.calidadDatos,         max: 10 },
  ];

  factors.forEach((f, i) => {
    const pct = f.value / f.max;
    const ql = qualLabel(pct);
    const rowBg: [number,number,number] = i % 2 === 0 ? C.cream : [245, 242, 225];

    rgb(doc, 'fill', rowBg);
    doc.rect(M, y, CW, 9, 'F');

    // Label
    rgb(doc, 'text', C.dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(f.label, M + 3, y + 6);

    // Barra
    const bx = M + 105; const bw = 50; const bh = 3; const by = y + 3;
    rgb(doc, 'fill', C.lightGray);
    doc.roundedRect(bx, by, bw, bh, 1, 1, 'F');
    rgb(doc, 'fill', ql.color);
    if (pct > 0) doc.roundedRect(bx, by, bw * pct, bh, 1, 1, 'F');

    // Chip etiqueta
    rgb(doc, 'fill', ql.color);
    doc.roundedRect(W - M - 23, y + 1.5, 23, 6, 1.5, 1.5, 'F');
    rgb(doc, 'text', C.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(ql.text, W - M - 11.5, y + 5.7, { align: 'center' });

    y += 9;
  });

  y += 8;

  // ── 6. CERTIFICACIÓN ─────────────────────────────────────────────────────────
  sectionTitle(doc, 'Certificación', M, y, CW);
  y += 7;

  const certH = 26;

  rgb(doc, 'fill', C.cream);
  rgb(doc, 'draw', C.gold);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, CW, certH, 2, 2, 'FD');
  rgb(doc, 'fill', C.gold);
  doc.roundedRect(M, y, 3, certH, 1, 1, 'F');

  const cx = M + CW / 2;
  const certTextW = CW - 10; // 5mm de margen a cada lado

  rgb(doc, 'text', C.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Voz-Activa certifica que:', cx, y + 7, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  rgb(doc, 'text', C.gray);
  const certRaw = `El titular ha registrado actividad comercial verificada en la plataforma Voz-Activa. El scoring se basa en comportamiento real: consistencia de ventas, capacidad de ahorro, gestión de cartera y calidad de registros financieros. Este documento puede presentarse ante bancos, cooperativas y microfinancieras como prueba alternativa de capacidad de pago.`;
  const certLines = doc.splitTextToSize(certRaw, certTextW);
  certLines.forEach((line: string, i: number) => doc.text(line, cx, y + 13 + i * 4, { align: 'center' }));

  y += certH + 6;

  // ── 7. CÓDIGO DE VERIFICACIÓN ─────────────────────────────────��───────────
  rgb(doc, 'fill', [242, 238, 218]);
  rgb(doc, 'draw', C.gold);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, CW, 10, 2, 2, 'FD');

  rgb(doc, 'text', C.gray);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Código de verificación:', M + 5, y + 6.5);

  rgb(doc, 'text', C.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(verifCode, M + 50, y + 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  rgb(doc, 'text', C.gray);
  doc.text(`Generado: ${formatDate(now)} · Válido hasta: ${validUntil}`, W - M, y + 6.5, { align: 'right' });

  // ── 8. FOOTER ─────────────────────────────────────────────────────────────
  rgb(doc, 'fill', C.dark);
  doc.rect(5, 273, W - 5, 24, 'F');

  rgb(doc, 'text', C.goldLight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('VOZ·ACTIVA', M, 280);

  rgb(doc, 'text', [150, 150, 145]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Scoring Crediticio Alternativo para Micronegocios de Colombia', M, 286);
  doc.text('Este documento no constituye garantía financiera. Solo certifica actividad registrada en la plataforma.', M, 292);

  rgb(doc, 'text', C.goldLight);
  doc.setFontSize(7);
  doc.text('voz-activa-snowy.vercel.app', W - M, 280, { align: 'right' });
  rgb(doc, 'text', [150, 150, 145]);
  doc.setFontSize(6.5);
  doc.text(`N° ${verifCode}`, W - M, 286, { align: 'right' });

  const safeCedula = cedula.replace(/\D/g, '');
  const dateStr = now.toISOString().slice(0, 10);
  const filename = `pasaporte-vozactiva-${safeCedula}-${dateStr}.pdf`;
  return { blob: doc.output('blob') as Blob, filename };
}

// ─── Pasaporte crediticio generado desde extracto bancario ────────────────────
import { CreditAnalysis } from '../agentes/creditoAgente';

const ENTIDAD_LABEL_PDF: Record<string, string> = {
  nequi: 'Nequi', daviplata: 'Daviplata',
  davivienda: 'Davivienda', bancolombia: 'Bancolombia',
};

export function generateExtractoCreditPDF(
  profile: { name: string; cedula: string; phone?: string },
  credit: CreditAnalysis,
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210; const M = 14; const CW = W - M * 2;
  const now = new Date();

  const { scores, narrative, totalIngresos, totalGastos, margenPct, entidad } = credit;
  const entidadLabel = ENTIDAD_LABEL_PDF[entidad] ?? 'Extracto bancario';
  const nombre   = profile.name   || 'Usuario Voz-Activa';
  const cedula   = profile.cedula || '—';
  const telefono = profile.phone  || '—';
  const sc = scoreColor(scores.scoreFinal);
  const validUntil = formatDate(addMonths(now, 3));

  let y = 0;

  // ── Franja dorada izquierda ───────────────────────────────────────────────
  rgb(doc, 'fill', C.gold);
  doc.rect(0, 0, 5, 297, 'F');

  // ── Header ────────────────────────────────────────────────────────────────
  rgb(doc, 'fill', C.dark);
  doc.rect(5, 0, W - 5, 38, 'F');

  rgb(doc, 'text', C.goldLight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('VOZ·ACTIVA', M + 2, 14);

  rgb(doc, 'text', [180, 180, 175]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('SCORING CREDITICIO ALTERNATIVO PARA MICRONEGOCIOS', M + 2, 21);

  rgb(doc, 'fill', C.gold);
  doc.roundedRect(M + 2, 25, 80, 8, 1.5, 1.5, 'F');
  rgb(doc, 'text', C.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(`ANÁLISIS CREDITICIO POR EXTRACTO — ${entidadLabel.toUpperCase()}`, M + 2 + 40, 30.2, { align: 'center' });

  rgb(doc, 'text', [180, 180, 175]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`Extracto: ${entidadLabel}`, W - M, 14, { align: 'right' });
  doc.text('Análisis por IA', W - M, 20, { align: 'right' });
  y = 48;

  // ── Titular ───────────────────────────────────────────────────────────────
  sectionTitle(doc, 'Datos del Titular', M, y, CW);
  y += 7;

  rgb(doc, 'text', C.dark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(nombre, M, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  rgb(doc, 'text', C.gray);
  doc.text(`Cédula de ciudadanía: ${cedula}`, M, y);
  y += 5;
  doc.text(`Teléfono: ${telefono}`, M, y);
  y += 5;

  doc.setFontSize(7.5);
  doc.text('Fecha de emisión:', W - M - 55, y - 10);
  rgb(doc, 'text', C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(formatDate(now), W - M - 55, y - 5);
  doc.setFont('helvetica', 'normal');
  rgb(doc, 'text', C.gray);
  doc.text('Válido hasta:', W - M - 55, y);
  rgb(doc, 'text', C.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(validUntil, W - M - 55, y + 5);
  y += 12;

  // ── Score hero ────────────────────────────────────────────────────────────
  sectionTitle(doc, 'Score de Viabilidad Crediticia', M, y, CW);
  y += 7;

  rgb(doc, 'fill', C.cream);
  rgb(doc, 'draw', C.gold);
  doc.setLineWidth(0.4);
  doc.roundedRect(M, y, CW, 38, 3, 3, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(42);
  rgb(doc, 'text', sc);
  doc.text(String(scores.scoreFinal), M + CW * 0.28, y + 17, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  rgb(doc, 'text', C.gray);
  doc.text('/ 950', M + CW * 0.28 + 16, y + 11);

  const lbl = getScoreLabel(scores.scoreFinal).toUpperCase();
  rgb(doc, 'fill', sc);
  doc.roundedRect(M + CW * 0.28 - 16, y + 19, 32, 7, 2, 2, 'F');
  rgb(doc, 'text', C.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(lbl, M + CW * 0.28, y + 23.8, { align: 'center' });

  const barX = M + CW * 0.45; const barW = CW * 0.52;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  rgb(doc, 'text', C.gray);
  doc.text('Posición en la escala:', barX, y + 6);
  scoreBar(doc, scores.scoreFinal, barX, y + 9, barW);
  y += 46;

  // ── Resumen financiero del extracto ──────────────────────────────────────
  sectionTitle(doc, `Resumen Financiero — Extracto ${entidadLabel}`, M, y, CW);
  y += 7;

  const margenCOP = totalIngresos - totalGastos;
  const metrics = [
    { label: 'Ingresos totales',  value: formatCOP(totalIngresos) },
    { label: 'Gastos / retiros',  value: formatCOP(totalGastos) },
    { label: 'Margen neto',       value: `${margenPct}%` },
    { label: 'Superávit',         value: formatCOP(Math.max(0, margenCOP)) },
  ];

  const halfCW = (CW - 4) / 2;
  metrics.forEach((m, i) => {
    const col = i % 2; const row = Math.floor(i / 2);
    const cx = M + col * (halfCW + 4); const cy = y + row * 14;
    rgb(doc, 'fill', col === 0 ? C.cream : [245, 242, 225]);
    rgb(doc, 'draw', C.lightGray);
    doc.setLineWidth(0.2);
    doc.roundedRect(cx, cy, halfCW, 12, 1.5, 1.5, 'FD');
    rgb(doc, 'text', C.gray);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(m.label, cx + halfCW / 2, cy + 4.5, { align: 'center' });
    rgb(doc, 'text', C.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(m.value, cx + halfCW / 2, cy + 10, { align: 'center' });
  });
  y += 30;

  // ── Factores crediticios ──────────────────────────────────────────────────
  sectionTitle(doc, 'Análisis de Factores Crediticios', M, y, CW);
  y += 7;

  const factors = [
    { label: 'Consistencia de ingresos',          value: scores.consistenciaIngresos, max: 30 },
    { label: 'Capacidad de pago',                  value: scores.capacidadPago,        max: 25 },
    { label: 'Calidad de ingresos (QR / digital)', value: scores.calidadIngresos,      max: 20 },
    { label: 'Volumen de actividad financiera',    value: scores.volumenActividad,     max: 15 },
    { label: 'Cobertura del extracto analizado',   value: scores.coberturaExtracto,    max: 10 },
  ];

  factors.forEach((f, i) => {
    const pct = f.value / f.max;
    const ql = qualLabel(pct);
    const rowBg: [number,number,number] = i % 2 === 0 ? C.cream : [245, 242, 225];
    rgb(doc, 'fill', rowBg);
    doc.rect(M, y, CW, 9, 'F');
    rgb(doc, 'text', C.dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(f.label, M + 3, y + 6);
    const bx = M + 105; const bw = 50; const by = y + 3;
    rgb(doc, 'fill', C.lightGray);
    doc.roundedRect(bx, by, bw, 3, 1, 1, 'F');
    rgb(doc, 'fill', ql.color);
    if (pct > 0) doc.roundedRect(bx, by, bw * pct, 3, 1, 1, 'F');
    rgb(doc, 'fill', ql.color);
    doc.roundedRect(W - M - 23, y + 1.5, 23, 6, 1.5, 1.5, 'F');
    rgb(doc, 'text', C.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(ql.text, W - M - 11.5, y + 5.7, { align: 'center' });
    y += 9;
  });
  y += 6;

  // ── Análisis de la IA ─────────────────────────────────────────────────────
  if (narrative.resumen || narrative.insights.length > 0) {
    sectionTitle(doc, 'Análisis de Inteligencia Artificial', M, y, CW);
    y += 7;

    if (narrative.resumen) {
      const lines = doc.splitTextToSize(narrative.resumen, CW - 4);
      rgb(doc, 'text', C.gray);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(lines, M + 2, y);
      y += lines.length * 4.5 + 4;
    }

    narrative.insights.slice(0, 3).forEach(ins => {
      if (y > 255) return;
      rgb(doc, 'fill', C.gold);
      doc.circle(M + 3, y + 3, 1.4, 'F');
      rgb(doc, 'text', C.dark);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(ins.titulo, M + 7, y + 3.8);
      const tlines = doc.splitTextToSize(ins.texto, CW - 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      rgb(doc, 'text', C.gray);
      doc.text(tlines, M + 7, y + 8.5);
      y += 8 + tlines.length * 4.5 + 3;
    });
  }

  // ── Conclusión ────────────────────────────────────────────────────────────
  if (narrative.conclusion && y < 255) {
    y += 2;
    rgb(doc, 'fill', [255, 250, 225]);
    doc.rect(M, y, CW, 16, 'F');
    rgb(doc, 'fill', C.gold);
    doc.rect(M, y, 3, 16, 'F');
    rgb(doc, 'text', C.gold);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('CONCLUSIÓN', M + 7, y + 6);
    const cl = doc.splitTextToSize(`"${narrative.conclusion}"`, CW - 10);
    rgb(doc, 'text', C.dark);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(cl, M + 7, y + 12);
    y += 20;
  }

  // ── Certificación ─────────────────────────────────────────────────────────
  if (y < 252) {
    sectionTitle(doc, 'Certificación', M, y, CW);
    y += 7;
    const certH = 22;
    rgb(doc, 'fill', C.cream);
    rgb(doc, 'draw', C.gold);
    doc.setLineWidth(0.4);
    doc.roundedRect(M, y, CW, certH, 2, 2, 'FD');
    rgb(doc, 'fill', C.gold);
    doc.roundedRect(M, y, 3, certH, 1, 1, 'F');
    const cx2 = M + CW / 2;
    rgb(doc, 'text', C.dark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Voz-Activa certifica que:', cx2, y + 6, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    rgb(doc, 'text', C.gray);
    const certText = `El análisis fue generado automáticamente a partir del extracto bancario de ${entidadLabel} del titular mediante inteligencia artificial. Los scores reflejan consistencia de ingresos, capacidad de pago y calidad de las fuentes. Este documento puede presentarse ante microfinancieras como indicador alternativo de capacidad crediticia.`;
    const certLines = doc.splitTextToSize(certText, CW - 10);
    certLines.forEach((line: string, i: number) => doc.text(line, cx2, y + 12 + i * 4, { align: 'center' }));
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  rgb(doc, 'fill', C.dark);
  doc.rect(5, 273, W - 5, 24, 'F');
  rgb(doc, 'text', C.goldLight);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('VOZ·ACTIVA', M, 280);
  rgb(doc, 'text', [150, 150, 145]);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('Scoring Crediticio Alternativo para Micronegocios de Colombia', M, 286);
  doc.text('Generado por IA a partir de extracto bancario. No constituye garantía financiera.', M, 292);
  rgb(doc, 'text', C.goldLight);
  doc.setFontSize(7);
  doc.text('voz-activa-snowy.vercel.app', W - M, 280, { align: 'right' });
  rgb(doc, 'text', [150, 150, 145]);
  doc.setFontSize(6.5);
  doc.text(formatDate(now), W - M, 286, { align: 'right' });

  const safeCedula = cedula.replace(/\D/g, '');
  const dateStr = now.toISOString().slice(0, 10);
  return {
    blob: doc.output('blob') as Blob,
    filename: `credito-extracto-vozactiva-${safeCedula}-${dateStr}.pdf`,
  };
}
