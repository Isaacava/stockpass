import { buildWeekendGapSummary, type DailyOHLC, type WeekendGapSummary } from '../src/lib/wggGap.js';
import { discoverKaminoXStockPositions } from '../src/lib/kamino.js';

const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
import { evaluateEarningsRisk, type EarningsEvent } from '../src/lib/wggEarnings.js';
import {
  calculateCollateralUsdForTargetLtv,
  calculateRepayUsdForTargetLtv,
  evaluateWeekendRisk,
} from '../src/lib/wggRisk.js';

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

type DailyValue = DailyOHLC;

let supabase: any = null;

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

async function fetchHistorical(symbols: string[], weeks = 13): Promise<Record<string, WeekendGapSummary>> {
  if (!TWELVE_DATA_API_KEY || !symbols.length) return {};
  const normalizedSymbols = [...new Set(symbols)].sort();
  const start = dateKey(addDays(new Date(), -(weeks + 12) * 7));
  const end = dateKey(new Date());
  const cacheKey = 'td:' + normalizedSymbols.join(',') + ':' + start + ':' + end;

  if (!supabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  const { data: cachedRow } = await supabase
    .from('wgg_market_cache')
    .select('payload')
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  let parsed: Record<string, any> | null = (cachedRow?.payload as Record<string, any> | null) ?? null;

  if (!parsed) {
    const url = new URL('https://api.twelvedata.com/time_series');
    url.searchParams.set('symbol', normalizedSymbols.join(','));
    url.searchParams.set('interval', '1day');
    url.searchParams.set('start_date', start);
    url.searchParams.set('end_date', end);
    url.searchParams.set('format', 'JSON');

    const response = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `apikey ${TWELVE_DATA_API_KEY}` },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Twelve Data ${response.status}: ${text.slice(0, 240)}`);

    const raw = JSON.parse(text) as Record<string, any>;
    parsed = {};
    if ('values' in raw || 'status' in raw) {
      parsed[String(raw.meta?.symbol || normalizedSymbols[0]).toUpperCase()] = raw;
    } else {
      for (const [key, value] of Object.entries(raw)) {
        if (value && typeof value === 'object') parsed[key.toUpperCase()] = value;
      }
    }

    await supabase.from('wgg_market_cache').upsert({
      cache_key: cacheKey,
      provider: 'Twelve Data',
      payload: parsed,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const out: Record<string, WeekendGapSummary> = {};
  for (const symbol of normalizedSymbols) {
    const values: DailyOHLC[] = (parsed[symbol]?.values ?? [])
      .map((row: any) => ({
        date: String(row?.datetime ?? '').slice(0, 10),
        open: finiteNumber(row?.open),
        close: finiteNumber(row?.close),
      }))
      .filter((row: DailyOHLC) => /^\\d{4}-\\d{2}-\\d{2}$/.test(row.date) && row.open > 0 && row.close > 0);

    const summary = buildWeekendGapSummary(symbol, values, weeks);
    if (summary) out[symbol] = summary;
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

async function upsertPositionRisk(wallet: string, position: any, stock: any, price: XStockPrice | undefined, gap: WeekendGapSummary | undefined, earningsEvent: EarningsEvent | null, runId: string) {
  if (!supabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');

  const previous = await supabase
    .from('wgg_monitored_positions')
    .select('*')
    .eq('wallet', wallet)
    .eq('obligation_address', position.obligation)
    .eq('collateral_mint', stock.mint)
    .maybeSingle();

  const earningsRisk = evaluateEarningsRisk(underlying(stock.symbol), earningsEvent);
  const risk = gap?.typicalWeekendGapPct != null && position.ltvPct != null && position.liquidationLtvPct != null
    ? evaluateWeekendRisk({
        currentLtvPct: position.ltvPct,
        liquidationLtvPct: position.liquidationLtvPct,
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
      const remainingCollateralFactor = Math.max(0.01, 1 - risk.adjustedGapPct / 100);
      targetLtvPct = Math.max(1, position.liquidationLtvPct * remainingCollateralFactor * 0.98);
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

async function syncWallet(wallet: string, runKind: 'manual' | 'scheduled' | 'position_scan') {
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
    const positions = await discoverKaminoXStockPositions(wallet, SOLANA_RPC_URL);
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

async function loadMonitoringState(wallet: string) {
  if (!supabase) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');

  const [runsResult, positionsResult, alertsResult, telegramResult] = await Promise.all([
    supabase
      .from('wgg_check_runs')
      .select('id,run_kind,started_at,finished_at,status,positions_scanned,positions_flagged,error_message,metadata')
      .contains('metadata', { wallet })
      .order('started_at', { ascending: false })
      .limit(10),
    supabase
      .from('wgg_monitored_positions')
      .select('id,symbol,obligation_address,collateral_mint,risk_status,collateral_value_usd,debt_usd,current_buffer_pct,typical_weekend_gap_pct,last_checked_at,updated_at')
      .eq('wallet', wallet)
      .order('updated_at', { ascending: false })
      .limit(25),
    supabase
      .from('wgg_alerts')
      .select('id,severity,title,message,details,created_at,acknowledged_at,telegram_sent_at')
      .eq('wallet', wallet)
      .order('created_at', { ascending: false })
      .limit(25),
    supabase
      .from('wgg_telegram_links')
      .select('wallet,linked_at,updated_at')
      .eq('wallet', wallet)
      .maybeSingle(),
  ]);

  if (runsResult.error) throw runsResult.error;
  if (positionsResult.error) throw positionsResult.error;
  if (alertsResult.error) throw alertsResult.error;
  if (telegramResult.error) throw telegramResult.error;

  const latestPositionCheck = (positionsResult.data ?? [])
    .map((row: { last_checked_at: string | null }) => row.last_checked_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
  const latestCompletedRun = (runsResult.data ?? []).find((run: { status: string }) => run.status === 'completed');

  return {
    wallet,
    lastCheckedAt: latestCompletedRun?.finished_at ?? latestPositionCheck,
    lastRun: runsResult.data?.[0] ?? null,
    runs: runsResult.data ?? [],
    positions: positionsResult.data ?? [],
    alerts: (alertsResult.data ?? []).map((alert: { id: string; severity: string; title: string; message: string; details: unknown; created_at: string; acknowledged_at: string | null; telegram_sent_at: string | null }) => ({
      id: alert.id,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      symbol: typeof alert.details === 'object' && alert.details
        ? String((alert.details as { symbol?: unknown }).symbol ?? '')
        : '',
      createdAt: alert.created_at,
      acknowledgedAt: alert.acknowledged_at,
      telegramSentAt: alert.telegram_sent_at,
    })),
    telegramLinked: Boolean(telegramResult.data),
  };
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

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req: any, res: any) {
  const method = String(req.method || 'GET');

  try {
    if (!supabase && SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
    const wallet = typeof body.wallet === 'string' ? body.wallet.trim() : '';
    const mode = body.mode === 'state' || body.mode === 'sync' ? body.mode : 'cron';

    if (mode === 'state') {
      if (method !== 'POST' || !wallet) return json(res, { error: 'POST with wallet is required for monitoring state.' }, 400);
      if (!await validateWalletSession(req, wallet)) return json(res, { error: 'A valid wallet session is required.' }, 401);
      return json(res, { ok: true, state: await loadMonitoringState(wallet) });
    }

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
        results.push(await syncWallet(currentWallet, 'scheduled'));
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
