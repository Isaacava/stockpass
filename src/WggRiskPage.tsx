import { ArrowRight, CheckCircle2, ShieldAlert, ShieldCheck, TrendingDown } from 'lucide-react';
import type { KaminoXStockPosition } from './lib/kamino';
import type { XStockPriceMap, WeekendGapMap } from './lib/wggMarketData';
import { evaluateWeekendRisk } from './lib/wggRisk';

type Row={position:KaminoXStockPosition;stock:KaminoXStockPosition['xStocks'][number];symbol:string;gap?:WeekendGapMap[string];risk:ReturnType<typeof evaluateWeekendRisk>|null;price?:XStockPriceMap[string]};
const pct=(v:number|null|undefined)=>v==null||!Number.isFinite(v)?'—':v.toFixed(2)+'%';

export default function WggRiskPage({rows,counts,prepareFix,preparing,authenticating}:{rows:Row[];counts:{flagged:number;watch:number;safe:number};prepareFix:(row:Row,kind:'deposit'|'repay')=>Promise<void>;preparing:boolean;authenticating:boolean}){
  const state=counts.flagged?'flagged':counts.watch?'watch':counts.safe?'safe':'empty';
  const title={flagged:'Protection action required',watch:'Protection boundary is close',safe:'Guard is clear',empty:'Guard is waiting for data'}[state];
  const tone=state==='flagged'?'border-rose-400/25 bg-rose-400/[.05]':state==='watch'?'border-amber-300/20 bg-amber-300/[.04]':state==='safe'?'border-emerald-300/20 bg-emerald-300/[.04]':'border-sp-border bg-sp-panel';
  return <section className="py-7 md:py-9">
    <div className="flex flex-col gap-4 border-b border-sp-border pb-6 md:flex-row md:items-end md:justify-between">
      <div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-slate-600">Guard / risk engine</div><h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Weekend Gap Guard</h1><p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500">A separate risk surface for current LTV, stressed LTV, liquidation boundary and protection actions.</p></div>
      <div className={'inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 font-mono text-[8px] uppercase tracking-[.12em] '+tone}>{state==='flagged'?<ShieldAlert size={13}/>:state==='watch'?<TrendingDown size={13}/>:<ShieldCheck size={13}/>} {state}</div>
    </div>

    <div className={'mt-4 border p-5 md:p-6 '+tone}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
        <div><div className="font-mono text-[8px] uppercase tracking-[.16em] text-slate-500">Guard status</div><h2 className="mt-2 text-xl font-semibold">{title}</h2><p className="mt-2 max-w-xl text-[11px] leading-5 text-slate-500">{rows.length?counts.flagged+' flagged · '+counts.watch+' watch · '+counts.safe+' safe across '+rows.length+' xStock collateral row'+(rows.length===1?'':'s')+'.':'No risk result is generated until a real mainnet position and valid weekend-gap history are available.'}</p></div>
        <div className="grid grid-cols-3 gap-px border border-sp-border bg-sp-border">
          <div className="bg-sp-panel p-3"><div className="font-mono text-[8px] text-slate-600">FLAGGED</div><div className="sp-num mt-2 text-xl text-rose-300">{counts.flagged}</div></div>
          <div className="bg-sp-panel p-3"><div className="font-mono text-[8px] text-slate-600">WATCH</div><div className="sp-num mt-2 text-xl text-amber-200">{counts.watch}</div></div>
          <div className="bg-sp-panel p-3"><div className="font-mono text-[8px] text-slate-600">SAFE</div><div className="sp-num mt-2 text-xl text-emerald-300">{counts.safe}</div></div>
        </div>
      </div>
    </div>

    <div className="mt-4 overflow-hidden border border-sp-border bg-sp-panel">
      <div className="hidden border-b border-sp-border bg-[#0a111b] px-4 py-3 font-mono text-[8px] uppercase tracking-[.13em] text-slate-600 lg:grid lg:grid-cols-[minmax(220px,1.5fr)_120px_120px_120px_110px_180px] lg:gap-4"><span>Asset</span><span>Current LTV</span><span>Stressed LTV</span><span>Liquidation</span><span>Status</span><span>Protection</span></div>
      {rows.filter(row=>row.risk).map(row=>{
        const flagged=row.risk?.status==='flagged';
        return <article key={row.stock.mint+row.position.obligation} className="border-b border-sp-border p-4 last:border-b-0 md:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(220px,1.5fr)_120px_120px_120px_110px_180px] lg:items-center lg:gap-4">
            <div className="flex items-center gap-3"><div className="grid size-9 place-items-center border border-sp-border bg-sp-panel-2 font-mono text-[8px] text-sp-blue">{row.symbol.slice(0,4)}</div><div><div className="text-[12px] font-semibold">{row.symbol}</div><div className="mt-1 text-[9px] text-slate-600">{row.stock.amount.toLocaleString(undefined,{maximumFractionDigits:6})} units</div></div></div>
            <div><span className="font-mono text-[8px] uppercase text-slate-600 lg:hidden">Current LTV</span><div className="sp-num text-[11px] text-slate-300">{pct(row.position.ltvPct)}</div></div>
            <div><span className="font-mono text-[8px] uppercase text-slate-600 lg:hidden">Stressed LTV</span><div className="sp-num text-[11px] text-slate-300">{pct(row.risk?.stressedLtvPct)}</div></div>
            <div><span className="font-mono text-[8px] uppercase text-slate-600 lg:hidden">Liquidation</span><div className="sp-num text-[11px] text-slate-300">{pct(row.position.liquidationLtvPct)}</div></div>
            <div><span className={'inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[8px] uppercase '+(flagged?'border-rose-400/25 bg-rose-400/[.06] text-rose-300':row.risk?.status==='watch'?'border-amber-300/20 bg-amber-300/[.05] text-amber-200':'border-emerald-300/20 bg-emerald-300/[.05] text-emerald-300')}>{flagged?<ShieldAlert size={11}/>:row.risk?.status==='watch'?<TrendingDown size={11}/>:<ShieldCheck size={11}/>} {row.risk?.status}</span></div>
            <div className="flex gap-2">{flagged&&<button className="inline-flex h-9 items-center gap-2 border border-blue-400/30 bg-blue-400/[.08] px-3 text-[10px] font-semibold text-blue-200" onClick={()=>void prepareFix(row,'deposit')} disabled={preparing||authenticating}>Add collateral <ArrowRight size={12}/></button>}{flagged&&row.position.debts.length>0&&<button className="inline-flex h-9 items-center gap-2 border border-sp-border bg-sp-panel-2 px-3 text-[10px] font-semibold text-slate-200" onClick={()=>void prepareFix(row,'repay')} disabled={preparing||authenticating}>Repay</button>}{!flagged&&<span className="text-[9px] text-slate-600">No fund movement recommended by this state.</span>}</div>
          </div>
        </article>;
      })}
      {!rows.filter(row=>row.risk).length&&<div className="flex min-h-60 items-center justify-center text-center"><div><ShieldCheck size={22} className="mx-auto text-slate-600"/><div className="mt-3 text-sm font-semibold">No risk scenario to display</div><div className="mt-1 text-[10px] text-slate-600">Risk stays empty rather than inventing a stress result.</div></div></div>}
    </div>

    {state==='safe'&&<div className="mt-4 flex gap-2 border border-emerald-300/20 bg-emerald-300/[.04] p-4 text-[10px] leading-5 text-emerald-200/70"><CheckCircle2 size={14} className="mt-0.5 shrink-0"/><span>The current account is inside the configured historical downside protection model. StockPass does not automatically move funds.</span></div>}
  </section>;
}
