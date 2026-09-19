import { createClient } from '@supabase/supabase-js';
import { readWalletSessionToken } from './walletSession';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config';

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
