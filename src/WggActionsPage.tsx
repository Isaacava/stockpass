import { Activity, KeyRound, ShieldCheck } from 'lucide-react';
import KaminoActionConsole from './KaminoActionConsole';
import type { KaminoXStockPosition } from './lib/kamino';

type WalletProvider={signMessage:(message:Uint8Array)=>Promise<Uint8Array>;signTransaction:<T>(transaction:T)=>Promise<T>};

export default function WggActionsPage({address,walletProvider,positions,onCompleted}:{address:string;walletProvider:WalletProvider|null;positions:KaminoXStockPosition[];onCompleted:()=>Promise<void>|void}){
  return <section className="py-7 md:py-9">
    <div className="border-b border-sp-border pb-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><div className="font-mono text-[9px] uppercase tracking-[.18em] text-slate-600">Actions / Kamino</div><h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Execution</h1><p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500">A dedicated transaction workspace for supply, borrow, collateral, repayment, withdrawal and self-service close. Every fund movement remains wallet-signed.</p></div>
        <div className="flex w-fit items-center gap-2 border border-emerald-400/20 bg-emerald-400/[.04] px-3 py-2 font-mono text-[8px] uppercase tracking-[.12em] text-emerald-300"><KeyRound size={13}/> Non-custodial</div>
      </div>
      <div className="mt-5 grid max-w-3xl gap-px border border-sp-border bg-sp-border sm:grid-cols-3">
        <div className="bg-sp-panel p-3"><Activity size={14} className="text-sp-blue"/><div className="mt-3 text-[10px] font-semibold">Fresh state</div><div className="mt-1 text-[9px] leading-4 text-slate-600">Kamino is re-read before preparation.</div></div>
        <div className="bg-sp-panel p-3"><ShieldCheck size={14} className="text-sp-blue"/><div className="mt-3 text-[10px] font-semibold">Wallet review</div><div className="mt-1 text-[9px] leading-4 text-slate-600">StockPass never signs for the user.</div></div>
        <div className="bg-sp-panel p-3"><KeyRound size={14} className="text-sp-blue"/><div className="mt-3 text-[10px] font-semibold">Verified result</div><div className="mt-1 text-[9px] leading-4 text-slate-600">Confirmed transactions are checked again.</div></div>
      </div>
    </div>
    <KaminoActionConsole address={address} walletProvider={walletProvider} positions={positions} onCompleted={onCompleted}/>
  </section>;
}
