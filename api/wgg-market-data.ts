import { buildWeekendGapSummary, type DailyOHLC, type WeekendGapSummary } from '../src/lib/wggGap.js';
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

type CacheEntry = { expiresAt: number; value: unknown };

const cache = new Map<string, CacheEntry>();
let supabase: any = null;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sfbxpscbevnmoppgkjcr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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

async function getSupabaseClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

async function fetchPersistentCache<T>(cacheKey: string): Promise<T | null> {
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from('wgg_market_cache')
    .select('payload,expires_at')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  return data.payload as T;
}

async function writePersistentCache(cacheKey: string, provider: string, value: unknown, ttlMs: number) {
  const client = await getSupabaseClient();
  if (!client) return;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await client.from('wgg_market_cache').upsert({
    cache_key: cacheKey,
    provider,
    payload: value,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
}

async function fetchTwelveDataSeries(symbols: string[], startDate: string, endDate: string, apiKey: string) {
  const normalizedSymbols = [...new Set(symbols)].sort();
  const cacheKey = `td:${normalizedSymbols.join(',')}:${startDate}:${endDate}`;
  const memoryCached = cached<Record<string, TwelveDataSeries>>(cacheKey);
  if (memoryCached) return memoryCached;
  const persistentCached = await fetchPersistentCache<Record<string, TwelveDataSeries>>(cacheKey);
  if (persistentCached) {
    putCache(cacheKey, persistentCached, HISTORY_CACHE_TTL);
    return persistentCached;
  }

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
  await writePersistentCache(cacheKey, 'Twelve Data', normalized, 24 * 60 * 60_000);
  return normalized;
}

export const config = { runtime: 'nodejs', maxDuration: 30 };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, { error: 'POST required' }, 405);

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
  const requestedSymbols: unknown[] = Array.isArray(body.symbols) ? body.symbols : [];
  const symbols: string[] = Array.from(
    new Set(
      requestedSymbols
        .map(normalizeSymbol)
        .map((value) => value.endsWith('X') ? value : value + 'X')
        .filter((value) => /^[A-Z0-9]{2,12}X$/.test(value)),
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
    const startDate = dateKey(addDays(new Date(), -(weeks + 12) * 7));

    try {
      const series = await fetchTwelveDataSeries(Array.from(new Set(underlyingSymbols)), startDate, endDate, apiKey);
      for (const xStockSymbol of symbols) {
        const underlying = underlyingSymbol(xStockSymbol);
        const seriesForSymbol = series[underlying];
        const values: DailyOHLC[] = (seriesForSymbol?.values ?? [])
          .map((value) => ({
            date: String(value.datetime ?? '').slice(0, 10),
            open: finiteNumber(value.open),
            close: finiteNumber(value.close),
          }))
          .filter((value): value is DailyOHLC => /^\d{4}-\d{2}-\d{2}$/.test(value.date) && value.open !== null && value.close !== null)
          .map((value) => ({ date: value.date, open: value.open as number, close: value.close as number }));
        const summary = buildWeekendGapSummary(underlying, values, weeks);
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
