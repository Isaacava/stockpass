import { fetchOfficialPrices } from './xstocks';
import type { StockAsset } from './assets';
import type { VerifiedPosition } from './solana';

export type XStockPortfolioRow = {
  mint: string;
  symbol: string;
  holding: number;
  priceUsd: number | null;
  valueUsd: number | null;
};

export async function fetchXStockPortfolioValue(
  positions: VerifiedPosition[],
  assets: StockAsset[]
): Promise<XStockPortfolioRow[]> {
  const supported = assets.filter((asset) => positions.some((position) => position.mint === asset.mint));
  const prices = await fetchOfficialPrices(supported);

  return positions.map((position) => {
    const price = Number.isFinite(prices[position.symbol]) ? prices[position.symbol] : null;
    return {
      mint: position.mint,
      symbol: position.symbol,
      holding: position.balance,
      priceUsd: price,
      valueUsd: price === null ? null : position.balance * price
    };
  });
}

export function sumXStockValue(rows: XStockPortfolioRow[]) {
  return rows.reduce((total, row) => total + (row.valueUsd ?? 0), 0);
}
