import type { StockAsset } from './assets';

const XSTOCKS_API = 'https://api.xstocks.fi/api/v2/public';

type XStockDeployment = { network?: string; address?: string; chain?: string };
type XStockAssetResponse = { symbol?: string; name?: string; displayName?: string; deployments?: XStockDeployment[]; networks?: XStockDeployment[]; mintAddress?: string; solanaAddress?: string; address?: string };
type PriceResponse = { price?: number | string; data?: { price?: number | string }; dataPoints?: Array<{ price?: number | string }> };
type MultiplierResponse = { multiplier?: number | string; data?: { multiplier?: number | string }; currentMultiplier?: number | string };

function pickSolanaMint(asset: XStockAssetResponse): string {
  const deployments = [...(asset.deployments ?? []), ...(asset.networks ?? [])];
  const solana = deployments.find((entry) => `${entry.network ?? entry.chain ?? ''}`.toLowerCase().includes('solana'));
  return solana?.address ?? asset.solanaAddress ?? (asset.mintAddress && asset.mintAddress.length > 20 ? asset.mintAddress : '');
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`xStocks request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function resolveOfficialStocks(stocks: StockAsset[]): Promise<StockAsset[]> {
  return Promise.all(stocks.map(async (stock) => {
    try {
      const result = await fetchJson<XStockAssetResponse>(`${XSTOCKS_API}/assets/${encodeURIComponent(stock.symbol)}?network=Solana`);
      return { ...stock, name: result.name ?? result.displayName ?? stock.name, mint: pickSolanaMint(result), source: 'xStocks' as const };
    } catch {
      return { ...stock };
    }
  }));
}

export async function fetchOfficialPrices(stocks: StockAsset[]) {
  const entries = await Promise.all(stocks.map(async (stock) => {
    try {
      const result = await fetchJson<PriceResponse>(`${XSTOCKS_API}/assets/${encodeURIComponent(stock.symbol)}/price-data?network=Solana`);
      const raw = result.price ?? result.data?.price ?? result.dataPoints?.at(-1)?.price;
      const price = typeof raw === 'string' ? Number(raw) : raw;
      return typeof price === 'number' && Number.isFinite(price) ? [stock.symbol, price] as const : null;
    } catch {
      return null;
    }
  }));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, number] => Boolean(entry)));
}

export async function fetchOfficialMultipliers(stocks: StockAsset[]) {
  const entries = await Promise.all(stocks.map(async (stock) => {
    try {
      const result = await fetchJson<MultiplierResponse>(`${XSTOCKS_API}/assets/${encodeURIComponent(stock.symbol)}/multiplier?network=Solana`);
      const raw = result.multiplier ?? result.currentMultiplier ?? result.data?.multiplier;
      const parsed = typeof raw === 'string' ? Number(raw) : raw;
      const multiplier = typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      return [stock.symbol, multiplier] as const;
    } catch {
      return [stock.symbol, 1] as const;
    }
  }));
  return Object.fromEntries(entries);
}
