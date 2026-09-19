
import { discoverKaminoXStockPositions } from '../src/lib/kamino';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sfbxpscbevnmoppgkjcr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_eCgd2QEH5mUlEK5vHIonyw_v0E8QFrp';
const MAINNET_RPC = process.env.SOLANA_RPC_URL || '';

function validAddress(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function json(res: any, body: unknown, status = 200) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

async function validateSession(req: any, wallet: string) {
  const clientInfoHeader = req.headers['x-client-info'];
  const clientInfo = Array.isArray(clientInfoHeader)
    ? clientInfoHeader.join(' ')
    : String(clientInfoHeader ?? '');

  if (!/stockpass-session=[^\s]+/.test(clientInfo)) {
    return { ok: false, error: 'A valid wallet session is required.' };
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/wallet-auth`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'x-client-info': clientInfo,
    },
    body: JSON.stringify({ action: 'validate', wallet }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return { ok: false, error: body?.error ?? 'Wallet session is invalid or expired.' };
  }

  return { ok: true };
}

export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, { error: 'POST required' }, 405);
  if (!MAINNET_RPC) return json(res, { error: 'SOLANA_RPC_URL is not configured.' }, 503);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const wallet = typeof body.wallet === 'string' ? body.wallet.trim() : '';

    if (!validAddress(wallet)) {
      return json(res, { error: 'Invalid Solana wallet address.' }, 400);
    }

    const auth = await validateSession(req, wallet);
    if (!auth.ok) return json(res, { error: auth.error }, 401);

    const positions = await discoverKaminoXStockPositions(wallet, MAINNET_RPC);
    return json(res, { wallet, positions });
  } catch (error) {
    console.error('wgg-kamino-positions', error);
    return json(
      res,
      { error: error instanceof Error ? error.message : 'Kamino position discovery failed.' },
      502,
    );
  }
}
