import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  House,
  Layers3,
  Shield,
  WalletCards,
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
import { calculateCollateralUsdForTargetLtv, evaluateWeekendRisk, selectWeekendGapPct, type WeekendRiskProfile } from './lib/wggRisk';
import { fetchWggMarketData, type XStockPriceMap, type WeekendGapMap } from './lib/wggMarketData';
import { clearWalletSession, refreshWalletSession, walletAuthHeaders } from './lib/walletAuth';
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
  actionId: string;
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

export default function WeekendGapGuardWorkspace() {
  const { walletProvider } = useAppKitProvider<WggWalletProvider>('solana');
  const { address, isConnected } = useAppKitAccount({ namespace: 'solana' });
  const [positions, setPositions] = useState<KaminoXStockPosition[]>([]);
  const [marketPrices, setMarketPrices] = useState<XStockPriceMap>({});
  const [weekendGaps, setWeekendGaps] = useState<WeekendGapMap>({});
  const [loading, setLoading] = useState(false);
  const [scanAttempted, setScanAttempted] = useState(false);
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
  const [riskProfile, setRiskProfile] = useState<WeekendRiskProfile>(() => {
    const saved = localStorage.getItem('stockpass.wgg.risk-profile');
    return saved === 'p90' || saved === 'max' ? saved : 'p75';
  });

  const rows = useMemo<Row[]>(() => positions.flatMap((position) => position.xStocks.map((stock) => {
    const symbol = stock.symbol.replace(/x$/i, '');
    const gap = weekendGaps[stock.symbol];
    const scenarioGap = gap ? selectWeekendGapPct(gap, riskProfile) : null;
    const risk = position.ltvPct != null && position.liquidationLtvPct != null && scenarioGap != null
      ? evaluateWeekendRisk({ currentLtvPct: position.ltvPct, liquidationLtvPct: position.liquidationLtvPct, typicalWeekendGapPct: scenarioGap }, riskProfile)
      : null;
    return { position, stock, symbol, gap, risk, price: marketPrices[stock.symbol] };
  })), [positions, weekendGaps, marketPrices, riskProfile]);

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
    localStorage.setItem('stockpass.wgg.risk-profile', riskProfile);
  }, [riskProfile]);

  useEffect(() => {
    if (!isConnected || !address) {
      clearWalletSession();
      setAuthStatus('signed_out');
      setAuthError('');
      setScanAttempted(false);
      return;
    }
    if (authStatus === 'authenticated' || authStatus === 'authenticating') return;
    if (!walletProvider?.signMessage) return;
    void authenticateCurrentWallet();
  }, [address, isConnected, walletProvider]);

  async function scan() {
    if (!address) return;
    if (!endpoint) {
      setError('The Solana mainnet RPC proxy is unavailable. Check Vercel SOLANA_RPC_URL and the /api/solana-rpc function.');
      return;
    }
    setLoading(true);
    setError('');
    setPrepared(null);
    setSignature('');
    setScanAttempted(true);
    try {
      const sessionToken = readWalletSessionToken();
      const clientInfo = sessionToken ? 'stockpass stockpass-session=' + sessionToken : 'stockpass';
      const response = await fetch('/api/wgg-kamino-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-info': clientInfo },
        body: JSON.stringify({ wallet: address }),
      });
      const text = await response.text();
      let data: { error?: string; positions?: KaminoXStockPosition[] } | null = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!response.ok) {
        throw new Error(data?.error ?? (text ? text.slice(0, 240) : 'Kamino position discovery failed.'));
      }
      const discovered = data?.positions ?? [];
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
    const scenarioGap = selectWeekendGapPct(row.gap, riskProfile) ?? 0;
    const risk = evaluateWeekendRisk({ currentLtvPct: row.position.ltvPct, liquidationLtvPct: row.position.liquidationLtvPct, typicalWeekendGapPct: scenarioGap }, riskProfile);
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
      let data: { error?: string; actionId?: string; instructions?: PreparedInstruction[]; lookupTables?: string[]; amountBaseUnits?: string } | null = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!response.ok) throw new Error(data?.error ?? (text ? text.slice(0, 240) : 'Protection preparation failed.'));
      if (!data?.actionId) throw new Error('Protection service returned no verification record.');
      if (!data?.instructions?.length) throw new Error('Protection service returned no instructions.');
      if (kind === 'repay' && !data.amountBaseUnits) throw new Error('Protection service returned no computed repay amount.');
      setPrepared({
        actionId: data.actionId,
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
      if (!endpoint) throw new Error('The Solana mainnet RPC proxy is not configured.');
      const connection = new Connection(endpoint, {
        commitment: 'confirmed',
        httpHeaders: {
          ...walletAuthHeaders(),
          'x-stockpass-wallet': address,
        },
      });
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

      const verifyResponse = await fetch('/api/kamino-actions-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...walletAuthHeaders() },
        body: JSON.stringify({ wallet: address, actionId: prepared.actionId, signature: txSignature }),
      });
      const verifyText = await verifyResponse.text();
      let verifyData: { error?: string; verified?: boolean } | null = null;
      try { verifyData = verifyText ? JSON.parse(verifyText) : null; } catch { verifyData = null; }
      if (!verifyResponse.ok || verifyData?.verified !== true) {
        throw new Error(verifyData?.error ?? 'Transaction confirmed, but independent Kamino verification failed.');
      }

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
    if (!authenticated || scanAttempted || loading) return;
    void scan();
  }, [authenticated, scanAttempted, loading]);

  function navigate(path: string) {
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    setRoute(path);
    window.scrollTo(0, 0);
  }

  if (!authenticated) {
    return (
      <div className="sp-dapp-auth">
        <div className="sp-auth-card">
          <div className="sp-brand-lockup">
            <div className="sp-brand-mark">SP</div>
            <div>
              <div className="sp-brand-name">StockPass</div>
              <div className="sp-brand-sub"><span /> Solana mainnet</div>
            </div>
          </div>

          <div className="sp-auth-hero">
            <div className="sp-eyebrow">Wallet verification</div>
            {authStatus === 'authenticating' ? (
              <>
                <h1 className="mt-3 text-[22px] font-extrabold tracking-[-.035em] text-ink">Verify your wallet</h1>
                <p className="mt-2 text-[11px] leading-6 text-mute">Approve the StockPass signature request. No assets move during authentication.</p>
              </>
            ) : authStatus === 'error' ? (
              <>
                <h1 className="mt-3 text-[22px] font-extrabold tracking-[-.035em] text-ink">Signature required</h1>
                <p className="mt-2 text-[11px] leading-6 text-flag">{authError}</p>
                <button className="sp-button-brand mt-4" onClick={() => void authenticateCurrentWallet()}>
                  Sign to continue <ArrowRight size={14} />
                </button>
              </>
            ) : (
              <>
                <h1 className="mt-3 text-[22px] font-extrabold tracking-[-.035em] text-ink">Wallet connected</h1>
                <p className="mt-2 text-[11px] leading-6 text-mute">Checking signed wallet ownership before opening your account.</p>
              </>
            )}
          </div>

          <div className="sp-auth-grid">
            <div className="sp-auth-stat"><div className="sp-label">Network</div><strong>Solana</strong></div>
            <div className="sp-auth-stat"><div className="sp-label">Position</div><strong>Kamino</strong></div>
            <div className="sp-auth-stat"><div className="sp-label">Custody</div><strong>None</strong></div>
          </div>
          <div className="mt-4 text-center font-mono text-[8px] uppercase tracking-[.11em] text-faint">Mainnet data · wallet-signed actions · non-custodial</div>
        </div>
      </div>
    );
  }

  const page: Page =
    route === '/app/positions' ? 'positions'
      : route === '/app/risk' ? 'risk'
        : route === '/app/actions' ? 'actions'
          : route === '/app/monitoring' ? 'monitoring'
            : 'dashboard';

  const nav: Array<{ id: Page; label: string }> = [
    { id: 'dashboard', label: 'Home' },
    { id: 'positions', label: 'Positions' },
    { id: 'actions', label: 'Actions' },
    { id: 'risk', label: 'Guard' },
    { id: 'monitoring', label: 'Monitor' },
  ];
  const routeFor = (id: Page) => id === 'dashboard' ? '/app' : '/app/' + id;

  return (
    <div className="sp-dapp">
      <header className="sp-topbar">
        <div className="sp-topbar-inner">
          <button onClick={() => navigate('/app')} className="sp-brand-lockup border-0 bg-transparent p-0 text-left">
            <div className="sp-brand-mark">SP</div>
            <div className="min-w-0">
              <div className="sp-brand-name">StockPass</div>
              <div className="sp-brand-sub"><span /> Solana mainnet</div>
            </div>
          </button>

          <div className="sp-header-actions">
            <div className="sp-network-button"><span /> Solana mainnet</div>
            <button onClick={() => navigate('/app/monitoring')} className="sp-icon-button relative" aria-label="Open monitoring">
              <Bell size={16} />
              {(counts.flagged > 0 || counts.watch > 0) && <span className="sp-alert-dot" />}
            </button>
            <button className="sp-wallet-button" title={address ?? 'Wallet'}>
              <span className="sp-wallet-badge"><WalletCards size={12} /></span>
              <span className="num">{address ? address.slice(0, 5) + '…' + address.slice(-5) : '—'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="sp-main">
        {page === 'dashboard' && (
          <WggDashboard
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
          />
        )}
        {page === 'positions' && <WggPositionsPage positions={positions} rows={rows} loading={loading} lastLoaded={lastLoaded} scan={scan} />}
        {page === 'risk' && (
          <WggRiskPage
            rows={rows}
            counts={counts}
            prepareFix={prepareFix}
            preparing={preparing}
            authenticating={authenticating}
            riskProfile={riskProfile}
            onRiskProfileChange={setRiskProfile}
          />
        )}
        {page === 'actions' && <WggActionsPage address={address ?? ''} walletProvider={walletProvider ?? null} positions={positions} onCompleted={scan} />}
        {page === 'monitoring' && <WggMonitoringPage address={address ?? ''} />}

        <div className="sp-provenance mt-7 pb-2">
          <div><span>Position</span><strong>Kamino</strong></div>
          <div><span>Price</span><strong>xStocks</strong></div>
          <div><span>Scenario</span><strong>Twelve Data</strong></div>
        </div>
      </main>

      <nav className="sp-bottom-nav" aria-label="StockPass navigation">
        {nav.map((item) => {
          const active = page === item.id;
          if (item.id === 'actions') {
            return (
              <button key={item.id} onClick={() => navigate(routeFor(item.id))} className="flex flex-col items-center justify-end gap-1 border-0 bg-transparent pb-0">
                <span className="sp-bottom-action"><Zap size={21} /></span>
                <span className={'sp-bottom-action-label text-[9px] font-semibold ' + (active ? 'text-brand' : '')}>Actions</span>
              </button>
            );
          }
          const Icon = item.id === 'dashboard' ? House : item.id === 'positions' ? Layers3 : item.id === 'risk' ? Shield : Bell;
          return (
            <button
              key={item.id}
              onClick={() => navigate(routeFor(item.id))}
              className={'sp-bottom-item ' + (active ? 'sp-bottom-active' : '')}
            >
              <Icon size={19} strokeWidth={active ? 2.1 : 1.8} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
