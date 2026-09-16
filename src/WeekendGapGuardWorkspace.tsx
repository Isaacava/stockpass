import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, CircleHelp, Gauge, LoaderCircle, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import type { Provider } from '@reown/appkit-adapter-solana';
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { discoverKaminoXStockPositions, type KaminoXStockPosition } from './lib/kamino';
import { calculateCollateralUsdForTargetLtv, evaluateWeekendRisk } from './lib/wggRisk';
import { fetchPythPrices, fetchWeekendGapSummaries, type PythPriceMap, type WeekendGapMap } from './lib/pyth';
import { supabase } from './lib/supabase';
import './weekend-gap-guard.css';

const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

type PreparedInstruction = {
  programAddress: string;
  data: string;
  accounts: Array<{ address: string; signer: boolean; writable: boolean }>;
};
type Prepared = {
  symbol: string;
  amountBaseUnits: string;
  instructionCount: number;
  instructions: PreparedInstruction[];
  lookupTables: string[];
} | null;
type Row = {
  position: KaminoXStockPosition;
  stock: KaminoXStockPosition['xStocks'][number];
  symbol: string;
  gap?: WeekendGapMap[string];
  risk: ReturnType<typeof evaluateWeekendRisk> | null;
  price?: PythPriceMap[string];
};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default function WeekendGapGuardWorkspace() {
  const { open } = useAppKit();
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const { address, isConnected } = useAppKitAccount();
  const [positions, setPositions] = useState<KaminoXStockPosition[]>([]);
  const [pythPrices, setPythPrices] = useState<PythPriceMap>({});
  const [weekendGaps, setWeekendGaps] = useState<WeekendGapMap>({});
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [prepared, setPrepared] = useState<Prepared>(null);
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const rows = useMemo<Row[]>(() => positions.flatMap((position) => position.xStocks.map((stock) => {
    const symbol = stock.symbol.replace(/x$/i, '');
    const gap = weekendGaps[symbol];
    const risk = position.liquidationBufferPct != null && gap?.typicalWeekendGapPct != null
      ? evaluateWeekendRisk({ currentBufferPct: position.liquidationBufferPct, typicalWeekendGapPct: gap.typicalWeekendGapPct })
      : null;
    return { position, stock, symbol, gap, risk, price: pythPrices[symbol] };
  })), [positions, weekendGaps, pythPrices]);

  const counts = rows.reduce((acc, row) => {
    if (row.risk?.status === 'flagged') acc.flagged += 1;
    else if (row.risk?.status === 'watch') acc.watch += 1;
    else if (row.risk?.status === 'safe') acc.safe += 1;
    return acc;
  }, { flagged: 0, watch: 0, safe: 0 });

  async function scan() {
    if (!address) return;
    setLoading(true); setError(''); setPrepared(null); setSignature('');
    try {
      const discovered = await discoverKaminoXStockPositions(address, endpoint);
      setPositions(discovered);
      const symbols = Array.from(new Set(discovered.flatMap((p) => p.xStocks.map((s) => s.symbol.replace(/x$/i, '')))));
      if (!symbols.length) {
        setPythPrices({});
        setWeekendGaps({});
      } else {
        const [prices, gaps] = await Promise.allSettled([fetchPythPrices(symbols), fetchWeekendGapSummaries(symbols, 13)]);
        setPythPrices(prices.status === 'fulfilled' ? prices.value : {});
        setWeekendGaps(gaps.status === 'fulfilled' ? gaps.value : {});
        if (prices.status === 'rejected' && gaps.status === 'rejected') setError('Kamino loaded, but the Pyth pricing and weekend-gap services are unavailable.');
      }
      setLastLoaded(new Date());
    } catch (e) {
      setPositions([]); setPythPrices({}); setWeekendGaps({});
      setError(e instanceof Error ? e.message : 'Kamino scan failed.');
    } finally { setLoading(false); }
  }

  async function prepareFix(row: Row) {
    if (!address || !row.price || !row.gap || row.position.liquidationLtvPct == null || row.position.liquidationBufferPct == null) return;
    const typicalGap = row.gap.typicalWeekendGapPct ?? 0;
    const risk = evaluateWeekendRisk({ currentBufferPct: row.position.liquidationBufferPct, typicalWeekendGapPct: typicalGap });
    if (risk.status !== 'flagged') return;
    const targetLtvPct = Math.max(1, row.position.liquidationLtvPct - risk.adjustedGapPct * 1.2);
    const neededUsd = calculateCollateralUsdForTargetLtv(row.position.borrowValueUsd ?? 0, row.position.depositValueUsd ?? 0, targetLtvPct);
    const tokenAmount = neededUsd / row.price.price;
    const amountBaseUnits = BigInt(Math.ceil(tokenAmount * 10 ** row.stock.mintDecimals)).toString();
    if (amountBaseUnits === '0') return;
    setPreparing(true); setError(''); setPrepared(null); setSignature('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('wgg-protection-prepare', {
        body: { wallet: address, obligationAddress: row.position.obligation, reserveAddress: row.stock.reserve, amountBaseUnits, kind: 'deposit', rpcUrl: endpoint },
      });
      if (fnError) throw fnError;
      const payload = data as { instructions?: PreparedInstruction[]; lookupTables?: string[] } | null;
      if (!payload?.instructions?.length) throw new Error('Protection service returned no instructions.');
      setPrepared({ symbol: row.symbol, amountBaseUnits, instructionCount: payload.instructions.length, instructions: payload.instructions, lookupTables: payload.lookupTables ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Protection preparation is not available yet.');
    } finally { setPreparing(false); }
  }

  async function signAndSendPrepared() {
    if (!address || !prepared || !walletProvider) return;
    setSigning(true); setError(''); setSignature('');
    try {
      const connection = new Connection(endpoint, 'confirmed');
      const latest = await connection.getLatestBlockhash('confirmed');
      const instructions = prepared.instructions.map((ix) => new TransactionInstruction({
        programId: new PublicKey(ix.programAddress), data: decodeBase64(ix.data),
        keys: ix.accounts.map((account) => ({ pubkey: new PublicKey(account.address), isSigner: account.signer, isWritable: account.writable })),
      }));
      const lookupTables = [];
      for (const lookupTableAddress of prepared.lookupTables) {
        const result = await connection.getAddressLookupTable(new PublicKey(lookupTableAddress));
        if (!result.value) throw new Error(`Kamino lookup table ${lookupTableAddress} is unavailable on mainnet.`);
        lookupTables.push(result.value);
      }
      const message = new TransactionMessage({ payerKey: new PublicKey(address), recentBlockhash: latest.blockhash, instructions }).compileToV0Message(lookupTables);
      const transaction = new VersionedTransaction(message);
      const signed = await walletProvider.signTransaction(transaction as never) as unknown as VersionedTransaction;
      const txSignature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 2 });
      await connection.confirmTransaction({ signature: txSignature, ...latest }, 'confirmed');
      setSignature(txSignature);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wallet signing or transaction submission failed.');
    } finally { setSigning(false); }
  }

  return <div className="wgg-app">
    <header className="wgg-header">
      <div className="wgg-brand"><span className="wgg-mark">WG</span><div><strong>Weekend Gap Guard</strong><small>risk protection for xStock collateral</small></div></div>
      <div className="wgg-header-right"><span className="wgg-mainnet"><i /> SOLANA MAINNET</span>{isConnected ? <div className="wgg-wallet"><Wallet size={14} />{address ? `${address.slice(0, 4)}…${address.slice(-4)}` : 'Connected'}</div> : <button className="wgg-connect" onClick={() => void open()}>Connect wallet</button>}</div>
    </header>
    <main className="wgg-main">
      <section className="wgg-hero">
        <div className="wgg-hero-copy"><div className="wgg-eyebrow"><span /> WEEKEND RISK MONITOR</div><h1>Know the gap<br /><em>before Monday.</em></h1><p>Read real Kamino xStock collateral, compare the live liquidation buffer with historical weekend-gap risk, and prepare a specific protection action.</p><div className="wgg-hero-actions">{!isConnected ? <button className="wgg-primary" onClick={() => void open()}>Connect wallet <ArrowRight size={15} /></button> : <button className="wgg-primary" onClick={() => void scan()} disabled={loading}>{loading ? <><LoaderCircle size={15} className="wgg-spin" /> Scanning</> : <>Scan my Kamino positions <ArrowRight size={15} /></>}</button>}<span className="wgg-hero-note"><ShieldCheck size={14} /> Read-only monitoring · fixes require wallet approval</span></div></div>
        <div className="wgg-hero-card"><div className="wgg-card-top"><span>FRIDAY CHECK</span><span className="wgg-status-dot"><i /> {loading ? 'SCANNING' : isConnected ? 'READY' : 'WAITING'}</span></div><div className="wgg-risk-meter"><div style={{ width: `${isConnected ? Math.max(8, 100 - counts.flagged * 25 - counts.watch * 10) : 12}%` }} /></div><div className="wgg-meter-label"><span>Protection signal</span><strong>{counts.flagged ? `${counts.flagged} flagged` : counts.watch ? `${counts.watch} on watch` : rows.length ? 'Gap model loaded' : 'Waiting for scan'}</strong></div><div className="wgg-card-rule"><span>xStock rows</span><b>{rows.length || '—'}</b></div><div className="wgg-card-rule"><span>Flagged</span><b>{counts.flagged || '—'}</b></div><div className="wgg-card-rule"><span>Watch</span><b>{counts.watch || '—'}</b></div></div>
      </section>
      <section className="wgg-principles"><div><Gauge size={18} /><div><strong>Independent Pyth signal</strong><span>Live equity pricing stays separate from Kamino account state.</span></div></div><div><Bell size={18} /><div><strong>Historical gap check</strong><span>Thirteen weeks of Friday-close to next-session-open observations feed the model.</span></div></div><div><ShieldCheck size={18} /><div><strong>Controlled protection</strong><span>A flagged position gets a specific action amount calculated before approval.</span></div></div></section>
      {isConnected && <section className="wgg-dashboard">
        <div className="wgg-section-head"><div><div className="wgg-eyebrow">REAL KAMINO + PYTH DATA</div><h2>Your xStock-backed obligations.</h2><p>{lastLoaded ? `Mainnet scan completed ${lastLoaded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'Scan the current Kamino Main Market to load real positions.'}</p></div><button className="wgg-secondary" onClick={() => void scan()} disabled={loading}><RefreshCw size={14} /> Refresh</button></div>
        {error && <div className="wgg-error"><AlertTriangle size={18} /><div><strong>Action unavailable</strong><span>{error}</span></div></div>}
        {prepared && <div className="wgg-empty"><ShieldCheck size={21} /><strong>Protection action prepared</strong><span>{prepared.symbol} deposit · {prepared.amountBaseUnits} base units · {prepared.instructionCount} instructions. Review it in your wallet before approval.</span><button className="wgg-primary" onClick={() => void signAndSendPrepared()} disabled={signing}>{signing ? <><LoaderCircle size={14} className="wgg-spin" /> Waiting for wallet</> : <>Review & sign <ArrowRight size={14} /></>}</button>{signature && <span>Confirmed transaction: {signature}</span>}</div>}
        {!loading && positions.length === 0 && <div className="wgg-empty"><AlertTriangle size={21} /><strong>No xStock-backed Kamino obligation found</strong><span>The scan completed against mainnet and no fake position was inserted.</span></div>}
        {loading && <div className="wgg-empty"><LoaderCircle size={21} className="wgg-spin" /><strong>Reading Kamino, Pyth and weekend history</strong><span>This is a read-only mainnet scan.</span></div>}
        {!loading && positions.length > 0 && <div className="wgg-position-list">{positions.map((position) => {
          const leadSymbol = position.xStocks[0]?.symbol.replace(/x$/i, '');
          const leadGap = leadSymbol ? weekendGaps[leadSymbol] : undefined;
          return <article className="wgg-position-card" key={position.obligation}>
            <div className="wgg-position-head"><div><span className="wgg-position-label">OBLIGATION</span><strong>{position.obligation.slice(0, 6)}…{position.obligation.slice(-6)}</strong></div><span className="wgg-ltv">LTV {position.ltvPct != null ? `${position.ltvPct.toFixed(2)}%` : '—'}</span></div>
            <div className="wgg-xstock-list">{position.xStocks.map((stock) => {
              const row = rows.find((candidate) => candidate.position.obligation === position.obligation && candidate.stock.mint === stock.mint);
              const risk = row?.risk;
              return <div className="wgg-xstock-row" key={`${position.obligation}-${stock.mint}`}><span className="wgg-xstock-icon">{row?.symbol.slice(0, 4)}</span><div><strong>{stock.symbol}</strong><span>{stock.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} collateral units</span></div><div className="wgg-xstock-status"><span>{row?.price ? `$${row.price.price.toFixed(2)} Pyth` : 'Pyth pending'}</span>{risk && <strong>{risk.status.toUpperCase()}</strong>}</div>{row && risk?.status === 'flagged' && <button className="wgg-secondary" onClick={() => void prepareFix(row)} disabled={preparing}>{preparing ? <LoaderCircle size={13} className="wgg-spin" /> : <ShieldCheck size={13} />} Prepare fix</button>}</div>;
            })}</div>
            <div className="wgg-position-metrics"><div><span>Liquidation LTV</span><strong>{position.liquidationLtvPct != null ? `${position.liquidationLtvPct.toFixed(2)}%` : '—'}</strong></div><div><span>Current buffer</span><strong>{position.liquidationBufferPct != null ? `${position.liquidationBufferPct.toFixed(2)} pts` : '—'}</strong></div><div><span>Typical weekend gap</span><strong>{leadGap?.typicalWeekendGapPct != null ? `${leadGap.typicalWeekendGapPct.toFixed(2)}%` : '—'}</strong></div><div><span>Borrow value</span><strong>{position.borrowValueUsd != null ? `$${position.borrowValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</strong></div></div>
          </article>;
        })}</div>}
      </section>}
      <section className="wgg-explain"><div><div className="wgg-eyebrow">HOW IT WORKS</div><h2>Not a lending protocol.<br />A protection layer.</h2></div><div className="wgg-steps"><article><b>01</b><strong>Discover</strong><span>Read the wallet's real Kamino obligations.</span></article><article><b>02</b><strong>Assess</strong><span>Measure the live buffer against the historical gap model.</span></article><article><b>03</b><strong>Protect</strong><span>Prepare a specific Kamino action for controlled approval.</span></article></div></section>
      <footer className="wgg-footer"><span>Weekend Gap Guard</span><span>Solana mainnet · Kamino overlay · no custody</span><span><CircleHelp size={12} /> No demo balance is presented as real.</span></footer>
    </main>
  </div>;
}
