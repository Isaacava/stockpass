export type MarketQuote = {
  symbol: string;
  priceUsd: number;
  asOf: string;
  source: 'Backed xStocks public API';
};

const PRICE_URL = (symbol: string) => `https://api.backed.fi/api/v2/public/assets/${encodeURIComponent(symbol)}/price-data`;

export async function fetchXStockPrice(symbol: string): Promise<MarketQuote | null> {
  const response = await fetch(PRICE_URL(symbol), { headers: { accept: 'application/json' } });
  if (!response.ok) return null;

  const payload = await response.json() as Record<string, unknown>;
  const price = findNumber(payload, ['price', 'priceUsd', 'usdPrice', 'estimatedPrice']);
  if (!price || price <= 0) return null;

  const timestamp = findString(payload, ['timestamp', 'asOf', 'updatedAt', 'lastUpdated']) ?? new Date().toISOString();
  return { symbol, priceUsd: price, asOf: timestamp, source: 'Backed xStocks public API' };
}

export async function fetchXStockPrices(symbols: string[]) {
  const results = await Promise.allSettled(symbols.map(fetchXStockPrice));
  return Object.fromEntries(
    results
      .filter((result): result is PromiseFulfilledResult<MarketQuote | null> => result.status === 'fulfilled' && result.value !== null)
      .map((result) => [result.value.symbol, result.value])
  );
}

function findNumber(object: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  }
  for (const value of Object.values(object)) {
    if (value && typeof value === 'object') {
      const nested = findNumber(value as Record<string, unknown>, keys);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function findString(object: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}
