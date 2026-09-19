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

function money(v:number|null|undefined){return v==null||!Number.isFinite(v)?'—':v.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2});}
function pct(v:number|null|undefined){return v==null||!Number.isFinite(v)?'—':v.toFixed(2)+'%';}
function short(v:string){return v.slice(0,7)+'…'+v.slice(-5);}

export default function WggPositionsPage({positions,rows,loading,lastLoaded,scan}:{positions:KaminoXStockPosition[];rows:Row[];loading:boolean;lastLoaded:Date|null;scan:()=>Promise<void>}) {
  return (
    <section className="py-7 md:py-9">
      <div className="flex flex-col gap-4 border-b border-sp-border pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[.18em] text-slate-600">Positions / Kamino</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Your positions</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500">Read-only account state from the connected wallet. No synthetic balances, PnL, or position values are inserted.</p>
        </div>
        <button onClick={()=>void scan()} disabled={loading} className="inline-flex h-10 items-center justify-center gap-2 border border-sp-border bg-sp-panel px-4 text-[11px] font-semibold text-slate-200 hover:border-sp-border-strong">
          <RefreshCw size={14} className={loading?'animate-spin':''}/>{loading?'Syncing':'Refresh mainnet'}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px border border-sp-border bg-sp-border md:grid-cols-4">
        <div className="bg-sp-panel p-4"><div className="font-mono text-[8px] uppercase text-slate-600">Obligations</div><div className="sp-num mt-3 text-xl">{positions.length}</div></div>
        <div className="bg-sp-panel p-4"><div className="font-mono text-[8px] uppercase text-slate-600">xStock rows</div><div className="sp-num mt-3 text-xl">{rows.length}</div></div>
        <div className="bg-sp-panel p-4"><div className="font-mono text-[8px] uppercase text-slate-600">Flagged</div><div className="sp-num mt-3 text-xl text-rose-300">{rows.filter(r=>r.risk?.status==='flagged').length}</div></div>
        <div className="bg-sp-panel p-4"><div className="font-mono text-[8px] uppercase text-slate-600">Last sync</div><div className="mt-3 text-[11px] text-slate-300">{lastLoaded?lastLoaded.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'—'}</div></div>
      </div>

      <section className="mt-4 overflow-hidden border border-sp-border bg-sp-panel">
        <div className="flex items-center justify-between border-b border-sp-border px-4 py-3 md:px-5">
          <div><div className="font-mono text-[8px] uppercase tracking-[.14em] text-slate-600">Live obligations</div><div className="mt-1 text-sm font-semibold">Kamino xStock collateral</div></div>
          <div className="font-mono text-[8px] uppercase text-slate-600">MAINNET</div>
        </div>
        {loading ? (
          <div className="flex min-h-56 items-center justify-center"><div className="text-center"><RefreshCw size={19} className="mx-auto animate-spin text-sp-blue"/><div className="mt-3 text-sm font-semibold">Reading Kamino</div><div className="mt-1 text-[10px] text-slate-600">Fetching current obligations and collateral.</div></div></div>
        ) : !positions.length ? (
          <div className="flex min-h-64 items-center justify-center px-5 text-center"><div><Layers3 size={20} className="mx-auto text-slate-600"/><div className="mt-4 text-sm font-semibold">No xStock-backed obligation found</div><p className="mx-auto mt-2 max-w-md text-[10px] leading-5 text-slate-600">The wallet has no matching Kamino position in the discovered mainnet state, or the upstream state is unavailable.</p><button onClick={()=>void scan()} className="mt-4 inline-flex h-9 items-center gap-2 border border-sp-border bg-white px-3 text-[10px] font-semibold text-slate-950">Scan again</button></div></div>
        ) : (
          <div className="divide-y divide-sp-border">
            {positions.map(position=>{
              const pr=rows.filter(r=>r.position.obligation===position.obligation);
              const risk=pr.reduce<ReturnType<typeof evaluateWeekendRisk>|null>((best,row)=>!row.risk?best:!best||({flagged:3,watch:2,safe:1}[row.risk.status] > ({flagged:3,watch:2,safe:1}[best.status]))?row.risk:best,null);
              return <article key={position.obligation} className="p-4 md:p-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(230px,1.45fr)_170px_150px_120px_minmax(130px,.7fr)] xl:items-center">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">{pr.slice(0,3).map(row=><span key={row.stock.mint} className="grid size-9 place-items-center border-2 border-sp-panel bg-[#172437] font-mono text-[8px] text-sp-blue">{row.symbol.slice(0,4)}</span>)}</div>
                    <div className="min-w-0"><div className="truncate text-[12px] font-semibold text-slate-200">{pr.map(r=>r.symbol).join(' · ')||'xStock collateral'}</div><div className="sp-num mt-1 truncate text-[8px] text-slate-600">{short(position.obligation)} · {pr.length} asset{pr.length===1?'':'s'}</div></div>
                  </div>
                  <div><div className="font-mono text-[8px] uppercase text-slate-600">Collateral</div><div className="sp-num mt-1 text-[11px] text-slate-300">{money(position.depositValueUsd)}</div></div>
                  <div><div className="font-mono text-[8px] uppercase text-slate-600">LTV path</div><div className="sp-num mt-1 text-[11px] text-slate-300">{pct(position.ltvPct)} <span className="text-slate-700">→</span> {risk?pct(risk.stressedLtvPct):'—'}</div></div>
                  <div><div className="font-mono text-[8px] uppercase text-slate-600">Liquidation</div><div className="sp-num mt-1 text-[11px] text-slate-300">{pct(position.liquidationLtvPct)}</div></div>
                  <div><span className={'inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 font-mono text-[8px] uppercase '+(risk?.status==='flagged'?'border-rose-400/25 bg-rose-400/[.06] text-rose-300':risk?.status==='watch'?'border-amber-300/20 bg-amber-300/[.05] text-amber-200':risk?.status==='safe'?'border-emerald-300/20 bg-emerald-300/[.05] text-emerald-300':'border-sp-border bg-sp-panel-2 text-slate-600')}>{risk?.status==='flagged'?<ShieldAlert size={12}/>:risk?.status==='watch'?<TrendingDown size={12}/>:<ShieldCheck size={12}/>} {risk?.status??'pending'}</span></div>
                </div>
              </article>;
            })}
          </div>
        )}
      </section>

      <section className="mt-4 border border-sp-border bg-sp-panel">
        <div className="border-b border-sp-border px-4 py-4 md:px-5">
          <div className="font-mono text-[8px] uppercase tracking-[.14em] text-slate-600">Market context</div>
          <div className="mt-1 text-sm font-semibold">Current xStocks + historical weekend scenario</div>
          <div className="mt-1 text-[10px] text-slate-600">Current price/multiplier context is separate from the Kamino account source of truth.</div>
        </div>
        {rows.length ? <div className="grid md:grid-cols-2 xl:grid-cols-3">{rows.slice(0,9).map(row=><div key={row.stock.mint} className="border-b border-sp-border p-4 md:border-r"><div className="flex items-center justify-between"><span className="font-semibold text-[11px]">{row.symbol}</span><span className="font-mono text-[8px] text-slate-600">XSTOCKS</span></div><div className="mt-4 grid grid-cols-2 gap-2"><div><div className="font-mono text-[8px] uppercase text-slate-600">Price</div><div className="sp-num mt-1 text-[10px] text-slate-300">{row.price?money(row.price.price):'Unavailable'}</div></div><div><div className="font-mono text-[8px] uppercase text-slate-600">Gap P75</div><div className="sp-num mt-1 text-[10px] text-slate-300">{row.gap?.typicalWeekendGapPct!=null?pct(row.gap.typicalWeekendGapPct):'Unavailable'}</div></div></div></div>)}</div> : <div className="p-5 text-[10px] text-slate-600">Market context will populate after a real xStock collateral row is discovered.</div>}
      </section>
    </section>
  );
}
