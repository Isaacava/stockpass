import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, CircleHelp, Gauge, LoaderCircle, ShieldCheck, Wallet } from 'lucide-react';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import type { KaminoXStockPosition } from './lib/kamino';
import WggMonitoringPage from './WggMonitoringPage';
import WggDashboard from './WggDashboard';
import WggPositionsPage from './WggPositionsPage';
import WggRiskPage from './WggRiskPage';
import WggActionsPage from './WggActionsPage';
import { calculateCollateralUsdForTargetLtv, evaluateWeekendRisk } from './lib/wggRisk';
import { fetchWggMarketData, type XStockPriceMap, type WeekendGapMap } from './lib/wggMarketData';
import { clearWalletSession, refreshWalletSession } from './lib/walletAuth';
import { readWalletSessionToken } from './lib/walletSession';
import './weekend-gap-guard.css';

const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || import.meta.env.VITE_SOLANA_MAINNET_RPC_URL || '';

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
    if (!endpoint) { setError('A browser Solana mainnet RPC is not configured. Set VITE_SOLANA_RPC_URL (or VITE_SOLANA_MAINNET_RPC_URL) in Vercel and redeploy.'); return; }
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

  const [route, setRoute] = useState(() => window.location.pathname || '/');

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    if (window.location.pathname === '/') {
      window.history.replaceState({}, '', '/app');
      setRoute('/app');
    }
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || lastLoaded || loading) return;
    void scan();
  }, [authenticated, lastLoaded, loading]);

  function navigate(path: string) {
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    setRoute(path);
    window.scrollTo(0, 0);
  }

  if (!authenticated) {
    return <div className="wgg-auth-transition">
      <div className="wgg-auth-panel">
        <div className="wgg-auth-kicker"><span /> STOCKPASS / WALLET AUTH</div>
        <span className="wgg-auth-mark">SP</span>
        {authStatus === 'authenticating'
          ? <><strong>Verify wallet ownership.</strong><span>Approve the StockPass authentication message in your Solana wallet.</span></>
          : authStatus === 'error'
            ? <><strong>Authentication needs approval.</strong><span>{authError}</span><button className="wgg-primary" onClick={() => void authenticateCurrentWallet()}>Sign to continue <ArrowRight size={14} /></button></>
            : <><strong>Wallet connected.</strong><span>Starting the signed wallet-authentication check before opening your risk workspace.</span></>}
        <small>Solana mainnet · wallet signature required · no custody</small>
      </div>
    </div>;
  }

  const page = route === '/app/positions' ? 'positions' : route === '/app/risk' ? 'risk' : route === '/app/actions' ? 'actions' : route === '/app/monitoring' ? 'monitoring' : 'dashboard';

  return <div className="wgg-app">
    <header className="wgg-header sp-app-header">
      <div className="wgg-brand">
        <span className="wgg-mark">SP</span>
        <div><strong>STOCKPASS</strong><small>WEEKEND GAP GUARD</small></div>
      </div>
      <nav className="sp-header-nav" aria-label="StockPass app">
        <button className={page === 'dashboard' ? 'is-active' : ''} onClick={() => navigate('/app')}>Overview</button>
        <button className={page === 'positions' ? 'is-active' : ''} onClick={() => navigate('/app/positions')}>Positions</button>
        <button className={page === 'risk' ? 'is-active' : ''} onClick={() => navigate('/app/risk')}>Guard</button>
        <button className={page === 'actions' ? 'is-active' : ''} onClick={() => navigate('/app/actions')}>Actions</button>
        <button className={page === 'monitoring' ? 'is-active' : ''} onClick={() => navigate('/app/monitoring')}>Monitoring</button>
      </nav>
      <div className="wgg-header-right">
        <span className="wgg-mainnet"><i /> SOLANA MAINNET</span>
        <div className="wgg-wallet"><Wallet size={14} />{address ? `${address.slice(0, 4)}…${address.slice(-4)}` : 'Connected'}</div>
      </div>
    </header>

    <main className="wgg-main sp-main">
      {page === 'dashboard' && <WggDashboard
        address={address ?? null}
        positions={positions}
        rows={rows}
        counts={counts}
        loading={loading}
        preparing={preparing}
        authenticating={authenticating}
        signing={signing}
        prepared={prepared}
        signature={signature}
        error={error}
        lastLoaded={lastLoaded}
        scan={scan}
        prepareFix={prepareFix}
        signAndSendPrepared={signAndSendPrepared}
      />}

      {page === 'positions' && <WggPositionsPage positions={positions} rows={rows} loading={loading} lastLoaded={lastLoaded} scan={scan} />}

      {page === 'risk' && <WggRiskPage rows={rows} counts={counts} prepareFix={prepareFix} preparing={preparing} authenticating={authenticating} />}

      {page === 'actions' && <WggActionsPage address={address ?? ''} walletProvider={walletProvider ?? null} positions={positions} onCompleted={scan} />}

      {page === 'monitoring' && <WggMonitoringPage address={address ?? ''} />}

      <nav className="sp-mobile-nav" aria-label="StockPass app mobile navigation">
        <button className={page === 'dashboard' ? 'is-active' : ''} onClick={() => navigate('/app')}>Overview</button>
        <button className={page === 'positions' ? 'is-active' : ''} onClick={() => navigate('/app/positions')}>Positions</button>
        <button className={page === 'risk' ? 'is-active' : ''} onClick={() => navigate('/app/risk')}>Guard</button>
        <button className={page === 'actions' ? 'is-active' : ''} onClick={() => navigate('/app/actions')}>Actions</button>
        <button className={page === 'monitoring' ? 'is-active' : ''} onClick={() => navigate('/app/monitoring')}>Monitoring</button>
      </nav>

      <footer className="wgg-footer">
        <span>StockPass / Weekend Gap Guard</span>
        <span>Solana mainnet · Kamino overlay · no custody</span>
        <span><CircleHelp size={12} /> No demo balance is presented as real.</span>
      </footer>
    </main>
  </div>;
}
