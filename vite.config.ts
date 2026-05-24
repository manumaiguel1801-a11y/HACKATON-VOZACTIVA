import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'http';

// ─── Inline transaction classifier (mirrors api/belvo-transactions.ts) ─────────
interface BelvoTx {
  id: string; value_date: string; collected_at: string;
  description: string; amount: number; type: 'INFLOW' | 'OUTFLOW';
  category?: string; subcategory?: string;
  account?: { institution?: { name?: string } };
}
function classifyTx(tx: BelvoTx) {
  const desc = (tx.description ?? '').toLowerCase();
  if (tx.type === 'OUTFLOW') {
    return desc.includes('retiro') || desc.includes('cajero') || desc.includes('atm')
      ? { tipo: 'retiro', esVentaProbable: false }
      : { tipo: 'transferencia_enviada', esVentaProbable: false };
  }
  if (desc.includes('cobro qr') || desc.includes('pago qr') || desc.includes(' qr ') || desc.match(/qr$/))
    return { tipo: 'cobro_qr', esVentaProbable: true };
  if (desc.includes('pago negocio') || desc.includes('cobro negocio') || desc.includes('venta'))
    return { tipo: 'cobro_qr', esVentaProbable: true };
  if (desc.includes('transferencia') || desc.includes('te enviaron') || desc.includes('recibiste de') ||
      desc.includes('enviado por') || /de\s+[a-záéíóúñ]+\s+[a-záéíóúñ]+/.test(desc)) {
    const m = desc.match(/(?:de|enviado por)\s+([a-záéíóúñ\s]{3,30})/i);
    return { tipo: 'transferencia_recibida', esVentaProbable: false, remitente: m?.[1]?.trim() };
  }
  const cat = (tx.category ?? '').toLowerCase();
  if (cat.includes('transfer')) return { tipo: 'transferencia_recibida', esVentaProbable: false };
  return { tipo: 'otro', esVentaProbable: tx.amount < 50_000 };
}

// ─── Dev API plugin — serves /api/belvo-* when running `npm run dev` ───────────
function devApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'voz-activa-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');

        // ── POST /api/belvo-token ──────────────────────────────────────────
        if (req.method === 'POST' && url.pathname === '/api/belvo-token') {
          const secretId  = env.BELVO_SECRET_ID;
          const secretPwd = env.BELVO_SECRET_PASSWORD;
          res.setHeader('Content-Type', 'application/json');
          if (!secretId || !secretPwd) {
            res.writeHead(503);
            res.end(JSON.stringify({ error: 'Agrega BELVO_SECRET_ID y BELVO_SECRET_PASSWORD en .env.local' }));
            return;
          }
          const base = (env.BELVO_ENV ?? 'sandbox') === 'production'
            ? 'https://api.belvo.com' : 'https://sandbox.belvo.com';
          const auth = Buffer.from(`${secretId}:${secretPwd}`).toString('base64');
          try {
            const r = await fetch(`${base}/api/token/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
              body: JSON.stringify({
                id: secretId, password: secretPwd,
                scopes: 'read_institutions,read_accounts,read_transactions,read_owners',
              }),
            });
            const data = await r.json();
            if (!r.ok) {
              // Surface the actual Belvo error message
              const msg = data?.detail ?? data?.non_field_errors?.[0]
                ?? data?.message ?? JSON.stringify(data);
              res.writeHead(r.status);
              res.end(JSON.stringify({ error: `Belvo ${r.status}: ${msg}` }));
              return;
            }
            res.writeHead(r.status);
            res.end(JSON.stringify(data));
          } catch (err: any) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // ── GET /api/belvo-transactions ────────────────────────────────────
        if (req.method === 'GET' && url.pathname === '/api/belvo-transactions') {
          const linkId    = url.searchParams.get('linkId');
          const secretId  = env.BELVO_SECRET_ID;
          const secretPwd = env.BELVO_SECRET_PASSWORD;
          res.setHeader('Content-Type', 'application/json');
          if (!linkId) { res.writeHead(400); res.end(JSON.stringify({ error: 'linkId requerido' })); return; }
          const base = (env.BELVO_ENV ?? 'sandbox') === 'production'
            ? 'https://api.belvo.com' : 'https://sandbox.belvo.com';
          const auth = Buffer.from(`${secretId}:${secretPwd}`).toString('base64');
          try {
            const r = await fetch(`${base}/api/transactions/?link=${linkId}&page_size=100`,
              { headers: { Authorization: `Basic ${auth}` } });
            const data = await r.json();
            const rawTxs: BelvoTx[] = data.results ?? data ?? [];
            const transactions = rawTxs.map(tx => {
              const c = classifyTx(tx);
              return {
                fecha: tx.value_date ?? tx.collected_at ?? '',
                descripcion: tx.description ?? '',
                monto: Math.abs(tx.amount ?? 0),
                tipo: c.tipo,
                esVentaProbable: c.esVentaProbable,
                ...(c.remitente ? { remitente: c.remitente } : {}),
              };
            });
            const ingresos         = transactions.filter(t => !['transferencia_enviada','retiro'].includes(t.tipo));
            const totalIngresos    = ingresos.reduce((s, t) => s + t.monto, 0);
            const ingresosVentas   = ingresos.filter(t => t.esVentaProbable).reduce((s, t) => s + t.monto, 0);
            const porcentajeVentas = totalIngresos > 0 ? Math.round((ingresosVentas / totalIngresos) * 100) : 0;
            const instName = rawTxs[0]?.account?.institution?.name ?? 'banco';
            const entidad  = instName.toLowerCase().includes('nequi')    ? 'nequi'
                           : instName.toLowerCase().includes('davip')    ? 'daviplata'
                           : instName.toLowerCase().includes('davi')     ? 'davivienda'
                           : instName.toLowerCase().includes('colombia') ? 'bancolombia'
                           : instName;
            res.writeHead(200);
            res.end(JSON.stringify({
              transactions, totalIngresos, ingresosVentas,
              ingresosTransferencias: totalIngresos - ingresosVentas,
              porcentajeVentas, entidad,
            }));
          } catch (err: any) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), devApiPlugin(env)],
    define: {
      'process.env.GEMINI_API_KEY':    JSON.stringify(env.GEMINI_API_KEY),
      'process.env.ANTHROPIC_API_KEY': JSON.stringify(env.ANTHROPIC_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
