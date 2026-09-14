import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Bell, CheckCircle2, ChevronRight, Eye, Flame, Link2, LockKeyhole, Menu, Plus, Send, Sparkles, TrendingUp, Users, Wallet, X } from 'lucide-react';
import { DEMO_POSTS, DEMO_PRICES, STOCKS } from './lib/assets';
import { readStockPositions, shortAddress, type VerifiedPosition } from './lib/solana';

type Tab = 'feed' | 'portfolio' | 'alerts';

type AlertRow = { symbol: string; direction: 'above' | 'below'; target: number; active: boolean };

const demoHoldings = [
  { symbol: 'NVDAx', name: 'NVIDIA', qty: 12.4, basis: 133.2, price: DEMO_PRICES.NVDAx },
  { symbol: 'AAPLx', name: 'Apple', qty: 3.8, basis: 210.9, price: DEMO_PRICES.AAPLx },
  { symbol: 'TSLAx', name: 'Tesla', qty: 1.4, basis: 301.4, price: DEMO_PRICES.TSLAx }
];

export default function App() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [tab, setTab] = useState<Tab>('feed');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [positions, setPositions] = useState<VerifiedPosition[]>([]);
  const [checking, setChecking] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [alerts, setAlerts] = useState<AlertRow[]>([
    { symbol: 'NVDAx', direction: 'above', target: 185, active: true },
    { symbol: 'TSLAx', direction: 'below', target: 320, active: true }
  ]);

  const verifyWallet = useCallback(async () => {
    if (!publicKey) return;
    setChecking(true);
    try {
      const found = await readStockPositions(connection, publicKey, STOCKS);
      setPositions(found);
      setToast(found.length ? `${found.length} onchain position${found.length > 1 ? 's' : ''} verified.` : 'No configured xStock mints found for this wallet yet.');
    } catch {
      setToast('Could not read token accounts from the selected RPC.');
    } finally {
      setChecking(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    if (connected && publicKey) verifyWallet();
    if (!connected) setPositions([]);
  }, [connected, publicKey, verifyWallet]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const verifiedSymbols = useMemo(() => new Set(positions.map((p) => p.symbol)), [positions]);
  const totalValue = demoHoldings.reduce((sum, row) => sum + row.qty * row.price, 0);
  const totalPnl = demoHoldings.reduce((sum, row) => sum + row.qty * (row.price - row.basis), 0);

  const addAlert = (symbol = 'NVDAx') => {
    setAlerts((current) => [...current, { symbol, direction: 'above', target: Math.round(DEMO_PRICES[symbol] * 1.08), active: true }]);
    setTab('alerts');
    setToast(`${symbol} price alert added.`);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark"><span>SP</span></div>
          <div><div className="brand">StockPass</div><div className="brand-sub">Proof behind the post.</div></div>
        </div>
        <nav className="desktop-nav">
          <button className={tab === 'feed' ? 'nav-link active' : 'nav-link'} onClick={() => setTab('feed')}>Discover</button>
          <button className={tab === 'portfolio' ? 'nav-link active' : 'nav-link'} onClick={() => setTab('portfolio')}>Portfolio</button>
          <button className={tab === 'alerts' ? 'nav-link active' : 'nav-link'} onClick={() => setTab('alerts')}>Alerts</button>
        </nav>
        <div className="top-actions">
          <div className="network-pill"><span className="dot" /> Mainnet verification</div>
          <WalletMultiButton />
          <button className="icon-btn mobile-only" onClick={() => setMobileMenu((v) => !v)} aria-label="Menu">{mobileMenu ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
      </header>

      {mobileMenu && <div className="mobile-nav-card"><button onClick={() => { setTab('feed'); setMobileMenu(false); }}>Discover</button><button onClick={() => { setTab('portfolio'); setMobileMenu(false); }}>Portfolio</button><button onClick={() => { setTab('alerts'); setMobileMenu(false); }}>Alerts</button></div>}

      <main>
        <section className="hero">
          <div>
            <p className="eyebrow"><Sparkles size={14} /> ONCHAIN SOCIAL TRADING</p>
            <h1>Show the position.<br /><span>Prove the position.</span></h1>
            <p className="hero-copy">Follow conviction backed by wallet state, not screenshots. StockPass stamps posts against the position that actually existed on Solana.</p>
            <div className="hero-actions"><button className="primary-btn" onClick={() => setComposeOpen(true)}><Plus size={17} /> Post a position</button><button className="ghost-btn" onClick={() => setTab('portfolio')}><Wallet size={17} /> View portfolio</button></div>
          </div>
          <div className="hero-card">
            <div className="hero-card-top"><span>YOUR TRUST SCORE</span><LockKeyhole size={16} /></div>
            <div className="score-line"><strong>98</strong><span>/100</span><div className="score-ring">✓</div></div>
            <div className="trust-row"><span>Wallet connected</span><b>{connected ? 'Verified' : 'Waiting'}</b></div>
            <div className="trust-row"><span>Position proofs</span><b>{positions.length || 0}</b></div>
            <div className="trust-row"><span>Last checked</span><b>{connected ? 'Just now' : '—'}</b></div>
          </div>
        </section>

        {tab === 'feed' && <Feed verifiedSymbols={verifiedSymbols} onAlert={addAlert} />}
        {tab === 'portfolio' && <Portfolio connected={connected} verifying={checking} positions={positions} totalValue={totalValue} totalPnl={totalPnl} onVerify={verifyWallet} onAlert={addAlert} />}
        {tab === 'alerts' && <Alerts alerts={alerts} onToggle={(i) => setAlerts((current) => current.map((a, idx) => idx === i ? { ...a, active: !a.active } : a))} onAdd={() => addAlert()} />}

        <section className="signal-strip">
          <div><Flame size={17} /><strong>3 people you follow bought NVDAx</strong><span>in the last 24 hours</span></div>
          <button onClick={() => setToast('Crowd signal alerts are active for the demo.')}>Turn on crowd alerts <ChevronRight size={16} /></button>
        </section>

        <section className="how-section">
          <div><p className="eyebrow">WHY STOCKPASS</p><h2>Social proof that survives the screenshot.</h2></div>
          <div className="feature-grid">
            <Feature icon={<CheckCircle2 />} title="Verified holder" copy="A post is checked against token accounts and the configured asset registry." />
            <Feature icon={<Bell />} title="Useful alerts" copy="Price targets and social activity arrive before you have to refresh the app." />
            <Feature icon={<Users />} title="Follow conviction" copy="See who is holding, adding, trimming, or simply watching — with context." />
          </div>
        </section>
      </main>

      <footer><div>StockPass prototype · Solana mainnet verification + devnet demo rail</div><div><Link2 size={14} /> Built for Stocklana</div></footer>

      {composeOpen && <ComposeModal onClose={() => setComposeOpen(false)} onPost={() => { setComposeOpen(false); setToast('Post published with a verification snapshot.'); }} />}
      {toast && <div className="toast"><CheckCircle2 size={16} /> {toast}</div>}
    </div>
  );
}

function Feed({ verifiedSymbols, onAlert }: { verifiedSymbols: Set<string>; onAlert: (symbol: string) => void }) {
  return <section className="content-section"><div className="section-heading"><div><p className="eyebrow">DISCOVER</p><h2>What your network is doing</h2></div><button className="ghost-btn compact"><Eye size={16} /> Watching 12</button></div><div className="feed-grid"><div className="feed-column">{DEMO_POSTS.map((post) => <article className="post-card" key={post.id}><div className="post-head"><div className="avatar">{post.avatar}</div><div className="post-author"><strong>{post.handle}</strong><span>{post.age}</span></div><div className={post.proof === 'Watching' ? 'proof watching' : 'proof'}>{post.proof === 'Verified holder' && <CheckCircle2 size={14} />}{post.proof === 'Verified seller' && <CheckCircle2 size={14} />}{post.proof}</div></div><p>{post.text}</p><div className="position-chip"><span className="ticker-dot">{post.symbol.replace('x', '')}</span><strong>{post.symbol}</strong><span>{post.pnl !== '—' && post.pnl}</span></div><div className="post-actions"><button onClick={() => onAlert(post.symbol)}><Bell size={15} /> Alert me</button><button onClick={() => window.navigator.clipboard?.writeText(window.location.href)}><Send size={15} /> Share</button><span>♡ {post.likes}</span></div></article>)}</div><aside className="sidebar-card"><div className="side-title"><span>Trending onchain</span><TrendingUp size={16} /></div>{Object.entries(DEMO_PRICES).slice(0, 5).map(([symbol, price]) => <div className="trend-row" key={symbol}><span className="ticker-dot">{symbol.replace('x', '')}</span><div><strong>{symbol}</strong><small>{STOCKS.find((x) => x.symbol === symbol)?.name}</small></div><div className="trend-price"><b>${price.toFixed(2)}</b><span>+{(Math.random() * 4 + 1).toFixed(2)}%</span></div></div>)}<div className="mini-note">{verifiedSymbols.size ? <><CheckCircle2 size={14} /> {verifiedSymbols.size} of your positions verified</> : <><LockKeyhole size={14} /> Connect to verify your holdings</>}</div></aside></div></section>;
}

function Portfolio({ connected, verifying, positions, totalValue, totalPnl, onVerify, onAlert }: { connected: boolean; verifying: boolean; positions: VerifiedPosition[]; totalValue: number; totalPnl: number; onVerify: () => void; onAlert: (symbol: string) => void }) {
  return <section className="content-section"><div className="section-heading"><div><p className="eyebrow">PORTFOLIO</p><h2>Your positions, with receipts</h2></div><button className="ghost-btn compact" onClick={onVerify} disabled={!connected || verifying}><CheckCircle2 size={16} /> {verifying ? 'Checking…' : 'Verify now'}</button></div><div className="portfolio-summary"><div><span>Wallet</span><strong>{connected ? shortAddress(window.solana?.publicKey?.toString?.()) : 'Not connected'}</strong></div><div><span>Demo portfolio value</span><strong>${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div><div><span>Demo unrealized PnL</span><strong className="positive">+${totalPnl.toFixed(0)}</strong></div></div>{positions.length > 0 ? <div className="position-list">{positions.map((position) => <div className="position-row" key={position.symbol}><div className="asset-logo">{position.icon}</div><div className="asset-name"><strong>{position.symbol}</strong><span>{position.name}</span></div><div className="asset-qty"><span>Verified balance</span><b>{position.balance.toLocaleString()}</b></div><div className="asset-proof"><CheckCircle2 size={16} /><span>Onchain</span></div><button className="icon-btn" onClick={() => onAlert(position.symbol)}><Bell size={16} /></button></div>)}</div> : <div className="empty-state"><LockKeyhole size={20} /><strong>{connected ? 'No configured xStock positions found' : 'Connect your wallet to unlock verification'}</strong><span>Verification only turns green when the wallet actually owns a configured asset mint.</span></div>}</section>;
}

function Alerts({ alerts, onToggle, onAdd }: { alerts: AlertRow[]; onToggle: (index: number) => void; onAdd: () => void }) {
  return <section className="content-section"><div className="section-heading"><div><p className="eyebrow">ALERTS</p><h2>Know before you refresh</h2></div><button className="primary-btn compact" onClick={onAdd}><Plus size={16} /> New alert</button></div><div className="alerts-list">{alerts.map((alert, index) => <div className="alert-row" key={`${alert.symbol}-${index}`}><div className="ticker-dot">{alert.symbol.replace('x', '')}</div><div><strong>{alert.symbol}</strong><span>Notify when price is {alert.direction} ${alert.target}</span></div><button className={alert.active ? 'toggle on' : 'toggle'} onClick={() => onToggle(index)}><span /></button></div>)}</div><div className="alert-callout"><Bell size={18} /><div><strong>Next layer: social alerts</strong><p>"3 people you follow bought NVDAx" uses the same follow graph and verified event stream.</p></div></div></section>;
}

function Feature({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) { return <div className="feature-card"><div className="feature-icon">{icon}</div><strong>{title}</strong><p>{copy}</p></div>; }

function ComposeModal({ onClose, onPost }: { onClose: () => void; onPost: () => void }) { return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><p className="eyebrow">NEW POST</p><h3>Publish with proof</h3></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><div className="compose-symbol"><span className="ticker-dot">NVDA</span><div><strong>NVDAx</strong><span>Your selected position</span></div><span className="proof"><CheckCircle2 size={14} /> Verified holder</span></div><textarea defaultValue="Holding through the move. My position is verified against Solana wallet state." /><div className="modal-foot"><span>Snapshot: now · wallet proof attached</span><button className="primary-btn" onClick={onPost}><Send size={16} /> Publish</button></div></div></div>; }
