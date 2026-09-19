export const config = { runtime: 'nodejs' };

function json(res: any, body: unknown, status = 200) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, { error: 'POST required' }, 405);

  const upstream = process.env.SOLANA_RPC_URL || '';
  if (!upstream) return json(res, { error: 'SOLANA_RPC_URL is not configured.' }, 503);

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
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
