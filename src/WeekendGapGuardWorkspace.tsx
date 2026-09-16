import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, CircleHelp, Gauge, LoaderCircle, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { discoverKaminoXStockPositions, type KaminoXStockPosition } from './lib/kamino';
import { evaluateWeekendRisk } from './lib/wggRisk';
import { fetchPythPrices, fetchWeekendGapSummaries, type PythPriceMap, type WeekendGapMap } from './lib/pyth';
import './weekend-gap-guard.css';

const EMPTY_POSITIONS: KaminoXStockPosition[] = [];
const endpoint = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

export default function WeekendGapGuardWorkspace() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const [positions, setPositions] = useState<KaminoXStockPosition[]>(EMPTY_POSITIONS);
  const [pythPrices, setPythPrices] = useState<PythPriceMap>({});
  const [weekendGaps, setWeekendGaps] = useState<WeekendGapMap>({});
  const [monitoring, setMonitoring] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [pythError, setPythError] = useState('');
  const [gapError, setGapError] = useState('');
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  const summary = useMemo(() => ({
    positions: positions.flatMap((position) => position.xStocks.map((stock) => {
      const symbol = stock.symbol.replace(/x$/i, '');
      const gap = weekendGaps[symbol];
      const risk = position.liquidationBufferPct !== null && gap?.typicalWeekendGapPct !== null && gap?.typicalWeekendGapPct !== undefined
        ? evaluateWeekendRisk({ currentBufferPct: position.liquidationBufferPct, typicalWeekendGapPct: gap.typicalWeekendGapPct })
        : null;
      return {
        ...stock,
        symbol,
        obligation: position.obligation,
        ltvPct: position.ltvPct,
        liquidationLtvPct: position.liquidationLtvPct,
        liquidationBufferPct: position.liquidationBufferPct,
        pyth: pythPrices[symbol],
        gap,
        risk,
      };
    })),
    debtUsd: positions.reduce((sum, position) => sum + (position.borrowValueUsd ?? 0), 0),
    collateralUsd: positions.reduce((sum, position) => sum + (position.depositValueUsd ?? 0), 0),
  }), [positions, pythPrices, weekendGaps]);

  const connect = () => void open();

  const loadPositions = async () => {
    if (!address) return;
    setMonitoring(true);
    setLoadingPositions(true);
    setLoadError('');
    setPythError('');
    setGapError('');
    try {
      const discovered = await discoverKaminoXStockPositions(address, endpoint);
      setPositions(discovered);
      const symbols = Array.from(new Set(discovered.flatMap((position) => position.xStocks.map((stock) => stock.symbol.replace(/x$/i, '')))));
      setWeekendGaps({});
      if (symbols.length) {
        try {
          setPythPrices(await fetchPythPrices(symbols));
        } catch (error) {
          console.error('Weekend Gap Guard Pyth request failed', error);
          setPythPrices({});
          setPythError(error instanceof Error ? error.message : 'Pyth live pricing is not configured yet.');
        }
        try {
          setWeekendGaps(await fetchWeekendGapSummaries(symbols, 13));
        } catch (error) {
          console.error('Weekend Gap Guard historical gap request failed', error);
          setWeekendGaps({});
          setGapError(error instanceof Error ? error.message : 'Historical weekend-gap data is not configured yet.');
        }
      } else {
        setPythPrices({});
      }
      setLastLoaded(new Date());
    } catch (error) {
      console.error('Weekend Gap Guard Kamino discovery failed', error);
      setPositions([]);
      setPythPrices({});
      setWeekendGaps({});
      setLoadError(error instanceof Error ? error.message : 'Could not load Kamino obligations.');
    } finally {
      setLoadingPositions(false);
    }
  };

  const riskCounts = summary.positions.reduce((acc, item) => {
    if (item.risk?.status === 'flagged') acc.flagged += 1;
    else if (item.risk?.status === 'watch') acc.watch += 1;
    else if (item.risk?.status === 'safe') acc.safe += 1;
    return acc;
  }, { flagged: 0, watch: 0, safe: 0 });

  return <div className="wgg-app">
    <header className="wgg-header">
      <div className="wgg-brand"><span className="wgg-mark">WG</span><div><strong>Weekend Gap Guard</strong><small>risk protection for xStock collateral</small></div></div>
      <div className="wgg-header-right"><span className="wgg-mainnet"><i /> SOLANA MAINNET</span>{isConnected ? <div className="wgg-wallet"><Wallet size={14} />{address ? `${address.slice(0, 4)}…${address.slice(-4)}` : 'Connected'}</div> : <button className="wgg-connect" onClick={connect}>Connect wallet</button>}</div>
    </header>

    <main className="wgg-main">
      <section className="wgg-hero">
        <div className="wgg-hero-copy">
          <div className="wgg-eyebrow"><span /> WEEKEND RISK MONITOR</div>
          <h1>Know the gap<br /><em>before Monday.</em></h1>
          <p>Weekend Gap Guard watches real Kamino xStock collateral and checks whether your current liquidation buffer can absorb a modeled historical weekend move.</p>
          <div className="wgg-hero-actions">
            {!isConnected ? <button className="wgg-primary" onClick={connect}>Connect wallet <ArrowRight size={15} /></button> : <button className="wgg-primary" onClick={() => void loadPositions()} disabled={loadingPositions}>{loadingPositions ? <><LoaderCircle size={15} className="wgg-spin" /> Scanning Kamino</> : <>Scan my Kamino positions <ArrowRight size={15} /></>}</button>}
            <span className="wgg-hero-note"><ShieldCheck size={14} /> Read-only scan · every future fix is user-signed</span>
          </div>
        </div>
        <div className="wgg-hero-card">
          <div className="wgg-card-top"><span>FRIDAY CHECK</span><span className="wgg-status-dot"><i /> {loadingPositions ? 'SCANNING' : isConnected ? 'READY' : 'WAITING'}</span></div>
          <div className="wgg-risk-meter"><div style={{ width: `${isConnected ? Math.min(100, Math.max(8, 100 - riskCounts.flagged * 25 - riskCounts.watch * 10)) : 12}%` }} /></div>
          <div className="wgg-meter-label"><span>Protection signal</span><strong>{riskCounts.flagged ? `${riskCounts.flagged} flagged` : riskCounts.watch ? `${riskCounts.watch} on watch` : summary.positions.length ? 'Gap model loaded' : 'Waiting for scan'}</strong></div>
          <div className="wgg-card-rule"><span>xStock positions</span><b>{summary.positions.length || '—'}</b></div>
          <div className="wgg-card-rule"><span>Collateral value</span><b>{summary.collateralUsd ? `$${summary.collateralUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</b></div>
          <div className="wgg-card-rule"><span>Debt value</span><b>{summary.debtUsd ? `$${summary.debtUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</b></div>
        </div>
      </section>

      <section className="wgg-principles">
        <div><Gauge size={18} /><div><strong>Independent Pyth signal</strong><span>Live Pyth price is displayed beside Kamino's own position state.</span></div></div>
        <div><Bell size={18} /><div><strong>Historical gap check</strong><span>A 13-week Friday-close → next-session-open history is compared with the live liquidation buffer.</span></div></div>
        <div><ShieldCheck size={18} /><div><strong>One-tap fix</strong><span>A specific repay or collateral transaction is prepared for your review.</span></div></div>
      </section>

      {isConnected && <section className="wgg-dashboard">
        <div className="wgg-section-head"><div><div className="wgg-eyebrow">REAL KAMINO + PYTH DATA</div><h2>{monitoring ? 'Your xStock-backed obligations.' : 'Scan your Kamino exposure.'}</h2><p>{lastLoaded ? `Mainnet scan completed ${lastLoaded.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'This reads the current Kamino Main Market, filters official xStocks, then requests live Pyth and historical weekend-gap data for each underlying equity.'}</p></div><button className="wgg-secondary" onClick={() => void loadPositions()} disabled={loadingPositions}><RefreshCw size={14} /> Refresh</button></div>

        {loadError && <div className="wgg-error"><AlertTriangle size={18} /><div><strong>Kamino scan failed</strong><span>{loadError}</span></div></div>}
        {pythError && <div className="wgg-error"><AlertTriangle size={18} /><div><strong>Pyth live price unavailable</strong><span>{pythError}</span></div></div>}
        {gapError && <div className="wgg-error"><AlertTriangle size={18} /><div><strong>Weekend-gap history unavailable</strong><span>{gapError}</span></div></div>}

        {!loadingPositions && !loadError && positions.length === 0 && <div className="wgg-empty"><AlertTriangle size={21} /><strong>No xStock-backed Kamino obligation found</strong><span>The scan completed against mainnet. We did not fabricate a position when no matching Kamino obligation was found.</span></div>}

        {loadingPositions && <div className="wgg-empty"><LoaderCircle size={21} className="wgg-spin" /><strong>Reading Kamino, Pyth and weekend history</strong><span>Loading the current Main Market, wallet obligations, independent equity prices and historical Friday-to-next-session observations. This is read-only.</span></div>}

        {!loadingPositions && positions.length > 0 && <div className="wgg-position-list">{positions.map((position) => <article className="wgg-position-card" key={position.obligation}><div className="wgg-position-head"><div><span className="wgg-position-label">OBLIGATION</span><strong>{position.obligation.slice(0, 6)}…{position.obligation.slice(-6)}</strong></div><span className="wgg-ltv">LTV {position.ltvPct !== null ? `${position.ltvPct.toFixed(2)}%` : '—'}</span></div><div className="wgg-xstock-list">{position.xStocks.map((stock) => { const symbol = stock.symbol.replace(/x$/i, ''); const pyth = pythPrices[symbol]; const gap = weekendGaps[symbol]; const risk = position.liquidationBufferPct !== null && gap?.typicalWeekendGapPct !== null && gap?.typicalWeekendGapPct !== undefined ? evaluateWeekendRisk({ currentBufferPct: position.liquidationBufferPct, typicalWeekendGapPct: gap.typicalWeekendGapPct }) : null; return <div className="wgg-xstock-row" key={`${position.obligation}-${stock.mint}`}><span className="wgg-xstock-icon">{symbol.slice(0, 4)}</span><div><strong>{stock.symbol}</strong><span>{stock.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} collateral units</span></div><div className="wgg-xstock-status"><span>{pyth ? `$${pyth.price.toFixed(2)} Pyth` : 'Pyth pending'}</span>{risk && <strong>{risk.status.toUpperCase()}</strong>}</div></div>; })}</div><div className="wgg-position-metrics"><div><span>Liquidation LTV</span><strong>{position.liquidationLtvPct !== null ? `${position.liquidationLtvPct.toFixed(2)}%` : '—'}</strong></div><div><span>Current buffer</span><strong>{position.liquidationBufferPct !== null ? `${position.liquidationBufferPct.toFixed(2)} pts` : '—'}</strong></div><div><span>Typical weekend gap</span><strong>{summary.positions.find((item) => item.obligation === position.obligation)?.gap?.typicalWeekendGapPct != null ? `${summary.positions.find((item) => item.obligation === position.obligation)!.gap!.typicalWeekendGapPct.toFixed(2)}%` : '—'}</strong></div><div><span>Borrow value</span><strong>{position.borrowValueUsd !== null ? `$${position.borrowValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}</strong></div></div></article>)}</div>}
      </section>}

      <section className="wgg-explain"><div><div className="wgg-eyebrow">HOW IT WORKS</div><h2>Not a lending protocol.<br />A protection layer.</h2></div><div className="wgg-steps"><article><b>01</b><strong>Discover</strong><span>Read the wallet's real Kamino obligations.</span></article><article><b>02</b><strong>Assess</strong><span>Measure the live liquidation buffer against historical weekend-gap observations.</span></article><article><b>03</b><strong>Protect</strong><span>Alert the user and prepare the exact fix they can sign.</span></article></div></section>

      <footer className="wgg-footer"><span>Weekend Gap Guard</span><span>Solana mainnet · Kamino overlay · no custody</span><span><CircleHelp size={12} /> No demo balance is ever presented as a real position.</span></footer>
    </main>
  </div>;
}
