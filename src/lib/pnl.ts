import { STOCKS } from './assets';
import { supabase } from './supabase';

export type TokenPnl = {
  mint: string;
  symbol: string;
  holding: number;
  currentValueUsd: number;
  realizedUsd: number;
  unrealizedUsd: number;
  totalUsd: number;
  totalPercent: number;
};

type PnlResponse = { tokens?: TokenPnl[]; error?: string };

export async function fetchPortfolioPnl(wallet: string, mints?: string[]): Promise<TokenPnl[]> {
  const allowed = new Set(STOCKS.map((asset) => asset.mint).filter(Boolean));
  const requested = (mints ?? [...allowed]).filter((mint) => allowed.has(mint));
  if (!wallet || requested.length === 0) return [];

  const { data, error } = await supabase.functions.invoke<PnlResponse>('stockpass-pnl', {
    body: { wallet, mints: requested }
  });

  if (error || !data?.tokens) return [];
  return data.tokens.map((token) => ({
    mint: String(token.mint),
    symbol: String(token.symbol ?? ''),
    holding: Number(token.holding ?? 0),
    currentValueUsd: Number(token.currentValueUsd ?? 0),
    realizedUsd: Number(token.realizedUsd ?? 0),
    unrealizedUsd: Number(token.unrealizedUsd ?? 0),
    totalUsd: Number(token.totalUsd ?? 0),
    totalPercent: Number(token.totalPercent ?? 0)
  }));
}

export function sumPortfolioPnl(rows: TokenPnl[]) {
  return rows.reduce((total, row) => total + row.totalUsd, 0);
}
