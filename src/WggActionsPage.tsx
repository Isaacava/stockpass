import { LockKeyhole } from 'lucide-react';
import KaminoActionConsole from './KaminoActionConsole';
import type { KaminoXStockPosition } from './lib/kamino';

type WalletProvider = { signMessage:(message:Uint8Array)=>Promise<Uint8Array>; signTransaction:<T>(transaction:T)=>Promise<T>; };

export default function WggActionsPage({address,walletProvider,positions,onCompleted}:{address:string;walletProvider:WalletProvider|null;positions:KaminoXStockPosition[];onCompleted:()=>Promise<void>|void}) {
  return <section className="sp-page">
    <header className="sp-page-head"><div><div className="sp-overline"><span /> KAMINO / EXECUTION</div><h1>Actions</h1><p>Every fund-moving operation is prepared from fresh Kamino state and then approved by the connected wallet. StockPass never receives custody.</p></div><div className="sp-status-stamp sp-page-status-safe"><LockKeyhole size={14}/> NON-CUSTODIAL</div></header>
    <KaminoActionConsole address={address} walletProvider={walletProvider} positions={positions} onCompleted={onCompleted}/>
  </section>;
}
