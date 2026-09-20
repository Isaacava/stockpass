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
      // Ignore malformed browser-origin headers and fail closed below.
    }
  }

  return false;
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
