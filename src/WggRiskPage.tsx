import { ArrowRight, CheckCircle2, ShieldAlert, ShieldCheck, TrendingDown } from 'lucide-react';
import type { KaminoXStockPosition } from './lib/kamino';
import type { XStockPriceMap, WeekendGapMap } from './lib/wggMarketData';
import { evaluateWeekendRisk } from './lib/wggRisk';

type Row = { position: KaminoXStockPosition; stock: KaminoXStockPosition['xStocks'][number]; symbol: string; gap?: WeekendGapMap[string]; risk: ReturnType<typeof evaluateWeekendRisk>|null; price?: XStockPriceMap[string]; };
function pct(v:number|null|undefined){return v==null||!Number.isFinite(v)?'—':v.toFixed(2)+'%';}

export default function WggRiskPage({ rows, counts, prepareFix, preparing, authenticating }:{
  rows: Row[]; counts:{flagged:number;watch:number;safe:number}; prepareFix:(row:Row,kind:'deposit'|'repay')=>Promise<void>; preparing:boolean; authenticating:boolean;
}) {
  const status = counts.flagged ? 'flagged' : counts.watch ? 'watch' : counts.safe ? 'safe' : 'empty';
  const title = status==='flagged' ? 'Protection action required' : status==='watch' ? 'Protection boundary is close' : status==='safe' ? 'Positions are inside the guard' : 'Guard is waiting for data';
  return <section className="sp-page">
    <header className="sp-page-head"><div><div className="sp-overline"><span /> WEEKEND GAP GUARD / RISK</div><h1>Protection monitor</h1><p>One page dedicated to the scenario: live LTV, stressed LTV, liquidation boundary and the actions that can change the position.</p></div><div className={`sp-status-stamp sp-page-status-${status}`}>{status==='flagged'?<ShieldAlert size={15}/>:status==='watch'?<TrendingDown size={15}/>:<ShieldCheck size={15}/>} {status.toUpperCase()}</div></header>
    <div className={`sp-risk-overview sp-risk-${status}`}><div><div className="sp-overline"><span /> GUARD STATE</div><h2>{title}</h2><p>{rows.length ? `${counts.flagged} flagged · ${counts.watch} watch · ${counts.safe} safe across ${rows.length} xStock collateral row${rows.length===1?'':'s'}.` : 'No risk reading is generated until a real mainnet position and valid weekend-gap history are available.'}</p></div><div className="sp-risk-counts"><div><strong>{counts.flagged}</strong><span>FLAGGED</span></div><div><strong>{counts.watch}</strong><span>WATCH</span></div><div><strong>{counts.safe}</strong><span>SAFE</span></div></div></div>
    <div className="sp-risk-list">{rows.map(row => row.risk ? <article className="sp-risk-row" key={`${row.position.obligation}-${row.stock.mint}`}><div className="sp-risk-asset"><div className="sp-asset-pile"><span>{row.symbol.slice(0,3)}</span></div><div><strong>{row.symbol}</strong><span>{row.stock.amount.toLocaleString(undefined,{maximumFractionDigits:6})} collateral units</span></div></div><div><span>Current LTV</span><strong>{pct(row.position.ltvPct)}</strong></div><div><span>Stressed LTV</span><strong>{pct(row.risk.stressedLtvPct)}</strong></div><div><span>Liquidation</span><strong>{pct(row.position.liquidationLtvPct)}</strong></div><div className={`sp-position-status sp-risk-${row.risk.status}`}>{row.risk.status==='flagged'?<ShieldAlert size={13}/>:row.risk.status==='watch'?<TrendingDown size={13}/>:<ShieldCheck size={13}/>} {row.risk.status.toUpperCase()}</div><div className="sp-risk-actions">{row.risk.status==='flagged' && <><button className="sp-secondary" onClick={()=>void prepareFix(row,'deposit')} disabled={preparing||authenticating}>Add collateral <ArrowRight size={12}/></button>{row.position.debts.length>0&&<button className="sp-quiet-button" onClick={()=>void prepareFix(row,'repay')} disabled={preparing||authenticating}>Repay</button>}</>}</div></article> : null)}</div>
    {!rows.length && <div className="sp-table-state sp-table-empty"><ShieldCheck size={19}/><strong>No risk scenario to display</strong><span>Risk remains empty rather than inventing a stress result.</span></div>}
    {status==='safe' && <div className="sp-safe-callout sp-page-callout"><CheckCircle2 size={16}/><span>The current wallet state remains inside the configured historical downside protection model. StockPass does not automatically move funds.</span></div>}
  </section>;
}
