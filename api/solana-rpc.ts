export const config = { runtime: 'nodejs' };

const ALLOWED_RPC_METHODS = new Set([
  'getAccountInfo',
  'getBalance',
  'getBlockHeight',
  'getEpochInfo',
  'getLatestBlockhash',
  'getMultipleAccounts',
  'getSignatureStatuses',
  'getSlot',
  'getTokenAccountBalance',
  'getTokenAccountsByOwner',
  'getTransaction',
  'getAddressLookupTable',
  'getVersion',
  'simulateTransaction',
  'sendTransaction',
]);

const READ_RATE_LIMIT = 180;
const SEND_RATE_LIMIT = 8;
const WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { startedAt: number; count: number }>();

function json(res: any, body: unknown, status = 200) {
  res.status(status)
    .setHeader('Cache-Control', 'no-store')
    .json(body);
}

function requestHost(req: any): string {
  const forwarded = String(req.headers?.['x-forwarded-host'] ?? '').split(',')[0].trim();
  const host = forwarded || String(req.headers?.host ?? '');
  return host.split(':')[0].toLowerCase();
}

function sameOrigin(req: any): boolean {
  const host = requestHost(req);
  if (!host) return false;

  const origin = String(req.headers?.origin ?? '').trim();
  const referer = String(req.headers?.referer ?? '').trim();

  for (const candidate of [origin, referer]) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.hostname.toLowerCase() === host) return true;
    } catch {
      // Fail closed on malformed browser-origin headers.
    }
  }

  return false;
}

function clientAddress(req: any): string {
  const forwarded = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || String(req.socket?.remoteAddress ?? 'unknown');
}

function rateLimited(key: string, limit: number) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

function parseRpcBody(raw: unknown): { method: string; params?: unknown; id?: unknown; jsonrpc?: unknown } | null {
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;
  const value = parsed as Record<string, unknown>;
  if (typeof value.method !== 'string') return null;

  return {
    method: value.method,
    params: value.params,
    id: value.id,
    jsonrpc: value.jsonrpc,
  };
}

function firstParam(params: unknown): unknown {
  return Array.isArray(params) ? params[0] : undefined;
}

async function validateWalletSession(req: any, wallet: string) {
  const clientInfoHeader = req.headers?.['x-client-info'];
  const clientInfo = Array.isArray(clientInfoHeader) ? clientInfoHeader.join(' ') : String(clientInfoHeader ?? '');
  if (!wallet || !/stockpass-session=[^\s]+/.test(clientInfo)) return false;

  const supabaseUrl = process.env.SUPABASE_URL || 'https://sfbxpscbevnmoppgkjcr.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceRoleKey) return false;

  const response = await fetch(supabaseUrl + '/functions/v1/wallet-auth', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: serviceRoleKey,
      'x-client-info': clientInfo,
    },
    body: JSON.stringify({ action: 'validate', wallet }),
  });
  return response.ok;
}

function extractTransactionEncoding(params: unknown): string | null {
  const first = firstParam(params);
  if (typeof first !== 'string' || !first) return null;
  return first;
}

async function transactionMatchesWallet(encoded: string, wallet: string) {
  try {
    const { VersionedTransaction, Transaction } = await import('@solana/web3.js');
    const bytes = Buffer.from(encoded, 'base64');
    try {
      const versioned = VersionedTransaction.deserialize(bytes);
      return versioned.message.staticAccountKeys[0]?.toBase58() === wallet;
    } catch {
      const legacy = Transaction.from(bytes);
      return legacy.feePayer?.toBase58() === wallet;
    }
  } catch {
    return false;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, { error: 'POST required' }, 405);

  if (!sameOrigin(req)) {
    return json(res, { error: 'Same-origin RPC requests only.' }, 403);
  }

  const upstream = process.env.SOLANA_RPC_URL || '';
  if (!upstream) return json(res, { error: 'SOLANA_RPC_URL is not configured.' }, 503);

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  if (body.length > 250_000) {
    return json(res, { error: 'RPC request body is too large.' }, 413);
  }

  const rpc = parseRpcBody(body);
  if (!rpc || !ALLOWED_RPC_METHODS.has(rpc.method)) {
    return json(res, { error: 'RPC method is not allowed.' }, 403);
  }

  const bucketKey = clientAddress(req) + ':' + rpc.method;
  if (rateLimited(bucketKey, rpc.method === 'sendTransaction' ? SEND_RATE_LIMIT : READ_RATE_LIMIT)) {
    return json(res, { error: 'RPC rate limit exceeded. Please retry shortly.' }, 429);
  }

  if (rpc.method === 'sendTransaction') {
    const wallet = String(req.headers?.['x-stockpass-wallet'] ?? '').trim();
    const encoded = extractTransactionEncoding(rpc.params);
    if (!wallet || !encoded) {
      return json(res, { error: 'Wallet-bound transaction submission is required.' }, 401);
    }

    if (!await validateWalletSession(req, wallet)) {
      return json(res, { error: 'A valid wallet session is required to submit transactions.' }, 401);
    }

    if (!await transactionMatchesWallet(encoded, wallet)) {
      return json(res, { error: 'Transaction fee payer does not match the authenticated wallet.' }, 422);
    }
  }

  try {
    const response = await fetch(upstream, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    const text = await response.text();
    res
      .status(response.status)
      .setHeader('content-type', response.headers.get('content-type') || 'application/json')
      .setHeader('cache-control', 'no-store')
      .send(text);
  } catch (error) {
    console.error('solana-rpc-proxy', error);
    return json(res, { error: error instanceof Error ? error.message : 'Solana RPC request failed.' }, 502);
  }
}
