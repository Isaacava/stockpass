import { useEffect } from 'react';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { ArrowUpRight, Bell, Check, ChevronRight, CircleDollarSign, LockKeyhole, Radar, ShieldCheck, Users, WalletCards } from 'lucide-react';
import { supabase } from './lib/supabase';

export default function Landing() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  useEffect(() => {
    if (!address) return;
    void supabase.from('stockpass_profiles').upsert(
      { wallet: address, updated_at: new Date().toISOString() },
      { onConflict: 'wallet' }
    );
  }, [address]);

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <button className="landing-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="landing-brand-mark">SP</span>
          <span>StockPass</span>
        </button>
        <nav className="landing-nav-links" aria-label="Primary navigation">
          <a href="#proof">Proof</a>
          <a href="#signals">Signals</a>
          <a href="#profiles">Profiles</a>
        </nav>
        <button className="landing-nav-cta" onClick={() => open()}>
          {isConnected ? 'Enter StockPass' : 'Connect wallet'} <ArrowUpRight size={14} />
        </button>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-kicker"><span /> SOLANA · SOCIAL TRADING</p>
            <h1>Post the position.<br /><em>Prove the position.</em></h1>
            <p className="landing-lede">StockPass turns real Solana holdings into social proof. Follow investors, track conviction, and share positions backed by the wallet state behind them.</p>
            <div className="landing-actions">
              <button className="landing-primary" onClick={() => open()}>
                <WalletCards size={16} /> {isConnected ? 'Enter StockPass' : 'Connect wallet'}
              </button>
              <a className="landing-secondary" href="#proof">See how proof works <ChevronRight size={15} /></a>
            </div>
            <div className="landing-proof-row">
              <div><strong>01</strong><span>Wallet ownership</span></div>
              <div><strong>02</strong><span>Position snapshot</span></div>
              <div><strong>03</strong><span>Shareable proof</span></div>
            </div>
          </div>

          <div className="landing-visual" aria-label="StockPass portfolio proof preview">
            <div className="proof-window">
              <div className="proof-window-top"><span>STOCKPASS / LIVE POSITION</span><span className="status-chip"><i /> VERIFIED</span></div>
              <div className="proof-heading"><div><span className="micro-label">NVIDIA</span><strong>NVDAx</strong></div><span className="proof-record"><ShieldCheck size={13} /> HOLDER PROOF</span></div>
              <div className="proof-chart">
                <div className="grid-lines"><i /><i /><i /><i /></div>
                <svg viewBox="0 0 520 180" preserveAspectRatio="none" aria-hidden="true"><path d="M0,150 C36,140 50,148 80,126 S126,134 150,110 S205,124 232,94 S278,102 308,80 S357,88 388,61 S434,78 460,44 S495,51 520,24" /></svg>
                <div className="chart-bubble"><b>$176.38</b><span>current price</span></div>
              </div>
              <div className="position-listing">
                <div><span className="asset-avatar nvda">NV</span><div><b>NVDAx</b><small>NVIDIA tokenized equity</small></div><strong>12.40</strong><em>+$534.18</em></div>
                <div><span className="asset-avatar aapl">AP</span><div><b>AAPLx</b><small>Apple tokenized equity</small></div><strong>3.80</strong><em>+$104.22</em></div>
                <div><span className="asset-avatar spy">SP</span><div><b>SPYx</b><small>S&amp;P 500 ETF tokenized</small></div><strong>1.20</strong><em>+$68.42</em></div>
              </div>
              <div className="proof-window-footer"><span><LockKeyhole size={12} /> Solana mainnet</span><b>Snapshot verified</b></div>
            </div>
            <div className="float-card float-card-top"><span className="float-label">POST PROOF</span><b>“Holding through the move.”</b><span className="float-proof"><Check size={12} /> Verified holder</span></div>
            <div className="float-card float-card-bottom"><span className="float-label">SOCIAL SIGNAL</span><b>3 people you follow bought NVDAx</b><div className="signal-people"><span>OC</span><span>SA</span><span>CL</span><i>+3</i></div></div>
          </div>
        </section>

        <section className="landing-marquee" aria-hidden="true">
          <span>WALLET STATE</span><b>—</b><span>POSITION PROOF</span><b>—</b><span>SOCIAL CONVICTION</span><b>—</b><span>MAINNET</span>
        </section>

        <section className="landing-story" id="proof">
          <div className="story-intro"><p className="landing-kicker"><span /> THE DIFFERENCE</p><h2>A screenshot can be edited. A position snapshot can be checked.</h2></div>
          <div className="story-body"><p>StockPass connects the social layer to the wallet layer. When you publish about an asset, the app checks the connected wallet against the configured asset mint and stores the verification moment.</p><p className="story-note">The claim is about what the wallet held when the post was created — not what someone says they held.</p></div>
        </section>

        <section className="landing-feature-grid" id="signals">
          <article className="landing-feature feature-large"><span className="feature-index">01 / PROOF</span><div><div className="landing-icon"><ShieldCheck size={19} /></div><span className="micro-label">VERIFIED HOLDER</span><h3>Make credibility part of the interface.</h3><p>Every qualifying post carries a clear ownership state instead of relying on screenshots, captions, or self-reported positions.</p></div><div className="feature-detail"><span>Evidence</span><b>Wallet + mint + snapshot</b></div></article>
          <article className="landing-feature"><span className="feature-index">02 / SIGNAL</span><div><div className="landing-icon"><Radar size={19} /></div><span className="micro-label">CROWD SIGNALS</span><h3>See conviction forming.</h3><p>Follow people, watch assets and receive activity alerts when the people you trust make a move.</p></div><div className="mini-rule"><span>Example</span><strong>3 follows bought NVDAx</strong></div></article>
          <article className="landing-feature"><span className="feature-index">03 / PROFILE</span><div><div className="landing-icon"><Users size={19} /></div><span className="micro-label">PUBLIC PROFILE</span><h3>Turn a wallet into a reputation surface.</h3><p>Build a public trading identity without forcing users to expose their entire portfolio.</p></div><div className="mini-rule"><span>Share</span><strong>Profile · position · proof</strong></div></article>
          <article className="landing-feature feature-wide" id="profiles"><span className="feature-index">04 / ALERTS</span><div><div className="landing-icon"><Bell size={19} /></div><span className="micro-label">INTELLIGENT ALERTS</span><h3>Useful when the market moves — and when the people you follow move.</h3><p>Price targets and social activity live together, so discovery does not stop at a watchlist.</p></div><div className="workflow-strip"><span>PRICE</span><i>+</i><span>FOLLOW GRAPH</span><i>+</i><span>VERIFIED EVENTS</span><i>→</i><b>ONE ALERT STREAM</b></div></article>
        </section>

        <section className="landing-architecture">
          <div className="architecture-copy"><p className="landing-kicker"><span /> TRUST LAYER</p><h2>Built around the wallet, not around the screenshot.</h2><p>StockPass uses Solana mainnet as the source of truth for ownership and transaction state. The social product sits on top of that evidence layer.</p></div>
          <div className="architecture-map"><div className="arch-node"><span>01</span><b>Your wallet</b><small>Real holdings · real transactions</small></div><div className="arch-line" /><div className="arch-node arch-engine"><span>02</span><b>StockPass verification</b><small>Asset mint · balance · timestamp · slot</small></div><div className="arch-line" /><div className="arch-node arch-devnet"><span>03</span><b>Social layer</b><small>Posts · follows · alerts · share cards</small></div></div>
        </section>

        <section className="landing-final">
          <div><p className="landing-kicker"><span /> START WITH PROOF</p><h2>Your position.<br /><em>Your proof.</em></h2><p>Connect a Solana wallet and enter StockPass.</p></div>
          <button className="landing-final-button" onClick={() => open()}><CircleDollarSign size={16} /> {isConnected ? 'Enter StockPass' : 'Connect wallet'}</button>
        </section>
      </main>

      <footer className="landing-footer"><span>StockPass · Solana social trading</span><span>Built for Stocklana</span><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top ↑</button></footer>
    </div>
  );
}
