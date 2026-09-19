const XSTOCKS_BASE = 'https://api.xstocks.fi/api/v2/public';
const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

type PricePoint = {
  price?: number | string;
  timestamp?: number | string;
};

type XStockPriceResponse = {
  price?: number | string;
  data?: { price?: number | string };
  dataPoints?: PricePoint[];
};

type XStockMultiplierResponse = {
  multiplier?: number | string;
  currentMultiplier?: number | string;
  data?: { multiplier?: number | string };
  activationTimestamp?: number | string;
  pendingMultiplier?: number | string;
};

type TwelveDataValue = {
  datetime?: string;
  open?: string | number;
  close?: string | number;
};

type TwelveDataSeries = {
  status?: string;
  message?: string;
  meta?: { symbol?: string };
  values?: TwelveDataValue[];
};

type WeekendGapObservation = {
  fridayDate: string;
  nextSessionDate: string;
  fridayClose: number;
  nextOpen: number;
  gapPct: number;
  downsideGapPct: number;
};

type WeekendGapSummary = {
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

type CacheEntry = { expiresAt: number; value: unknown };

const cache = new Map<string, CacheEntry>();
const PRICE_CACHE_TTL = 15_000;
const HISTORY_CACHE_TTL = 30 * 60_000;
const MAX_SYMBOLS = 12;
const DEFAULT_WEEKS = 13;
const MAX_WEEKS = 26;

function json(res: any, body: unknown, status = 200, cacheControl = 'no-store') {
  res.status(status).setHeader('Cache-Control', cacheControl).json(body);
}

function normalizeSymbol(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function underlyingSymbol(xStockSymbol: string): string {
  return xStockSymbol.endsWith('X') ? xStockSymbol.slice(0, -1) : xStockSymbol;
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value as T;
}

function putCache(key: string, value: unknown, ttl: number) {
  cache.set(key, { expiresAt: Date.now() + ttl, value });
}

async function fetchJson<T>(url: string, headers?: HeadersInit): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json', ...(headers ?? {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 250)}`);
  return JSON.parse(text) as T;
}

async function fetchXStockPrice(symbol: string) {
  const key = `xprice:${symbol}`;
  const cachedValue = cached<{ price: number; multiplier: number | null; updatedAt: number | null; source: 'xStocks' }>(key);
  if (cachedValue) return cachedValue;

  const [priceResult, multiplierResult] = await Promise.allSettled([
    fetchJson<XStockPriceResponse>(`${XSTOCKS_BASE}/assets/${encodeURIComponent(symbol)}/price-data?network=Solana`),
    fetchJson<XStockMultiplierResponse>(`${XSTOCKS_BASE}/assets/${encodeURIComponent(symbol)}/multiplier?network=Solana`),
  ]);

  if (priceResult.status === 'rejected') throw new Error(`xStocks price unavailable for ${symbol}.`);

  const pricePayload = priceResult.value;
  const dataPoints = Array.isArray(pricePayload.dataPoints) ? pricePayload.dataPoints : [];
  const latestPoint = dataPoints.length ? dataPoints[dataPoints.length - 1] : undefined;
  const rawPrice =
    pricePayload.price ??
    pricePayload.data?.price ??
    latestPoint?.price;
  const price = finiteNumber(rawPrice);
  if (price === null || price <= 0) throw new Error(`xStocks returned no usable current price for ${symbol}.`);

  let multiplier: number | null = null;
  if (multiplierResult.status === 'fulfilled') {
    const rawMultiplier =
      multiplierResult.value.multiplier ??
      multiplierResult.value.currentMultiplier ??
      multiplierResult.value.data?.multiplier;
    const parsedMultiplier = finiteNumber(rawMultiplier);
    if (parsedMultiplier !== null && parsedMultiplier > 0) multiplier = parsedMultiplier;
  }

  const updatedAt = finiteNumber(latestPoint?.timestamp);
  const value = { price, multiplier, updatedAt, source: 'xStocks' as const };
  putCache(key, value, PRICE_CACHE_TTL);
  return value;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function lastCompletedFriday(today = new Date()): Date {
  const day = today.getUTCDay();
  const daysSinceFriday = day >= 5 ? day - 5 : day + 2;
  const friday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  friday.setUTCDate(friday.getUTCDate() - daysSinceFriday);
  return friday;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

async function fetchTwelveDataSeries(symbols: string[], startDate: string, endDate: string, apiKey: string) {
  const cacheKey = `td:${symbols.join(',')}:${startDate}:${endDate}`;
  const cachedValue = cached<Record<string, TwelveDataSeries>>(cacheKey);
  if (cachedValue) return cachedValue;

  const url = new URL(`${TWELVE_DATA_BASE}/time_series`);
  url.searchParams.set('symbol', symbols.join(','));
  url.searchParams.set('interval', '1day');
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('format', 'JSON');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `apikey ${apiKey}`,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Twelve Data ${response.status}: ${text.slice(0, 300)}`);

  const parsed = JSON.parse(text) as unknown;
  const normalized: Record<string, TwelveDataSeries> = {};

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if ('values' in record || 'status' in record) {
      const metaSymbol = typeof (record.meta as { symbol?: unknown } | undefined)?.symbol === 'string'
        ? String((record.meta as { symbol?: unknown }).symbol).toUpperCase()
        : symbols[0];
      normalized[metaSymbol] = parsed as TwelveDataSeries;
    } else {
      for (const [key, value] of Object.entries(record)) {
        if (value && typeof value === 'object') normalized[key.toUpperCase()] = value as TwelveDataSeries;
      }
    }
  }

  putCache(cacheKey, normalized, HISTORY_CACHE_TTL);
  return normalized;
}

function buildSummary(underlying: string, series: TwelveDataSeries, weeks: number): WeekendGapSummary | null {
  const values = (series.values ?? [])
    .map((value) => ({
      date: String(value.datetime ?? '').slice(0, 10),
      open: finiteNumber(value.open),
      close: finiteNumber(value.close),
    }))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value.date) && value.open !== null && value.close !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!values.length) return null;

  const map = new Map(values.map((value) => [value.date, value]));
  const latestFriday = lastCompletedFriday();
  const earliestFriday = addDays(latestFriday, -(weeks + 8) * 7);
  const observations: WeekendGapObservation[] = [];

  for (let date = new Date(earliestFriday); date <= latestFriday && observations.length < weeks; date = addDays(date, 1)) {
    if (date.getUTCDay() !== 5) continue;

    const fridayDate = dateKey(date);
    const friday = map.get(fridayDate);
    if (!friday || friday.close === null || friday.close <= 0) continue;

    let nextSessionDate: string | null = null;
    let nextOpen: number | null = null;
    for (const candidate of values) {
      if (candidate.date <= fridayDate) continue;
      nextSessionDate = candidate.date;
      nextOpen = candidate.open;
      break;
    }
    if (!nextSessionDate || nextOpen === null || nextOpen <= 0) continue;

    const gapPct = ((nextOpen - friday.close) / friday.close) * 100;
    observations.push({
      fridayDate,
      nextSessionDate,
      fridayClose: friday.close,
      nextOpen,
      gapPct,
      downsideGapPct: Math.max(0, -gapPct),
    });
  }

  if (observations.length < Math.max(8, Math.floor(weeks * 0.6))) return null;

  const gapSeries = observations.map((item) => item.gapPct);
  const downsideSeries = observations.map((item) => item.downsideGapPct);

  return {
    provider: 'Twelve Data',
    underlyingSymbol: underlying,
    sampleCount: observations.length,
    medianGapPct: percentile(gapSeries, 0.5),
    p75GapPct: percentile(gapSeries, 0.75),
    p90GapPct: percentile(gapSeries, 0.9),
    maxDownsideGapPct: downsideSeries.length ? Math.max(...downsideSeries) : null,
    typicalWeekendGapPct: percentile(downsideSeries, 0.75),
    windowStart: observations[0]?.fridayDate ?? null,
    windowEnd: observations[observations.length - 1]?.nextSessionDate ?? null,
    methodology:
      'Friday close to the next available trading-session open using Twelve Data daily OHLC; downside gap is max(0, Friday-to-next-session-open return). Typical weekend gap is the 75th percentile of downside observations.',
    observations,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, { error: 'POST required' }, 405);

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  const symbols = Array.from(
    new Set(
      (Array.isArray(body.symbols) ? body.symbols : [])
        .map(normalizeSymbol)
        .map((value: string) => value.endsWith('X') ? value : `${value}X`)
        .filter((value: string) => /^[A-Z0-9]{2,12}X$/.test(value)),
    ),
  ).slice(0, MAX_SYMBOLS);

  const weeks = Math.min(
    MAX_WEEKS,
    Math.max(4, Math.floor(Number(body.weeks ?? DEFAULT_WEEKS))),
  );

  if (!symbols.length) return json(res, { prices: {}, weekendGaps: {}, unavailable: [] });

  const priceEntries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return [symbol, await fetchXStockPrice(symbol)] as const;
      } catch {
        return [symbol, null] as const;
      }
    }),
  );

  const prices = Object.fromEntries(priceEntries.filter((entry): entry is readonly [string, NonNullable<typeof entry[1]>] => Boolean(entry[1])));

  const apiKey = process.env.TWELVE_DATA_API_KEY ?? '';
  const underlyingSymbols = symbols
    .map(underlyingSymbol)
    .filter((symbol) => /^[A-Z0-9.]{1,10}$/.test(symbol));

  const weekendGaps: Record<string, WeekendGapSummary> = {};
  const unavailable: Array<{ symbol: string; reason: string }> = [];

  if (!apiKey) {
    for (const symbol of symbols) unavailable.push({ symbol, reason: 'Twelve Data historical provider is not configured.' });
  } else if (underlyingSymbols.length) {
    const endDate = dateKey(new Date());
    const startDate = dateKey(addDays(lastCompletedFriday(), -(weeks + 8) * 7));

    try {
      const series = await fetchTwelveDataSeries(Array.from(new Set(underlyingSymbols)), startDate, endDate, apiKey);
      for (const xStockSymbol of symbols) {
        const underlying = underlyingSymbol(xStockSymbol);
        const seriesForSymbol = series[underlying];
        const summary = seriesForSymbol ? buildSummary(underlying, seriesForSymbol, weeks) : null;
        if (summary) weekendGaps[xStockSymbol] = summary;
        else unavailable.push({ symbol: xStockSymbol, reason: 'Insufficient historical OHLC observations.' });
      }
    } catch (error) {
      for (const symbol of symbols) {
        unavailable.push({
          symbol,
          reason: error instanceof Error ? error.message : 'Historical provider request failed.',
        });
      }
    }
  }

  return json(
    res,
    { prices, weekendGaps, unavailable, providers: { currentPrice: 'xStocks', historical: apiKey ? 'Twelve Data' : null } },
    200,
    'private, max-age=10',
  );
}
