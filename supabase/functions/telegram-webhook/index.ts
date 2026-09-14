import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const BASE58_WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

async function reply(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

Deno.serve(async (req) => {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const update = await req.json();
  const message = update.message;
  if (!message?.text || !message.chat?.id) return new Response('ok');

  const chatId = Number(message.chat.id);
  const text = String(message.text).trim();

  if (!text.startsWith('/start')) return new Response('ok');

  const payload = text.slice('/start'.length).trim();
  if (!payload) {
    await reply(chatId, 'Open StockPass, connect your wallet, and tap Connect Telegram to link this chat.');
    return new Response('ok');
  }

  if (!BASE58_WALLET.test(payload)) {
    await reply(chatId, 'That does not look like a valid Solana wallet address. Open StockPass and use Connect Telegram again.');
    return new Response('ok');
  }

  const { error } = await supabase
    .from('stockpass_telegram_links')
    .upsert({ wallet: payload, chat_id: chatId }, { onConflict: 'wallet' });

  if (error) {
    await reply(chatId, 'StockPass could not link this chat yet. Please try again.');
    return new Response('ok');
  }

  await reply(chatId, `Linked. Price alerts for ${payload.slice(0, 4)}…${payload.slice(-4)} will be sent here.`);
  return new Response('ok');
});
