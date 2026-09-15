import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import nacl from 'npm:tweetnacl@1.0.3';
import bs58 from 'npm:bs58@6.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing Supabase function environment.');
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function normalizeWallet(wallet: string) {
  return bs58.encode(bs58.decode(wallet));
}

function isValidWallet(wallet: string) {
  try {
    return bs58.decode(wallet).length === 32;
  } catch {
    return false;
  }
}

function createSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bs58.encode(bytes);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function challengeMessage(wallet: string, nonce: string, issuedAt: string, expiresAt: string) {
  return [
    'StockPass wallet verification',
    '',
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued: ${issuedAt}`,
    `Expires: ${expiresAt}`,
    '',
    'Sign this message to prove control of the wallet. No transaction will be sent.',
  ].join('\n');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json();
    const action = String(body?.action ?? '');
    const wallet = typeof body?.wallet === 'string' ? normalizeWallet(body.wallet.trim()) : '';

    if (!wallet || !isValidWallet(wallet)) {
      return json({ error: 'A valid Solana wallet address is required.' }, 400);
    }

    if (action === 'challenge') {
      const now = new Date();
      const expires = new Date(now.getTime() + CHALLENGE_TTL_MS);
      const nonce = createSessionToken().slice(0, 22);
      const message = challengeMessage(wallet, nonce, now.toISOString(), expires.toISOString());

      const { error } = await admin
        .from('stockpass_wallet_auth_challenges')
        .insert({
          wallet,
          nonce,
          message,
          issued_at: now.toISOString(),
          expires_at: expires.toISOString(),
          used_at: null,
        });

      if (error) {
        console.error('challenge insert failed', error);
        return json({ error: 'Could not create wallet challenge.' }, 500);
      }

      return json({ message, expiresAt: expires.toISOString() });
    }

    if (action !== 'verify') return json({ error: 'Unknown wallet-auth action.' }, 400);

    const message = typeof body?.message === 'string' ? body.message : '';
    const signature = typeof body?.signature === 'string' ? body.signature : '';
    if (!message || !signature) return json({ error: 'Message and signature are required.' }, 400);

    const { data: challenge, error: challengeError } = await admin
      .from('stockpass_wallet_auth_challenges')
      .select('id,wallet,message,expires_at,used_at')
      .eq('wallet', wallet)
      .eq('message', message)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('issued_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeError || !challenge) return json({ error: 'Wallet challenge is invalid or expired.' }, 400);

    let verified = false;
    try {
      const publicKeyBytes = bs58.decode(wallet);
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = bs58.decode(signature);
      verified = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    } catch {
      verified = false;
    }

    if (!verified) return json({ error: 'Wallet signature verification failed.' }, 401);

    const nowIso = new Date().toISOString();
    const { error: usedError } = await admin
      .from('stockpass_wallet_auth_challenges')
      .update({ used_at: nowIso })
      .eq('id', challenge.id)
      .is('used_at', null);

    if (usedError) return json({ error: 'Could not finalize wallet challenge.' }, 500);

    const rawToken = createSessionToken();
    const tokenHash = await sha256(rawToken);
    const expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    const { error: sessionError } = await admin
      .from('stockpass_wallet_auth_sessions')
      .insert({
        token_hash: tokenHash,
        wallet,
        expires_at: expires,
      });

    if (sessionError) {
      console.error('session insert failed', sessionError);
      return json({ error: 'Could not create wallet session.' }, 500);
    }

    return json({ wallet, token: rawToken, expiresAt: expires });
  } catch (error) {
    console.error('wallet-auth error', error);
    return json({ error: 'Unexpected wallet-auth error.' }, 500);
  }
});
