import { STOCKS } from './assets';

const PNL_URL = 'https://public-api.birdeye.so/wallet/v2/pnl';
const TOKEN_LIST_PARAM = 'list_address';
const BIRDEYE_API_KEY = import.meta.env.VITE_BIRDEYE_API_KEY ?? '';

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

export async function fetchPortfolioPnl(wallet: string, mints?: string[]): Promise<TokenPnl[]> {
  if (!BIRDEYE_API_KEY) return [];

  const allowed = new Set(STOCKS.map((asset) => asset.mint).filter(Boolean));
  const requested = (mints ?? [...allowed]).filter((mint) => allowed.has(mint));
  if (requested.length === 0) return [];

  const url = `${PNL_URL}?wallet=${encodeURIComponent(wallet)}&${TOKEN_LIST_PARAM}=${requested.map(encodeURIComponent).join(',')}`;
  const response = await fetch(url, {
    headers: {
      'X-API-KEY': BIRDEYE_API_KEY,
      'x-chain': 'solana',
      accept: 'application/json'
    }
  });

  if (!response.ok) return [];

  const payload = await response.json();
  const tokens = payload?.data?.tokens ?? {};

  return Object.entries(tokens as Record<string, any>).map(([mint, token]) => ({
    mint,
    symbol: token.symbol ?? '',
    holding: Number(token.quantity?.holding ?? 0),
    currentValueUsd: Number(token.cashflow_usd?.current_value ?? 0),
    realizedUsd: Number(token.pnl?.realized_profit_usd ?? 0),
    unrealizedUsd: Number(token.pnl?.unrealized_usd ?? 0),
    totalUsd: Number(token.pnl?.total_usd ?? 0),
    totalPercent: Number(token.pnl?.total_percent ?? 0)
  }));
}

export function sumPortfolioPnl(rows: TokenPnl[]) {
  return rows.reduce((total, row) => total + row.totalUsd, 0);
}
