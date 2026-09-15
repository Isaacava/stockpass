import { fetchOfficialMultipliers, fetchOfficialPrices } from './xstocks';
import type { StockAsset } from './assets';
import type { VerifiedPosition } from './solana';

export type XStockPortfolioRow = {
  mint: string;
  symbol: string;
  rawHolding: number;
  multiplier: number;
  holding: number;
  priceUsd: number | null;
  valueUsd: number | null;
};

export async function fetchXStockPortfolioValue(
  positions: VerifiedPosition[],
  assets: StockAsset[]
): Promise<XStockPortfolioRow[]> {
  const supported = assets.filter((asset) => positions.some((position) => position.mint === asset.mint));
  const [prices, multipliers] = await Promise.all([
    fetchOfficialPrices(supported),
    fetchOfficialMultipliers(supported)
  ]);

  return positions.map((position) => {
    const price = Number.isFinite(prices[position.symbol]) ? prices[position.symbol] : null;
    const rawMultiplier = multipliers[position.symbol];
    const multiplier = typeof rawMultiplier === 'number' && Number.isFinite(rawMultiplier) && rawMultiplier > 0 ? rawMultiplier : 1;
    const holding = position.balance * multiplier;
    return {
      mint: position.mint,
      symbol: position.symbol,
      rawHolding: position.balance,
      multiplier,
      holding,
      priceUsd: price,
      valueUsd: price === null ? null : holding * price
    };
  });
}

export function sumXStockValue(rows: XStockPortfolioRow[]) {
  return rows.reduce((total, row) => total + (row.valueUsd ?? 0), 0);
}
