import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CheckCircle2,
  Clock3,
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
function statusTone(status: string) {
  return status === 'flagged'
    ? 'border-rose-400/25 bg-rose-400/[.06] text-rose-300'
    : status === 'watch'
      ? 'border-amber-300/20 bg-amber-300/[.05] text-amber-200'
      : 'border-emerald-300/20 bg-emerald-300/[.05] text-emerald-300';
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
  const totalCollateral = positions.reduce((sum, item) => sum + (item.depositValueUsd ?? 0), 0);
  const totalBorrow = positions.reduce((sum, item) => sum + (item.borrowValueUsd ?? 0), 0);
  const maxLtv = positions.reduce<number | null>((max, item) => item.ltvPct == null ? max : Math.max(max ?? 0, item.ltvPct), null);
  const liquidation = positions.reduce<number | null>((max, item) => item.liquidationLtvPct == null ? max : Math.max(max ?? 0, item.liquidationLtvPct), null);
  const worstRisk = counts.flagged ? 'flagged' : counts.watch ? 'watch' : counts.safe ? 'safe' : 'empty';
  const target = rows.find((row) => row.risk?.status === worstRisk) ?? rows.find((row) => row.risk);
  const statusCopy = {
    flagged: ['Action required', 'At least one collateral row is outside the current weekend protection model.'],
    watch: ['Near boundary', 'At least one collateral row is close to the modeled liquidation boundary.'],
    safe: ['Guard clear', 'The connected account is inside the current modeled protection zone.'],
    empty: ['Waiting for position', 'No real Kamino xStock obligation has been loaded yet.'],
  }[worstRisk];

  return (
    <section className="py-7 md:py-9">
      <div className="flex flex-col gap-4 border-b border-sp-border pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[.18em] text-slate-600">Account / command center</div>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100 md:text-3xl">Portfolio overview</h1>
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[.05] px-2 py-1 font-mono text-[8px] uppercase tracking-[.12em] text-emerald-300 sm:flex"><span className="size-1.5 rounded-full bg-emerald-400" /> Live mainnet</span>
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500">Real Kamino collateral and debt, paired with xStocks market context and the Weekend Gap Guard stress model.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="border border-sp-border bg-sp-panel px-3 py-2">
            <div className="font-mono text-[8px] uppercase tracking-[.12em] text-slate-600">Wallet</div>
            <div className="sp-num mt-1 text-[10px] text-slate-300">{shortAddress(address)}</div>
          </div>
          <button onClick={() => void scan()} disabled={loading} className="inline-flex h-10 items-center gap-2 border border-sp-border bg-white px-3 text-[11px] font-semibold text-slate-950 hover:bg-slate-100">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Syncing' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-3 border border-rose-400/20 bg-rose-400/[.05] px-4 py-3 text-rose-200">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-rose-300" />
          <div><div className="text-[12px] font-semibold">Mainnet data needs attention</div><div className="mt-1 text-[11px] leading-5 text-rose-200/70">{error}</div></div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden border border-sp-border bg-sp-border lg:grid-cols-4">
        {[
          ['COLLATERAL', positions.length ? money(totalCollateral) : '—', positions.length ? positions.length + ' obligation' + (positions.length === 1 ? '' : 's') : 'Awaiting Kamino state', <Layers3 size={14} />],
          ['BORROWED', positions.length ? money(totalBorrow) : '—', positions.length ? 'Current debt value' : 'No debt loaded', <ArrowUpFromLine size={14} />],
          ['MAX LTV', positions.length ? pct(maxLtv) : '—', liquidation != null ? 'Liquidation ' + pct(liquidation) : 'Boundary unavailable', <Activity size={14} />],
          ['PROTECTION', worstRisk === 'empty' ? 'WAITING' : worstRisk.toUpperCase(), rows.length ? counts.flagged + ' flagged · ' + counts.watch + ' watch · ' + counts.safe + ' safe' : 'Run the mainnet scan', worstRisk === 'flagged' ? <ShieldAlert size={14} /> : worstRisk === 'watch' ? <TrendingDown size={14} /> : <ShieldCheck size={14} />],
        ].map(([label, value, sub, icon]) => (
          <article key={String(label)} className="bg-sp-panel p-4 md:p-5">
            <div className="flex items-center justify-between text-slate-600"><span className="font-mono text-[8px] uppercase tracking-[.16em]">{label}</span>{icon}</div>
            <div className="sp-num mt-7 text-xl font-semibold tracking-tight text-slate-100 md:text-2xl">{value}</div>
            <div className="mt-1 text-[10px] leading-5 text-slate-600">{sub}</div>
          </article>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_360px]">
        <section className="sp-panel p-5 md:p-6">
          <div className="flex flex-col gap-3 border-b border-sp-border pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[.16em] text-slate-600"><span className="size-1.5 rounded-full bg-sp-blue" /> Weekend Gap Guard</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{statusCopy[0]}</h2>
              <p className="mt-2 max-w-2xl text-[11px] leading-5 text-slate-500">{statusCopy[1]}</p>
            </div>
            <span className={'w-fit rounded-full border px-2.5 py-1 font-mono text-[8px] uppercase tracking-[.12em] ' + (worstRisk === 'empty' ? 'border-sp-border bg-sp-panel-2 text-slate-500' : statusTone(worstRisk))}>{worstRisk}</span>
          </div>

          {target?.risk ? (
            <div className="pt-5">
              <div className="grid grid-cols-3 gap-px overflow-hidden border border-sp-border bg-sp-border">
                <div className="bg-sp-panel-2 p-4"><div className="font-mono text-[8px] uppercase text-slate-600">Current LTV</div><div className="sp-num mt-2 text-lg text-white">{pct(target.position.ltvPct)}</div></div>
                <div className="bg-sp-panel-2 p-4"><div className="font-mono text-[8px] uppercase text-slate-600">Stressed LTV</div><div className="sp-num mt-2 text-lg text-white">{pct(target.risk.stressedLtvPct)}</div></div>
                <div className="bg-sp-panel-2 p-4"><div className="font-mono text-[8px] uppercase text-slate-600">Liquidation</div><div className="sp-num mt-2 text-lg text-white">{pct(target.position.liquidationLtvPct)}</div></div>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between font-mono text-[8px] uppercase text-slate-600"><span>Stress path</span><span>Liquidation boundary</span></div>
                <div className="relative h-2 overflow-hidden bg-[#182332]">
                  <span className={'absolute inset-y-0 left-0 ' + (target.risk.status === 'flagged' ? 'bg-rose-400' : target.risk.status === 'watch' ? 'bg-amber-300' : 'bg-emerald-400')} style={{ width: Math.min(100, Math.max(4, (target.risk.stressedLtvPct / Math.max(target.position.liquidationLtvPct ?? 1, target.risk.stressedLtvPct)) * 100)) + '%' }} />
                  <i className="absolute inset-y-[-3px] w-px bg-white" style={{ left: Math.min(100, Math.max(2, ((target.position.liquidationLtvPct ?? 0) / Math.max(target.risk.stressedLtvPct, target.position.liquidationLtvPct ?? 1)) * 100)) + '%' }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600"><span>Weekend scenario: {pct(target.risk.adjustedGapPct)}</span><span>{target.risk.liquidationDistancePct?.toFixed(2) ?? '—'} pts to liquidation</span></div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-52 items-center justify-center py-8">
              <div className="max-w-md text-center">
                <div className="mx-auto grid size-11 place-items-center border border-sp-border bg-sp-panel-2 text-slate-500"><Activity size={18} /></div>
                <div className="mt-4 text-sm font-semibold text-slate-200">{loading ? 'Reading Kamino state…' : 'No position loaded'}</div>
                <p className="mt-2 text-[11px] leading-5 text-slate-600">{loading ? 'Scanning obligations, xStocks and market context.' : 'This empty state is intentional. StockPass does not invent account balances.'}</p>
                {!loading && <button onClick={() => void scan()} className="mt-4 inline-flex h-9 items-center gap-2 border border-sp-border bg-white px-3 text-[10px] font-semibold text-slate-950">Scan account <ArrowRight size={13} /></button>}
              </div>
            </div>
          )}
        </section>

        <aside className="sp-panel-2 p-5 md:p-6">
          <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[.16em] text-slate-600"><ArrowRight size={13} className="text-sp-blue" /> Next action</div>
          {worstRisk === 'flagged' && target ? (
            <>
              <h3 className="mt-4 text-lg font-semibold text-slate-100">Bring the position back inside the guard.</h3>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">{target.symbol} is outside the modeled protection zone.</p>
              <div className="mt-5 grid grid-cols-2 gap-px border border-sp-border bg-sp-border">
                <div className="bg-sp-panel p-3"><div className="font-mono text-[8px] uppercase text-slate-600">Scenario</div><div className="sp-num mt-2 text-sm text-rose-300">{pct(target.risk?.adjustedGapPct)}</div></div>
                <div className="bg-sp-panel p-3"><div className="font-mono text-[8px] uppercase text-slate-600">Stressed LTV</div><div className="sp-num mt-2 text-sm text-slate-200">{pct(target.risk?.stressedLtvPct)}</div></div>
              </div>
              <div className="mt-5 grid gap-2">
                <button className="inline-flex h-10 items-center justify-between border border-blue-400/30 bg-blue-400/[.08] px-3 text-[11px] font-semibold text-blue-200 hover:bg-blue-400/[.13]" onClick={() => void prepareFix(target, 'deposit')} disabled={preparing || authenticating}><span className="inline-flex items-center gap-2"><ArrowDownToLine size={14} /> Add collateral</span><ArrowRight size={13} /></button>
                {target.position.debts.length > 0 && <button className="inline-flex h-10 items-center justify-between border border-sp-border bg-sp-panel px-3 text-[11px] font-semibold text-slate-200 hover:border-sp-border-strong" onClick={() => void prepareFix(target, 'repay')} disabled={preparing || authenticating}><span>Repay debt</span><ArrowRight size={13} /></button>}
              </div>
              <div className="mt-4 flex items-start gap-2 font-mono text-[8px] leading-4 text-slate-600"><ShieldCheck size={12} className="mt-0.5 shrink-0 text-slate-500" /> Server prepares from fresh Kamino state. Your wallet signs the final transaction.</div>
            </>
          ) : worstRisk === 'watch' && target ? (
            <>
              <h3 className="mt-4 text-lg font-semibold">Monitor before moving funds.</h3>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">{target.symbol} is close to the modeled liquidation boundary.</p>
              <div className="mt-5 border border-amber-300/20 bg-amber-300/[.04] p-3 text-[10px] leading-5 text-amber-100/70"><Clock3 size={14} className="mb-2 text-amber-200" />No automatic action is taken.</div>
            </>
          ) : worstRisk === 'safe' ? (
            <>
              <h3 className="mt-4 text-lg font-semibold">Guard is clear.</h3>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">The account does not currently require a protection transaction under the loaded historical downside scenario.</p>
              <div className="mt-5 flex gap-2 border border-emerald-300/20 bg-emerald-300/[.04] p-3 text-[10px] leading-5 text-emerald-200/70"><CheckCircle2 size={14} className="mt-0.5 shrink-0" />Read-only monitoring remains active.</div>
            </>
          ) : (
            <>
              <h3 className="mt-4 text-lg font-semibold">Start with the account scan.</h3>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">StockPass only shows balances, debt and risk once they are read from mainnet.</p>
              <button onClick={() => void scan()} disabled={loading} className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 bg-white text-[11px] font-semibold text-slate-950">{loading ? <><RefreshCw size={14} className="animate-spin" />Scanning</> : <>Read my Kamino state <ArrowRight size={13} /></>}</button>
            </>
          )}
        </aside>
      </div>

      {prepared && (
        <div className="mt-4 flex flex-col gap-4 border border-blue-400/20 bg-blue-400/[.05] p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-sp-blue" /><div><div className="font-mono text-[8px] uppercase tracking-[.15em] text-blue-200/60">Wallet review required</div><div className="mt-1 text-sm font-semibold">{prepared.symbol} {prepared.kind === 'deposit' ? 'collateral' : 'repay'} ready</div><div className="mt-1 text-[10px] text-slate-500">{prepared.instructionCount} instructions · prepared from fresh Kamino state.</div></div></div>
          <button onClick={() => void signAndSendPrepared()} disabled={signing} className="inline-flex h-10 items-center justify-center gap-2 bg-white px-4 text-[11px] font-semibold text-slate-950">{signing ? 'Waiting for wallet…' : 'Review & sign'} <ArrowRight size={13} /></button>
        </div>
      )}

      {signature && (
        <div className="mt-4 border border-emerald-400/20 bg-emerald-400/[.04] p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-200"><CheckCircle2 size={15} /> Transaction submitted</div>
          <div className="sp-num mt-2 break-all text-[9px] text-slate-500">{signature}</div>
        </div>
      )}

      <div className="mt-4 border border-sp-border bg-sp-panel">
        <div className="flex items-center justify-between border-b border-sp-border px-4 py-3 md:px-5">
          <div><div className="font-mono text-[8px] uppercase tracking-[.15em] text-slate-600">Live positions</div><div className="mt-1 text-sm font-semibold">Kamino xStock collateral</div></div>
          <div className="font-mono text-[8px] uppercase text-slate-600">{lastLoaded ? 'Synced ' + lastLoaded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not scanned'}</div>
        </div>
        {rows.length ? (
          <div className="divide-y divide-sp-border">
            {rows.slice(0, 6).map((row) => (
              <div key={row.stock.mint + row.position.obligation} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(170px,1.5fr)_130px_110px_100px] md:items-center md:px-5">
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center border border-sp-border bg-sp-panel-2 font-mono text-[9px] font-semibold text-sp-blue">{row.symbol.slice(0, 4)}</div>
                  <div><div className="text-[12px] font-medium text-slate-200">{row.symbol}</div><div className="mt-1 text-[9px] text-slate-600">{row.stock.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} units</div></div>
                </div>
                <div><div className="font-mono text-[8px] uppercase text-slate-600">Collateral</div><div className="sp-num mt-1 text-[11px] text-slate-300">{money(row.position.depositValueUsd)}</div></div>
                <div><div className="font-mono text-[8px] uppercase text-slate-600">LTV</div><div className="sp-num mt-1 text-[11px] text-slate-300">{pct(row.position.ltvPct)}</div></div>
                <div><span className={'inline-flex w-fit rounded-full border px-2 py-1 font-mono text-[8px] uppercase ' + (row.risk ? statusTone(row.risk.status) : 'border-sp-border bg-sp-panel-2 text-slate-600')}>{row.risk?.status ?? 'pending'}</span></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-40 items-center justify-center text-center"><div className="text-[11px] text-slate-600">No real Kamino xStock rows are loaded.</div></div>
        )}
      </div>

      <div className="mt-4 grid gap-px border border-sp-border bg-sp-border md:grid-cols-3">
        <div className="bg-sp-panel p-4"><div className="font-mono text-[8px] uppercase tracking-[.14em] text-slate-600">Position truth</div><div className="mt-2 text-[11px] text-slate-300">Kamino obligations</div></div>
        <div className="bg-sp-panel p-4"><div className="font-mono text-[8px] uppercase tracking-[.14em] text-slate-600">Market context</div><div className="mt-2 text-[11px] text-slate-300">xStocks price + multiplier</div></div>
        <div className="bg-sp-panel p-4"><div className="font-mono text-[8px] uppercase tracking-[.14em] text-slate-600">Scenario</div><div className="mt-2 text-[11px] text-slate-300">Twelve Data weekend history</div></div>
      </div>
    </section>
  );
}
