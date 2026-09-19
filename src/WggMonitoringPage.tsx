import { useState } from 'react';
import { Activity, AlertTriangle, Bell, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { readWalletSessionToken } from './lib/walletSession';

type Props = { address: string };
type Result = { ok?: boolean; scanned?: number; flagged?: number; alertsCreated?: number; runId?: string; error?: string };

export default function WggMonitoringPage({ address }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  async function runCheck() {
    setRunning(true); setError(''); setResult(null);
    try {
      const token = readWalletSessionToken();
      if (!token) throw new Error('Wallet session is missing. Re-authenticate before running monitoring.');
      const response = await fetch('/api/wgg-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-info': 'stockpass stockpass-session=' + token },
        body: JSON.stringify({ mode: 'sync', wallet: address }),
      });
      const body = await response.json().catch(() => null) as Result | null;
      if (!response.ok) throw new Error(body?.error ?? 'Monitoring sync failed.');
      setResult(body ?? { ok: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Monitoring sync failed.');
    } finally { setRunning(false); }
  }

  const hasRun = Boolean(result);
  const flagged = result?.flagged ?? 0;
  const scanned = result?.scanned ?? 0;

  return (
    <section className="sp-page">
      <div className="sp-page-head">
        <div>
          <div className="sp-overline"><span /> MONITORING / PROTECTION</div>
          <h1>Monitoring</h1>
          <p>Run a fresh protection check for this authenticated wallet. The monitor refreshes Kamino, xStocks, weekend history and optional earnings context before writing monitoring state.</p>
        </div>
        <button className="sp-primary" onClick={() => void runCheck()} disabled={running}>
          <RefreshCw size={14} className={running ? 'wgg-spin' : ''} />
          {running ? 'Checking…' : 'Run protection check'}
        </button>
      </div>

      <div className="sp-monitor-grid">
        <article className="sp-monitor-card"><div className="sp-overline"><span /> MONITOR</div><strong>{hasRun ? 'Fresh check completed' : 'Ready for a check'}</strong><span>{hasRun ? scanned + ' position row' + (scanned === 1 ? '' : 's') + ' scanned from mainnet.' : 'Nothing is assumed until the wallet is checked.'}</span></article>
        <article className="sp-monitor-card sp-monitor-risk"><div className="sp-overline"><span /> ALERT SIGNAL</div><strong>{hasRun ? (flagged ? flagged + ' flagged' : 'No flagged rows') : '—'}</strong><span>{hasRun ? (flagged ? 'Review the Positions page and protection action.' : 'No flagged scenario was produced by this check.') : 'Run the monitor to calculate live state.'}</span></article>
        <article className="sp-monitor-card"><div className="sp-overline"><span /> ALERTS</div><strong>{hasRun ? String(result?.alertsCreated ?? 0) : '—'}</strong><span>New deduplicated alerts created by the monitor run.</span></article>
      </div>

      {error && <div className="sp-alert sp-alert-error"><AlertTriangle size={17} /><div><strong>Monitoring unavailable</strong><span>{error}</span></div></div>}
      {hasRun && !error && <div className="sp-alert sp-alert-success">{flagged ? <ShieldAlert size={17} /> : <CheckCircle2 size={17} />}<div><strong>{flagged ? 'Protection review needed' : 'Protection check clean'}</strong><span>Run {result?.runId ?? 'completed'} · {scanned} scanned · {result?.alertsCreated ?? 0} new alerts.</span></div></div>}

      <div className="sp-monitor-detail">
        <div className="sp-monitor-detail-title"><div className="sp-overline"><span /> PIPELINE</div><h2>What StockPass refreshes</h2></div>
        <div className="sp-monitor-steps">
          <div><Activity size={16} /><strong>Kamino</strong><span>Current collateral, debt and liquidation state.</span></div>
          <div><ShieldCheck size={16} /><strong>xStocks</strong><span>Current price and multiplier context.</span></div>
          <div><ShieldAlert size={16} /><strong>Weekend gap</strong><span>Historical downside repricing scenario.</span></div>
          <div><Bell size={16} /><strong>Alerts</strong><span>Persisted watch/flagged events with deduplication.</span></div>
        </div>
      </div>
    </section>
  );
}