import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BIRDEYE_URL = 'https://public-api.birdeye.so/wallet/v2/pnl';
const MAX_TOKENS = 50;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization, x-client-info, apikey',
      'access-control-allow-methods': 'POST, OPTIONS'
    }
  });
}

function normalizeNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return json({}, 204);
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);

  const apiKey = Deno.env.get('BIRDEYE_API_KEY');
  if (!apiKey) return json({ error: 'PnL service is not configured' }, 503);

  let input: { wallet?: string; mints?: string[] };
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const wallet = typeof input.wallet === 'string' ? input.wallet.trim() : '';
  const mints = Array.isArray(input.mints)
    ? Array.from(new Set(input.mints.filter((mint): mint is string => typeof mint === 'string' && mint.length > 20))).slice(0, MAX_TOKENS)
    : [];

  if (!wallet) return json({ error: 'wallet is required' }, 400);
  if (!mints.length) return json({ tokens: [] });

  const url = new URL(BIRDEYE_URL);
  url.searchParams.set('wallet', wallet);
  url.searchParams.set('token_addresses', mints.join(','));
  url.searchParams.set('pnl_method', 'wac');

  const upstream = await fetch(url, {
    headers: {
      'X-API-KEY': apiKey,
      'x-chain': 'solana',
      accept: 'application/json'
    }
  });

  const payload = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return json({ error: 'Birdeye PnL request failed', upstream_status: upstream.status }, upstream.status === 429 ? 429 : 502);
  }

  const sourceTokens = payload?.data?.tokens ?? {};
  const tokens = Object.entries(sourceTokens as Record<string, Record<string, any>>).map(([mint, token]) => ({
    mint,
    symbol: String(token?.symbol ?? ''),
    holding: normalizeNumber(token?.quantity?.holding),
    currentValueUsd: normalizeNumber(token?.cashflow_usd?.current_value),
    realizedUsd: normalizeNumber(token?.pnl?.realized_profit_usd),
    unrealizedUsd: normalizeNumber(token?.pnl?.unrealized_usd),
    totalUsd: normalizeNumber(token?.pnl?.total_usd),
    totalPercent: normalizeNumber(token?.pnl?.total_percent)
  }));

  return json({ tokens });
});
