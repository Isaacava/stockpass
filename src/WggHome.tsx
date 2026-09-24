import "./wgg-home.css";

type Props = {
  onLaunch?: () => void;
};

const method = [
  {
    index: "01",
    kicker: "POSITION",
    title: "Find the exposure that actually matters.",
    body: "Connect a Solana wallet. WGG reads the wallet's live Kamino obligations and isolates xStock collateral such as AAPLx, NVDAx and TSLAx.",
  },
  {
    index: "02",
    kicker: "SCENARIO",
    title: "Stress the loan, not the headline.",
    body: "The model takes the underlying stock's Friday-close to next-session-open downside history and applies that shock to the live LTV.",
  },
  {
    index: "03",
    kicker: "RESPONSE",
    title: "Turn a warning into a transaction you control.",
    body: "When the scenario crosses the boundary, WGG prepares a Kamino repay or add-collateral transaction. You inspect it and sign it yourself.",
  },
];

const sources = [
  {
    name: "Solana",
    role: "Position truth",
    detail: "Wallet ownership and Token-2022 balances.",
  },
  {
    name: "Kamino",
    role: "Loan truth",
    detail: "Collateral, debt, LTV and liquidation threshold.",
  },
  {
    name: "xStocks",
    role: "Market truth",
    detail: "Current xStock price and multiplier.",
  },
  {
    name: "Twelve Data",
    role: "Historical context",
    detail: "Underlying-stock daily OHLC for the gap model.",
  },
];

const guardrails = [
  "No custody. Your funds and keys stay in your wallet.",
  "No standing approval. Every fund-moving action is signed by you.",
  "No automatic liquidation. WGG can warn and prepare; it does not seize or move funds.",
  "No invented state. Missing upstream data remains visibly unavailable.",
];

const navItems = [
  { href: "#why", label: "Why the gap" },
  { href: "#method", label: "The method" },
  { href: "#sources", label: "The sources" },
  { href: "#guardrails", label: "The guardrails" },
];

export default function WggHome({ onLaunch }: Props) {
  const launch = () => onLaunch?.();

  return (
    <div className="wgh">
      <header className="wgh-nav">
        <a className="wgh-brand" href="#top" aria-label="Weekend Gap Guard home">
          <span className="wgh-brand-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span className="wgh-brand-copy">
            <strong>WGG</strong>
            <small>Weekend Gap Guard</small>
          </span>
        </a>

        <nav className="wgh-nav-links" aria-label="Primary navigation">
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
        </nav>

        <button className="wgh-nav-cta" onClick={launch}>
          Check my position
          <span aria-hidden="true">↗</span>
        </button>
      </header>

      <main id="top">
        <section className="wgh-hero">
          <div className="wgh-hero-copy">
            <div className="wgh-eyebrow">
              <span className="wgh-eyebrow-dot" />
              SOLANA MAINNET · KAMINO · XSTOCKS
            </div>

            <h1>Friday closes the market.<br /><em>Your collateral stays live.</em></h1>

            <p className="wgh-hero-lede">
              xStocks keep trading on Solana while the US equity market is closed. That gap between
              live collateral and a sleeping underlying market is where weekend risk begins.
            </p>

            <div className="wgh-hero-actions">
              <button className="wgh-button wgh-button--solid" onClick={launch}>
                Connect wallet
                <span aria-hidden="true">→</span>
              </button>
              <a className="wgh-button wgh-button--quiet" href="#method">
                See the method
              </a>
            </div>

            <div className="wgh-proofline">
              <span>REAL POSITION</span>
              <i />
              <span>LIVE LTV</span>
              <i />
              <span>HISTORICAL GAP</span>
              <i />
              <span>WALLET-SIGNED ACTION</span>
            </div>
          </div>

          <figure className="wgh-hero-card" aria-labelledby="wgh-gap-caption">
            <div className="wgh-card-topline">
              <span>WEEKEND WINDOW</span>
              <span className="wgh-live-tag"><i /> MAINNET</span>
            </div>

            <div className="wgh-window-head">
              <div>
                <small>THE RISK</small>
                <strong>Price can move before the stock reopens.</strong>
              </div>
              <span className="wgh-card-index">01</span>
            </div>

            <div className="wgh-timeline">
              <div className="wgh-time-row">
                <span>FRI</span>
                <strong>16:00 ET</strong>
                <small>US close</small>
              </div>
              <div className="wgh-time-line">
                <span className="wgh-line-fill" />
                <b>WEEKEND</b>
              </div>
              <div className="wgh-time-row wgh-time-row--right">
                <span>MON</span>
                <strong>09:30 ET</strong>
                <small>US open</small>
              </div>
            </div>

            <div className="wgh-risk-strip">
              <div className="wgh-risk-safe">
                <span>LIQUIDATION BUFFER</span>
                <strong>room</strong>
              </div>
              <div className="wgh-risk-gap">
                <span>DOWNWARD SCENARIO</span>
                <strong>gap</strong>
              </div>
            </div>

            <div className="wgh-caption-row">
              <div>
                <span className="wgh-caption-label">WHAT WGG CHECKS</span>
                <p>Does the historical downside scenario consume more of your live buffer than the position can absorb?</p>
              </div>
              <span className="wgh-caption-arrow" aria-hidden="true">↘</span>
            </div>

            <figcaption id="wgh-gap-caption">
              Illustration only. The connected workspace replaces the illustration with your actual Kamino state.
            </figcaption>
          </figure>
        </section>

        <section id="why" className="wgh-story">
          <div className="wgh-section-label">WHY THE GAP MATTERS</div>
          <div className="wgh-story-grid">
            <h2>The dangerous part is not Friday.<br /><em>It is what happens between two closes.</em></h2>
            <div className="wgh-story-copy">
              <p>
                Your Kamino position does not pause because the traditional market does. When the
                underlying stock reopens after the weekend, a sharp repricing can arrive before you
                have had a chance to react.
              </p>
              <p>
                Weekend Gap Guard makes that hidden window explicit: live position on one side,
                historical downside on the other, one clear protection state in the middle.
              </p>
            </div>
          </div>
        </section>

        <section id="method" className="wgh-section">
          <div className="wgh-section-head">
            <div>
              <div className="wgh-section-label">THE METHOD</div>
              <h2>One chain from position to protection.</h2>
            </div>
            <p>No black box. No substitute data. Every stage has a defined source and a defined job.</p>
          </div>

          <div className="wgh-method-grid">
            {method.map((item) => (
              <article className="wgh-method-card" key={item.index}>
                <div className="wgh-method-meta">
                  <span>{item.index}</span>
                  <small>{item.kicker}</small>
                </div>
                <div className="wgh-method-rule" />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <div className="wgh-method-caption">
                  <span>STEP {item.index}</span>
                  <b>{item.index === "01" ? "READ" : item.index === "02" ? "MODEL" : "PREPARE"}</b>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="sources" className="wgh-source-section">
          <div className="wgh-source-intro">
            <div className="wgh-section-label">SOURCE MAP</div>
            <h2>Every number has one owner.</h2>
            <p>
              WGG keeps account state, market state and historical context separate. One provider
              cannot quietly stand in for another.
            </p>
          </div>

          <div className="wgh-source-list">
            {sources.map((source, index) => (
              <div className="wgh-source-row" key={source.name}>
                <span className="wgh-source-no">0{index + 1}</span>
                <strong>{source.name}</strong>
                <span className="wgh-source-role">{source.role}</span>
                <p>{source.detail}</p>
                <span className="wgh-source-arrow" aria-hidden="true">↗</span>
              </div>
            ))}
          </div>
        </section>

        <section id="guardrails" className="wgh-guard-section">
          <div className="wgh-guard-head">
            <div className="wgh-section-label">THE GUARDRAILS</div>
            <h2>Protection without taking control.</h2>
            <p>
              WGG is deliberately narrow: observe the position, model the weekend, prepare a
              response, return control to the wallet.
            </p>
          </div>

          <div className="wgh-guard-grid">
            {guardrails.map((item, index) => (
              <article className="wgh-guard-card" key={item}>
                <span className="wgh-guard-no">0{index + 1}</span>
                <span className="wgh-guard-mark" aria-hidden="true">—</span>
                <p>{item}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="wgh-monitor-card">
          <div>
            <div className="wgh-section-label">MONITORING</div>
            <h2>Know before the weekend is over.</h2>
            <p>
              Once a position is enrolled, WGG can re-read Kamino, refresh market context and raise
              a warning when the live position enters a watch or flagged state. Telegram is optional.
            </p>
          </div>

          <div className="wgh-monitor-panel">
            <div className="wgh-monitor-top">
              <span>WGG / MONITOR</span>
              <span>OPT-IN</span>
            </div>
            <div className="wgh-monitor-line">
              <span />
              <i>POSITION</i>
              <b>→</b>
              <i>SCENARIO</i>
              <b>→</b>
              <i>ALERT</i>
            </div>
            <small>No automated fund movement.</small>
          </div>
        </section>

        <section className="wgh-final">
          <div>
            <div className="wgh-section-label">START WITH THE REAL THING</div>
            <h2>Check the position<br /><em>before the gap.</em></h2>
            <p>Connect your wallet and let WGG work from the live Solana and Kamino state it can actually verify.</p>
          </div>

          <button className="wgh-button wgh-button--solid wgh-final-button" onClick={launch}>
            Connect wallet
            <span aria-hidden="true">→</span>
          </button>
        </section>
      </main>

      <footer className="wgh-footer">
        <div>
          <span className="wgh-footer-mark">WGG</span>
          <span>Weekend Gap Guard</span>
        </div>
        <span>Part of StockPass · Solana mainnet</span>
        <span>Risk states are historical estimates, not guarantees.</span>
      </footer>
    </div>
  );
}
