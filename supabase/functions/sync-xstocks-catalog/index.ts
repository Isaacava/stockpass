import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const XSTOCKS_API = 'https://api.xstocks.fi/api/v2/public/assets';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

type Node = {
  symbol?: string;
  name?: string;
  description?: string;
  logo?: string;
  deployments?: Array<{ network?: string; address?: string }>;
};

type ResponseShape = { nodes?: Node[] };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  try {
    const rows: Array<Record<string, unknown>> = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const url = `${XSTOCKS_API}?network=Solana&page=${page}`;
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`xStocks API ${response.status}`);
      const payload = await response.json() as ResponseShape;
      const nodes = payload.nodes ?? [];

      for (const node of nodes) {
        const deployment = (node.deployments ?? []).find((item) => `${item.network ?? ''}`.toLowerCase() === 'solana');
        if (!node.symbol || !deployment?.address) continue;
        rows.push({
          symbol: node.symbol,
          name: node.name ?? node.description ?? node.symbol,
          solana_mint: deployment.address,
          network: 'Solana',
          is_verified: true,
          badge_enabled: true,
          source: 'xStocks',
          logo_url: node.logo ?? null,
          updated_at: new Date().toISOString()
        });
      }

      if (nodes.length < PAGE_SIZE) break;
    }

    const unique = [...new Map(rows.map((row) => [row.symbol, row])).values()];
    const { error } = await supabase.from('stockpass_xstock_catalog').upsert(unique, { onConflict: 'symbol' });
    if (error) throw error;

    const { error: assetError } = await supabase.from('stockpass_assets').upsert(
      unique.map((row) => ({
        mint: row.solana_mint,
        symbol: row.symbol,
        name: row.name,
        icon: String(row.symbol).replace(/x$/, '').slice(0, 5),
        source: 'xStocks'
      })),
      { onConflict: 'mint' }
    );
    if (assetError) throw assetError;

    return new Response(JSON.stringify({ synced: unique.length }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Sync failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
});
