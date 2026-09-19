import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CircleHelp,
  Eye,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  Zap,
} from 'lucide-react';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import type { KaminoXStockPosition } from './lib/kamino';
import WggDashboard from './WggDashboard';
import WggPositionsPage from './WggPositionsPage';
import WggRiskPage from './WggRiskPage';
import WggActionsPage from './WggActionsPage';
import WggMonitoringPage from './WggMonitoringPage';
import { calculateCollateralUsdForTargetLtv, evaluateWeekendRisk } from './lib/wggRisk';
import { fetchWggMarketData, type XStockPriceMap, type WeekendGapMap } from './lib/wggMarketData';
import { clearWalletSession, refreshWalletSession } from './lib/walletAuth';
import { readWalletSessionToken } from './lib/walletSession';
import './app.css';

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

type Page = 'dashboard' | 'positions' | 'risk' | 'actions' | 'monitoring';

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function navIcon(page: Page) {
  if (page === 'dashboard') return <LayoutDashboard size={16} />;
  if (page === 'positions') return <ListChecks size={16} />;
  if (page === 'risk') return <ShieldAlert size={16} />;
  if (page === 'actions') return <Zap size={16} />;
  return <Eye size={16} />;
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
  const [route, setRoute] = useState(() => window.location.pathname || '/');

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
    } catch (cause) {
      clearWalletSession();
      setAuthStatus('error');
      setAuthError(cause instanceof Error ? cause.message : 'Wallet authentication failed.');
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
    if (!endpoint) {
      setError('A browser Solana mainnet RPC is not configured. Set VITE_SOLANA_RPC_URL in Vercel and redeploy.');
      return;
    }
    setLoading(true);
    setError('');
    setPrepared(null);
    setSignature('');
    try {
      const { discoverKaminoXStockPositions } = await import('./lib/kamino');
      const discovered = await discoverKaminoXStockPositions(address, endpoint);
      setPositions(discovered);
      const symbols = Array.from(new Set(discovered.flatMap((position) => position.xStocks.map((stock) => stock.symbol))));
      if (!symbols.length) {
        setMarketPrices({});
        setWeekendGaps({});
      } else {
        const market = await fetchWggMarketData(symbols, 13);
        setMarketPrices(market.prices ?? {});
        setWeekendGaps(market.weekendGaps ?? {});
        if ((market.unavailable ?? []).length && Object.keys(market.weekendGaps ?? {}).length === 0) {
          setError('Kamino loaded, but weekend-gap history is unavailable: ' + (market.unavailable?.[0]?.reason ?? 'Historical market data is unavailable.'));
        }
      }
      setLastLoaded(new Date());
    } catch (cause) {
      setPositions([]);
      setMarketPrices({});
      setWeekendGaps({});
      setError(cause instanceof Error ? cause.message : 'Kamino scan failed.');
    } finally {
      setLoading(false);
    }
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
      if (!row.price || row.price.multiplier == null || row.price.multiplier <= 0) {
        throw new Error('Current xStock multiplier is unavailable; refusing to prepare an unsafe raw-token amount.');
      }
      const neededUsd = calculateCollateralUsdForTargetLtv(row.position.borrowValueUsd ?? 0, row.position.depositValueUsd ?? 0, targetLtvPct);
      const scaledTokenAmount = neededUsd / row.price.price;
      const rawTokenAmount = scaledTokenAmount / row.price.multiplier;
      amountBaseUnits = BigInt(Math.ceil(rawTokenAmount * 10 ** row.stock.mintDecimals)).toString();
      if (amountBaseUnits === '0') return;
    }

    setPreparing(true);
    setAuthenticating(true);
    setError('');
    setPrepared(null);
    setSignature('');
    try {
      if (!walletProvider?.signMessage) throw new Error('Connected wallet does not support message signing.');
      await refreshWalletSession({
        publicKey: { toBase58: () => address },
        signMessage: walletProvider.signMessage.bind(walletProvider),
      });
      setAuthenticating(false);
      const sessionToken = readWalletSessionToken();
      const clientInfo = sessionToken ? 'stockpass stockpass-session=' + sessionToken : 'stockpass';
      const response = await fetch('/api/wgg-protection-prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-info': clientInfo },
        body: JSON.stringify({
          wallet: address,
          obligationAddress: row.position.obligation,
          reserveAddress: kind === 'repay' ? (row.position.debts[0]?.reserve ?? '') : row.stock.reserve,
          amountBaseUnits,
          targetLtvPct,
          kind,
        }),
      });
      const text = await response.text();
      let data: { error?: string; instructions?: PreparedInstruction[]; lookupTables?: string[]; amountBaseUnits?: string } | null = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!response.ok) throw new Error(data?.error ?? (text ? text.slice(0, 240) : 'Protection preparation failed.'));
      if (!data?.instructions?.length) throw new Error('Protection service returned no instructions.');
      if (kind === 'repay' && !data.amountBaseUnits) throw new Error('Protection service returned no computed repay amount.');
      setPrepared({
        kind,
        symbol: kind === 'repay' ? (row.position.debts[0]?.mint ?? 'Debt') : row.symbol,
        amountBaseUnits: data.amountBaseUnits ?? amountBaseUnits,
        instructionCount: data.instructions.length,
        instructions: data.instructions,
        lookupTables: data.lookupTables ?? [],
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Protection preparation is not available yet.');
    } finally {
      setPreparing(false);
      setAuthenticating(false);
    }
  }

  async function signAndSendPrepared() {
    if (!address || !prepared || !walletProvider) return;
    setSigning(true);
    setError('');
    setSignature('');
    try {
      if (!endpoint) throw new Error('VITE_SOLANA_RPC_URL is not configured.');
      const connection = new Connection(endpoint, 'confirmed');
      const latest = await connection.getLatestBlockhash('confirmed');
      const instructions = prepared.instructions.map((ix) => new TransactionInstruction({
        programId: new PublicKey(ix.programAddress),
        data: Buffer.from(decodeBase64(ix.data)),
        keys: ix.accounts.map((account) => ({ pubkey: new PublicKey(account.address), isSigner: account.signer, isWritable: account.writable })),
      }));
      const lookupTables = [];
      for (const lookupTableAddress of prepared.lookupTables) {
        const result = await connection.getAddressLookupTable(new PublicKey(lookupTableAddress));
        if (!result.value) throw new Error('Kamino lookup table ' + lookupTableAddress + ' is unavailable on mainnet.');
        lookupTables.push(result.value);
      }
      const message = new TransactionMessage({ payerKey: new PublicKey(address), recentBlockhash: latest.blockhash, instructions }).compileToV0Message(lookupTables);
      const transaction = new VersionedTransaction(message);
      const signed = await walletProvider.signTransaction(transaction);
      const txSignature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, maxRetries: 2 });
      await connection.confirmTransaction({ signature: txSignature, ...latest }, 'confirmed');
      setSignature(txSignature);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet signing or transaction submission failed.');
    } finally {
      setSigning(false);
    }
  }

  const authenticated = isConnected && authStatus === 'authenticated';

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
    return (
      <div className="min-h-screen bg-[#070b12] text-slate-100 grid place-items-center p-5 font-sans">
        <div className="w-full max-w-lg border border-sp-border bg-sp-panel p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,.32)]">
          <div className="flex items-center gap-3 border-b border-sp-border pb-5">
            <div className="grid size-10 place-items-center border border-white/10 bg-white text-xs font-bold text-[#070b12]">SP</div>
            <div>
              <div className="text-xs font-semibold tracking-[.16em]">STOCKPASS</div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[.18em] text-slate-500">Weekend Gap Guard</div>
            </div>
          </div>
          <div className="py-10">
            <div className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.18em] text-slate-500"><span className="size-1.5 rounded-full bg-emerald-400" /> Wallet authentication</div>
            {authStatus === 'authenticating' ? (
              <><h1 className="text-2xl font-semibold tracking-tight">Verify wallet ownership</h1><p className="mt-3 text-sm leading-6 text-slate-400">Approve the StockPass authentication message in your Solana wallet before your account state is read.</p></>
            ) : authStatus === 'error' ? (
              <><h1 className="text-2xl font-semibold tracking-tight">Authentication needs approval</h1><p className="mt-3 text-sm leading-6 text-rose-300">{authError}</p><button className="mt-6 inline-flex h-11 items-center gap-2 bg-white px-4 text-sm font-semibold text-slate-950" onClick={() => void authenticateCurrentWallet()}>Sign to continue <ArrowRight size={15} /></button></>
            ) : (
              <><h1 className="text-2xl font-semibold tracking-tight">Wallet connected</h1><p className="mt-3 text-sm leading-6 text-slate-400">Starting the signed wallet-authentication check before opening the risk workspace.</p></>
            )}
          </div>
          <div className="border-t border-sp-border pt-4 font-mono text-[9px] uppercase tracking-[.15em] text-slate-500">Solana mainnet · wallet signature required · no custody</div>
        </div>
      </div>
    );
  }

  const page: Page = route === '/app/positions' ? 'positions' : route === '/app/risk' ? 'risk' : route === '/app/actions' ? 'actions' : route === '/app/monitoring' ? 'monitoring' : 'dashboard';
  const nav: Array<{ id: Page; label: string; hint: string }> = [
    { id: 'dashboard', label: 'Overview', hint: 'Account health' },
    { id: 'positions', label: 'Positions', hint: 'Kamino collateral' },
    { id: 'risk', label: 'Guard', hint: 'Weekend stress' },
    { id: 'actions', label: 'Actions', hint: 'Execute on Kamino' },
    { id: 'monitoring', label: 'Monitoring', hint: 'Alerts & sync' },
  ];
  const routeFor = (id: Page) => id === 'dashboard' ? '/app' : '/app/' + id;

  return (
    <div className="sp-dapp min-h-screen">
      <div className="min-h-screen lg:flex">
        <aside className="hidden w-60 shrink-0 border-r border-sp-border bg-[#090e16] lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-sp-border px-5">
            <div className="grid size-8 place-items-center bg-white text-[10px] font-bold text-[#070b12]">SP</div>
            <div>
              <div className="text-[11px] font-bold tracking-[.14em]">STOCKPASS</div>
              <div className="mt-0.5 font-mono text-[8px] uppercase tracking-[.17em] text-slate-500">Weekend Gap Guard</div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-5">
            <div className="px-3 pb-2 font-mono text-[8px] uppercase tracking-[.18em] text-slate-600">Workspace</div>
            <nav className="space-y-1">
              {nav.map((item) => {
                const active = page === item.id;
                return (
                  <button key={item.id} onClick={() => navigate(routeFor(item.id))} className={'group flex w-full items-center gap-3 border px-3 py-2.5 text-left transition-colors ' + (active ? 'border-sp-border-strong bg-sp-panel-2 text-white' : 'border-transparent text-slate-500 hover:border-sp-border hover:bg-sp-panel hover:text-slate-200')}>
                    <span className={active ? 'text-sp-blue' : 'text-slate-600 group-hover:text-slate-400'}>{navIcon(item.id)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium">{item.label}</span>
                      <span className="mt-0.5 block text-[9px] text-slate-600">{item.hint}</span>
                    </span>
                    {active && <span className="size-1 rounded-full bg-sp-blue" />}
                  </button>
                );
              })}
            </nav>
            <div className="mt-7 border-t border-sp-border pt-5">
              <div className="px-3 pb-2 font-mono text-[8px] uppercase tracking-[.18em] text-slate-600">System</div>
              <div className="space-y-2 px-3 font-mono text-[9px] leading-5 text-slate-600">
                <div className="flex items-center justify-between"><span>Network</span><span className="text-slate-400">MAINNET</span></div>
                <div className="flex items-center justify-between"><span>Source</span><span className="text-slate-400">KAMINO</span></div>
                <div className="flex items-center justify-between"><span>Market</span><span className="text-slate-400">XSTOCKS</span></div>
              </div>
            </div>
          </div>
          <div className="border-t border-sp-border p-4">
            <div className="flex items-center gap-3 border border-sp-border bg-sp-panel px-3 py-3">
              <span className="flex size-2 rounded-full bg-emerald-400" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[8px] uppercase tracking-[.16em] text-slate-600">Connected wallet</div>
                <div className="sp-num mt-1 truncate text-[10px] text-slate-300">{address}</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-sp-border bg-[#070b12]/95 backdrop-blur lg:relative lg:bg-[#070b12]">
            <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between gap-4 px-4 md:px-6 xl:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-8 shrink-0 place-items-center border border-sp-border bg-sp-panel text-[10px] font-bold lg:hidden">SP</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[.16em] text-slate-600"><span>StockPass</span><span>/</span><span>{nav.find((item) => item.id === page)?.label}</span></div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-200">{nav.find((item) => item.id === page)?.hint}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-2 border border-sp-border bg-sp-panel px-3 py-2 md:flex"><span className="size-1.5 rounded-full bg-emerald-400" /><span className="font-mono text-[9px] uppercase tracking-[.12em] text-slate-500">Solana mainnet</span></div>
                <button onClick={() => void scan()} disabled={loading} className="sp-focus inline-flex size-9 items-center justify-center border border-sp-border bg-sp-panel text-slate-500 hover:text-white" aria-label="Refresh mainnet state"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
                <div className="hidden max-w-44 items-center gap-2 border border-sp-border bg-sp-panel px-3 py-2 sm:flex"><Wallet size={14} className="text-sp-blue" /><span className="sp-num truncate text-[10px] text-slate-300">{address?.slice(0, 5)}…{address?.slice(-5)}</span></div>
              </div>
            </div>
          </header>

          <div className="mx-auto min-h-[calc(100vh-64px)] max-w-[1500px] px-4 pb-24 md:px-6 md:pb-10 xl:px-8">
            {page === 'dashboard' && <WggDashboard address={address ?? null} positions={positions} rows={rows} counts={counts} loading={loading} preparing={preparing} authenticating={authenticating} signing={signing} prepared={prepared} signature={signature} error={error} lastLoaded={lastLoaded} scan={scan} prepareFix={prepareFix} signAndSendPrepared={signAndSendPrepared} />}
            {page === 'positions' && <WggPositionsPage positions={positions} rows={rows} loading={loading} lastLoaded={lastLoaded} scan={scan} />}
            {page === 'risk' && <WggRiskPage rows={rows} counts={counts} prepareFix={prepareFix} preparing={preparing} authenticating={authenticating} />}
            {page === 'actions' && <WggActionsPage address={address ?? ''} walletProvider={walletProvider ?? null} positions={positions} onCompleted={scan} />}
            {page === 'monitoring' && <WggMonitoringPage address={address ?? ''} />}

            <footer className="mt-10 border-t border-sp-border pt-5 md:flex md:items-center md:justify-between">
              <div className="font-mono text-[8px] uppercase tracking-[.14em] text-slate-600">StockPass · Weekend Gap Guard</div>
              <div className="mt-2 flex items-center gap-4 font-mono text-[8px] uppercase tracking-[.12em] text-slate-600 md:mt-0"><span className="inline-flex items-center gap-1.5"><CircleHelp size={11} /> No demo balances</span><span className="inline-flex items-center gap-1.5"><ShieldCheck size={11} /> Wallet-signed actions</span></div>
            </footer>
          </div>

          <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 gap-1 border border-sp-border bg-[#0a1018] p-1 shadow-2xl lg:hidden">
            {nav.map((item) => {
              const active = page === item.id;
              return <button key={item.id} onClick={() => navigate(routeFor(item.id))} className={'flex min-h-12 flex-col items-center justify-center gap-1 text-[9px] ' + (active ? 'bg-white text-slate-950' : 'text-slate-500')}>{navIcon(item.id)}<span>{item.label}</span></button>;
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}
