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
import { SOLANA_MAINNET_RPC } from './config';
import './app.css';

const endpoint = SOLANA_MAINNET_RPC;

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
      <div className="sp-dapp min-h-screen grid place-items-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md rounded-[28px] border border-sp-border bg-white p-6 shadow-[0_20px_60px_rgba(16,24,40,.08)] sm:p-8">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#101828] text-xs font-bold text-white shadow-sm">SP</div>
            <div>
              <div className="text-sm font-bold tracking-[.12em] text-slate-100">STOCKPASS</div>
              <div className="mt-1 font-mono text-[8px] uppercase tracking-[.16em] text-slate-500">Weekend Gap Guard</div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl bg-[#f6f8ff] p-5">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[#315efb]">
              <span className="size-2 rounded-full bg-[#315efb]" /> Wallet verification
            </div>
            {authStatus === 'authenticating' ? (
              <>
                <h1 className="mt-4 text-2xl font-bold tracking-[-.03em] text-slate-100">Verify your wallet</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">Approve the StockPass signature request. No assets move during authentication.</p>
              </>
            ) : authStatus === 'error' ? (
              <>
                <h1 className="mt-4 text-2xl font-bold tracking-[-.03em] text-slate-100">Signature required</h1>
                <p className="mt-2 text-sm leading-6 text-rose-600">{authError}</p>
                <button className="sp-primary mt-5 inline-flex h-11 items-center gap-2 px-4 text-sm font-semibold" onClick={() => void authenticateCurrentWallet()}>
                  Sign to continue <ArrowRight size={15} />
                </button>
              </>
            ) : (
              <>
                <h1 className="mt-4 text-2xl font-bold tracking-[-.03em] text-slate-100">Wallet connected</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">Checking signed wallet ownership before opening your account.</p>
              </>
            )}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-sp-border bg-white p-3"><div className="font-mono text-[8px] uppercase tracking-[.12em] text-slate-500">Network</div><div className="mt-2 text-[10px] font-semibold text-slate-200">Solana</div></div>
            <div className="rounded-2xl border border-sp-border bg-white p-3"><div className="font-mono text-[8px] uppercase tracking-[.12em] text-slate-500">Source</div><div className="mt-2 text-[10px] font-semibold text-slate-200">Kamino</div></div>
            <div className="rounded-2xl border border-sp-border bg-white p-3"><div className="font-mono text-[8px] uppercase tracking-[.12em] text-slate-500">Custody</div><div className="mt-2 text-[10px] font-semibold text-slate-200">None</div></div>
          </div>

          <div className="mt-6 font-mono text-[8px] uppercase tracking-[.12em] text-slate-400">Mainnet data · wallet-signed actions · non-custodial</div>
        </div>
      </div>
    );
  }

  const page: Page = route === '/app/positions' ? 'positions' : route === '/app/risk' ? 'risk' : route === '/app/actions' ? 'actions' : route === '/app/monitoring' ? 'monitoring' : 'dashboard';
  const nav: Array<{ id: Page; label: string; hint: string }> = [
    { id: 'dashboard', label: 'Home', hint: 'Account overview' },
    { id: 'positions', label: 'Positions', hint: 'Kamino collateral' },
    { id: 'risk', label: 'Guard', hint: 'Weekend protection' },
    { id: 'actions', label: 'Actions', hint: 'Kamino execution' },
    { id: 'monitoring', label: 'Monitor', hint: 'Alerts & sync' },
  ];
  const routeFor = (id: Page) => id === 'dashboard' ? '/app' : '/app/' + id;
  const pageTitle = nav.find((item) => item.id === page)?.label ?? 'Home';

  return (
    <div className="sp-dapp min-h-screen">
      <div className="min-h-screen lg:flex">
        <aside className="sp-sidebar hidden w-[248px] shrink-0 lg:flex lg:flex-col">
          <div className="sp-sidebar-brand flex h-[76px] items-center gap-3 px-5">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#101828] text-[11px] font-bold text-white">SP</div>
            <div className="min-w-0">
              <div className="text-[12px] font-bold tracking-[.14em] text-slate-100">STOCKPASS</div>
              <div className="mt-1 truncate font-mono text-[8px] uppercase tracking-[.15em] text-slate-500">Weekend Gap Guard</div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-5">
            <div className="px-3 pb-2 text-[9px] font-semibold uppercase tracking-[.14em] text-slate-400">Workspace</div>
            <nav className="space-y-1.5">
              {nav.map((item) => {
                const active = page === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(routeFor(item.id))}
                    className={'sp-nav-item group flex w-full items-center gap-3 px-3 py-3 text-left ' + (active ? 'sp-active' : '')}
                  >
                    <span className={active ? 'text-sp-blue' : 'text-slate-400'}>{navIcon(item.id)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold">{item.label}</span>
                      <span className="mt-0.5 block text-[9px] text-slate-500">{item.hint}</span>
                    </span>
                    {active && <span className="size-1.5 rounded-full bg-sp-blue" />}
                  </button>
                );
              })}
            </nav>

            <div className="mt-8 rounded-2xl border border-sp-border bg-[#f8faff] p-4">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.13em] text-slate-500">
                <span className="size-2 rounded-full bg-emerald-500" /> Mainnet live
              </div>
              <div className="mt-4 space-y-2 text-[10px]">
                <div className="flex justify-between"><span className="text-slate-500">Protocol</span><span className="font-semibold text-slate-200">Kamino</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Market</span><span className="font-semibold text-slate-200">xStocks</span></div>
              </div>
            </div>
          </div>

          <div className="border-t border-sp-border p-4">
            <div className="sp-wallet-chip flex items-center gap-3 px-3 py-3">
              <span className="grid size-8 place-items-center rounded-xl bg-[#eef3ff] text-sp-blue"><Wallet size={15} /></span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[8px] uppercase tracking-[.12em] text-slate-500">Connected wallet</div>
                <div className="sp-num mt-1 truncate text-[9px] text-slate-200">{address}</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sp-topbar sticky top-0 z-30">
            <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between gap-3 px-4 md:px-7">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#101828] text-[10px] font-bold text-white lg:hidden">SP</div>
                <div className="min-w-0">
                  <div className="hidden font-mono text-[8px] uppercase tracking-[.15em] text-slate-400 sm:block">StockPass</div>
                  <div className="truncate text-[15px] font-bold tracking-[-.02em] text-slate-100">{pageTitle}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="sp-network-chip hidden items-center gap-2 px-3 py-2 text-[9px] font-semibold uppercase tracking-[.08em] md:flex">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> Solana mainnet
                </div>
                <button onClick={() => void scan()} disabled={loading} className="sp-refresh inline-flex size-10 items-center justify-center" aria-label="Refresh mainnet state">
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
                <div className="sp-wallet-chip hidden items-center gap-2 px-3 py-2 sm:flex">
                  <Wallet size={14} className="text-sp-blue" />
                  <span className="sp-num max-w-32 truncate text-[9px] text-slate-300">{address?.slice(0, 5)}…{address?.slice(-5)}</span>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto min-h-[calc(100vh-72px)] max-w-[1240px] px-4 pb-28 md:px-7 md:pb-10">
            {page === 'dashboard' && <WggDashboard address={address ?? null} positions={positions} rows={rows} counts={counts} loading={loading} preparing={preparing} authenticating={authenticating} signing={signing} prepared={prepared} signature={signature} error={error} lastLoaded={lastLoaded} scan={scan} prepareFix={prepareFix} signAndSendPrepared={signAndSendPrepared} />}
            {page === 'positions' && <WggPositionsPage positions={positions} rows={rows} loading={loading} lastLoaded={lastLoaded} scan={scan} />}
            {page === 'risk' && <WggRiskPage rows={rows} counts={counts} prepareFix={prepareFix} preparing={preparing} authenticating={authenticating} />}
            {page === 'actions' && <WggActionsPage address={address ?? ''} walletProvider={walletProvider ?? null} positions={positions} onCompleted={scan} />}
            {page === 'monitoring' && <WggMonitoringPage address={address ?? ''} />}

            <footer className="mt-10 flex flex-col gap-2 border-t border-sp-border py-6 text-[9px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-mono uppercase tracking-[.12em]">StockPass · Weekend Gap Guard</div>
              <div className="flex items-center gap-4 font-mono uppercase tracking-[.1em]">
                <span className="inline-flex items-center gap-1.5"><CircleHelp size={11} /> No demo balances</span>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck size={11} /> Wallet signed</span>
              </div>
            </footer>
          </main>

          <nav className="sp-bottom-nav fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 lg:hidden">
            {nav.map((item) => {
              const active = page === item.id;
              return (
                <button key={item.id} onClick={() => navigate(routeFor(item.id))} className={'sp-bottom-item flex flex-col items-center justify-center gap-1 text-[9px] font-semibold ' + (active ? 'sp-active' : '')}>
                  {navIcon(item.id)}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}