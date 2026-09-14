import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://sfbxpscbevnmoppgkjcr.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eCgd2QEH5mUlEK5vHIonyw_v0E8QFrp';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
