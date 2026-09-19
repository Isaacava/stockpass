import { Layers3, RefreshCw, ShieldAlert, ShieldCheck, TrendingDown } from 'lucide-react';
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

function money(v: number | null | undefined) {
  return v == null || !Number.isFinite(v) ? '—' : v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
function pct(v: number | null | undefined) {
  return v == null || !Number.isFinite(v) ? '—' : v.toFixed(2) + '%';
}
function short(v: string) {
  return v.slice(0, 7) + '…' + v.slice(-5);
}

function RiskBadge({ status }: { status?: 'safe' | 'watch' | 'flagged' | null }) {
  if (!status) return <span className="sp-status bg-soft text-faint">Pending</span>;
  const meta = {
    safe: ['Safe', 'bg-safe-soft text-safe', ShieldCheck],
    watch: ['Watch', 'bg-watch-soft text-watch', TrendingDown],
    flagged: ['Flagged', 'bg-flag-soft text-flag', ShieldAlert],
  }[status];
  const Icon = meta[2];
  return <span className={'sp-status ' + meta[1]}><span className={'size-1.5 rounded-full ' + (status === 'safe' ? 'bg-safe' : status === 'watch' ? 'bg-watch' : 'bg-flag')} /><Icon size={12} />{meta[0]}</span>;
}

export default function WggPositionsPage({
  positions, rows, loading, lastLoaded, scan,
}: {
  positions: KaminoXStockPosition[];
  rows: Row[];
  loading: boolean;
  lastLoaded: Date | null;
  scan: () => Promise<void>;
}) {
  const totalCollateral = positions.reduce((sum, position) => sum + (position.depositValueUsd ?? 0), 0);
  const totalBorrow = positions.reduce((sum, position) => sum + (position.borrowValueUsd ?? 0), 0);

  return (
    <section className="sp-screen">
      <div className="sp-page-head">
        <div>
          <div className="sp-eyebrow">Positions / Kamino</div>
          <h1 className="sp-page-title">Positions</h1>
          <p className="sp-page-copy">Every live Kamino xStock obligation loaded for this wallet.</p>
        </div>
        <button onClick={() => void scan()} disabled={loading} className="sp-button-outline px-4">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Rescanning' : 'Rescan mainnet'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="sp-kpi-card"><div className="sp-label">Collateral</div><div className="num mt-1 text-[18px] font-bold">{positions.length ? money(totalCollateral) : '—'}</div><div className="sp-caption">{positions.length ? positions.length + ' obligation' + (positions.length === 1 ? '' : 's') : 'Awaiting real state'}</div></div>
        <div className="sp-kpi-card"><div className="sp-label">Borrowed</div><div className="num mt-1 text-[18px] font-bold">{positions.length ? money(totalBorrow) : '—'}</div><div className="sp-caption">{rows.length} xStock row{rows.length === 1 ? '' : 's'}</div></div>
      </div>

      <section className="sp-list-card mt-3">
        <div className="sp-list-head">
          <div><div className="text-[13px] font-bold text-ink">Live Kamino xStock rows</div><div className="sp-caption">Mainnet account source</div></div>
          <div className="sp-caption num">{lastLoaded ? lastLoaded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not scanned'}</div>
        </div>

        {loading ? (
          <div className="sp-empty-block"><RefreshCw size={20} className="animate-spin" /><div className="sp-empty-title">Reading Kamino state…</div><div className="sp-empty-copy">Fetching current obligations and xStock collateral from mainnet.</div></div>
        ) : rows.length ? (
          <div>
            {rows.map((row) => {
              const risk = row.risk;
              return (
                <article key={row.stock.mint + row.position.obligation} className="sp-row-static">
                  <div className="sp-asset-mark">{row.symbol.slice(0, 4)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[13px] font-semibold text-ink">{row.symbol}x</div>
                      <RiskBadge status={risk?.status} />
                    </div>
                    <div className="num mt-1 text-[10px] text-mute">{row.stock.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} units · obligation {short(row.position.obligation)}</div>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-md">
                      <Metric label="Collateral" value={money(row.position.depositValueUsd)} />
                      <Metric label="LTV" value={pct(row.position.ltvPct)} />
                      <Metric label="Stressed" value={pct(risk?.stressedLtvPct)} />
                    </div>
                    <div className="mt-3">
                      <div className="sp-gauge"><span className={'sp-gauge-fill ' + (risk?.status === 'flagged' ? 'bg-flag' : risk?.status === 'watch' ? 'bg-watch' : risk?.status === 'safe' ? 'bg-safe' : 'bg-line')} style={{ width: risk && row.position.liquidationLtvPct ? Math.min(100, Math.max(4, risk.stressedLtvPct / Math.max(row.position.liquidationLtvPct, risk.stressedLtvPct) * 100)) + '%' : '0%' }} /><i style={{ left: risk && row.position.liquidationLtvPct ? Math.min(96, Math.max(4, row.position.liquidationLtvPct / Math.max(row.position.liquidationLtvPct, risk.stressedLtvPct) * 100)) + '%' : '96%' }} /></div>
                      <div className="mt-1 flex justify-between text-[9px] text-faint"><span>Liquidation {pct(row.position.liquidationLtvPct)}</span><span>{risk ? risk.liquidationDistancePct.toFixed(2) + ' pts buffer' : 'Scenario unavailable'}</span></div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="sp-empty-block">
            <Layers3 size={20} />
            <div className="sp-empty-title">No xStock-backed obligation found</div>
            <div className="sp-empty-copy">The connected wallet has no matching Kamino xStock obligation in the discovered mainnet state, or upstream state is unavailable.</div>
            <button onClick={() => void scan()} className="sp-button-dark mt-1 px-4">Scan again</button>
          </div>
        )}
      </section>

      <section className="sp-list-card mt-3">
        <div className="sp-list-head">
          <div><div className="text-[13px] font-bold text-ink">Market context</div><div className="sp-caption">xStocks current price + Twelve Data weekend scenario</div></div>
        </div>
        {rows.length ? (
          <div>
            {rows.map((row) => (
              <div key={'market-' + row.stock.mint} className="sp-market-row">
                <div className="sp-asset-mark">{row.symbol.slice(0, 4)}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-semibold text-ink">{row.symbol}x</div>
                  <div className="sp-caption">Current price context is separate from Kamino position truth.</div>
                </div>
                <div className="text-right">
                  <div className="sp-label">Price</div>
                  <div className="num mt-1 text-[11px] font-semibold text-ink">{row.price ? money(row.price.price) : 'Unavailable'}</div>
                  <div className="sp-caption mt-1">{row.gap?.typicalWeekendGapPct != null ? 'P75 gap ' + pct(row.gap.typicalWeekendGapPct) : 'History unavailable'}</div>
                </div>
              </div>
            ))}
          </div>
        ) : <div className="sp-empty-copy p-4">Market context appears after a real xStock collateral row is discovered.</div>}
      </section>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-soft px-3 py-2.5"><div className="sp-label">{label}</div><div className="num mt-1 text-[12px] font-semibold text-ink">{value}</div></div>;
}
