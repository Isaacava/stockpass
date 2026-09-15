import { supabase } from './supabase';

export type CatalogXStock = {
  symbol: string;
  name: string;
  solana_mint: string;
  logo_url: string | null;
};

export async function loadVerifiedSolanaXStocks(): Promise<CatalogXStock[]> {
  const { data, error } = await supabase
    .from('stockpass_xstock_catalog')
    .select('symbol, name, solana_mint, logo_url')
    .eq('network', 'Solana')
    .eq('is_verified', true)
    .eq('badge_enabled', true)
    .order('symbol')
    .limit(1000);

  if (error) throw error;
  return (data ?? []) as CatalogXStock[];
}
