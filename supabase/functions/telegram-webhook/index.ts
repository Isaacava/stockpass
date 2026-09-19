import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function sha256(value: string) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then((buffer) =>
    Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  );
}

async function reply(chatId: number, text: string) {
  await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (req.headers.get('x-telegram-bot-api-secret-token') !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const update = await req.json().catch(() => null) as any;
  const message = update?.message;
  if (!message?.text || !message.chat?.id) return new Response('ok');

  const chatId = Number(message.chat.id);
  const text = String(message.text).trim();
  if (!text.startsWith('/start')) return new Response('ok');

  const payload = text.slice('/start'.length).trim();
  if (!payload) {
    await reply(chatId, 'Open StockPass, connect your wallet, and use the Telegram connect action to create a one-time link.');
    return new Response('ok');
  }

  const token = payload.replace(/^link[_-]/i, '');
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    await reply(chatId, 'That StockPass link is invalid or expired. Start a new Telegram connection from the app.');
    return new Response('ok');
  }

  const tokenHash = await sha256(token);
  const { data: challenge } = await supabase
    .from('wgg_telegram_link_challenges')
    .select('wallet,expires_at,used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!challenge || challenge.used_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
    await reply(chatId, 'That StockPass link is invalid or expired. Start a new Telegram connection from the app.');
    return new Response('ok');
  }

  const { error: usedError } = await supabase
    .from('wgg_telegram_link_challenges')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('used_at', null);

  if (usedError) {
    await reply(chatId, 'StockPass could not finish the Telegram link. Please start again from the app.');
    return new Response('ok');
  }

  const { error } = await supabase
    .from('wgg_telegram_links')
    .upsert({ wallet: challenge.wallet, telegram_chat_id: String(chatId) }, { onConflict: 'wallet' });

  if (error) {
    await reply(chatId, 'StockPass could not save the Telegram link yet. Please try again.');
    return new Response('ok');
  }

  await reply(chatId, 'Weekend Gap Guard alerts are now linked to this chat. You can disconnect from StockPass at any time.');
  return new Response('ok');
});