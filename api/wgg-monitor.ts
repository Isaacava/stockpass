import { createClient } from '@supabase/supabase-js';
import { discoverKaminoXStockPositions, KAMINO_MAIN_MARKET } from '../src/lib/kamino';
import { evaluateEarningsRisk, type EarningsEvent } from '../src/lib/wggEarnings';
import {
  calculateCollateralUsdForTargetLtv,
  calculateRepayUsdForTargetLtv,
  evaluateWeekendRisk,
} from '../src/lib/wggRisk';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sfbxpscbevnmoppgkjcr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || '';
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const MAX_WALLETS_PER_RUN = Math.max(1, Math.min(25, Number(process.env.WGG_MAX_WALLETS || 12)));
const ALERT_WORKER_URL = process.env.WGG_ALERT_WORKER_URL || `${SUPABASE_URL}/functions/v1/alerts-worker`;

type XStockPrice = {
  price: number;
  multiplier: number | null;
  updatedAt: number | null;
};

type DailyValue = { date: string; open: number; close: number };
type WeekendGap = {
  underlyingSymbol: string;
  sampleCount: number;
  typicalWeekendGapPct: number | null;
  p75GapPct: number | null;
  p90GapPct: number | null;
  maxDownsideGapPct: number | null;
  observations: Array<{
    fridayDate: string;
    nextSessionDate: string;
    fridayClose: number;
    nextOpen: number;
    gapPct: number;
    downsideGapPct: number;
  }>;
};

const supabase = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function json(res: any, body: unknown, status = 200) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

function finiteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
  return JSON.parse(text) as T;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function lastCompletedFriday(today = new Date()) {
  const day = today.getUTCDay();
  const daysSinceFriday = day === 5 ? 0 : day > 5 ? day - 5 : day + 2;
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

function underlying(symbol: string) {
  return symbol.toUpperCase().replace(/X$/, '');
}

async function fetchXStockData(symbols: string[]): Promise<Record<string, XStockPrice>> {
  const entries = await Promise.all(symbols.map(async (symbol) => {
    try {
      const [pricePayload, multiplierPayload] = await Promise.all([
        fetchJson<any>(`https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(symbol)}/price-data?network=Solana`),
        fetchJson<any>(`https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(symbol)}/multiplier?network=Solana`),
      ]);
      const latestPoint = Array.isArray(pricePayload?.dataPoints) ? pricePayload.dataPoints.at(-1) : undefined;
      const price = finiteNumber(pricePayload?.price ?? pricePayload?.data?.price ?? latestPoint?.price);
      const multiplier = finiteNumber(
        multiplierPayload?.multiplier ??
        multiplierPayload?.currentMultiplier ??
        multiplierPayload?.data?.multiplier,
      );
      if (price === null || price <= 0) return null;
      return [symbol, {
        price,
        multiplier: multiplier !== null && multiplier > 0 ? multiplier : null,
        updatedAt: finiteNumber(latestPoint?.timestamp),
      }] as const;
    } catch {
      return null;
    }
  }));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, XStockPrice] => Boolean(entry)));
}

async function fetchHistorical(symbols: string[], weeks = 13): Promise<Record<string, WeekendGap>> {
  if (!TWELVE_DATA_API_KEY || !symbols.length) return {};
  const start = dateKey(addDays(lastCompletedFriday(), -(weeks + 8) * 7));
  const end = dateKey(new Date());
  const url = new URL('https://api.twelvedata.com/time_series');
  url.searchParams.set('symbol', symbols.join(','));
  url.searchParams.set('interval', '1day');
  url.searchParams.set('start_date', start);
  url.searchParams.set('end_date', end);
  url.searchParams.set('format', 'JSON');

  const response = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `apikey ${TWELVE_DATA_API_KEY}` },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Twelve Data ${response.status}: ${text.slice(0, 240)}`);
  const parsed = JSON.parse(text) as Record<string, any>;

  const normalized: Record<string, any> = {};
  if ('values' in parsed || 'status' in parsed) {
    const metaSymbol = String(parsed.meta?.symbol || symbols[0]).toUpperCase();
    normalized[metaSymbol] = parsed;
  } else {
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === 'object') normalized[key.toUpperCase()] = value;
    }
  }

  const out: Record<string, WeekendGap> = {};
  for (const symbol of symbols) {
    const series = normalized[symbol];
    const values: DailyValue[] = (series?.values ?? [])
      .map((row: any) => ({
        date: String(row?.datetime ?? '').slice(0, 10),
        open: finiteNumber(row?.open),
        close: finiteNumber(row?.close),
      }))
      .filter((row: any) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.open !== null && row.close !== null)
      .map((row: any) => ({ date: row.date, open: row.open as number, close: row.close as number }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!values.length) continue;
    const map = new Map(values.map((value) => [value.date, value]));
    const latestFriday = lastCompletedFriday();
    const earliestFriday = addDays(latestFriday, -(weeks + 8) * 7);
    const observations: WeekendGap['observations'] = [];

    for (let cursor = new Date(earliestFriday); cursor <= latestFriday; cursor = addDays(cursor, 1)) {
      if (cursor.getUTCDay() !== 5) continue;
      const fridayDate = dateKey(cursor);
      const friday = map.get(fridayDate);
      if (!friday || friday.close <= 0) continue;

      const next = values.find((value) => value.date > fridayDate);
      if (!next || next.open <= 0) continue;

      const gapPct = ((next.open - friday.close) / friday.close) * 100;
      observations.push({
        fridayDate,
        nextSessionDate: next.date,
        fridayClose: friday.close,
        nextOpen: next.open,
        gapPct,
        downsideGapPct: Math.max(0, -gapPct),
      });
      if (observations.length >= weeks) break;
    }

    if (observations.length < Math.max(8, Math.floor(weeks * 0.6))) continue;
    const allGaps = observations.map((item) => item.gapPct);
    const downside = observations.map((item) => item.downsideGapPct);
    out[symbol] = {
      underlyingSymbol: symbol,
      sampleCount: observations.length,
      typicalWeekendGapPct: percentile(downside, 0.75),
      p75GapPct: percentile(allGaps, 0.75),
      p90GapPct: percentile(allGaps, 0.9),
      maxDownsideGapPct: Math.max(...downside),
      observations,
    };
  }
  return out;
}

async function fetchEarnings(symbols: string[]): Promise<Record<string, EarningsEvent>> {
  if (!TWELVE_DATA_API_KEY || !symbols.length) return {};
  const today = new Date();
  const start = dateKey(today);
  const end = dateKey(addDays(today, 7));
  const url = new URL('https://api.twelvedata.com/earnings_calendar');
  url.searchParams.set('start_date', start);
  url.searchParams.set('end_date', end);
  url.searchParams.set('country', 'United States');
  url.searchParams.set('format', 'JSON');

  const response = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `apikey ${TWELVE_DATA_API_KEY}` },
  });
  if (!response.ok) return {};

  const payload = await response.json().catch(() => null) as any;
  const rows = Object.values(payload?.earnings ?? {}).flat() as any[];
  const target = new Set(symbols.map((symbol) => symbol.toUpperCase()));
  const result: Record<string, EarningsEvent> = {};

  for (const row of rows) {
    const symbol = String(row?.symbol ?? '').toUpperCase();
    if (!target.has(symbol) || result[symbol]) continue;
    const rawTime = String(row?.time ?? 'Time Not Supplied');
    const timing: EarningsEvent['timing'] =
      rawTime === 'Pre Market' ? 'before_open' :
      rawTime === 'After Hours' ? 'after_close' : 'unspecified';
    result[symbol] = {
      symbol,
      reportDate: String(row?.date ?? ''),
      timing,
      source: 'Twelve Data earnings calendar',
      sourceUrl: 'https://twelvedata.com/docs',
    };
  }
  return result;
}

async function validateWalletSession(req: any, wallet: string) {
  const clientInfo = Array.isArray(req.headers?.['x-client-info'])
    ? req.headers['x-client-info'].join(' ')
    : String(req.headers?.['x-client-info'] ?? '');
  if (!/stockpass-session=[^\s]+/.test(clientInfo)) return false;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/wallet-auth`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      'x-client-info': clientInfo,
    },
    body: JSON.stringify({ action: 'validate', wallet }),
  });
  return response.ok;
}

function cronAuthorized(req: any) {
  if (!CRON_SECRET) return false;
  const header = String(req.headers?.authorization ?? '');
  return header === `Bearer ${CRON_SECRET}`;
}

async function upsertPositionRisk(wallet: string, position: any, stock: any, price: XStockPrice | undefined, gap: WeekendGap | undefined, earningsEvent: EarningsEvent | null, runId: string) {
  if (!supabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');

  const previous = await supabase
    .from('wgg_monitored_positions')
    .select('*')
    .eq('wallet', wallet)
    .eq('obligation_address', position.obligation)
    .eq('collateral_mint', stock.mint)
    .maybeSingle();

  const earningsRisk = evaluateEarningsRisk(underlying(stock.symbol), earningsEvent);
  const risk = gap?.typicalWeekendGapPct != null && position.liquidationBufferPct != null
    ? evaluateWeekendRisk({
        currentBufferPct: position.liquidationBufferPct,
        typicalWeekendGapPct: gap.typicalWeekendGapPct,
        earningsRisk: earningsRisk.upcoming,
      })
    : null;

  let riskStatus: 'unknown' | 'safe' | 'watch' | 'flagged' | 'stale' = 'stale';
  let recommendedRepayUsd: number | null = null;
  let recommendedCollateralUsd: number | null = null;
  let targetLtvPct: number | null = null;

  if (risk && position.liquidationLtvPct != null && position.borrowValueUsd != null && position.depositValueUsd != null) {
    riskStatus = risk.status;
    if (risk.status === 'flagged') {
      targetLtvPct = Math.max(1, position.liquidationLtvPct - risk.adjustedGapPct * 1.2);
      recommendedRepayUsd = calculateRepayUsdForTargetLtv(position.borrowValueUsd, position.depositValueUsd, targetLtvPct);
      recommendedCollateralUsd = calculateCollateralUsdForTargetLtv(position.borrowValueUsd, position.depositValueUsd, targetLtvPct);
    }
  }

  const payload = {
    wallet,
    kamino_market: KAMINO_MAIN_MARKET,
    obligation_address: position.obligation,
    collateral_mint: stock.mint,
    symbol: stock.symbol,
    collateral_amount: stock.amount,
    collateral_value_usd: position.depositValueUsd,
    debt_usd: position.borrowValueUsd,
    liquidation_ltv: position.liquidationLtvPct,
    current_buffer_pct: position.liquidationBufferPct,
    typical_weekend_gap_pct: gap?.typicalWeekendGapPct ?? null,
    earnings_risk: earningsRisk.upcoming,
    health_factor: null,
    risk_status: riskStatus,
    recommended_repay_usd: recommendedRepayUsd,
    recommended_collateral_usd: recommendedCollateralUsd,
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let positionId = previous.data?.id as string | undefined;
  if (positionId) {
    const { error } = await supabase.from('wgg_monitored_positions').update(payload).eq('id', positionId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('wgg_monitored_positions').insert(payload).select('id').single();
    if (error) throw error;
    positionId = data.id;
  }

  if ((riskStatus === 'watch' || riskStatus === 'flagged') && positionId) {
    const recentCutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('wgg_alerts')
      .select('id')
      .eq('position_id', positionId)
      .eq('severity', riskStatus)
      .gte('created_at', recentCutoff)
      .limit(1);

    if (!recent?.length) {
      const { data: alert, error } = await supabase
        .from('wgg_alerts')
        .insert({
          wallet,
          position_id: positionId,
          severity: riskStatus,
          title: riskStatus === 'flagged' ? `${stock.symbol} weekend protection flagged` : `${stock.symbol} weekend protection on watch`,
          message: riskStatus === 'flagged'
            ? `Live Kamino liquidation buffer is ${position.liquidationBufferPct?.toFixed(2)} pts versus an adjusted weekend-gap signal of ${risk?.adjustedGapPct.toFixed(2)}%.`
            : `Live Kamino liquidation buffer is close to the modeled weekend-gap signal.`,
          details: {
            symbol: stock.symbol,
            price: price?.price ?? null,
            multiplier: price?.multiplier ?? null,
            currentBufferPct: position.liquidationBufferPct,
            typicalWeekendGapPct: gap?.typicalWeekendGapPct ?? null,
            adjustedGapPct: risk?.adjustedGapPct ?? null,
            deficitPct: risk?.deficitPct ?? null,
            earnings: earningsRisk.event,
            recommendedRepayUsd,
            recommendedCollateralUsd,
            targetLtvPct,
            runId,
          },
        })
        .select('id')
        .single();
      if (error) throw error;
      return { positionId, alertId: alert.id, riskStatus };
    }
  }

  return { positionId, alertId: null, riskStatus };
}

async function syncWallet(wallet: string, runKind: 'manual' | 'friday' | 'position_scan') {
  if (!supabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  if (!SOLANA_RPC_URL) throw new Error('SOLANA_RPC_URL is not configured.');

  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase
    .from('wgg_check_runs')
    .insert({ run_kind: runKind, started_at: startedAt, status: 'running' })
    .select('id')
    .single();
  if (runError) throw runError;

  try {
    const [positions, marketData] = await Promise.all([
      discoverKaminoXStockPositions(wallet, SOLANA_RPC_URL),
      Promise.resolve(null),
    ]);

    const symbols = Array.from(new Set(positions.flatMap((position) => position.xStocks.map((stock) => stock.symbol))));
    const priceData = await fetchXStockData(symbols);
    const underlyingSymbols = Array.from(new Set(symbols.map(underlying)));
    const [gaps, earnings] = await Promise.all([
      fetchHistorical(underlyingSymbols, 13),
      fetchEarnings(underlyingSymbols),
    ]);

    const seen = new Set<string>();
    let scanned = 0;
    let flagged = 0;
    const alertIds: string[] = [];

    for (const position of positions) {
      for (const stock of position.xStocks) {
        const result = await upsertPositionRisk(
          wallet,
          position,
          stock,
          priceData[stock.symbol],
          gaps[underlying(stock.symbol)],
          earnings[underlying(stock.symbol)] ?? null,
          run.id,
        );
        seen.add(`${position.obligation}:${stock.mint}`);
        scanned += 1;
        if (result.riskStatus === 'flagged') flagged += 1;
        if (result.alertId) alertIds.push(result.alertId);
      }
    }

    const previousRows = await supabase
      .from('wgg_monitored_positions')
      .select('id,obligation_address,collateral_mint')
      .eq('wallet', wallet);

    for (const row of previousRows.data ?? []) {
      const key = `${row.obligation_address}:${row.collateral_mint}`;
      if (!seen.has(key)) {
        await supabase.from('wgg_monitored_positions').update({
          risk_status: 'stale',
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', row.id);
      }
    }

    await supabase.from('wgg_check_runs').update({
      finished_at: new Date().toISOString(),
      status: 'completed',
      positions_scanned: scanned,
      positions_flagged: flagged,
      metadata: {
        wallet,
        market: KAMINO_MAIN_MARKET,
        symbols,
        historicalProvider: TWELVE_DATA_API_KEY ? 'Twelve Data' : null,
        currentPriceProvider: 'xStocks',
        alertsCreated: alertIds.length,
        marketDataUsed: Boolean(marketData),
      },
    }).eq('id', run.id);

    return { wallet, runId: run.id, scanned, flagged, alertsCreated: alertIds.length, alertIds };
  } catch (error) {
    await supabase.from('wgg_check_runs').update({
      finished_at: new Date().toISOString(),
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'WGG monitoring failed.',
    }).eq('id', run.id);
    throw error;
  }
}

async function dispatchAlerts() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(ALERT_WORKER_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ source: 'wgg-monitor' }),
    });
  } catch (error) {
    console.error('wgg-monitor alert dispatch', error);
  }
}

async function loadWallets() {
  if (!supabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  const [monitored, actions] = await Promise.all([
    supabase.from('wgg_monitored_positions').select('wallet').limit(500),
    supabase.from('wgg_platform_actions').select('wallet').eq('status', 'confirmed').limit(500),
  ]);
  const wallets = new Set<string>();
  for (const row of monitored.data ?? []) wallets.add(String(row.wallet));
  for (const row of actions.data ?? []) wallets.add(String(row.wallet));
  return [...wallets].filter(Boolean).slice(0, MAX_WALLETS_PER_RUN);
}

export const config = { maxDuration: 60 };

export default async function handler(req: any, res: any) {
  const method = String(req.method || 'GET');

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const wallet = typeof body.wallet === 'string' ? body.wallet.trim() : '';
    const mode = body.mode === 'sync' ? 'sync' : 'cron';

    if (mode === 'sync') {
      if (method !== 'POST' || !wallet) return json(res, { error: 'POST with wallet is required for manual sync.' }, 400);
      if (!await validateWalletSession(req, wallet)) return json(res, { error: 'A valid wallet session is required.' }, 401);
      const result = await syncWallet(wallet, 'position_scan');
      await dispatchAlerts();
      return json(res, { ok: true, ...result });
    }

    if (method !== 'GET') return json(res, { error: 'GET required for scheduled monitoring.' }, 405);
    if (!cronAuthorized(req)) return json(res, { error: 'Unauthorized scheduled monitor.' }, 401);

    const wallets = await loadWallets();
    const results: unknown[] = [];
    for (const currentWallet of wallets) {
      try {
        results.push(await syncWallet(currentWallet, 'friday'));
      } catch (error) {
        results.push({ wallet: currentWallet, error: error instanceof Error ? error.message : 'Wallet monitoring failed.' });
      }
    }

    await dispatchAlerts();
    return json(res, { ok: true, wallets: wallets.length, results });
  } catch (error) {
    console.error('wgg-monitor', error);
    return json(res, { error: error instanceof Error ? error.message : 'WGG monitoring failed.' }, 502);
  }
}
