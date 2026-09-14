import { useEffect } from 'react';
import { useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { ArrowUpRight, Bell, Check, ChevronRight, CircleDollarSign, LineChart, LockKeyhole, Radar, ShieldCheck, WalletCards } from 'lucide-react';
import { supabase } from './lib/supabase';
import './landing.css';

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
          <a href="#utility">Utility</a>
          <a href="#proof">Proof</a>
          <a href="#signals">Signals</a>
          <a href="#profiles">Social</a>
        </nav>
        <button className="landing-nav-cta" onClick={() => open()}>
          {isConnected ? 'Open workspace' : 'Connect wallet'} <ArrowUpRight size={14} />
        </button>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-kicker"><span /> SOLANA · XSTOCK UTILITY</p>
            <h1>Know what you own.<br /><em>Prove it. Act on it.</em></h1>
            <p className="landing-lede">StockPass is a utility layer for real Solana xStock holdings. Verify the wallet, monitor the portfolio, follow market signals, set alerts, and turn verified positions into shareable proof.</p>
            <div className="landing-actions">
              <button className="landing-primary" onClick={() => open()}>
                <WalletCards size={16} /> {isConnected ? 'Open workspace' : 'Connect wallet'}
              </button>
              <a className="landing-secondary" href="#utility">Explore the utility layer <ChevronRight size={15} /></a>
            </div>
            <div className="landing-proof-row">
              <div><strong>01</strong><span>Live xStock portfolio</span></div>
              <div><strong>02</strong><span>Mainnet ownership proof</span></div>
              <div><strong>03</strong><span>Alerts, signals & history</span></div>
            </div>
          </div>

          <div className="landing-visual" aria-label="StockPass utility workspace preview">
            <div className="proof-window">
              <div className="proof-window-top"><span>STOCKPASS / PORTFOLIO</span><span className="status-chip"><i /> MAINNET LIVE</span></div>
              <div className="proof-heading"><div><span className="micro-label">PORTFOLIO VALUE</span><strong>$24,860.42</strong></div><span className="proof-record"><ShieldCheck size={13} /> VERIFIED WALLET</span></div>
              <div className="proof-chart">
                <div className="grid-lines"><i /><i /><i /><i /></div>
                <svg viewBox="0 0 520 180" preserveAspectRatio="none" aria-hidden="true"><path d="M0,146 C35,151 53,128 81,135 S124,112 151,118 S197,91 230,103 S272,78 306,85 S347,61 385,70 S429,44 462,50 S495,29 520,21" /></svg>
                <div className="chart-bubble"><b>LIVE</b><span>official xStocks feed</span></div>
              </div>
              <div className="position-listing">
                <div><span className="asset-avatar nvda">NV</span><div><b>NVDAx</b><small>Verified balance · mainnet</small></div><strong>$10,440</strong><em>+8.4%</em></div>
                <div><span className="asset-avatar aapl">AP</span><div><b>AAPLx</b><small>Verified balance · mainnet</small></div><strong>$8,120</strong><em>+3.1%</em></div>
                <div><span className="asset-avatar spy">SP</span><div><b>SPYx</b><small>Verified balance · mainnet</small></div><strong>$6,300</strong><em>+1.7%</em></div>
              </div>
              <div className="proof-window-footer"><span><LockKeyhole size={12} /> Solana mainnet source of truth</span><b>Balances verified</b></div>
            </div>
            <div className="float-card float-card-top"><span className="float-label">PRICE ALERT</span><b>NVDAx crossed your target.</b><span className="float-proof"><Check size={12} /> Alert ready</span></div>
            <div className="float-card float-card-bottom"><span className="float-label">PROOF SNAPSHOT</span><b>A position was verified at a specific slot and timestamp.</b><div className="signal-people"><span>✓</span><span>SP</span><span>TX</span><i>LIVE</i></div></div>
          </div>
        </section>

        <section className="landing-marquee" aria-hidden="true">
          <span>PORTFOLIO</span><b>—</b><span>PROOF</span><b>—</b><span>PRICE SIGNALS</span><b>—</b><span>ALERTS</span><b>—</b><span>SOCIAL LAYER</span>
        </section>

        <section className="landing-story" id="utility">
          <div className="story-intro"><p className="landing-kicker"><span /> THE UTILITY LAYER</p><h2>Your wallet becomes a live utility surface, not just an address.</h2></div>
          <div className="story-body"><p>StockPass reads supported xStock balances from Solana mainnet, resolves official asset metadata and market data, and turns that information into useful portfolio, proof and alert workflows.</p><p className="story-note">The social layer is built on top of the utility layer: first verify the position, then share it, follow it, or act on the signal.</p></div>
        </section>

        <section className="landing-feature-grid" id="proof">
          <article className="landing-feature feature-large"><span className="feature-index">01 / PORTFOLIO</span><div><div className="landing-icon"><WalletCards size={19} /></div><span className="micro-label">LIVE XSTOCK HOLDINGS</span><h3>See every supported xStock your wallet actually holds.</h3><p>Balances are discovered from the wallet's real Solana token accounts. No fake balances, demo positions or simulated portfolio state.</p></div><div className="feature-detail"><span>Source</span><b>SPL + Token-2022 · Solana mainnet</b></div></article>
          <article className="landing-feature"><span className="feature-index">02 / PROOF</span><div><div className="landing-icon"><ShieldCheck size={19} /></div><span className="micro-label">VERIFIED OWNERSHIP</span><h3>Turn a balance into evidence.</h3><p>Every proof-backed post can carry the asset mint, wallet and verification moment behind the claim.</p></div><div className="mini-rule"><span>Evidence</span><strong>Wallet · mint · slot · timestamp</strong></div></article>
          <article className="landing-feature"><span className="feature-index">03 / MARKETS</span><div><div className="landing-icon"><LineChart size={19} /></div><span className="micro-label">OFFICIAL MARKET DATA</span><h3>Put your holdings beside the market.</h3><p>Track supported xStocks with official metadata and public market feeds so the utility stays connected to what is moving now.</p></div><div className="mini-rule"><span>Context</span><strong>Price · asset · live state</strong></div></article>
          <article className="landing-feature"><span className="feature-index">04 / ALERTS</span><div><div className="landing-icon"><Bell size={19} /></div><span className="micro-label">PRICE + ACTIVITY ALERTS</span><h3>Know when something needs attention.</h3><p>Save price targets and receive useful activity around the assets and wallets that matter to you.</p></div><div className="workflow-strip"><span>PRICE</span><i>+</i><span>PORTFOLIO</span><i>+</i><span>FOLLOW GRAPH</span><i>→</i><b>ONE SIGNAL SURFACE</b></div></article>
          <article className="landing-feature feature-wide" id="signals"><span className="feature-index">05 / ACTION</span><div><div className="landing-icon"><Radar size={19} /></div><span className="micro-label">UTILITY → SIGNAL → ACTION</span><h3>Use proof and market context to decide what to do next.</h3><p>StockPass is designed so utility comes first: monitor the wallet, understand the asset, spot the event, then act. Future buy, sell and swap flows remain real wallet-signed Solana mainnet transactions.</p></div><div className="workflow-strip"><span>VERIFY</span><i>→</i><span>MONITOR</span><i>→</i><span>ALERT</span><i>→</i><b>ACT</b></div></article>
        </section>

        <section className="landing-architecture">
          <div className="architecture-copy"><p className="landing-kicker"><span /> TRUST LAYER</p><h2>The wallet is the source of truth. Everything else builds around it.</h2><p>StockPass uses Solana mainnet for supported asset ownership and state. Portfolio utilities and market signals read from that foundation, while social features make verified information easier to share and discover.</p></div>
          <div className="architecture-map"><div className="arch-node"><span>01</span><b>Your wallet</b><small>Real holdings · real transactions</small></div><div className="arch-line" /><div className="arch-node arch-engine"><span>02</span><b>StockPass utility engine</b><small>Assets · balances · prices · proof · alerts</small></div><div className="arch-line" /><div className="arch-node arch-devnet"><span>03</span><b>Social & action layer</b><small>Posts · follows · notifications · signed actions</small></div></div>
        </section>

        <section className="landing-story" id="profiles">
          <div className="story-intro"><p className="landing-kicker"><span /> SOCIAL, NOT SOCIAL-FIRST</p><h2>Follow people because their information is useful.</h2></div>
          <div className="story-body"><p>Profiles, posts and follows give the utility layer a human network. Users can show verified positions, inspect another wallet's supported xStocks, receive activity and share proof without turning StockPass into a generic social feed.</p><p className="story-note">Utility first. Social when it adds context.</p></div>
        </section>

        <section className="landing-final">
          <div><p className="landing-kicker"><span /> START WITH UTILITY</p><h2>Your portfolio.<br /><em>Your proof.</em></h2><p>Connect a Solana wallet and inspect your real xStock state.</p></div>
          <button className="landing-final-button" onClick={() => open()}><CircleDollarSign size={16} /> {isConnected ? 'Open workspace' : 'Connect wallet'}</button>
        </section>
      </main>

      <footer className="landing-footer"><span>StockPass · Solana xStock utility</span><span>Built for Stocklana</span><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Back to top ↑</button></footer>
    </div>
  );
}
