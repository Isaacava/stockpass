import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

async function authorize(req: Request) {
  const expected = 'Bearer ' + SERVICE_ROLE_KEY;
  return Boolean(SERVICE_ROLE_KEY) && req.headers.get('authorization') === expected;
}

async function sendTelegram(chatId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return false;
  const response = await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  return response.ok;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
  if (!(await authorize(req))) return json({ error: 'unauthorized' }, 401);

  const { data: alerts, error } = await supabase
    .from('wgg_alerts')
    .select('id,wallet,position_id,severity,title,message,details,telegram_sent_at')
    .is('telegram_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let skipped = 0;

  for (const alert of alerts ?? []) {
    const { data: link } = await supabase
      .from('wgg_telegram_links')
      .select('telegram_chat_id')
      .eq('wallet', alert.wallet)
      .maybeSingle();

    if (!link?.telegram_chat_id) {
      skipped += 1;
      continue;
    }

    const details = alert.details && typeof alert.details === 'object' ? alert.details as Record<string, unknown> : {};
    const symbol = String(details.symbol || 'xStock');
    const gap = details.typicalWeekendGapPct == null ? '—' : Number(details.typicalWeekendGapPct).toFixed(2) + '%';
    const buffer = details.currentBufferPct == null ? '—' : Number(details.currentBufferPct).toFixed(2) + ' pts';
    const adjusted = details.adjustedGapPct == null ? '—' : Number(details.adjustedGapPct).toFixed(2) + '%';
    const text = 'Weekend Gap Guard\n\n' +
      alert.title + '\n' +
      alert.message + '\n\n' +
      'Symbol: ' + symbol + '\n' +
      'Weekend gap (P75 downside): ' + gap + '\n' +
      'Adjusted gap signal: ' + adjusted + '\n' +
      'Current liquidation buffer: ' + buffer + '\n\n' +
      'This is a risk-monitoring alert. Any Kamino action still requires your wallet signature.';

    try {
      const delivered = await sendTelegram(String(link.telegram_chat_id), text);
      if (delivered) {
        await supabase.from('wgg_alerts').update({ telegram_sent_at: new Date().toISOString() }).eq('id', alert.id);
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  return json({ processed: (alerts ?? []).length, sent, skipped, botConfigured: Boolean(TELEGRAM_BOT_TOKEN) });
});