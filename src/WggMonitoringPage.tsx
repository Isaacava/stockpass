import { Activity, AlertTriangle, Bell, CheckCircle2, RefreshCw, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { readWalletSessionToken } from './lib/walletSession';

type Props={address:string};
type Result={ok?:boolean;scanned?:number;flagged?:number;alertsCreated?:number;runId?:string;error?:string};

export default function WggMonitoringPage({address}:Props){
  const [running,setRunning]=useState(false);
  const [result,setResult]=useState<Result|null>(null);
  const [error,setError]=useState('');

  async function runCheck(){
    setRunning(true);setError('');setResult(null);
    try{
      const token=readWalletSessionToken();
      if(!token) throw new Error('Wallet session is missing. Re-authenticate before running monitoring.');
      const response=await fetch('/api/wgg-monitor',{method:'POST',headers:{'Content-Type':'application/json','x-client-info':'stockpass stockpass-session='+token},body:JSON.stringify({mode:'sync',wallet:address})});
      const text=await response.text();
      let body:Result|null=null;
      try{body=text?JSON.parse(text):null;}catch{}
      if(!response.ok) throw new Error(body?.error??(text?text.slice(0,240):'Monitoring sync failed.'));
      setResult(body??{ok:true});
    }catch(cause){setError(cause instanceof Error?cause.message:'Monitoring sync failed.');}
    finally{setRunning(false);}
  }

  const scanned=result?.scanned??0;
  const flagged=result?.flagged??0;
  const alerts=result?.alertsCreated??0;

  return <section className="py-7 md:py-9">
    <div className="flex flex-col gap-4 border-b border-sp-border pb-6 md:flex-row md:items-end md:justify-between">
      <div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-slate-600">Monitoring / automation</div><h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Monitoring</h1><p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500">Run an authenticated refresh that re-reads Kamino, xStocks, weekend history and optional earnings context before updating persisted monitoring state.</p></div>
      <button onClick={()=>void runCheck()} disabled={running} className="inline-flex h-10 items-center justify-center gap-2 bg-white px-4 text-[11px] font-semibold text-slate-950"><RefreshCw size={14} className={running?'animate-spin':''}/>{running?'Running check…':'Run protection check'}</button>
    </div>

    <div className="mt-4 grid grid-cols-1 gap-px border border-sp-border bg-sp-border md:grid-cols-3">
      <div className="bg-sp-panel p-5"><div className="font-mono text-[8px] uppercase tracking-[.15em] text-slate-600">Monitor run</div><div className="mt-6 text-lg font-semibold">{result?'Completed':'Ready'}</div><div className="mt-2 text-[10px] leading-5 text-slate-600">{result?scanned+' position row'+(scanned===1?'':'s')+' scanned from mainnet.':'Nothing is written until the authenticated check runs.'}</div></div>
      <div className="bg-sp-panel p-5"><div className="font-mono text-[8px] uppercase tracking-[.15em] text-slate-600">Alert signal</div><div className={'mt-6 text-lg font-semibold '+(flagged?'text-rose-300':'text-slate-200')}>{result?(flagged?flagged+' flagged':'No flagged rows'):'—'}</div><div className="mt-2 text-[10px] leading-5 text-slate-600">{result?(flagged?'Review the Guard and Actions pages.':'No flagged scenario was produced.'):'Run the check to calculate live state.'}</div></div>
      <div className="bg-sp-panel p-5"><div className="font-mono text-[8px] uppercase tracking-[.15em] text-slate-600">New alerts</div><div className="mt-6 text-lg font-semibold">{result?alerts:'—'}</div><div className="mt-2 text-[10px] leading-5 text-slate-600">Deduplicated alerts created by this run.</div></div>
    </div>

    {error&&<div className="mt-4 flex items-start gap-3 border border-rose-400/20 bg-rose-400/[.05] p-4 text-rose-200"><AlertTriangle size={17} className="mt-0.5"/><div><div className="text-[12px] font-semibold">Monitoring unavailable</div><div className="mt-1 text-[10px] leading-5 text-rose-200/70">{error}</div></div></div>}
    {result&&!error&&<div className={'mt-4 flex items-start gap-3 border p-4 '+(flagged?'border-amber-300/20 bg-amber-300/[.04]':'border-emerald-300/20 bg-emerald-300/[.04]')}>{flagged?<ShieldAlert size={17} className="mt-0.5 text-amber-200"/>:<CheckCircle2 size={17} className="mt-0.5 text-emerald-300"/>}<div><div className="text-[12px] font-semibold">{flagged?'Protection review needed':'Protection check clean'}</div><div className="mt-1 font-mono text-[9px] text-slate-600">Run {result.runId??'completed'} · {scanned} scanned · {alerts} new alerts</div></div></div>}

    <section className="mt-4 overflow-hidden border border-sp-border bg-sp-panel">
      <div className="border-b border-sp-border px-5 py-4"><div className="font-mono text-[8px] uppercase tracking-[.15em] text-slate-600">Pipeline</div><div className="mt-1 text-sm font-semibold">What StockPass refreshes</div></div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4">
        {([
          [Activity,'Kamino','Collateral, debt and liquidation state.'],
          [ShieldCheck,'xStocks','Current price and multiplier context.'],
          [ShieldAlert,'Weekend gap','Historical downside repricing scenario.'],
          [Bell,'Alerts','Persisted watch/flagged events with deduplication.'],
        ] as Array<[LucideIcon, string, string]>).map(([Icon,title,body])=><div key={String(title)} className="border-b border-sp-border p-5 xl:border-r"><Icon size={17} className="text-sp-blue"/><div className="mt-5 text-[12px] font-semibold">{title}</div><div className="mt-2 text-[10px] leading-5 text-slate-600">{body}</div></div>)}
      </div>
    </section>
  </section>;
}
