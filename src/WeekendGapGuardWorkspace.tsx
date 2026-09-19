import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, CircleHelp, Gauge, LoaderCircle, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { discoverKaminoXStockPositions, type KaminoXStockPosition } from './lib/kamino';
import KaminoActionConsole from './KaminoActionConsole';
import { calculateCollateralUsdForTargetLtv, evaluateWeekendRisk } from './lib/wggRisk';
import { fetchWggMarketData, type XStockPriceMap, type WeekendGapMap } from './lib/wggMarketData';
import { refreshWalletSession } from './lib/walletAuth';
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
  const { address, isConnected } = useAppKitAccount();
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

  const rows = useMemo<Row[]>(() => positions.flatMap((position) => position.xStocks.map((stock) => {
    const symbol = stock.symbol.replace(/x$/i, '');
    const gap = weekendGaps[stock.symbol];
    const risk = position.liquidationBufferPct != null && gap?.typicalWeekendGapPct != null
      ? evaluateWeekendRisk({ currentBufferPct: position.liquidationBufferPct, typicalWeekendGapPct: gap.typicalWeekendGapPct })
      : null;
    return { position, stock, symbol, gap, risk, price: marketPrices[stock.symbol] };
  })), [positions, weekendGaps, marketPrices]);

  const counts = rows.reduce((acc, row) => {
    if (row.risk?.status === 'flagged') acc.flagged += 1;
    else if (row.risk?.status === 'watch') acc.watch += 1;
    else if (row.risk?.status === 'safe') acc.safe += 1;
    return acc;
  }, { flagged: 0, watch: 0, safe: 0 });

  async function scan() {
    if (!address) return;
    if (!endpoint) { setError('VITE_SOLANA_RPC_URL is not configured.'); return; }
    setLoading(true); setError(''); setPrepared(null); setSignature('');
    try {
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
    if (!address || !row.gap || row.position.liquidationLtvPct == null || row.position.liquidationBufferPct == null) return;
    const typicalGap = row.gap.typicalWeekendGapPct ?? 0;
    const risk = evaluateWeekendRisk({ currentBufferPct: row.position.liquidationBufferPct, typicalWeekendGapPct: typicalGap });
    if (risk.status !== 'flagged') return;
    const targetLtvPct = Math.max(1, row.position.liquidationLtvPct - risk.adjustedGapPct * 1.2);
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


  return <div className="wgg-app">
    <header className="wgg-nav">
      <a className="wgg-brand-lockup" href="/" aria-label="StockPass">
        <span className="wgg-brand-mark"><span>SP</span></span>
        <span className="wgg-brand-word"><strong>STOCKPASS</strong><small>WEEKEND GAP GUARD</small></span>
      </a>

      <div className="wgg-nav-center">
        <span className="wgg-nav-signal"><i /> SOLANA MAINNET</span>
        <span className="wgg-nav-divider">/</span>
        <span className="wgg-nav-context">{isConnected ? 'RISK WORKSPACE' : 'COLLATERAL RISK LAYER'}</span>
      </div>

      <div className="wgg-nav-actions">
        {isConnected && <span className="wgg-wallet-chip"><Wallet size={14} /> {address ? address.slice(0, 4) + '…' + address.slice(-4) : 'Connected'}</span>}
        {!isConnected ? (
          <button className="wgg-nav-button" onClick={() => void open()}>Connect wallet <ArrowRight size={14} /></button>
        ) : (
          <button className="wgg-nav-button wgg-nav-button-dark" onClick={() => void scan()} disabled={loading}>
            {loading ? <LoaderCircle size={14} className="wgg-spin" /> : <RefreshCw size={14} />}
            {loading ? 'Reading' : 'Refresh'}
          </button>
        )}
      </div>
    </header>

    {!isConnected ? (
      <main className="wgg-landing">
        <section className="wgg-landing-hero">
          <div className="wgg-landing-copy">
            <div className="wgg-kicker"><span /> MARKET RISK / 01</div>
            <h1>Protect the position<br /><em>when the market sleeps.</em></h1>
            <p className="wgg-landing-lede">
              Weekend Gap Guard reads real Kamino xStock collateral on Solana, compares the live liquidation buffer with historical Friday-to-next-session gaps, and turns a risk signal into a wallet-approved action.
            </p>
            <div className="wgg-landing-actions">
              <button className="wgg-hero-button" onClick={() => void open()}>Enter the guard <ArrowRight size={16} /></button>
              <a className="wgg-text-link" href="#method">See how it works <span>↘</span></a>
            </div>
            <div className="wgg-landing-stats" aria-label="Product principles">
              <div><strong>01</strong><span>Read Kamino state</span></div>
              <div><strong>02</strong><span>Measure weekend gap</span></div>
              <div><strong>03</strong><span>Approve protection</span></div>
            </div>
          </div>

          <div className="wgg-landing-visual" aria-label="Weekend risk model preview">
            <div className="wgg-visual-topline"><span>FRIDAY CHECK / 16:00 ET</span><span className="wgg-live-badge"><i /> READY</span></div>
            <div className="wgg-radar-stage">
              <div className="wgg-radar"><span className="ring ring-one" /><span className="ring ring-two" /><span className="ring ring-three" /><span className="cross cross-x" /><span className="cross cross-y" /><b className="radar-dot" /></div>
              <div className="wgg-radar-label top">LIQUIDATION BUFFER</div>
              <div className="wgg-radar-label left">FRIDAY CLOSE</div>
              <div className="wgg-radar-label right">NEXT SESSION</div>
              <div className="wgg-radar-label bottom">P75 DOWNSIDE GAP</div>
            </div>
            <div className="wgg-model-stack">
              <div><span>DATA</span><strong>xStocks price</strong><small>official public market layer</small></div>
              <div><span>HISTORY</span><strong>13 weekly samples</strong><small>Friday close → next valid session</small></div>
              <div><span>ACTION</span><strong>Wallet approval</strong><small>no custody / no standing permission</small></div>
            </div>
          </div>
        </section>

        <section className="wgg-proof-rail">
          <div><span>THE SOURCE ORDER</span><strong>Kamino state</strong><i>→</i><strong>xStocks market data</strong><i>→</i><strong>weekend model</strong><i>→</i><strong>your signature</strong></div>
          <div><ShieldCheck size={15} /><span>Nothing here needs a demo balance to look convincing.</span></div>
        </section>

        <section id="method" className="wgg-method">
          <div className="wgg-method-heading">
            <div>
              <div className="wgg-kicker"><span /> WHY THIS EXISTS / 02</div>
              <h2>Risk changes when<br /><em>the exchange is closed.</em></h2>
            </div>
            <p>The product is deliberately narrow. It does not replace Kamino. It adds a weekend-aware decision layer on top of the money market you already use.</p>
          </div>

          <div className="wgg-method-grid">
            <article className="wgg-method-card">
              <div className="wgg-card-index">A1</div>
              <Gauge size={19} />
              <h3>Read the real position</h3>
              <p>Collateral, debt, LTV and liquidation thresholds come from the wallet's live Kamino obligation on mainnet.</p>
            </article>
            <article className="wgg-method-card wgg-method-card-accent">
              <div className="wgg-card-index">B2</div>
              <BarChart3 size={19} />
              <h3>Model the closed-market move</h3>
              <p>Historical observations measure the downside gap from a Friday close to the next valid trading-session open.</p>
            </article>
            <article className="wgg-method-card">
              <div className="wgg-card-index">C3</div>
              <ShieldCheck size={19} />
              <h3>Make the action explicit</h3>
              <p>When a position is flagged, StockPass prepares a concrete Kamino transaction. Your wallet remains the final authority.</p>
            </article>
          </div>
        </section>

        <section className="wgg-landing-bottom">
          <div className="wgg-bottom-panel">
            <div><div className="wgg-kicker"><span /> BUILT FOR REAL STATE</div><h2>Connect once.<br />Judge the position.</h2></div>
            <button className="wgg-hero-button" onClick={() => void open()}>Scan my position <ArrowRight size={16} /></button>
          </div>
          <div className="wgg-bottom-note">
            <div className="wgg-note-icon"><LockKeyhole size={16} /></div>
            <div><strong>Non-custodial by design</strong><span>StockPass can prepare transactions, but it cannot move funds without a fresh wallet signature.</span></div>
          </div>
        </section>
      </main>
    ) : (
      <main className="wgg-workspace">
        <div className="wgg-mobile-jump">
          <a href="#overview">Overview</a><a href="#positions">Positions</a><a href="#control">Control</a>
        </div>

        <section id="overview" className="wgg-overview-head">
          <div>
            <div className="wgg-kicker"><span /> WEEKEND GAP GUARD / 03</div>
            <h1>Your position,<br /><em>before Monday.</em></h1>
            <p>Fresh mainnet state, live xStocks pricing, and a thirteen-week weekend-gap model in one read.</p>
          </div>
          <div className="wgg-overview-stamp">
            <div className="wgg-stamp-label">LAST READ</div>
            <strong>{lastLoaded ? lastLoaded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</strong>
            <span>{lastLoaded ? 'mainnet scan completed' : 'scan not run yet'}</span>
          </div>
        </section>

        <section className="wgg-kpi-grid">
          <div className="wgg-kpi wgg-kpi-dark"><span>POSITIONS</span><strong>{rows.length}</strong><small>xStock collateral rows</small></div>
          <div className="wgg-kpi wgg-kpi-alert"><span>FLAGGED</span><strong>{counts.flagged}</strong><small>requires action review</small></div>
          <div className="wgg-kpi"><span>WATCH</span><strong>{counts.watch}</strong><small>buffer is tightening</small></div>
          <div className="wgg-kpi"><span>SAFE</span><strong>{counts.safe}</strong><small>gap model within buffer</small></div>
        </section>

        <section id="positions" className="wgg-position-section">
          <div className="wgg-section-title-row">
            <div>
              <div className="wgg-kicker"><span /> LIVE POSITION RADAR</div>
              <h2>Kamino obligations on mainnet.</h2>
            </div>
            <div className="wgg-section-status"><span className="wgg-status-led" /> {loading ? 'READING' : error ? 'REVIEW' : 'LIVE'}</div>
          </div>

          {error && <div className="wgg-error"><AlertTriangle size={18} /><div><strong>Read needs attention</strong><span>{error}</span></div></div>}

          {prepared && <div className="wgg-prepared-banner"><div><ShieldCheck size={18} /><div><strong>Protection action prepared</strong><span>{prepared.symbol} · {prepared.kind} · {prepared.amountBaseUnits} base units · {prepared.instructionCount} instructions</span></div></div><button className="wgg-hero-button" onClick={() => void signAndSendPrepared()} disabled={signing}>{signing ? <><LoaderCircle size={14} className="wgg-spin" /> Waiting for wallet</> : <>Review & sign <ArrowRight size={14} /></>}</button>{signature && <code>{signature}</code>}</div>}

          {loading && <div className="wgg-empty-state"><LoaderCircle size={20} className="wgg-spin" /><strong>Reading Kamino, xStocks and weekend history</strong><span>Read-only mainnet scan. No positions are invented while data loads.</span></div>}
          {!loading && rows.length === 0 && <div className="wgg-empty-state"><Radar size={21} /><strong>{error ? 'No position data loaded' : 'No xStock-backed Kamino obligation found'}</strong><span>The connected wallet was checked against the configured Kamino main market. Existing external positions are eligible too.</span><button className="wgg-secondary" onClick={() => void scan()}><RefreshCw size={13} /> Scan again</button></div>}

          {!loading && rows.length > 0 && (
            <div className="wgg-position-grid">
              {positions.map((position) => (
                <article className="wgg-position-card" key={position.obligation}>
                  <div className="wgg-position-card-top">
                    <div><span className="wgg-micro">OBLIGATION</span><strong>{position.obligation.slice(0, 6)}…{position.obligation.slice(-6)}</strong></div>
                    <span className="wgg-ltv-chip">LTV {position.ltvPct != null ? position.ltvPct.toFixed(2) + '%' : '—'}</span>
                  </div>

                  <div className="wgg-position-assets">
                    {position.xStocks.map((stock) => {
                      const row = rows.find((candidate) => candidate.position.obligation === position.obligation && candidate.stock.mint === stock.mint);
                      const risk = row?.risk;
                      return (
                        <div className="wgg-asset-row" key={position.obligation + '-' + stock.mint}>
                          <div className="wgg-asset-icon">{row?.symbol.slice(0, 4)}</div>
                          <div className="wgg-asset-main"><strong>{stock.symbol}</strong><span>{stock.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} collateral units</span></div>
                          <div className="wgg-asset-price"><span>{row?.price ? ' + row.price.price.toFixed(2) : 'PRICE —'}</span><small>{row?.price ? 'xStocks live price' : 'price unavailable'}</small></div>
                          {risk && <div className={'wgg-risk-tag wgg-risk-' + risk.status}><i /> {risk.status.toUpperCase()}</div>}
                          {row && risk?.status === 'flagged' && (
                            <div className="wgg-risk-actions">
                              <button className="wgg-secondary" onClick={() => void prepareFix(row, 'deposit')} disabled={preparing}>{preparing ? <LoaderCircle size={13} className="wgg-spin" /> : <ShieldCheck size={13} />} {authenticating ? 'Verify wallet' : 'Add collateral'}</button>
                              {row.position.debts.length > 0 && <button className="wgg-secondary" onClick={() => void prepareFix(row, 'repay')} disabled={preparing}>{preparing ? <LoaderCircle size={13} className="wgg-spin" /> : <ShieldCheck size={13} />} {authenticating ? 'Verify wallet' : 'Prepare repay'}</button>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="wgg-metric-row">
                    <div><span>LIQUIDATION LTV</span><strong>{position.liquidationLtvPct != null ? position.liquidationLtvPct.toFixed(2) + '%' : '—'}</strong></div>
                    <div><span>BUFFER</span><strong>{position.liquidationBufferPct != null ? position.liquidationBufferPct.toFixed(2) + ' pts' : '—'}</strong></div>
                    <div><span>WEEKEND GAP</span><strong>{(() => { const gap = position.xStocks[0]?.symbol ? weekendGaps[position.xStocks[0].symbol] : undefined; return gap?.typicalWeekendGapPct != null ? gap.typicalWeekendGapPct.toFixed(2) + '%' : '—'; })()}</strong></div>
                    <div><span>BORROW VALUE</span><strong>{position.borrowValueUsd != null ? ' + position.borrowValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</strong></div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="control" className="wgg-control-shell">
          <KaminoActionConsole address={address ?? ''} walletProvider={walletProvider ?? null} positions={positions} onCompleted={scan} />
        </section>

        <section className="wgg-method wgg-method-dashboard">
          <div className="wgg-method-heading">
            <div><div className="wgg-kicker"><span /> THE DECISION CHAIN</div><h2>One source of truth per layer.</h2></div>
            <p>Kamino owns lending state. xStocks owns current market context. The gap model measures the closed-market risk. Your wallet signs the action.</p>
          </div>
          <div className="wgg-chain">
            <article><span>01</span><Blocks size={17} /><strong>KAMINO</strong><small>Collateral · debt · LTV</small></article>
            <i>→</i>
            <article><span>02</span><Database size={17} /><strong>XSTOCKS</strong><small>Price · multiplier · asset context</small></article>
            <i>→</i>
            <article><span>03</span><BarChart3 size={17} /><strong>GAP MODEL</strong><small>Friday → next session</small></article>
            <i>→</i>
            <article><span>04</span><ShieldCheck size={17} /><strong>WALLET</strong><small>Fresh approval every action</small></article>
          </div>
        </section>
      </main>
    )}

    <footer className="wgg-footer">
      <div><strong>STOCKPASS</strong><span>Weekend Gap Guard</span></div>
      <div><span>Solana mainnet</span><i>·</i><span>Kamino overlay</span><i>·</i><span>non-custodial</span></div>
      <div><CircleHelp size={13} /><span>No demo balance is presented as real.</span></div>
    </footer>
  </div>;

}
