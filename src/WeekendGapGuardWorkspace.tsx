import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, CircleHelp, Gauge, LoaderCircle, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import type { KaminoXStockPosition } from './lib/kamino';
import KaminoActionConsole from './KaminoActionConsole';
import { calculateCollateralUsdForTargetLtv, evaluateWeekendRisk } from './lib/wggRisk';
import { fetchWggMarketData, type XStockPriceMap, type WeekendGapMap } from './lib/wggMarketData';
import { clearWalletSession, refreshWalletSession } from './lib/walletAuth';
import { readWalletSessionToken } from './lib/walletSession';
import './weekend-gap-guard.css';

const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || '';

type WggWalletProvider = {
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: <T>(transaction: T) => Promise<T>;
};

type PreparedInstruction = {
  programAddress: string;
  data: string;
  accounts: Array<{ address: string; signer: boolean; writable: boolean }>;
};
type Prepared = {
  kind: 'deposit' | 'repay';
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
  price?: XStockPriceMap[string];
};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default function WeekendGapGuardWorkspace() {
  const { open } = useAppKit();
  const { walletProvider } = useAppKitProvider<WggWalletProvider>('solana');
  const { address, isConnected } = useAppKitAccount({ namespace: 'solana' });
  const [positions, setPositions] = useState<KaminoXStockPosition[]>([]);
  const [marketPrices, setMarketPrices] = useState<XStockPriceMap>({});
  const [weekendGaps, setWeekendGaps] = useState<WeekendGapMap>({});
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [signing, setSigning] = useState(false);
  const [prepared, setPrepared] = useState<Prepared>(null);
  const [signature, setSignature] = useState('');
  const [error, setError] = useState('');
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [authStatus, setAuthStatus] = useState<'signed_out' | 'authenticating' | 'authenticated' | 'error'>('signed_out');
  const [authError, setAuthError] = useState('');

  const rows = useMemo<Row[]>(() => positions.flatMap((position) => position.xStocks.map((stock) => {
    const symbol = stock.symbol.replace(/x$/i, '');
    const gap = weekendGaps[stock.symbol];
    const risk = position.ltvPct != null && position.liquidationLtvPct != null && gap?.typicalWeekendGapPct != null
      ? evaluateWeekendRisk({ currentLtvPct: position.ltvPct, liquidationLtvPct: position.liquidationLtvPct, typicalWeekendGapPct: gap.typicalWeekendGapPct })
      : null;
    return { position, stock, symbol, gap, risk, price: marketPrices[stock.symbol] };
  })), [positions, weekendGaps, marketPrices]);

  const counts = rows.reduce((acc, row) => {
    if (row.risk?.status === 'flagged') acc.flagged += 1;
    else if (row.risk?.status === 'watch') acc.watch += 1;
    else if (row.risk?.status === 'safe') acc.safe += 1;
    return acc;
  }, { flagged: 0, watch: 0, safe: 0 });

  async function authenticateCurrentWallet() {
    if (!address || !walletProvider?.signMessage) {
      setAuthStatus('error');
      setAuthError('Your Solana wallet connected, but message signing is not available yet.');
      return;
    }
    setAuthStatus('authenticating');
    setAuthError('');
    try {
      await refreshWalletSession({
        publicKey: { toBase58: () => address },
        signMessage: walletProvider.signMessage.bind(walletProvider),
      });
      setAuthStatus('authenticated');
    } catch (e) {
      clearWalletSession();
      setAuthStatus('error');
      setAuthError(e instanceof Error ? e.message : 'Wallet authentication failed.');
    }
  }

  useEffect(() => {
    if (!isConnected || !address) {
      clearWalletSession();
      setAuthStatus('signed_out');
      setAuthError('');
      return;
    }
    if (authStatus === 'authenticated' || authStatus === 'authenticating') return;
    if (!walletProvider?.signMessage) return;
    void authenticateCurrentWallet();
  }, [address, isConnected, walletProvider]);

  async function scan() {
    if (!address) return;
    if (!endpoint) { setError('VITE_SOLANA_RPC_URL is not configured.'); return; }
    setLoading(true); setError(''); setPrepared(null); setSignature('');
    try {
      const { discoverKaminoXStockPositions } = await import('./lib/kamino');
      const discovered = await discoverKaminoXStockPositions(address, endpoint);
      setPositions(discovered);
      const symbols = Array.from(new Set(discovered.flatMap((p) => p.xStocks.map((s) => s.symbol))));
      if (!symbols.length) {
        setMarketPrices({});
        setWeekendGaps({});
      } else {
        const market = await fetchWggMarketData(symbols, 13);
        setMarketPrices(market.prices ?? {});
        setWeekendGaps(market.weekendGaps ?? {});
        if ((market.unavailable ?? []).length && Object.keys(market.weekendGaps ?? {}).length === 0) {
          const firstUnavailable = market.unavailable?.[0]?.reason ?? 'Historical market data is unavailable.';
          setError(`Kamino loaded, but weekend-gap history is unavailable: ${firstUnavailable}`);
        }
      }
      setLastLoaded(new Date());
    } catch (e) {
      setPositions([]); setMarketPrices({}); setWeekendGaps({});
      setError(e instanceof Error ? e.message : 'Kamino scan failed.');
    } finally { setLoading(false); }
  }

  async function prepareFix(row: Row, kind: 'deposit' | 'repay') {
    if (!address || !row.gap || row.position.ltvPct == null || row.position.liquidationLtvPct == null) return;
    const typicalGap = row.gap.typicalWeekendGapPct ?? 0;
    const risk = evaluateWeekendRisk({ currentLtvPct: row.position.ltvPct, liquidationLtvPct: row.position.liquidationLtvPct, typicalWeekendGapPct: typicalGap });
    if (risk.status !== 'flagged') return;
    const remainingCollateralFactor = Math.max(0.01, 1 - risk.adjustedGapPct / 100);
    const targetLtvPct = Math.max(1, row.position.liquidationLtvPct * remainingCollateralFactor * 0.98);
    let amountBaseUnits = '';
    if (kind === 'deposit') {
      if (!row.price || row.price.multiplier == null || row.price.multiplier <= 0) throw new Error('Current xStocks multiplier is unavailable; refusing to prepare an unsafe raw-token amount.');
      const neededUsd = calculateCollateralUsdForTargetLtv(row.position.borrowValueUsd ?? 0, row.position.depositValueUsd ?? 0, targetLtvPct);
      const scaledTokenAmount = neededUsd / row.price.price;
      const rawTokenAmount = scaledTokenAmount / row.price.multiplier;
      amountBaseUnits = BigInt(Math.ceil(rawTokenAmount * 10 ** row.stock.mintDecimals)).toString();
      if (amountBaseUnits === '0') return;
    }

    setPreparing(true); setAuthenticating(true); setError(''); setPrepared(null); setSignature('');
    try {
      if (!walletProvider?.signMessage) throw new Error('Connected wallet does not support message signing.');
      await refreshWalletSession({
        publicKey: { toBase58: () => address },
        signMessage: walletProvider.signMessage.bind(walletProvider),
      });
      setAuthenticating(false);
      const sessionToken = readWalletSessionToken();
      const clientInfo = sessionToken ? `stockpass stockpass-session=${sessionToken}` : 'stockpass';
      const response = await fetch('/api/wgg-protection-prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-info': clientInfo },
        body: JSON.stringify({
          wallet: address,
          obligationAddress: row.position.obligation,
          reserveAddress: kind === 'repay'
            ? (row.position.debts[0]?.reserve ?? '')
            : row.stock.reserve,
          amountBaseUnits,
          targetLtvPct,
          kind,
        }),
      });
      const data = await response.json().catch(() => null) as {
        error?: string;
        instructions?: PreparedInstruction[];
        lookupTables?: string[];
        amountBaseUnits?: string;
        repayUsd?: number;
        targetLtvPct?: number;
      } | null;
      if (!response.ok) throw new Error(data?.error ?? 'Protection preparation failed.');
      const payload = data;
      if (!payload?.instructions?.length) throw new Error('Protection service returned no instructions.');
      if (kind === 'repay' && !data?.amountBaseUnits) throw new Error('Protection service returned no computed repay amount.');
      setPrepared({
        kind,
        symbol: kind === 'repay' ? (row.position.debts[0]?.mint ?? 'Debt') : row.symbol,
        amountBaseUnits: data?.amountBaseUnits ?? amountBaseUnits,
        instructionCount: payload.instructions.length,
        instructions: payload.instructions,
        lookupTables: payload.lookupTables ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Protection preparation is not available yet.');
    } finally { setPreparing(false); setAuthenticating(false); }
  }

  async function signAndSendPrepared() {
    if (!address || !prepared || !walletProvider) return;
    setSigning(true); setError(''); setSignature('');
    try {
      const connection = new Connection(endpoint, 'confirmed');
      const latest = await connection.getLatestBlockhash('confirmed');
      const instructions = prepared.instructions.map((ix) => new TransactionInstruction({
        programId: new PublicKey(ix.programAddress), data: Buffer.from(decodeBase64(ix.data)),
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
      const signed = await walletProvider.signTransaction(transaction);
      const txSignature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 2 });
      await connection.confirmTransaction({ signature: txSignature, ...latest }, 'confirmed');
      setSignature(txSignature);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wallet signing or transaction submission failed.');
    } finally { setSigning(false); }
  }

  const authenticated = isConnected && authStatus === 'authenticated';

  return <div className="wgg-app">
    <header className="wgg-header">
      <div className="wgg-brand"><span className="wgg-mark">WG</span><div><strong>Weekend Gap Guard</strong><small>risk protection for xStock collateral</small></div></div>
      <div className="wgg-header-right"><span className="wgg-mainnet"><i /> SOLANA MAINNET</span>{authenticated ? <div className="wgg-wallet"><Wallet size={14} />{address ? `${address.slice(0, 4)}…${address.slice(-4)}` : 'Connected'}</div> : <button className="wgg-connect" onClick={() => authenticated ? undefined : (!isConnected ? void open({ view: 'Connect', namespace: 'solana' }) : void authenticateCurrentWallet())} disabled={authStatus === 'authenticating'}>{authStatus === 'authenticating' ? 'Authenticating…' : isConnected ? 'Sign to enter' : 'Connect wallet'}</button>}</div>
    </header>
    <main className="wgg-main">
      <section className="wgg-hero">
        <div className="wgg-hero-copy"><div className="wgg-eyebrow"><span /> TOKENIZED-EQUITY DEFI / WEEKEND GUARD</div><h1>Stress the position<br /><em>before Monday.</em></h1><p>StockPass reads the real Kamino position, applies a historical downside shock from the xStock's Friday-to-next-session gap, and shows the resulting LTV before you approve any protection action.</p><div className="wgg-hero-actions">{!isConnected ? <button className="wgg-primary" onClick={() => void open()}>Connect wallet <ArrowRight size={15} /></button> : <button className="wgg-primary" onClick={() => void scan()} disabled={loading}>{loading ? <><LoaderCircle size={15} className="wgg-spin" /> Scanning</> : <>Scan my Kamino positions <ArrowRight size={15} /></>}</button>}<span className="wgg-hero-note"><ShieldCheck size={14} /> {!isConnected ? 'Wallet signature is required before the risk workspace unlocks.' : authStatus === 'authenticating' ? 'Approve the StockPass authentication message in your wallet.' : authStatus === 'error' ? authError : 'Authenticated wallet · monitoring is read-only; protection actions require approval.'}</span></div></div>
        <div className="wgg-hero-card"><div className="wgg-card-top"><span>FRIDAY CHECK</span><span className="wgg-status-dot"><i /> {loading ? 'SCANNING' : isConnected ? 'READY' : 'WAITING'}</span></div><div className="wgg-risk-meter"><div style={{ width: `${isConnected ? Math.max(8, 100 - counts.flagged * 25 - counts.watch * 10) : 12}%` }} /></div><div className="wgg-meter-label"><span>Protection signal</span><strong>{counts.flagged ? `${counts.flagged} flagged` : counts.watch ? `${counts.watch} on watch` : rows.length ? 'Gap model loaded' : 'Waiting for scan'}</strong></div><div className="wgg-card-rule"><span>xStock rows</span><b>{rows.length || '—'}</b></div><div className="wgg-card-rule"><span>Flagged</span><b>{counts.flagged || '—'}</b></div><div className="wgg-card-rule"><span>Watch</span><b>{counts.watch || '—'}</b></div></div>
      </section>
      <section className="wgg-principles"><div><Gauge size={18} /><div><strong>Real Kamino state</strong><span>Collateral, debt and liquidation parameters come from the connected wallet's mainnet obligation.</span></div></div><div><Bell size={18} /><div><strong>Price-shock scenario</strong><span>Historical downside gaps are applied to the current LTV to produce a stressed-LTV scenario.</span></div></div><div><ShieldCheck size={18} /><div><strong>Wallet-approved protection</strong><span>StockPass prepares the Kamino action; the wallet remains the final authority on every fund-moving transaction.</span></div></div></section>
      {authenticated && <section className="wgg-dashboard">
        <div className="wgg-section-head"><div><div className="wgg-eyebrow">REAL KAMINO + XSTOCKS DATA</div><h2>Your position under stress.</h2><p>{lastLoaded ? `Mainnet scan completed ${lastLoaded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. WGG models the historical downside scenario against the live LTV.` : 'Scan the current Kamino Main Market to load real positions and run the weekend scenario.'}</p></div><button className="wgg-secondary" onClick={() => void scan()} disabled={loading}><RefreshCw size={14} /> Refresh</button></div>
        {error && <div className="wgg-error"><AlertTriangle size={18} /><div><strong>Action unavailable</strong><span>{error}</span></div></div>}
        {prepared && <div className="wgg-empty"><ShieldCheck size={21} /><strong>Protection action prepared</strong><span>{prepared.symbol} {prepared.kind} · {prepared.amountBaseUnits} base units · {prepared.instructionCount} instructions. Review it in your wallet before approval.</span><button className="wgg-primary" onClick={() => void signAndSendPrepared()} disabled={signing}>{signing ? <><LoaderCircle size={14} className="wgg-spin" /> Waiting for wallet</> : <>Review & sign <ArrowRight size={14} /></>}</button>{signature && <span>Confirmed transaction: {signature}</span>}</div>}
        {!loading && positions.length === 0 && <div className="wgg-empty"><AlertTriangle size={21} /><strong>No xStock-backed Kamino obligation found</strong><span>The scan completed against mainnet and no fake position was inserted.</span></div>}
        {loading && <div className="wgg-empty"><LoaderCircle size={21} className="wgg-spin" /><strong>Reading Kamino, xStocks and weekend history</strong><span>This is a read-only mainnet scan.</span></div>}
        {!loading && positions.length > 0 && <div className="wgg-position-list">{positions.map((position) => {
          const leadSymbol = position.xStocks[0]?.symbol;
          const leadGap = leadSymbol ? weekendGaps[leadSymbol] : undefined;
          return <article className="wgg-position-card" key={position.obligation}>
            <div className="wgg-position-head"><div><span className="wgg-position-label">OBLIGATION</span><strong>{position.obligation.slice(0, 6)}…{position.obligation.slice(-6)}</strong></div><span className="wgg-ltv">LTV {position.ltvPct != null ? `${position.ltvPct.toFixed(2)}%` : '—'}</span></div>
            <div className="wgg-xstock-list">{position.xStocks.map((stock) => {
              const row = rows.find((candidate) => candidate.position.obligation === position.obligation && candidate.stock.mint === stock.mint);
              const risk = row?.risk;
              return <div className="wgg-xstock-row" key={`${position.obligation}-${stock.mint}`}><span className="wgg-xstock-icon">{row?.symbol.slice(0, 4)}</span><div><strong>{stock.symbol}</strong><span>{stock.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} Kamino collateral units</span></div><div className="wgg-xstock-status"><span>{row?.price ? `$${row.price.price.toFixed(2)} xStocks` : 'xStocks price unavailable'}</span>{risk && <strong>{risk.status.toUpperCase()}</strong>}</div>{row && risk?.status === 'flagged' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
  <button className="wgg-secondary" onClick={() => void prepareFix(row, 'deposit')} disabled={preparing}>
    {preparing ? <LoaderCircle size={13} className="wgg-spin" /> : <ShieldCheck size={13} />} {authenticating ? 'Verify wallet' : 'Add collateral'}
  </button>
  {row.position.debts.length > 0 && <button className="wgg-secondary" onClick={() => void prepareFix(row, 'repay')} disabled={preparing}>
    {preparing ? <LoaderCircle size={13} className="wgg-spin" /> : <ShieldCheck size={13} />} {authenticating ? 'Verify wallet' : 'Prepare repay'}
  </button>}
</div>}</div>;
            })}</div>
            <div className="wgg-position-metrics"><div><span>Liquidation LTV</span><strong>{position.liquidationLtvPct != null ? `${position.liquidationLtvPct.toFixed(2)}%` : '—'}</strong></div><div><span>Stressed LTV</span><strong>{rows.find((row) => row.position.obligation === position.obligation)?.risk?.stressedLtvPct != null ? `${rows.find((row) => row.position.obligation === position.obligation)?.risk?.stressedLtvPct.toFixed(2)}%` : '—'}</strong></div><div><span>Distance to liquidation</span><strong>{rows.find((row) => row.position.obligation === position.obligation)?.risk?.liquidationDistancePct != null ? `${rows.find((row) => row.position.obligation === position.obligation)?.risk?.liquidationDistancePct.toFixed(2)} pts` : '—'}</strong></div><div><span>Borrow value</span><strong>{position.borrowValueUsd != null ? `$${position.borrowValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</strong></div></div>
          </article>;
        })}</div>}
      </section>}
      {authenticated && <KaminoActionConsole address={address ?? ''} walletProvider={walletProvider ?? null} positions={positions} onCompleted={scan} />}
      <section className="wgg-explain"><div><div className="wgg-eyebrow">THE WGG METHOD</div><h2>From price shock<br />to signed action.</h2></div><div className="wgg-steps"><article><b>01</b><strong>Read</strong><span>Load the real Kamino obligation and the current xStock market context.</span></article><article><b>02</b><strong>Stress</strong><span>Apply the historical downside gap to the live LTV and compare the stressed result with liquidation.</span></article><article><b>03</b><strong>Protect</strong><span>Prepare the amount needed to bring the position back under the scenario target, then let the wallet sign.</span></article></div></section>
      <footer className="wgg-footer"><span>Weekend Gap Guard</span><span>Solana mainnet · Kamino overlay · no custody</span><span><CircleHelp size={12} /> No demo balance is presented as real.</span></footer>
    </main>
  </div>;
}
