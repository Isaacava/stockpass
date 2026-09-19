import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Layers3,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
} from 'lucide-react';
import type { KaminoXStockPosition } from './lib/kamino';
import type { XStockPriceMap, WeekendGapMap } from './lib/wggMarketData';
import { evaluateWeekendRisk } from './lib/wggRisk';

type Row = {
  position: KaminoXStockPosition;
  stock: KaminoXStockPosition['xStocks'][number];
  symbol: string;
  gap?: WeekendGapMap[string];
  risk: ReturnType<typeof evaluateWeekendRisk> | null;
  price?: XStockPriceMap[string];
};

type Prepared = {
  kind: 'deposit' | 'repay';
  symbol: string;
  amountBaseUnits: string;
  instructionCount: number;
  instructions: Array<{
    programAddress: string;
    data: string;
    accounts: Array<{ address: string; signer: boolean; writable: boolean }>;
  }>;
  lookupTables: string[];
} | null;

type Props = {
  address: string | null;
  positions: KaminoXStockPosition[];
  rows: Row[];
  counts: { flagged: number; watch: number; safe: number };
  loading: boolean;
  preparing: boolean;
  authenticating: boolean;
  signing: boolean;
  prepared: Prepared;
  signature: string;
  error: string;
  lastLoaded: Date | null;
  scan: () => Promise<void>;
  prepareFix: (row: Row, kind: 'deposit' | 'repay') => Promise<void>;
  signAndSendPrepared: () => Promise<void>;
};

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function pct(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(digits) + '%';
}

function shortAddress(value: string | null): string {
  return value ? value.slice(0, 5) + '…' + value.slice(-5) : '—';
}

export default function WggDashboard({
  address,
  positions,
  rows,
  counts,
  loading,
  preparing,
  authenticating,
  signing,
  prepared,
  signature,
  error,
  lastLoaded,
  scan,
  prepareFix,
  signAndSendPrepared,
}: Props) {
  const totalCollateral = positions.reduce((sum, p) => sum + (p.depositValueUsd ?? 0), 0);
  const totalBorrow = positions.reduce((sum, p) => sum + (p.borrowValueUsd ?? 0), 0);
  const maxLtv = positions.reduce<number | null>((max, p) => p.ltvPct == null ? max : Math.max(max ?? 0, p.ltvPct), null);
  const maxLiquidationLtv = positions.reduce<number | null>((max, p) => p.liquidationLtvPct == null ? max : Math.max(max ?? 0, p.liquidationLtvPct), null);
  const worstRisk = counts.flagged > 0 ? 'flagged' : counts.watch > 0 ? 'watch' : counts.safe > 0 ? 'safe' : 'empty';
  const worstRow = rows.find((row) => row.risk?.status === worstRisk) ?? rows.find((row) => row.risk);
  const monitoredAssets = Array.from(new Set(rows.map((row) => row.symbol))).length;
  const totalRows = rows.length;

  const protectionTitle = worstRisk === 'flagged'
    ? 'Action required'
    : worstRisk === 'watch'
      ? 'Keep the guard visible'
      : worstRisk === 'safe'
        ? 'No protection action needed'
        : 'Waiting for a live position';

  const protectionBody = worstRisk === 'flagged'
    ? `${counts.flagged} collateral row${counts.flagged === 1 ? '' : 's'} exceed the modeled weekend protection zone. Review the stressed LTV and choose a funding action below.`
    : worstRisk === 'watch'
      ? `${counts.watch} collateral row${counts.watch === 1 ? '' : 's'} sit close to the modeled liquidation boundary. No automatic transaction is sent.`
      : worstRisk === 'safe'
        ? 'The connected account is inside the modeled protection zone using the latest mainnet position and historical downside inputs.'
        : 'Scan the wallet to replace the empty state with real Kamino obligations. StockPass never inserts demo balances into the account view.';

  const statusIcon = worstRisk === 'flagged' ? <ShieldAlert size={17} /> : worstRisk === 'watch' ? <TrendingDown size={17} /> : worstRisk === 'safe' ? <ShieldCheck size={17} /> : <Activity size={17} />;
  const targetRow = worstRow;

  return (
    <section className="sp-dashboard">
      <div className="sp-dashboard-bar">
        <div>
          <div className="sp-overline"><span /> ACCOUNT / WEEKEND GAP GUARD</div>
          <h1>Risk workspace</h1>
          <p>Live Kamino state, xStock market context and a weekend repricing scenario—together in one place.</p>
        </div>
        <div className="sp-dashboard-bar-actions">
          <div className="sp-account-chip">
            <span className="sp-account-dot" />
            <span>{shortAddress(address)}</span>
            <small>MAINNET</small>
          </div>
          <button className="sp-icon-button" onClick={() => void scan()} disabled={loading} aria-label="Refresh mainnet account">
            <RefreshCw size={15} className={loading ? 'wgg-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="sp-kpi-grid">
        <article className="sp-kpi sp-kpi-primary">
          <div className="sp-kpi-label"><Layers3 size={14} /> Collateral</div>
          <strong>{positions.length ? money(totalCollateral) : '—'}</strong>
          <span>{positions.length ? `${monitoredAssets} xStock asset${monitoredAssets === 1 ? '' : 's'} across ${positions.length} obligation${positions.length === 1 ? '' : 's'}` : 'Awaiting live Kamino state'}</span>
        </article>
        <article className="sp-kpi">
          <div className="sp-kpi-label"><ArrowUpFromLine size={14} /> Borrowed</div>
          <strong>{positions.length ? money(totalBorrow) : '—'}</strong>
          <span>{positions.length ? 'Current obligation debt value' : 'No debt value loaded'}</span>
        </article>
        <article className="sp-kpi">
          <div className="sp-kpi-label"><Activity size={14} /> Max LTV</div>
          <strong>{positions.length ? pct(maxLtv) : '—'}</strong>
          <span>{maxLiquidationLtv != null ? `Liquidation boundary ${pct(maxLiquidationLtv)}` : 'Live liquidation boundary not loaded'}</span>
        </article>
        <article className={`sp-kpi sp-kpi-risk sp-risk-${worstRisk}`}>
          <div className="sp-kpi-label">{statusIcon} Protection</div>
          <strong>{worstRisk === 'empty' ? 'WAITING' : worstRisk.toUpperCase()}</strong>
          <span>{rows.length ? `${counts.flagged} flagged · ${counts.watch} watch · ${counts.safe} safe` : 'Run the mainnet scan to evaluate risk'}</span>
        </article>
      </div>

      {error && (
        <div className="sp-alert sp-alert-error">
          <AlertTriangle size={17} />
          <div><strong>Live data needs attention</strong><span>{error}</span></div>
        </div>
      )}

      {prepared && (
        <div className="sp-prepared-banner">
          <div>
            <div className="sp-overline"><span /> WALLET REVIEW REQUIRED</div>
            <strong>{prepared.symbol} {prepared.kind === 'deposit' ? 'collateral' : 'repay'} action is ready</strong>
            <span>{prepared.amountBaseUnits} base units · {prepared.instructionCount} instructions · prepared from fresh Kamino state.</span>
          </div>
          <button className="sp-primary" onClick={() => void signAndSendPrepared()} disabled={signing}>
            {signing ? 'Waiting for wallet…' : 'Review & sign'}
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      <div className="sp-command-grid">
        <article className={`sp-protection-card sp-protection-${worstRisk}`}>
          <div className="sp-card-head">
            <div>
              <div className="sp-overline"><span /> GUARD STATUS</div>
              <h2>{protectionTitle}</h2>
            </div>
            <div className="sp-status-stamp">{statusIcon}{worstRisk === 'empty' ? 'NO DATA' : worstRisk}</div>
          </div>

          <div className="sp-protection-copy">{protectionBody}</div>

          {targetRow?.risk ? (
            <div className="sp-stress-compare">
              <div className="sp-stress-row">
                <div><span>Current LTV</span><strong>{pct(targetRow.position.ltvPct)}</strong></div>
                <div><span>Stressed LTV</span><strong>{pct(targetRow.risk.stressedLtvPct)}</strong></div>
                <div><span>Liquidation</span><strong>{pct(targetRow.position.liquidationLtvPct)}</strong></div>
              </div>
              <div className="sp-stress-bar">
                <span style={{ width: `${Math.min(100, Math.max(4, (targetRow.risk.stressedLtvPct / Math.max(targetRow.position.liquidationLtvPct ?? 1, targetRow.risk.stressedLtvPct)) * 100))}%` }} />
                <i style={{ left: `${Math.min(100, Math.max(2, ((targetRow.position.liquidationLtvPct ?? 0) / Math.max(targetRow.risk.stressedLtvPct, targetRow.position.liquidationLtvPct ?? 1)) * 100))}%` }} />
              </div>
              <div className="sp-stress-legend">
                <span><b /> Current stress path</span>
                <span><i /> Liquidation boundary</span>
              </div>
              <div className="sp-protection-meta">
                <span>Distance to liquidation</span>
                <strong>{targetRow.risk.liquidationDistancePct != null ? `${targetRow.risk.liquidationDistancePct.toFixed(2)} pts` : '—'}</strong>
              </div>
            </div>
          ) : (
            <div className="sp-scan-empty">
              <Activity size={21} />
              <div><strong>{loading ? 'Reading the account…' : 'No position loaded'}</strong><span>{loading ? 'Scanning Kamino, xStocks and weekend history from mainnet.' : 'The dashboard is empty by design until a real Kamino obligation is found.'}</span></div>
              {!loading && <button className="sp-primary" onClick={() => void scan()}>Scan account <ArrowRight size={14} /></button>}
            </div>
          )}
        </article>

        <aside className="sp-next-card">
          <div className="sp-overline"><span /> NEXT ACTION</div>
          {worstRisk === 'flagged' && targetRow ? (
            <>
              <h3>Bring the position back inside the guard.</h3>
              <p>{targetRow.symbol} is outside the modeled protection zone.</p>
              <div className="sp-next-metrics">
                <div><span>Scenario gap</span><strong>{pct(targetRow.risk?.adjustedGapPct)}</strong></div>
                <div><span>Stressed LTV</span><strong>{pct(targetRow.risk?.stressedLtvPct)}</strong></div>
              </div>
              <div className="sp-next-actions">
                <button className="sp-primary" onClick={() => void prepareFix(targetRow, 'deposit')} disabled={preparing || authenticating}>
                  <ArrowDownToLine size={14} /> Add collateral
                </button>
                {targetRow.position.debts.length > 0 && (
                  <button className="sp-secondary" onClick={() => void prepareFix(targetRow, 'repay')} disabled={preparing || authenticating}>
                    Repay
                  </button>
                )}
              </div>
              <small>Each action is prepared server-side from fresh Kamino state. Your wallet signs the final transaction.</small>
            </>
          ) : worstRisk === 'watch' && targetRow ? (
            <>
              <h3>Monitor before moving funds.</h3>
              <p>{targetRow.symbol} is inside the model but close to the liquidation boundary.</p>
              <div className="sp-watch-callout"><Clock3 size={15} /><span>No automatic action is taken. Recheck the position before a weekend repricing window.</span></div>
            </>
          ) : worstRisk === 'safe' ? (
            <>
              <h3>Position is inside the current guard.</h3>
              <p>The live account does not currently require a protection transaction under the selected historical downside scenario.</p>
              <div className="sp-safe-callout"><CheckCircle2 size={15} /><span>Read-only monitoring stays available while your funds remain in Kamino.</span></div>
            </>
          ) : (
            <>
              <h3>Start with the account scan.</h3>
              <p>StockPass only displays balances, debt and risk once they are read from mainnet.</p>
              <button className="sp-primary sp-wide" onClick={() => void scan()} disabled={loading}>{loading ? 'Scanning…' : 'Read my Kamino state'} <ArrowRight size={14} /></button>
            </>
          )}
        </aside>
      </div>

      <div className="sp-footnote">
        <span><CheckCircle2 size={12} /> Source hierarchy: Kamino state → xStocks price/multiplier → historical gap model → WGG scenario.</span>
        <span><Clock3 size={12} /> Every fund-moving action still requires a fresh wallet signature.</span>
      </div>
    </section>
  );
}
