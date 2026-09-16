import { supabase } from './supabase';

export type PythPrice = {
  price: number;
  confidence: number | null;
  publishTime: number | null;
  feedId: string;
};

export type PythPriceMap = Record<string, PythPrice>;

export type WeekendGapSummary = {
  sampleCount: number;
  medianGapPct: number | null;
  p75GapPct: number | null;
  p90GapPct: number | null;
  maxDownsideGapPct: number | null;
  typicalWeekendGapPct: number | null;
  windowStart: string;
  windowEnd: string;
  methodology: string;
  feedId: string;
};

export type WeekendGapMap = Record<string, WeekendGapSummary>;

export async function fetchPythPrices(symbols: string[]): Promise<PythPriceMap> {
  const unique = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
  if (!unique.length) return {};

  const { data, error } = await supabase.functions.invoke('wgg-pyth', {
    body: { symbols: unique },
  });
  if (error) throw error;
  return (data?.prices ?? {}) as PythPriceMap;
}

export async function fetchWeekendGapSummaries(symbols: string[], weeks = 13): Promise<WeekendGapMap> {
  const unique = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)));
  if (!unique.length) return {};

  const { data, error } = await supabase.functions.invoke('wgg-weekend-gap', {
    body: { symbols: unique, weeks },
  });
  if (error) throw error;
  return (data?.summary ?? {}) as WeekendGapMap;
}

export function calculateLiquidationBufferPct(currentLtvPct: number | null, liquidationLtvPct: number | null) {
  if (currentLtvPct === null || liquidationLtvPct === null) return null;
  if (!Number.isFinite(currentLtvPct) || !Number.isFinite(liquidationLtvPct)) return null;
  return Math.max(0, liquidationLtvPct - currentLtvPct);
}

export function priceMovePct(currentPrice: number | null, referencePrice: number | null) {
  if (currentPrice === null || referencePrice === null || referencePrice <= 0) return null;
  return ((currentPrice - referencePrice) / referencePrice) * 100;
}
