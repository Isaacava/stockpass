import type { StockAsset } from './assets';
import type { VerifiedPosition } from './solana';
import { fetchXStockPortfolioValue, sumXStockValue, type XStockPortfolioRow } from './xstockPortfolio';

export type TokenPnl = XStockPortfolioRow & {
  currentValueUsd: number | null;
  realizedUsd: null;
  unrealizedUsd: null;
  totalUsd: number | null;
  totalPercent: null;
};

/**
 * StockPass tracks xStocks only. This compatibility helper now uses only
 * xStocks public market data plus onchain Solana holdings. It does not use
 * Birdeye or another paid/third-party market-data provider, and it does not
 * invent cost basis or realized PnL.
 */
export async function fetchPortfolioPnl(
  _wallet: string,
  assets: StockAsset[],
  positions: VerifiedPosition[]
): Promise<TokenPnl[]> {
  const rows = await fetchXStockPortfolioValue(positions, assets);
  return rows.map((row) => ({
    ...row,
    currentValueUsd: row.valueUsd,
    realizedUsd: null,
    unrealizedUsd: null,
    totalUsd: row.valueUsd,
    totalPercent: null
  }));
}

export function sumPortfolioPnl(rows: TokenPnl[]) {
  return sumXStockValue(rows);
}
