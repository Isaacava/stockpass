import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpFromLine, Check, CheckCircle2, ChevronDown,
  CircleDollarSign, CreditCard, LoaderCircle, LockKeyhole, Minus, Plus, RefreshCw,
  ShieldCheck, WalletCards, X,
} from 'lucide-react';
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { type KaminoXStockPosition } from './lib/kamino';
import { refreshWalletSession } from './lib/walletAuth';
import { readWalletSessionToken } from './lib/walletSession';

type WalletProvider={signMessage:(message:Uint8Array)=>Promise<Uint8Array>;signTransaction:<T>(transaction:T)=>Promise<T>};
type ReserveOption={address:string;symbol:string;mint:string;decimals:number;oraclePrice:number};
type PreparedAction={actionId:string;action:ActionType;instructions:Array<{programAddress:string;data:string;accounts:Array<{address:string;signer:boolean;writable:boolean}>}>;lookupTables:string[]};
type ActionType='borrow'|'supply'|'deposit'|'repay'|'withdraw'|'close';

const actionMeta:Record<ActionType,{label:string;description:string;icon:typeof Plus;mutating:boolean}>={
  borrow:{label:'Borrow',description:'Borrow against an existing Kamino obligation.',icon:ArrowUpFromLine,mutating:true},
  supply:{label:'Supply',description:'Deposit an asset into a Kamino reserve.',icon:ArrowDownToLine,mutating:true},
  deposit:{label:'Add collateral',description:'Increase xStock collateral on an obligation.',icon:Plus,mutating:true},
  repay:{label:'Repay',description:'Reduce debt on an existing obligation.',icon:Minus,mutating:true},
  withdraw:{label:'Withdraw',description:'Remove available xStock collateral.',icon:ArrowUpFromLine,mutating:true},
  close:{label:'Close position',description:'Repay debt and withdraw owned collateral.',icon:X,mutating:true},
};

function decodeBase64(value:string){const binary=atob(value||'');const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);return bytes;}
function toBaseUnits(value:string,decimals:number){
  const input=value.trim();
  if(!/^\d+(\.\d+)?$/.test(input)) throw new Error('Enter a positive token amount.');
  const [whole,fraction='']=input.split('.');
  if(fraction.length>decimals) throw new Error('Amount has more decimal places than this reserve supports.');
  const base=BigInt(whole||'0')*(10n**BigInt(decimals))+BigInt(fraction.padEnd(decimals,'0')||'0');
  if(base<=0n) throw new Error('Amount must be greater than zero.');
  return base.toString();
}
async function readResponse(response:Response){
  const text=await response.text();
  let body:any=null;
  try{body=text?JSON.parse(text):null;}catch{}
  if(!response.ok) throw new Error(body?.error??(text?text.slice(0,240):'Server returned an empty response.'));
  return body;
}

export default function KaminoActionConsole({address,walletProvider,positions,onCompleted}:{address:string;walletProvider:WalletProvider|null;positions:KaminoXStockPosition[];onCompleted:()=>Promise<void>|void}){
  const [action,setAction]=useState<ActionType>(positions.length?'borrow':'supply');
  const [reserves,setReserves]=useState<ReserveOption[]>([]);
  const [obligation,setObligation]=useState(positions[0]?.obligation??'');
  const [reserveAddress,setReserveAddress]=useState('');
  const [collateralReserve,setCollateralReserve]=useState('');
  const [repayReserve,setRepayReserve]=useState('');
  const [amount,setAmount]=useState('');
  const [withdrawAmount,setWithdrawAmount]=useState('');
  const [prepared,setPrepared]=useState<PreparedAction|null>(null);
  const [loadingMarkets,setLoadingMarkets]=useState(false);
  const [preparing,setPreparing]=useState(false);
  const [signing,setSigning]=useState(false);
  const [error,setError]=useState('');
  const [verified,setVerified]=useState('');

  const position=useMemo(()=>positions.find(item=>item.obligation===obligation)??positions[0],[positions,obligation]);
  const collateralOptions=position?.xStocks??[];
  const debtOptions=position?.debts??[];
  const marketReserve=reserves.find(item=>item.address===reserveAddress);
  const collateral=collateralOptions.find(item=>item.reserve===collateralReserve)??collateralOptions[0];
  const debt=debtOptions.find(item=>item.reserve===repayReserve)??debtOptions[0];

  useEffect(()=>{if(!obligation&&positions[0])setObligation(positions[0].obligation);},[obligation,positions]);

  useEffect(()=>{
    if(!address)return;
    setLoadingMarkets(true);
    fetch('/api/kamino-market')
      .then(readResponse)
      .then(body=>{const next=Array.isArray(body?.reserves)?body.reserves:[];setReserves(next);if(!reserveAddress&&next[0])setReserveAddress(next[0].address);})
      .catch(cause=>setError(cause instanceof Error?cause.message:'Kamino markets unavailable.'))
      .finally(()=>setLoadingMarkets(false));
  },[address]);

  useEffect(()=>{
    if(action==='deposit'||action==='withdraw'){
      const item=collateralOptions.find(candidate=>candidate.reserve===collateralReserve)??collateralOptions[0];
      if(item){setCollateralReserve(item.reserve);setReserveAddress(item.reserve);if(action==='withdraw'&&!amount)setAmount(String(item.amount));}
    }
    if(action==='repay'){
      const item=debtOptions.find(candidate=>candidate.reserve===repayReserve)??debtOptions[0];
      if(item){setRepayReserve(item.reserve);setReserveAddress(item.reserve);}
    }
    if(action==='close'&&debtOptions[0]&&collateralOptions[0]){
      if(!repayReserve)setRepayReserve(debtOptions[0].reserve);
      if(!collateralReserve)setCollateralReserve(collateralOptions[0].reserve);
      setReserveAddress(repayReserve||debtOptions[0].reserve);
      if(!amount)setAmount(String(debtOptions[0].amount));
      if(!withdrawAmount)setWithdrawAmount(String(collateralOptions[0].amount));
    }
  },[action,collateralOptions,debtOptions,collateralReserve,repayReserve,amount,withdrawAmount]);

  function choose(next:ActionType){
    setAction(next);setPrepared(null);setVerified('');setError('');
    if(next!=='withdraw')setAmount('');
    setWithdrawAmount('');
  }

  async function prepareAction(){
    if(!address||!walletProvider)return;
    setPreparing(true);setError('');setPrepared(null);setVerified('');
    try{
      if(!walletProvider.signMessage)throw new Error('Connected wallet does not support message signing.');
      await refreshWalletSession({publicKey:{toBase58:()=>address},signMessage:walletProvider.signMessage.bind(walletProvider)});
      let targetReserve=reserveAddress;
      let baseUnits='';
      let withdrawBaseUnits:string|undefined;
      if(action==='borrow'||action==='supply'){
        if(!marketReserve)throw new Error('Select a Kamino reserve first.');
        if(action==='borrow'&&!position)throw new Error('Borrow requires an existing Kamino obligation.');
        baseUnits=toBaseUnits(amount,marketReserve.decimals);targetReserve=marketReserve.address;
      }else if(action==='deposit'||action==='withdraw'){
        if(!position||!collateral)throw new Error('Select an xStock collateral reserve.');
        baseUnits=toBaseUnits(amount,collateral.mintDecimals);targetReserve=collateral.reserve;
      }else if(action==='repay'){
        if(!position||!debt)throw new Error('Select a debt reserve.');
        baseUnits=toBaseUnits(amount,debt.mintDecimals);targetReserve=debt.reserve;
      }else{
        if(!position||!debt||!collateral)throw new Error('Close requires both a debt and collateral reserve.');
        baseUnits=toBaseUnits(amount,debt.mintDecimals);withdrawBaseUnits=toBaseUnits(withdrawAmount,collateral.mintDecimals);targetReserve=debt.reserve;
      }
      const token=readWalletSessionToken();
      const body=await readResponse(await fetch('/api/kamino-actions-prepare',{
        method:'POST',
        headers:{'Content-Type':'application/json','x-client-info':token?'stockpass stockpass-session='+token:'stockpass'},
        body:JSON.stringify({action,wallet:address,obligationAddress:action==='supply'?undefined:position?.obligation, reserveAddress:targetReserve,withdrawReserveAddress:action==='close'?collateral?.reserve:undefined,amountBaseUnits:baseUnits,withdrawAmountBaseUnits:withdrawBaseUnits}),
      }));
      if(!body?.actionId||!Array.isArray(body.instructions)||!body.instructions.length)throw new Error('Kamino preparation returned no signable instructions.');
      setPrepared({actionId:body.actionId,action,instructions:body.instructions,lookupTables:body.lookupTables??[]});
    }catch(cause){setError(cause instanceof Error?cause.message:'Kamino action preparation failed.')}
    finally{setPreparing(false);}
  }

  async function signAndVerify(){
    if(!address||!walletProvider||!prepared)return;
    setSigning(true);setError('');setVerified('');
    try{
      const rpcUrl=import.meta.env.VITE_SOLANA_RPC_URL||import.meta.env.VITE_SOLANA_MAINNET_RPC_URL||'';
      if(!rpcUrl)throw new Error('VITE_SOLANA_RPC_URL is not configured.');
      const connection=new Connection(rpcUrl,'confirmed');
      const latest=await connection.getLatestBlockhash('confirmed');
      const instructions=prepared.instructions.map(ix=>new TransactionInstruction({programId:new PublicKey(ix.programAddress),data:Buffer.from(decodeBase64(ix.data)),keys:ix.accounts.map(account=>({pubkey:new PublicKey(account.address),isSigner:account.signer,isWritable:account.writable}))}));
      const lookupTables=[];
      for(const item of prepared.lookupTables){const lookup=await connection.getAddressLookupTable(new PublicKey(item));if(!lookup.value)throw new Error('Kamino lookup table '+item+' is unavailable on mainnet.');lookupTables.push(lookup.value);}
      const message=new TransactionMessage({payerKey:new PublicKey(address),recentBlockhash:latest.blockhash,instructions}).compileToV0Message(lookupTables);
      const transaction=new VersionedTransaction(message);
      const signed=await walletProvider.signTransaction(transaction);
      const signature=await connection.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:2});
      await connection.confirmTransaction({signature,...latest},'confirmed');
      const token=readWalletSessionToken();
      const body=await readResponse(await fetch('/api/kamino-actions-verify',{method:'POST',headers:{'Content-Type':'application/json','x-client-info':token?'stockpass stockpass-session='+token:'stockpass'},body:JSON.stringify({wallet:address,actionId:prepared.actionId,signature})}));
      if(!body?.verified&&body?.ok===false)throw new Error(body?.error||'Transaction confirmed but platform verification failed.');
      setVerified(signature);setPrepared(null);await onCompleted();
    }catch(cause){setError(cause instanceof Error?cause.message:'Wallet signing or verification failed.')}
    finally{setSigning(false);}
  }

  const availableActions=(Object.keys(actionMeta) as ActionType[]).filter(item=>item==='supply'||positions.length>0);
  const current=actionMeta[actionMeta[action]?action:'supply'];
  const fieldLabel=action==='close'?'Debt repayment amount':action==='withdraw'?'Withdrawal amount':'Amount';
  const tokenLabel=action==='borrow'||action==='supply'?(marketReserve?.symbol||'TOKEN'):action==='repay'||action==='close'?(debt?.mint||'DEBT'):(collateral?.symbol||'xStock');

  return <section className="mt-4 overflow-hidden border border-sp-border bg-sp-panel">
    <div className="grid xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-sp-border bg-[#0a1018] xl:border-b-0 xl:border-r">
        <div className="border-b border-sp-border p-4"><div className="font-mono text-[8px] uppercase tracking-[.15em] text-slate-600">Kamino actions</div><div className="mt-2 text-sm font-semibold">Execution workbench</div><div className="mt-1 text-[10px] leading-5 text-slate-600">Every action rebuilds from fresh state before your wallet is asked to sign.</div></div>
        <div className="grid grid-cols-2 gap-1 p-2 xl:grid-cols-1">
          {availableActions.map(item=>{const Icon=actionMeta[item].icon;const active=action===item;return <button key={item} onClick={()=>choose(item)} className={'flex items-center gap-3 border px-3 py-3 text-left '+(active?'border-blue-400/30 bg-blue-400/[.08] text-white':'border-transparent text-slate-500 hover:border-sp-border hover:bg-sp-panel') }><span className={active?'text-sp-blue':'text-slate-600'}><Icon size={15}/></span><span className="min-w-0"><span className="block text-[11px] font-semibold">{actionMeta[item].label}</span><span className="mt-0.5 hidden text-[8px] leading-4 text-slate-600 xl:block">{actionMeta[item].description}</span></span>{active&&<span className="ml-auto size-1 rounded-full bg-sp-blue"/>}</button>})}
        </div>
        <div className="hidden border-t border-sp-border p-4 xl:block"><div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[.13em] text-slate-600"><LockKeyhole size={12}/> Non-custodial</div><div className="mt-2 text-[9px] leading-4 text-slate-600">StockPass prepares instructions. The connected wallet remains the signer.</div></div>
      </aside>

      <div className="min-w-0">
        <div className="border-b border-sp-border p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div><div className="font-mono text-[8px] uppercase tracking-[.16em] text-slate-600">Action / {current.label}</div><h2 className="mt-2 text-xl font-semibold">{current.label}</h2><p className="mt-2 max-w-2xl text-[11px] leading-5 text-slate-500">{current.description} Preparation happens server-side from current Kamino state; signing happens only in your wallet.</p></div>
            <div className="flex items-center gap-2 border border-sp-border bg-sp-panel-2 px-3 py-2"><WalletCards size={14} className="text-sp-blue"/><span className="font-mono text-[8px] uppercase tracking-[.12em] text-slate-600">Wallet approval</span></div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_270px]">
          <div className="p-5 md:p-6">
            {action!=='supply'&&action!=='borrow'&&!positions.length?<div className="flex min-h-52 items-center justify-center text-center"><div><ShieldCheck size={21} className="mx-auto text-slate-600"/><div className="mt-3 text-sm font-semibold">No Kamino obligation loaded</div><div className="mt-1 max-w-sm text-[10px] leading-5 text-slate-600">Supply can operate without an obligation. The other actions require a real discovered position.</div></div></div>:<>
              {(action==='borrow'||action==='supply')&&<Field label="Kamino reserve"><select value={reserveAddress} onChange={e=>setReserveAddress(e.target.value)} className={inputClass()}><option value="">{loadingMarkets?'Loading mainnet reserves…':'Select reserve'}</option>{reserves.map(item=><option key={item.address} value={item.address}>{item.symbol} · {item.decimals} decimals</option>)}</select></Field>}
              {action!=='supply'&&action!=='borrow'&&<Field label="Position"><select value={position?.obligation??''} onChange={e=>{setObligation(e.target.value);setPrepared(null);}} className={inputClass()}>{positions.map(item=><option key={item.obligation} value={item.obligation}>{item.obligation.slice(0,6)}…{item.obligation.slice(-6)} · LTV {item.ltvPct?.toFixed(1)??'—'}%</option>)}</select></Field>}
              {(action==='deposit'||action==='withdraw'||action==='close')&&<Field label="xStock collateral"><select value={collateralReserve} onChange={e=>{setCollateralReserve(e.target.value);if(action!=='close')setReserveAddress(e.target.value)}} className={inputClass()}>{collateralOptions.map(item=><option key={item.reserve} value={item.reserve}>{item.symbol} · {item.amount.toLocaleString(undefined,{maximumFractionDigits:6})} units</option>)}</select></Field>}
              {(action==='repay'||action==='close')&&<Field label="Debt reserve"><select value={repayReserve} onChange={e=>{setRepayReserve(e.target.value);setReserveAddress(e.target.value)}} className={inputClass()}>{debtOptions.map(item=><option key={item.reserve} value={item.reserve}>{item.mint.slice(0,5)}…{item.mint.slice(-4)} · {item.amount.toLocaleString(undefined,{maximumFractionDigits:6})} units</option>)}</select></Field>}

              <Field label={fieldLabel}>
                <div className="flex overflow-hidden border border-sp-border bg-[#0a111b] focus-within:border-sp-blue/60">
                  <input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="sp-num min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-slate-700"/>
                  <span className="grid min-w-24 place-items-center border-l border-sp-border px-3 font-mono text-[9px] text-slate-500">{tokenLabel}</span>
                </div>
              </Field>

              {action==='close'&&<Field label="Collateral withdrawal amount"><div className="flex overflow-hidden border border-sp-border bg-[#0a111b] focus-within:border-sp-blue/60"><input value={withdrawAmount} onChange={e=>setWithdrawAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="sp-num min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-slate-700"/><span className="grid min-w-24 place-items-center border-l border-sp-border px-3 font-mono text-[9px] text-slate-500">{collateral?.symbol||'xStock'}</span></div></Field>}

              <div className="mt-6 flex flex-col gap-3 border-t border-sp-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="text-[11px] font-semibold text-slate-200">Prepare from fresh state</div><div className="mt-1 text-[9px] text-slate-600">No transaction is sent during preparation.</div></div>
                <button onClick={()=>void prepareAction()} disabled={preparing||signing} className="inline-flex h-10 items-center justify-center gap-2 bg-white px-4 text-[11px] font-semibold text-slate-950">{preparing?<><LoaderCircle size={14} className="animate-spin"/>Preparing</>:<>Prepare transaction <ArrowRight size={13}/></>}</button>
              </div>
            </>}
          </div>

          <aside className="border-t border-sp-border bg-[#0a1018] p-5 lg:border-l lg:border-t-0 md:p-6">
            <div className="font-mono text-[8px] uppercase tracking-[.15em] text-slate-600">Transaction preview</div>
            <div className="mt-4 space-y-3">
              <SummaryRow label="Action" value={current.label}/>
              <SummaryRow label="Network" value="Solana mainnet"/>
              <SummaryRow label="Protocol" value="Kamino"/>
              <SummaryRow label="Custody" value="None"/>
            </div>
            <div className="mt-5 border-t border-sp-border pt-4"><div className="flex items-center gap-2 text-[9px] font-semibold text-slate-300"><LockKeyhole size={12} className="text-sp-blue"/> Wallet signs every fund movement</div><p className="mt-2 text-[9px] leading-4 text-slate-600">StockPass does not receive or hold the assets involved in this action.</p></div>
          </aside>
        </div>

        {prepared&&<div className="border-t border-blue-400/20 bg-blue-400/[.05] p-5 md:flex md:items-center md:justify-between md:gap-5"><div className="flex items-start gap-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-sp-blue"/><div><div className="font-mono text-[8px] uppercase tracking-[.14em] text-blue-200/60">Ready for wallet review</div><div className="mt-1 text-sm font-semibold">{actionMeta[prepared.action].label} prepared</div><div className="mt-1 text-[9px] text-slate-600">{prepared.instructions.length} instructions · {prepared.lookupTables.length} lookup tables · action {prepared.actionId.slice(0,8)}…</div></div></div><button onClick={()=>void signAndVerify()} disabled={signing} className="mt-4 inline-flex h-10 items-center justify-center gap-2 bg-white px-4 text-[11px] font-semibold text-slate-950 md:mt-0">{signing?<><LoaderCircle size={14} className="animate-spin"/>Waiting for wallet</>:<>Review & sign <ArrowRight size={13}/></>}</button></div>}

        {verified&&<div className="border-t border-emerald-400/20 bg-emerald-400/[.04] p-5"><div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-200"><CheckCircle2 size={15}/> Verified on Solana mainnet</div><div className="sp-num mt-2 break-all text-[9px] text-slate-600">{verified}</div></div>}
        {error&&<div className="border-t border-rose-400/20 bg-rose-400/[.05] p-5"><div className="flex items-start gap-3 text-rose-200"><CircleDollarSign size={16} className="mt-0.5 shrink-0"/><div><div className="text-[11px] font-semibold">Action unavailable</div><div className="mt-1 break-words text-[10px] leading-5 text-rose-200/65">{error}</div></div></div></div>}
      </div>
    </div>
  </section>;
}

function inputClass(){return 'w-full border border-sp-border bg-[#0a111b] px-3 py-3 text-[11px] text-slate-200 outline-none focus:border-sp-blue/60';}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="mt-4 block"><span className="font-mono text-[8px] uppercase tracking-[.14em] text-slate-600">{label}</span><div className="mt-2">{children}</div></label>;}
function SummaryRow({label,value}:{label:string;value:string}){return <div className="flex items-center justify-between border-b border-sp-border pb-3 text-[10px] last:border-0"><span className="text-slate-600">{label}</span><span className="text-slate-300">{value}</span></div>;}
