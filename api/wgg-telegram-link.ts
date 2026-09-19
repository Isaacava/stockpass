import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sfbxpscbevnmoppgkjcr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function json(res: any, body: unknown, status = 200) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, { error: 'POST required' }, 405);
  if (!SUPABASE_SERVICE_ROLE_KEY) return json(res, { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, 503);

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  const wallet = typeof body.wallet === 'string' ? body.wallet.trim() : '';
  const clientInfo = Array.isArray(req.headers?.['x-client-info'])
    ? req.headers['x-client-info'].join(' ')
    : String(req.headers?.['x-client-info'] ?? '');

  if (!wallet) return json(res, { error: 'wallet is required.' }, 400);
  if (!/stockpass-session=[^\s]+/.test(clientInfo)) {
    return json(res, { error: 'A valid wallet session is required.' }, 401);
  }

  const authResponse = await fetch(`${SUPABASE_URL}/functions/v1/wallet-auth`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      'x-client-info': clientInfo,
    },
    body: JSON.stringify({ action: 'validate', wallet }),
  });
  if (!authResponse.ok) return json(res, { error: 'Wallet session is invalid or expired.' }, 401);

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from('wgg_telegram_link_challenges').insert({
    token_hash: tokenHash,
    wallet,
    expires_at: expiresAt,
  });
  if (error) throw error;

  return json(res, { token, expiresAt });
}
