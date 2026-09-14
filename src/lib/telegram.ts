import { supabase } from './supabase';

export const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '';

export function telegramConnectUrl(wallet: string) {
  if (!TELEGRAM_BOT_USERNAME) return null;
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(wallet)}`;
}

export async function isTelegramLinked(wallet: string) {
  const { data, error } = await supabase
    .from('stockpass_telegram_links')
    .select('wallet')
    .eq('wallet', wallet)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
