import { createClient } from '@supabase/supabase-js';
import { readWalletSessionToken } from './walletSession';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://sfbxpscbevnmoppgkjcr.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_eCgd2QEH5mUlEK5vHIonyw_v0E8QFrp';

const walletAwareFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  const token = readWalletSessionToken();
  const existingClientInfo = headers.get('x-client-info') || 'stockpass';
  const cleanedClientInfo = existingClientInfo.replace(/\s+stockpass-session=[^\s]+/g, '').trim();
  if (token) headers.set('x-client-info', `${cleanedClientInfo} stockpass-session=${token}`);
  else headers.set('x-client-info', cleanedClientInfo);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: walletAwareFetch },
});
