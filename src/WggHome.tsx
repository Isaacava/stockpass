import "./wgg-home.css";

type Props = {
  /** Called by every "Connect wallet" / "Launch app" button. Route to the authenticated WGG workspace. */
  onLaunch?: () => void;
};

const steps = [
  {
    title: "Discover",
    body: "Connect your Solana wallet. We read your real Kamino obligations and pick out the ones backed by xStocks such as AAPLx or NVDAx.",
  },
  {
    title: "Assess",
    body: "We compare how close your loan is to liquidation with how far that stock has historically gapped down between Friday's close and the next open.",
  },
  {
    title: "Protect",
    body: "If a weekend could push you over the line, we prepare a Kamino repay or add-collateral transaction. You review it and sign it in your own wallet.",
  },
];

const sources = [
  { who: "Solana", what: "What your wallet actually holds, as raw Token-2022 balances." },
  { who: "xStocks", what: "The current price of each xStock and its multiplier." },
  { who: "Kamino", what: "Your collateral, debt, LTV and liquidation threshold." },
  { who: "Twelve Data", what: "Historical daily prices of the underlying stock, used only for the weekend-gap model." },
];

const never = [
  "Hold your funds or your private keys",
  "Keep standing permission to send transactions",
  "Liquidate or move anything automatically",
  "Show a balance or risk number it could not verify",
];

export default function WggHome({ onLaunch }: Props) {
  const launch = () => onLaunch?.();

  return (
    <div className="wgh">
      <header className="wgh-bar">
        <a className="wgh-brand" href="#top" aria-label="Weekend Gap Guard home">
          <span className="wgh-mark" aria-hidden="true" />
          Weekend Gap Guard
        </a>
        <button className="wgh-btn wgh-btn--ghost" onClick={launch}>
          Launch app
        </button>
      </header>

      <main id="top">
        <section className="wgh-hero">
          <div className="wgh-hero-copy">
            <h1>The US market closes on Friday. Your xStocks loan keeps running.</h1>
            <p className="wgh-lede">
              xStocks trade on Solana all weekend, but the stock behind them doesn't. Prices drift
              on thin trading, then can jump when the real market reopens on Monday. If you borrow
              against xStocks on Kamino, that jump can push you toward liquidation. Weekend Gap
              Guard reads your real position, shows how much room you have, and prepares the fix
              before the weekend starts.
            </p>
            <div className="wgh-cta">
              <button className="wgh-btn wgh-btn--primary" onClick={launch}>
                Connect wallet
              </button>
              <a className="wgh-btn wgh-btn--ghost" href="#how">
                How it works
              </a>
            </div>
            <p className="wgh-note">Non-custodial. Solana mainnet. Built for Kamino xStocks positions.</p>
          </div>

          <figure className="wgh-figure" aria-labelledby="fig-cap">
            <div className="wgh-days" aria-hidden="true">
              <span>Fri close</span>
              <span>Weekend: xStocks trade, US stock is shut</span>
              <span>Mon open</span>
            </div>
            <div className="wgh-track" role="img" aria-label="A weekend price drop eating into the distance to liquidation">
              <div className="wgh-buffer">Room before liquidation</div>
              <div className="wgh-gap">Weekend gap</div>
            </div>
            <div className="wgh-states" aria-hidden="true">
              <span className="wgh-pill wgh-pill--safe">Safe</span>
              <span className="wgh-pill wgh-pill--watch">Watch</span>
              <span className="wgh-pill wgh-pill--flag">Flagged</span>
            </div>
            <figcaption id="fig-cap">
              Illustration of the check, not live data. Your position gets one of three states:
              the typical downside gap fits inside your buffer, eats most of it, or exceeds it.
            </figcaption>
          </figure>
        </section>

        <section id="how" className="wgh-section">
          <h2>Discover, assess, protect</h2>
          <ol className="wgh-steps">
            {steps.map((s, i) => (
              <li key={s.title}>
                <span className="wgh-step-n">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="wgh-section wgh-split">
          <div>
            <h2>Every number has one owner</h2>
            <p>
              We never let one provider fill in for another. Historical prices help estimate a
              weekend gap; they never decide what you own or owe.
            </p>
          </div>
          <dl className="wgh-sources">
            {sources.map((s) => (
              <div key={s.who}>
                <dt>{s.who}</dt>
                <dd>{s.what}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="wgh-section wgh-split">
          <div>
            <h2>What it will never do</h2>
            <p>You stay in control. Every action is a transaction you read and sign yourself.</p>
          </div>
          <ul className="wgh-never">
            {never.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>

        <section className="wgh-section wgh-monitor">
          <h2>Get warned before Friday ends</h2>
          <p>
            Once your position is enrolled, a trusted server check re-reads Kamino, refreshes
            prices and the weekend-gap model, and raises an alert if you're flagged. Link
            Telegram if you want the alert there. It's opt-in, one link, and you can ignore it.
          </p>
        </section>

        <section className="wgh-final">
          <h2>Check your position before the weekend</h2>
          <button className="wgh-btn wgh-btn--primary" onClick={launch}>
            Connect wallet
          </button>
        </section>
      </main>

      <footer className="wgh-foot">
        <span>Weekend Gap Guard, part of StockPass. Built for the Stocklana hackathon on Solana.</span>
        <span>Not financial advice. Risk states are estimates from historical data.</span>
      </footer>
    </div>
  );
}
