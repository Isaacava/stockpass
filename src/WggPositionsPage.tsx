import { Activity, Layers3, RefreshCw, ShieldAlert, ShieldCheck, TrendingDown } from 'lucide-react';
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

function money(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
function pct(value: number | null | undefined) { return value == null || !Number.isFinite(value) ? '—' : value.toFixed(2) + '%'; }
function short(value: string) { return value.slice(0, 6) + '…' + value.slice(-6); }

export default function WggPositionsPage({
  positions, rows, loading, lastLoaded, scan,
}: {
  positions: KaminoXStockPosition[];
  rows: Row[];
  loading: boolean;
  lastLoaded: Date | null;
  scan: () => Promise<void>;
}) {
  return <section className="sp-page">
    <header className="sp-page-head">
      <div><div className="sp-overline"><span /> POSITIONS / KAMINO</div><h1>Your positions</h1><p>Every value below is read from the connected wallet's live Kamino obligation and current xStock market context.</p></div>
      <button className="sp-secondary" onClick={() => void scan()} disabled={loading}><RefreshCw size={14} className={loading ? 'wgg-spin' : ''} /> {loading ? 'Scanning' : 'Refresh'}</button>
    </header>

    <section className="sp-positions sp-page-card">
      <div className="sp-section-head"><div><div className="sp-overline"><span /> LIVE OBLIGATIONS</div><h2>Kamino xStock collateral</h2></div><div className="sp-section-meta">{lastLoaded ? `Synced ${lastLoaded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not scanned'} · mainnet</div></div>
      {loading ? <div className="sp-table-state"><RefreshCw size={18} className="wgg-spin" /><strong>Scanning mainnet</strong><span>Reading Kamino obligations, xStocks and market context.</span></div>
        : positions.length === 0 ? <div className="sp-table-state sp-table-empty"><Layers3 size={19} /><strong>No xStock-backed Kamino position found</strong><span>Nothing is fabricated when the connected wallet has no matching obligation.</span><button className="sp-secondary" onClick={() => void scan()}>Scan again</button></div>
        : <div className="sp-position-table">
          <div className="sp-position-table-head"><span>Position</span><span>Collateral</span><span>LTV path</span><span>Status</span><span>Details</span></div>
          {positions.map(position => {
            const pr = rows.filter(r => r.position.obligation === position.obligation);
            const risk = pr.reduce<ReturnType<typeof evaluateWeekendRisk> | null>((best, row) => !row.risk ? best : !best || ({ flagged:3, watch:2, safe:1 }[row.risk.status] > ({ flagged:3, watch:2, safe:1 }[best.status])) ? row.risk : best, null);
            return <article className="sp-position-item" key={position.obligation}>
              <div className="sp-position-identity"><div className="sp-asset-pile">{pr.slice(0,3).map(row => <span key={row.stock.mint}>{row.symbol.slice(0,3)}</span>)}</div><div><strong>{pr.map(r=>r.symbol).join(' · ') || 'xStock collateral'}</strong><span>{short(position.obligation)} · {pr.length} asset{pr.length===1?'':'s'}</span></div></div>
              <div className="sp-position-value"><strong>{money(position.depositValueUsd)}</strong><span>{pr.map(r=>r.price ? `${r.symbol} ${money(r.price.price)}` : `${r.symbol} price unavailable`).join(' · ')}</span></div>
              <div className="sp-position-ltv"><strong>{pct(position.ltvPct)} <span>→</span> {risk ? pct(risk.stressedLtvPct) : '—'}</strong><span>Liquidation {pct(position.liquidationLtvPct)}</span></div>
              <div className={`sp-position-status sp-risk-${risk?.status ?? 'empty'}`}>{risk?.status==='flagged'?<ShieldAlert size={14}/>:risk?.status==='watch'?<TrendingDown size={14}/>:risk?.status==='safe'?<ShieldCheck size={14}/>:<Activity size={14}/>}<span>{risk?.status?.toUpperCase() ?? 'PENDING'}</span>{pr[0]?.gap?.sampleCount!=null && <small>{pr[0].gap.sampleCount} gap samples</small>}</div>
              <div className="sp-position-action"><span className="sp-section-meta">Obligation {short(position.obligation)}</span></div>
            </article>;
          })}
        </div>}
    </section>

    <section className="sp-market-strip sp-page-card">
      <div className="sp-market-strip-title"><div className="sp-overline"><span /> MARKET CONTEXT</div><strong>xStocks + weekend history</strong><span>Current prices come from xStocks. Historical weekend-gap statistics are independent scenario inputs.</span></div>
      <div className="sp-market-items">{rows.length ? rows.slice(0,8).map(row => <div className="sp-market-item" key={row.stock.mint}><div><b>{row.symbol}</b><span>{row.price ? money(row.price.price) : 'Price unavailable'}</span></div><div><span>Gap P75</span><strong>{row.gap?.typicalWeekendGapPct != null ? pct(row.gap.typicalWeekendGapPct) : '—'}</strong></div><span className="sp-market-link is-disabled">LIVE</span></div>) : <div className="sp-market-empty">Market context will appear after a real xStock position is found.</div>}</div>
    </section>
  </section>;
}
