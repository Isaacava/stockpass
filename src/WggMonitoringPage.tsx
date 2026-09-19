import { AlertTriangle, Bell, CheckCircle2, Clock3, ExternalLink, RefreshCw, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { readWalletSessionToken } from './lib/walletSession';
import { TELEGRAM_BOT_USERNAME } from './config';

type Props = { address: string };
type Result = { ok?: boolean; scanned?: number; flagged?: number; alertsCreated?: number; runId?: string; error?: string };
type MonitorState = {
  lastCheckedAt: string | null;
  lastRun: {
    id: string;
    run_kind: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    positions_scanned: number;
    positions_flagged: number;
    error_message: string | null;
  } | null;
  runs: Array<{
    id: string;
    run_kind: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    positions_scanned: number;
    positions_flagged: number;
    error_message: string | null;
  }>;
  positions: Array<{
    id: string;
    symbol: string;
    obligation_address: string;
    risk_status: string;
    collateral_value_usd: number | null;
    debt_usd: number | null;
    current_buffer_pct: number | null;
    typical_weekend_gap_pct: number | null;
    last_checked_at: string | null;
  }>;
  alerts: Array<{
    id: string;
    severity: 'watch' | 'flagged';
    title: string;
    message: string;
    symbol: string;
    createdAt: string;
    acknowledgedAt: string | null;
    telegramSentAt: string | null;
  }>;
  telegramLinked: boolean;
};

function formatTime(value: string | null) {
  if (!value) return 'Not checked';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unavailable'
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatAgo(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

export default function WggMonitoringPage({ address }: Props) {
  const [running, setRunning] = useState(false);
  const [loadingState, setLoadingState] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [state, setState] = useState<MonitorState | null>(null);
  const [error, setError] = useState('');
  const [telegramPending, setTelegramPending] = useState(false);

  async function request(mode: 'state' | 'sync') {
    const token = readWalletSessionToken();
    if (!token) throw new Error('Wallet session is missing. Re-authenticate before using monitoring.');
    const response = await fetch('/api/wgg-monitor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-client-info': 'stockpass stockpass-session=' + token },
      body: JSON.stringify({ mode, wallet: address }),
    });
    const text = await response.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) throw new Error(body?.error ?? (text ? text.slice(0, 240) : 'Monitoring request failed.'));
    return body;
  }

  async function loadState() {
    if (!address) return;
    setLoadingState(true);
    try {
      const body = await request('state');
      setState(body?.state ?? null);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Monitoring state could not be loaded.');
    } finally {
      setLoadingState(false);
    }
  }

  async function runCheck() {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const body = await request('sync');
      setResult(body ?? { ok: true });
      const stateBody = await request('state');
      setState(stateBody?.state ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Monitoring sync failed.');
    } finally {
      setRunning(false);
    }
  }

  async function connectTelegram() {
    if (!TELEGRAM_BOT_USERNAME || state?.telegramLinked || telegramPending) return;
    setTelegramPending(true);
    setError('');
    try {
      const token = readWalletSessionToken();
      if (!token) throw new Error('Wallet session is missing. Re-authenticate before connecting Telegram.');
      const response = await fetch('/api/wgg-telegram-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-info': 'stockpass stockpass-session=' + token },
        body: JSON.stringify({ wallet: address }),
      });
      const text = await response.text();
      let body: any = null;
      try { body = text ? JSON.parse(text) : null; } catch {}
      if (!response.ok || !body?.token) throw new Error(body?.error ?? 'Telegram link challenge could not be created.');
      const username = TELEGRAM_BOT_USERNAME.replace(/^@/, '');
      window.open('https://t.me/' + encodeURIComponent(username) + '?start=' + encodeURIComponent(body.token), '_blank', 'noopener,noreferrer');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Telegram link could not be started.');
    } finally {
      setTelegramPending(false);
    }
  }

  useEffect(() => { void loadState(); }, [address]);

  const alerts = state?.alerts ?? [];
  const scanned = result?.scanned ?? state?.lastRun?.positions_scanned ?? state?.positions.length ?? 0;
  const flagged = result?.flagged ?? state?.lastRun?.positions_flagged ?? state?.positions.filter((position) => position.risk_status === 'flagged').length ?? 0;
  const linked = Boolean(state?.telegramLinked);

  return (
    <section className="sp-screen">
      <div className="sp-page-head">
        <div>
          <div className="sp-eyebrow">Monitoring / trusted checks</div>
          <h1 className="sp-page-title">Monitoring</h1>
          <p className="sp-page-copy">Persisted WGG state from authenticated checks. Alerts come from the real monitoring tables.</p>
        </div>
        <button onClick={() => void loadState()} disabled={loadingState} className="sp-icon-button" aria-label="Refresh monitoring state">
          <RefreshCw size={15} className={loadingState ? 'animate-spin' : ''} />
        </button>
      </div>

      <section className="sp-monitor-head">
        <div>
          <div className="sp-label">Last checked</div>
          <div className="num mt-1 text-[14px] font-bold text-ink">{formatTime(state?.lastCheckedAt ?? null)}</div>
          <div className="sp-caption mt-1">{formatAgo(state?.lastCheckedAt ?? null)}</div>
        </div>
        <button onClick={() => void runCheck()} disabled={running} className="sp-button-dark">
          <RefreshCw size={14} className={running ? 'animate-spin' : ''} /> {running ? 'Running' : 'Run check'}
        </button>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <MetricCard label="Monitored" value={String(state?.positions.length ?? 0)} sub={state ? scanned + ' scanned on latest run' : 'Loading persisted state'} />
        <MetricCard label="Flagged" value={String(flagged)} sub={flagged ? 'Review Guard and Actions' : 'No flagged rows in latest state'} tone={flagged ? 'flag' : 'safe'} />
      </div>

      {error && (
        <div className="sp-alert-card sp-alert-danger mt-3">
          <AlertTriangle size={16} className="shrink-0" />
          <div><div className="sp-alert-title">Monitoring unavailable</div><div className="sp-alert-copy">{error}</div></div>
        </div>
      )}

      {result && !error && (
        <div className={'sp-alert-card mt-3 ' + (flagged ? 'sp-next-watch' : 'sp-alert-safe')}>
          {flagged ? <ShieldAlert size={16} /> : <CheckCircle2 size={16} />}
          <div><div className="sp-alert-title">{flagged ? 'Protection review needed' : 'Protection check clean'}</div><div className="sp-alert-copy num">{result.runId ? 'Run ' + result.runId.slice(0, 8) + '… · ' : ''}{scanned} scanned · {result.alertsCreated ?? 0} new alerts</div></div>
        </div>
      )}

      <section className="sp-action-card mt-3">
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div><div className="text-[13px] font-bold text-ink">Telegram alerts</div><div className="sp-caption mt-1">{linked ? 'Connected for this wallet.' : 'Connect through a one-time wallet-authenticated challenge.'}</div></div>
            <Send size={17} className={linked ? 'text-safe' : 'text-brand'} />
          </div>
        </div>

        <div className="p-4">
          {TELEGRAM_BOT_USERNAME ? (
            <button
              onClick={() => void connectTelegram()}
              disabled={linked || telegramPending}
              className={'sp-toggle-row ' + (linked ? 'sp-toggle-on' : '')}
            >
              <span className={'sp-toggle ' + (linked ? 'sp-toggle-active' : '')}><span /></span>
              <span className="flex-1 text-left">
                <span className="block text-[11.5px] font-semibold text-ink">{linked ? 'Telegram connected' : telegramPending ? 'Creating link…' : 'Connect Telegram alerts'}</span>
                <span className="mt-0.5 block text-[9.5px] text-mute">{linked ? 'The bot can receive WGG alerts for this wallet.' : 'Opens the configured StockPass Telegram bot.'}</span>
              </span>
              {!linked && <ExternalLink size={14} className="text-mute" />}
            </button>
          ) : (
            <div className="sp-empty-inline">Telegram handoff is unavailable because VITE_TELEGRAM_BOT_USERNAME is not configured.</div>
          )}
        </div>
      </section>

      <section className="mt-5">
        <div className="sp-eyebrow px-1">Recent alerts</div>
        <div className="mt-2 flex flex-col gap-2">
          {loadingState && !state ? (
            <div className="sp-empty-block"><RefreshCw size={18} className="animate-spin" /><div className="sp-empty-title">Loading persisted alerts…</div><div className="sp-empty-copy">Reading wgg_alerts for this wallet.</div></div>
          ) : alerts.length ? alerts.map((alert) => (
            <article key={alert.id} className="sp-alert-row">
              <span className={'size-2 rounded-full shrink-0 ' + (alert.severity === 'flagged' ? 'bg-flag' : 'bg-watch')} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-[12px] font-semibold text-ink">{alert.title}</div>
                  {alert.symbol && <span className="sp-status bg-soft text-mute">{alert.symbol}</span>}
                </div>
                <div className="mt-1 text-[10px] leading-5 text-mute">{alert.message}</div>
                <div className="mt-1 num text-[8.5px] text-faint">{formatTime(alert.createdAt)}{alert.telegramSentAt ? ' · Telegram sent' : ''}</div>
              </div>
            </article>
          )) : (
            <div className="sp-empty-block"><Bell size={18} /><div className="sp-empty-title">No persisted alerts</div><div className="sp-empty-copy">Alerts remain empty until the real monitoring worker generates a watch or flagged event.</div></div>
          )}
        </div>
      </section>

      <section className="sp-list-card mt-3">
        <div className="sp-list-head">
          <div><div className="text-[13px] font-bold text-ink">Monitored positions</div><div className="sp-caption">Read-only mirror of wgg_monitored_positions</div></div>
          <span className="sp-caption num">{state?.positions.length ?? 0}</span>
        </div>
        {state?.positions.length ? state.positions.map((position) => (
          <div key={position.id} className="sp-alert-row">
            <div className="sp-asset-mark">{position.symbol.replace(/x$/i, '').slice(0, 4)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><div className="text-[12px] font-semibold text-ink">{position.symbol}</div><span className="sp-status bg-soft text-mute">{position.risk_status}</span></div>
              <div className="sp-caption mt-1 num">{position.last_checked_at ? 'Checked ' + formatTime(position.last_checked_at) : 'Not checked'} · buffer {position.current_buffer_pct == null ? '—' : position.current_buffer_pct.toFixed(2) + ' pts'}</div>
            </div>
          </div>
        )) : <div className="sp-empty-copy p-4">No monitored positions are persisted for this wallet.</div>}
      </section>
    </section>
  );
}

function MetricCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'safe' | 'flag' }) {
  return <div className="sp-kpi-card"><div className="sp-label">{label}</div><div className={'num mt-1 text-[18px] font-bold ' + (tone === 'flag' ? 'text-flag' : tone === 'safe' ? 'text-safe' : 'text-ink')}>{value}</div><div className="sp-caption">{sub}</div></div>;
}
