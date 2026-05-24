import type { VercelRequest, VercelResponse } from '@vercel/node';

interface BelvoTx {
  id: string;
  value_date: string;
  collected_at: string;
  description: string;
  amount: number;
  type: 'INFLOW' | 'OUTFLOW';
  category?: string;
  subcategory?: string;
  account?: { institution?: { name?: string } };
}

function classifyTransaction(tx: BelvoTx) {
  const desc = (tx.description ?? '').toLowerCase();

  if (tx.type === 'OUTFLOW') {
    if (desc.includes('retiro') || desc.includes('cajero') || desc.includes('atm'))
      return { tipo: 'retiro', esVentaProbable: false };
    return { tipo: 'transferencia_enviada', esVentaProbable: false };
  }

  // Inflows — classify by description
  if (desc.includes('cobro qr') || desc.includes('pago qr') || desc.includes(' qr ') || desc.match(/qr$/))
    return { tipo: 'cobro_qr', esVentaProbable: true };

  if (desc.includes('pago negocio') || desc.includes('cobro negocio') || desc.includes('venta'))
    return { tipo: 'cobro_qr', esVentaProbable: true };

  if (
    desc.includes('transferencia') ||
    desc.includes('te enviaron') ||
    desc.includes('recibiste de') ||
    desc.includes('enviado por') ||
    /de\s+[a-záéíóúñ]+\s+[a-záéíóúñ]+/.test(desc) // "de Nombre Apellido"
  ) {
    const senderMatch = desc.match(/(?:de|enviado por)\s+([a-záéíóúñ\s]{3,30})/i);
    return {
      tipo: 'transferencia_recibida',
      esVentaProbable: false,
      remitente: senderMatch?.[1]?.trim(),
    };
  }

  // Belvo category hints
  const cat = (tx.category ?? '').toLowerCase();
  if (cat.includes('transfer')) return { tipo: 'transferencia_recibida', esVentaProbable: false };

  // Small amounts from unknown sources lean toward sales
  return { tipo: 'otro', esVentaProbable: tx.amount < 50_000 };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const linkId = req.query.linkId as string;
  if (!linkId) return res.status(400).json({ error: 'linkId requerido' });

  const secretId       = process.env.BELVO_SECRET_ID;
  const secretPassword = process.env.BELVO_SECRET_PASSWORD;
  const isSandbox      = (process.env.BELVO_ENV ?? 'sandbox') !== 'production';
  const base           = isSandbox ? 'https://sandbox.belvo.com' : 'https://api.belvo.com';
  const auth           = Buffer.from(`${secretId}:${secretPassword}`).toString('base64');

  try {
    // Fetch up to 100 transactions for this link
    const r = await fetch(
      `${base}/api/transactions/?link=${linkId}&page_size=100`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    const data = await r.json();
    const rawTxs: BelvoTx[] = data.results ?? data ?? [];

    // Classify each transaction
    const transactions = rawTxs.map(tx => {
      const c = classifyTransaction(tx);
      return {
        fecha:          tx.value_date ?? tx.collected_at ?? '',
        descripcion:    tx.description ?? '',
        monto:          Math.abs(tx.amount ?? 0),
        tipo:           c.tipo,
        esVentaProbable:c.esVentaProbable,
        ...(c.remitente ? { remitente: c.remitente } : {}),
      };
    });

    // Build partial summary (cross-reference with app happens client-side)
    const ingresos     = transactions.filter(t => !['transferencia_enviada','retiro'].includes(t.tipo));
    const totalIngresos     = ingresos.reduce((s, t) => s + t.monto, 0);
    const ingresosVentas    = ingresos.filter(t => t.esVentaProbable).reduce((s, t) => s + t.monto, 0);
    const porcentajeVentas  = totalIngresos > 0 ? Math.round((ingresosVentas / totalIngresos) * 100) : 0;

    const institution = rawTxs[0]?.account?.institution?.name ?? 'banco';

    return res.status(200).json({
      transactions,
      totalIngresos,
      ingresosVentas,
      ingresosTransferencias: totalIngresos - ingresosVentas,
      porcentajeVentas,
      entidad: institution.toLowerCase().includes('nequi') ? 'nequi'
             : institution.toLowerCase().includes('davip') ? 'daviplata'
             : institution.toLowerCase().includes('davi')  ? 'davivienda'
             : institution.toLowerCase().includes('banco') && institution.toLowerCase().includes('colombia') ? 'bancolombia'
             : institution,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
