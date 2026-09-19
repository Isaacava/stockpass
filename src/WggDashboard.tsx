import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpFromLine, Bell,
  CheckCircle2, Clock3, Layers3, RefreshCw, ShieldAlert, ShieldCheck, X,
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

const statusMeta = {
  safe: { label: 'Safe', dot: 'bg-safe', text: 'text-safe', soft: 'bg-safe-soft', icon: ShieldCheck },
  watch: { label: 'Watch', dot: 'bg-watch', text: 'text-watch', soft: 'bg-watch-soft', icon: Clock3 },
  flagged: { label: 'Flagged', dot: 'bg-flag', text: 'text-flag', soft: 'bg-flag-soft', icon: ShieldAlert },
} as const;

function money(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
function pct(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(2) + '%';
}
function shortAddress(value: string | null) {
  return value ? value.slice(0, 5) + '…' + value.slice(-5) : '—';
}

export default function WggDashboard({
  address, positions, rows, counts, loading, preparing, authenticating, signing, prepared,
  signature, error, lastLoaded, scan, prepareFix, signAndSendPrepared,
}: Props) {
  const [filter, setFilter] = useState<'all' | 'safe' | 'watch' | 'flagged'>('all');
  const [selected, setSelected] = useState<Row | null>(null);

  const filteredRows = useMemo(
    () => rows.filter((row) => filter === 'all' || row.risk?.status === filter),
    [filter, rows],
  );

  const totalCollateral = positions.reduce((sum, item) => sum + (item.depositValueUsd ?? 0), 0);
  const totalBorrow = positions.reduce((sum, item) => sum + (item.borrowValueUsd ?? 0), 0);

  const target = useMemo(() => {
    const ranked = [...rows]
      .filter((row) => row.risk)
      .sort((a, b) => {
        const rank = { flagged: 0, watch: 1, safe: 2 };
        const ar = rank[a.risk!.status];
        const br = rank[b.risk!.status];
        if (ar !== br) return ar - br;
        return (a.risk?.liquidationDistancePct ?? Number.POSITIVE_INFINITY)
          - (b.risk?.liquidationDistancePct ?? Number.POSITIVE_INFINITY);
      });
    return ranked[0] ?? null;
  }, [rows]);

  const state: 'empty' | 'safe' | 'watch' | 'flagged' =
    counts.flagged ? 'flagged' : counts.watch ? 'watch' : counts.safe ? 'safe' : 'empty';
  const hero = state === 'empty'
    ? { title: loading ? 'Reading current Kamino state…' : 'Waiting for position', sub: loading ? 'Scanning real obligations and market context.' : 'No real Kamino xStock obligation has been loaded.' }
    : state === 'flagged'
      ? { title: target ? target.symbol + ' needs attention' : 'Action needed', sub: 'At least one live collateral row is outside the current weekend protection model.' }
      : state === 'watch'
        ? { title: target ? target.symbol + ' is near the boundary' : 'Monitor closely', sub: 'The loaded weekend scenario leaves limited distance to liquidation.' }
        : { title: 'Position is inside the guard', sub: 'No protection transaction is required under the current loaded scenario.' };

  const targetMeta = state !== 'empty' ? statusMeta[state] : null;
  const fillPct = target?.risk && target.position.liquidationLtvPct
    ? Math.min(100, Math.max(4, (target.risk.stressedLtvPct / Math.max(target.position.liquidationLtvPct, target.risk.stressedLtvPct)) * 100))
    : 0;
  const markerPct = target?.risk && target.position.liquidationLtvPct
    ? Math.min(96, Math.max(4, (target.position.liquidationLtvPct / Math.max(target.position.liquidationLtvPct, target.risk.stressedLtvPct)) * 100))
    : 96;

  const statusIcon = targetMeta ? targetMeta.icon : ShieldCheck;

  return (
    <section className="sp-screen">
      <div className="sp-page-head">
        <div>
          <div className="sp-eyebrow">Protection status</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="sp-wallet-pill"><span className="size-1.5 rounded-full bg-safe" /> Solana mainnet</span>
            <span className="sp-wallet-pill num">{shortAddress(address)}</span>
          </div>
        </div>
        <button
          onClick={() => void scan()}
          disabled={loading}
          className="sp-icon-button"
          aria-label="Refresh mainnet state"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="sp-alert-card sp-alert-danger">
          <AlertTriangle size={16} className="shrink-0" />
          <div>
            <div className="sp-alert-title">Live data unavailable</div>
            <div className="sp-alert-copy">{error}</div>
          </div>
        </div>
      )}

      <section className="sp-hero-card">
        <div className="flex items-center justify-between gap-3">
          <span className="sp-eyebrow">Guard state</span>
          {targetMeta ? (
            <span className={'sp-status ' + targetMeta.soft + ' ' + targetMeta.text}>
              <span className={'size-1.5 rounded-full ' + targetMeta.dot} /> {state === 'flagged' ? 'Action needed' : state === 'watch' ? 'Monitor closely' : 'Guard clear'}
            </span>
          ) : (
            <span className="sp-status bg-soft text-mute">No risk result</span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className={'sp-status-icon ' + (targetMeta ? targetMeta.soft : 'bg-soft') + ' ' + (targetMeta ? targetMeta.text : 'text-mute')}>
            {loading && state === 'empty' ? <RefreshCw size={20} className="animate-spin" /> : (() => { const Icon = statusIcon; return <Icon size={20} />; })()}
          </div>
          <div className="min-w-0">
            <h1 className="sp-hero-title">{hero.title}</h1>
            <p className="sp-hero-copy">{hero.sub}</p>
          </div>
        </div>

        {target?.risk ? (
          <>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Metric label="Current LTV" value={pct(target.position.ltvPct)} />
              <Metric label="Stressed" value={pct(target.risk.stressedLtvPct)} />
              <Metric label="Liquidation" value={pct(target.position.liquidationLtvPct)} />
            </div>
            <div className="mt-4">
              <div className="sp-gauge"><span className={'sp-gauge-fill ' + (state === 'flagged' ? 'bg-flag' : state === 'watch' ? 'bg-watch' : 'bg-safe')} style={{ width: fillPct + '%' }} /><i style={{ left: markerPct + '%' }} /></div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[9px] text-faint">
                <span>Weekend scenario {pct(target.risk.adjustedGapPct)}</span>
                <span>{target.risk.liquidationDistancePct.toFixed(2)} pts to liquidation</span>
              </div>
            </div>
          </>
        ) : (
          <div className="sp-empty-inline mt-4">{loading ? 'Reading fresh Kamino state…' : 'StockPass does not invent LTV, debt, or risk numbers.'}</div>
        )}
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <MetricCard label="Collateral value" value={positions.length ? money(totalCollateral) : '—'} sub={positions.length ? 'Across loaded obligations' : 'Awaiting Kamino state'} />
        <MetricCard label="Borrowed" value={positions.length ? money(totalBorrow) : '—'} sub={positions.length ? counts.flagged + counts.watch + counts.safe + ' risk-scored rows' : 'No debt loaded'} />
      </div>

      <div className="sp-chip-row mt-5">
        {(['all', 'safe', 'watch', 'flagged'] as const).map((item) => (
          <button key={item} onClick={() => setFilter(item)} className={'sp-chip ' + (filter === item ? 'sp-chip-active' : '')}>
            {item === 'all' ? 'All positions' : <><span className={'size-1.5 rounded-full ' + statusMeta[item].dot} /> {statusMeta[item].label}</>}
          </button>
        ))}
      </div>

      <section className="sp-list-card mt-3">
        <div className="sp-list-head">
          <div>
            <div className="text-[13px] font-bold text-ink">Kamino xStock collateral</div>
            <div className="sp-caption">{lastLoaded ? 'Synced ' + lastLoaded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not scanned'}</div>
          </div>
          <span className="sp-caption num">{rows.length} row{rows.length === 1 ? '' : 's'}</span>
        </div>
        {filteredRows.length ? (
          <div>
            {filteredRows.map((row) => <PositionRow key={row.stock.mint + row.position.obligation} row={row} onSelect={setSelected} />)}
          </div>
        ) : (
          <div className="sp-empty-block">
            <Layers3 size={20} />
            <div className="sp-empty-title">{loading ? 'Loading real positions…' : 'No positions match this filter'}</div>
            <div className="sp-empty-copy">{loading ? 'Reading the connected wallet from Kamino mainnet.' : 'The filter is empty. No synthetic rows are added.'}</div>
          </div>
        )}
      </section>

      <NextAction
        state={state}
        target={target}
        preparing={preparing}
        authenticating={authenticating}
        prepareFix={prepareFix}
      />

      {prepared && (
        <section className="sp-review-card mt-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand" />
            <div className="min-w-0">
              <div className="sp-eyebrow">Wallet review required</div>
              <div className="mt-1 text-[13px] font-bold text-ink">{prepared.symbol} · {prepared.kind === 'deposit' ? 'Add collateral' : 'Repay'} ready</div>
              <div className="sp-caption mt-1">{prepared.instructionCount} instructions prepared from fresh Kamino state.</div>
            </div>
          </div>
          <button onClick={() => void signAndSendPrepared()} disabled={signing} className="sp-button-dark mt-3 w-full">
            {signing ? <><RefreshCw size={14} className="animate-spin" /> Waiting for wallet…</> : <>Review &amp; sign <ArrowRight size={14} /></>}
          </button>
        </section>
      )}

      {signature && (
        <section className="sp-success-card mt-3">
          <CheckCircle2 size={17} />
          <div className="min-w-0">
            <div className="text-[12px] font-bold">Confirmed transaction submitted</div>
            <div className="num mt-1 break-all text-[9px]">{signature}</div>
          </div>
        </section>
      )}

      <div className="sp-provenance mt-3">
        <div><span>Position</span><strong>Kamino</strong></div>
        <div><span>Price</span><strong>xStocks</strong></div>
        <div><span>Scenario</span><strong>Twelve Data</strong></div>
      </div>

      {selected && (
        <div className="sp-sheet-layer" role="dialog" aria-modal="true">
          <button className="sp-sheet-backdrop" aria-label="Close position details" onClick={() => setSelected(null)} />
          <section className="sp-sheet">
            <div className="sp-sheet-handle" />
            <button onClick={() => setSelected(null)} className="sp-sheet-close" aria-label="Close"><X size={17} /></button>
            <div className="flex items-center gap-3">
              <div className="sp-asset-mark">{selected.symbol.slice(0, 4)}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-ink">{selected.symbol}x</div>
                <div className="num text-[10px] text-mute">{selected.stock.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} units</div>
              </div>
              <StatusBadge status={selected.risk?.status} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Metric label="Collateral" value={money(selected.position.depositValueUsd)} />
              <Metric label="Debt" value={money(selected.position.borrowValueUsd)} />
              <Metric label="Current LTV" value={pct(selected.position.ltvPct)} />
              <Metric label="Liquidation" value={pct(selected.position.liquidationLtvPct)} />
              <Metric label="Weekend gap" value={pct(selected.risk?.adjustedGapPct ?? selected.gap?.typicalWeekendGapPct)} />
              <Metric label="xStocks price" value={selected.price ? money(selected.price.price) : '—'} />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                className="sp-button-brand"
                disabled={preparing || authenticating || selected.risk?.status !== 'flagged'}
                onClick={() => { setSelected(null); void prepareFix(selected, 'deposit'); }}
              >
                <ArrowDownToLine size={14} /> Add collateral
              </button>
              {selected.position.debts.length > 0 && (
                <button
                  className="sp-button-outline"
                  disabled={preparing || authenticating || selected.risk?.status !== 'flagged'}
                  onClick={() => { setSelected(null); void prepareFix(selected, 'repay'); }}
                >
                  <ArrowUpFromLine size={14} /> Repay debt
                </button>
              )}
            </div>
            {selected.risk?.status !== 'flagged' && (
              <div className="sp-caption mt-3">No fund-moving protection action is offered from this row unless the real WGG risk state is flagged.</div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-soft px-3 py-2.5"><div className="sp-label">{label}</div><div className="num mt-1 text-[13px] font-semibold text-ink">{value}</div></div>;
}
function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="sp-kpi-card"><div className="sp-label">{label}</div><div className="num mt-1 text-[18px] font-bold text-ink">{value}</div><div className="mt-1 text-[10px] font-medium text-mute">{sub}</div></div>;
}
function StatusBadge({ status }: { status?: 'safe' | 'watch' | 'flagged' | null }) {
  if (!status) return <span className="sp-status bg-soft text-faint">Pending</span>;
  const meta = statusMeta[status];
  return <span className={'sp-status ' + meta.soft + ' ' + meta.text}><span className={'size-1.5 rounded-full ' + meta.dot} />{meta.label}</span>;
}
function PositionRow({ row, onSelect }: { row: Row; onSelect: (row: Row) => void }) {
  return (
    <button onClick={() => onSelect(row)} className="sp-row">
      <div className="sp-asset-mark">{row.symbol.slice(0, 4)}</div>
      <div className="min-w-0 flex-1 text-left">
        <div className="text-[13px] font-semibold text-ink">{row.symbol}x</div>
        <div className="num text-[10px] text-mute">{row.stock.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} units</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-[12px] font-semibold text-ink">{money(row.position.depositValueUsd)}</div>
        <div className="num text-[9px] text-mute">{pct(row.position.ltvPct)} LTV</div>
      </div>
      <StatusBadge status={row.risk?.status} />
    </button>
  );
}
function NextAction({
  state, target, preparing, authenticating, prepareFix,
}: {
  state: 'empty' | 'safe' | 'watch' | 'flagged';
  target: Row | null;
  preparing: boolean;
  authenticating: boolean;
  prepareFix: (row: Row, kind: 'deposit' | 'repay') => Promise<void>;
}) {
  if (state === 'flagged' && target) return (
    <section className="sp-next-card sp-next-danger mt-3">
      <div className="sp-eyebrow text-flag">Action required</div>
      <div className="mt-1.5 text-[13.5px] font-bold text-ink">{target.symbol} is outside the weekend guard.</div>
      <div className="sp-caption mt-1">Bring the position back inside by adding collateral or repaying part of the debt. Your wallet signs the final transaction.</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="sp-button-brand" disabled={preparing || authenticating} onClick={() => void prepareFix(target, 'deposit')}><ArrowDownToLine size={14} /> Add collateral</button>
        {target.position.debts.length > 0 && <button className="sp-button-outline" disabled={preparing || authenticating} onClick={() => void prepareFix(target, 'repay')}>Repay debt</button>}
      </div>
    </section>
  );
  if (state === 'watch' && target) return (
    <section className="sp-next-card sp-next-watch mt-3">
      <div className="sp-eyebrow text-watch">Monitor closely</div>
      <div className="mt-1.5 text-[13.5px] font-bold text-ink">{target.symbol} is near the boundary.</div>
      <div className="sp-caption mt-1">No automatic action is taken. Review the Guard page or top up collateral manually when the live state warrants it.</div>
    </section>
  );
  if (state === 'safe') return (
    <section className="sp-next-card sp-next-safe mt-3">
      <div className="sp-eyebrow text-safe">Guard clear</div>
      <div className="mt-1.5 text-[13.5px] font-bold text-ink">Nothing needs your attention right now.</div>
      <div className="sp-caption mt-1">Read-only monitoring stays active across the loaded positions.</div>
    </section>
  );
  return (
    <section className="sp-next-card mt-3">
      <div className="sp-eyebrow">Next step</div>
      <div className="mt-1.5 text-[13.5px] font-bold text-ink">Scan the connected wallet.</div>
      <div className="sp-caption mt-1">Only real Kamino state can populate the protection model.</div>
    </section>
  );
}
