export type XStockPrice = {
  price: number;
  multiplier: number | null;
  updatedAt: number | null;
  source: 'xStocks';
};

export type XStockPriceMap = Record<string, XStockPrice>;

export type WeekendGapObservation = {
  fridayDate: string;
  nextSessionDate: string;
  fridayClose: number;
  nextOpen: number;
  gapPct: number;
  downsideGapPct: number;
};

export type WeekendGapSummary = {
  provider: 'Twelve Data';
  underlyingSymbol: string;
  sampleCount: number;
  medianGapPct: number | null;
  p75GapPct: number | null;
  p90GapPct: number | null;
  maxDownsideGapPct: number | null;
  typicalWeekendGapPct: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  methodology: string;
  observations: WeekendGapObservation[];
};

export type WeekendGapMap = Record<string, WeekendGapSummary>;

type MarketDataResponse = {
  prices?: XStockPriceMap;
  weekendGaps?: WeekendGapMap;
  unavailable?: Array<{ symbol: string; reason: string }>;
  providers?: { currentPrice?: string | null; historical?: string | null };
};

export async function fetchWggMarketData(symbols: string[], weeks = 13): Promise<MarketDataResponse> {
  const unique = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
  if (!unique.length) return { prices: {}, weekendGaps: {}, unavailable: [] };

  const response = await fetch('/api/wgg-market-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbols: unique, weeks }),
  });

  const data = await response.json().catch(() => null) as MarketDataResponse | { error?: string } | null;
  if (!response.ok) throw new Error((data as { error?: string } | null)?.error ?? 'Market data request failed.');

  return (data ?? {}) as MarketDataResponse;
}
