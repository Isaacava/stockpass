import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Bell, CircleHelp, Gauge, ShieldCheck, Wallet } from 'lucide-react';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { evaluateWeekendRisk } from './lib/wggRisk';
import './weekend-gap-guard.css';

type DemoPosition = {
  symbol: string;
  collateral: number;
  collateralValue: number;
  debt: number;
  buffer: number;
  typicalGap: number;
  earningsRisk: boolean;
};

const EMPTY_POSITIONS: DemoPosition[] = [];

export default function WeekendGapGuardWorkspace() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const [positions] = useState<DemoPosition[]>(EMPTY_POSITIONS);
  const [monitoring, setMonitoring] = useState(false);

  const summary = useMemo(() => {
    const evaluated = positions.map((position) => ({
      ...position,
      risk: evaluateWeekendRisk({ currentBufferPct: position.buffer, typicalWeekendGapPct: position.typicalGap, earningsRisk: position.earningsRisk }),
    }));
    return {
      evaluated,
      flagged: evaluated.filter((position) => position.risk.status === 'flagged').length,
      watch: evaluated.filter((position) => position.risk.status === 'watch').length,
    };
  }, [positions]);

  const connect = () => void open();

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
          <p>Weekend Gap Guard watches real Kamino xStock collateral and checks whether your current buffer can absorb a typical Friday-close to Monday-open move.</p>
          <div className="wgg-hero-actions">
            {!isConnected ? <button className="wgg-primary" onClick={connect}>Connect wallet <ArrowRight size={15} /></button> : <button className="wgg-primary" onClick={() => setMonitoring(true)}>Monitor my Kamino positions <ArrowRight size={15} /></button>}
            <span className="wgg-hero-note"><ShieldCheck size={14} /> No custody · every fix is user-signed</span>
          </div>
        </div>
        <div className="wgg-hero-card">
          <div className="wgg-card-top"><span>FRIDAY CHECK</span><span className="wgg-status-dot"><i /> READY</span></div>
          <div className="wgg-risk-meter"><div style={{ width: `${isConnected ? Math.min(100, Math.max(8, 100 - summary.flagged * 20 - summary.watch * 8)) : 12}%` }} /></div>
          <div className="wgg-meter-label"><span>Portfolio protection</span><strong>{isConnected && positions.length ? 'Live' : 'Waiting for wallet'}</strong></div>
          <div className="wgg-card-rule"><span>Kamino position</span><b>{summary.evaluated.length || '—'}</b></div>
          <div className="wgg-card-rule"><span>Flagged</span><b>{summary.flagged || '—'}</b></div>
          <div className="wgg-card-rule"><span>Watch</span><b>{summary.watch || '—'}</b></div>
        </div>
      </section>

      <section className="wgg-principles">
        <div><Gauge size={18} /><div><strong>Independent risk signal</strong><span>Pyth adds a live market view beside Kamino's own position state.</span></div></div>
        <div><Bell size={18} /><div><strong>Friday protection check</strong><span>Monitored positions are evaluated before the weekend starts.</span></div></div>
        <div><ShieldCheck size={18} /><div><strong>One-tap fix</strong><span>A specific repay or collateral transaction is prepared for your review.</span></div></div>
      </section>

      {isConnected && <section className="wgg-dashboard">
        <div className="wgg-section-head"><div><div className="wgg-eyebrow">YOUR POSITIONS</div><h2>{monitoring ? 'Monitoring started.' : 'Connect your Kamino exposure.'}</h2><p>{monitoring ? 'The next step is to load real Kamino obligations and filter xStock collateral.' : 'Nothing is fabricated here. The dashboard will only show positions discovered from Solana mainnet.'}</p></div><div className="wgg-source-badge"><span>DATA SOURCE</span><strong>Kamino + Pyth</strong></div></div>
        <div className="wgg-empty"><AlertTriangle size={21} /><strong>{monitoring ? 'Position discovery is the next build step' : 'No monitored positions loaded yet'}</strong><span>We will connect the wallet to Kamino's current SDK, discover obligations, then calculate weekend-gap risk from the real position state.</span></div>
      </section>}

      <section className="wgg-explain"><div><div className="wgg-eyebrow">HOW IT WORKS</div><h2>Not a lending protocol.<br />A protection layer.</h2></div><div className="wgg-steps"><article><b>01</b><strong>Discover</strong><span>Read the wallet's real Kamino obligations.</span></article><article><b>02</b><strong>Assess</strong><span>Compare current liquidation buffer to historical weekend-gap risk.</span></article><article><b>03</b><strong>Protect</strong><span>Alert the user and prepare the exact fix they can sign.</span></article></div></section>

      <footer className="wgg-footer"><span>Weekend Gap Guard</span><span>Solana mainnet · Kamino overlay · no custody</span><span><CircleHelp size={12} /> Demo/test data is never presented as a real position.</span></footer>
    </main>
  </div>;
}
