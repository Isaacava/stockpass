import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

type AlertRow = {
  id: string;
  wallet: string;
  mint: string | null;
  direction: 'above' | 'below';
  target_price: number;
};

async function fetchPrices(mints: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  for (let i = 0; i < mints.length; i += 50) {
    const chunk = mints.slice(i, i + 50);
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${chunk.map(encodeURIComponent).join(',')}`);
    if (!response.ok) continue;
    const payload = await response.json();
    for (const [mint, entry] of Object.entries(payload.data ?? {})) {
      const price = Number((entry as { price?: string | number } | null)?.price);
      if (Number.isFinite(price)) prices[mint] = price;
    }
  }
  return prices;
}

async function sendTelegram(chatId: number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

Deno.serve(async () => {
  const { data: alerts, error } = await supabase
    .from('stockpass_alerts')
    .select('id, wallet, mint, direction, target_price')
    .eq('active', true);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }

  const rows = (alerts ?? []) as AlertRow[];
  const mints = [...new Set(rows.map((alert) => alert.mint).filter((mint): mint is string => Boolean(mint)))];
  const prices = await fetchPrices(mints);
  let triggered = 0;

  for (const alert of rows) {
    if (!alert.mint) continue;
    const price = prices[alert.mint];
    if (price === undefined) continue;

    const hit =
      (alert.direction === 'above' && price >= alert.target_price) ||
      (alert.direction === 'below' && price <= alert.target_price);
    if (!hit) continue;

    triggered += 1;

    await supabase.from('stockpass_alerts').update({ active: false }).eq('id', alert.id);
    await supabase.from('stockpass_activity_events').insert({
      wallet: alert.wallet,
      mint: alert.mint,
      event_type: 'alert_triggered',
      metadata: {
        direction: alert.direction,
        target_price: alert.target_price,
        price_at_trigger: price
      }
    });

    const { data: link } = await supabase
      .from('stockpass_telegram_links')
      .select('chat_id')
      .eq('wallet', alert.wallet)
      .maybeSingle();

    if (link?.chat_id) {
      await sendTelegram(
        Number(link.chat_id),
        `StockPass alert: ${alert.mint.slice(0, 4)}… reached $${price.toFixed(2)} (target $${alert.target_price}).`
      );
    }
  }

  return new Response(JSON.stringify({ checked: rows.length, triggered }), {
    headers: { 'content-type': 'application/json' }
  });
});
