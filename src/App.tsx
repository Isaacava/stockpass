import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Bell, CheckCircle2, ChevronRight, Eye, Flame, Link2, LockKeyhole, Menu, Plus, Send, ShieldCheck, TrendingUp, Users, Wallet, X } from 'lucide-react';
import { DEMO_POSTS, DEMO_PRICES, STOCKS } from './lib/assets';
import { readStockPositions, shortAddress, type VerifiedPosition } from './lib/solana';

type Tab = 'feed' | 'portfolio' | 'alerts';
type AlertRow = { symbol: string; direction: 'above' | 'below'; target: number; active: boolean };

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
      setToast(found.length ? `${found.length} live onchain position${found.length > 1 ? 's' : ''} verified.` : 'No configured xStock positions were found in this wallet.');
    } catch {
      setToast('Could not read token accounts from Solana mainnet.');
    } finally {
      setChecking(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    if (connected && publicKey) void verifyWallet();
    if (!connected) setPositions([]);
  }, [connected, publicKey, verifyWallet]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const verifiedSymbols = useMemo(() => new Set(positions.map((p) => p.symbol)), [positions]);

  const nav = (next: Tab) => {
    setTab(next);
    setMobileMenu(false);
  };

  const addAlert = (symbol = 'NVDAx') => {
    const current = DEMO_PRICES[symbol] ?? 100;
    setAlerts((rows) => [...rows, { symbol, direction: 'above', target: Math.round(current * 1.08), active: true }]);
    setTab('alerts');
    setToast(`${symbol} alert added.`);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-wrap">
            <div className="brand-mark">SP</div>
            <div><div className="brand">StockPass</div><div className="brand-sub">Proof behind the post.</div></div>
          </div>
          <nav className="sidebar-nav">
            <button className={tab === 'feed' ? 'nav-link active' : 'nav-link'} onClick={() => nav('feed')}>Discover</button>
            <button className={tab === 'portfolio' ? 'nav-link active' : 'nav-link'} onClick={() => nav('portfolio')}>Portfolio</button>
            <button className={tab === 'alerts' ? 'nav-link active' : 'nav-link'} onClick={() => nav('alerts')}>Alerts</button>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="network-pill"><span className="dot" /> Solana mainnet</div>
          <div className="wallet-mini">{connected && publicKey ? publicKey.toBase58() : 'Wallet not connected'}</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="top-actions">
            <button className="ghost-btn compact" onClick={() => setToast('StockPass reads ownership directly from Solana mainnet.')}><ShieldCheck size={14} /> Mainnet proof</button>
            <WalletMultiButton />
            <button className="ghost-btn compact" onClick={() => setMobileMenu((open) => !open)} aria-label="Menu"><Menu size={14} /></button>
          </div>
        </header>

        {mobileMenu && <div className="mobile-nav-card"><button onClick={() => nav('feed')}>Discover</button><button onClick={() => nav('portfolio')}>Portfolio</button><button onClick={() => nav('alerts')}>Alerts</button></div>}

        <main>
          <section className="hero">
            <div className="hero-copy-wrap">
              <p className="eyebrow">ONCHAIN SOCIAL TRADING</p>
              <h1>Show the position.<br /><span>Prove the position.</span></h1>
              <p className="hero-copy">Follow conviction backed by wallet state, not screenshots. StockPass links every position post to what actually existed on Solana at the moment it was published.</p>
              <div className="hero-actions">
                <button className="primary-btn" onClick={() => setComposeOpen(true)}><Plus size={15} /> Post a position</button>
                <button className="ghost-btn" onClick={() => nav('portfolio')}><Wallet size={15} /> View portfolio</button>
              </div>
              <div className="hero-proof">
                <div><strong>OWNERSHIP</strong><span>Verified from the connected wallet.</span></div>
                <div><strong>MARKET DATA</strong><span>Matched to the configured live asset.</span></div>
                <div><strong>PROOF</strong><span>Snapshot timestamp and slot can be retained.</span></div>
              </div>
            </div>
            <div className="hero-card">
              <div className="hero-card-top"><span>YOUR VERIFICATION</span><LockKeyhole size={14} /></div>
              <div className="score-line"><strong>{connected ? positions.length : '—'}</strong><span>live proofs</span><div className="score-ring">✓</div></div>
              <div className="trust-row"><span>Wallet status</span><b>{connected ? 'Connected' : 'Waiting'}</b></div>
              <div className="trust-row"><span>Mainnet positions</span><b>{connected ? positions.length : 0}</b></div>
              <div className="trust-row"><span>Verification source</span><b>Solana RPC</b></div>
            </div>
          </section>

          {tab === 'feed' && <Feed verifiedSymbols={verifiedSymbols} onAlert={addAlert} />}
          {tab === 'portfolio' && <Portfolio connected={connected} publicKey={publicKey?.toBase58() ?? null} verifying={checking} positions={positions} onVerify={verifyWallet} onAlert={addAlert} />}
          {tab === 'alerts' && <Alerts alerts={alerts} onToggle={(i) => setAlerts((rows) => rows.map((a, idx) => idx === i ? { ...a, active: !a.active } : a))} onAdd={() => addAlert()} />}

          <section className="signal-strip">
            <div><Flame size={15} /><strong>Social signal</strong><span>3 people you follow bought NVDAx in the last 24 hours.</span></div>
            <button onClick={() => setToast('Crowd-signal notifications will use the same verified event stream.')} >Turn on alerts <ChevronRight size={14} /></button>
          </section>

          <section className="how-section">
            <p className="eyebrow">WHY STOCKPASS</p>
            <h2>Social proof that survives the screenshot.</h2>
            <div className="feature-grid">
              <Feature icon={<CheckCircle2 />} title="Verified holder" copy="A badge requires a configured official asset mint and a non-zero mainnet wallet balance at verification time." />
              <Feature icon={<Bell />} title="Useful alerts" copy="Target-price alerts and social activity are designed around positions that can be independently verified." />
              <Feature icon={<Users />} title="Follow conviction" copy="See who is holding, adding, trimming, or watching — with enough context to judge the signal." />
            </div>
          </section>
        </main>

        <footer><div>StockPass · Solana mainnet social trading</div><div><Link2 size={13} /> Built for Stocklana</div></footer>
      </div>

      {composeOpen && <ComposeModal connected={connected} positions={positions} onClose={() => setComposeOpen(false)} onPost={() => { setComposeOpen(false); setToast('Post published with a verification snapshot.'); }} />}
      {toast && <div className="toast"><CheckCircle2 size={15} /> {toast}</div>}
    </div>
  );
}

function Feed({ verifiedSymbols, onAlert }: { verifiedSymbols: Set<string>; onAlert: (symbol: string) => void }) {
  return <section className="content-section">
    <div className="section-heading"><div><p className="eyebrow">DISCOVER</p><h2>What your network is doing</h2><div className="section-note">A position feed where ownership claims can be checked.</div></div><button className="ghost-btn compact"><Eye size={14} /> Watching 12</button></div>
    <div className="feed-grid"><div className="feed-column">{DEMO_POSTS.map((post) => <article className="post-card" key={post.id}>
      <div className="post-head"><div className="avatar">{post.avatar}</div><div className="post-author"><strong>{post.handle}</strong><span>{post.age}</span></div><div className={post.proof === 'Watching' ? 'proof watching' : 'proof'}>{post.proof !== 'Watching' && <CheckCircle2 size={13} />}{post.proof}</div></div>
      <p>{post.text}</p><div className="position-chip"><span className="ticker-dot">{post.symbol.replace('x', '')}</span><strong>{post.symbol}</strong><span>{post.pnl !== '—' ? post.pnl : 'Watching'}</span></div>
      <div className="post-actions"><button onClick={() => onAlert(post.symbol)}><Bell size={13} /> Alert me</button><button onClick={() => window.navigator.clipboard?.writeText(window.location.href)}><Send size={13} /> Share</button><span>♡ {post.likes}</span></div>
    </article>)}</div>
      <aside className="sidebar-card"><div className="side-title"><span>Trending onchain</span><TrendingUp size={14} /></div>{Object.entries(DEMO_PRICES).slice(0, 5).map(([symbol, price]) => <div className="trend-row" key={symbol}><span className="ticker-dot">{symbol.replace('x', '')}</span><div><strong>{symbol}</strong><small>{STOCKS.find((x) => x.symbol === symbol)?.name}</small></div><div className="trend-price"><b>${price.toFixed(2)}</b><span>tracked</span></div></div>)}<div className="mini-note">{verifiedSymbols.size ? <><CheckCircle2 size={13} /> {verifiedSymbols.size} of your live positions verified</> : <><LockKeyhole size={13} /> Connect wallet to verify</>}</div></aside>
    </div>
  </section>;
}

function Portfolio({ connected, publicKey, verifying, positions, onVerify, onAlert }: { connected: boolean; publicKey: string | null; verifying: boolean; positions: VerifiedPosition[]; onVerify: () => void; onAlert: (symbol: string) => void }) {
  return <section className="content-section"><div className="section-heading"><div><p className="eyebrow">PORTFOLIO</p><h2>Your positions, with receipts</h2><div className="section-note">Balances below are read from Solana mainnet.</div></div><button className="ghost-btn compact" onClick={onVerify} disabled={!connected || verifying}><CheckCircle2 size={14} /> {verifying ? 'Checking…' : 'Verify now'}</button></div>
    <div className="portfolio-summary"><div><span>Wallet</span><strong>{connected && publicKey ? shortAddress(publicKey) : 'Not connected'}</strong></div><div><span>Verified positions</span><strong>{positions.length}</strong></div><div><span>Proof state</span><strong className={positions.length ? 'positive' : ''}>{positions.length ? 'Live onchain' : 'Waiting'}</strong></div></div>
    {positions.length > 0 ? <div className="position-list">{positions.map((position) => <div className="position-row" key={position.symbol}><div className="asset-logo">{position.icon}</div><div className="asset-name"><strong>{position.symbol}</strong><span>{position.name}</span></div><div className="asset-qty"><span>Verified balance</span><b>{position.balance.toLocaleString()}</b></div><div className="asset-proof"><CheckCircle2 size={14} /><span>Onchain</span></div><button className="ghost-btn compact" onClick={() => onAlert(position.symbol)}><Bell size={13} /></button></div>)}</div> : <div className="empty-state"><LockKeyhole size={20} /><strong>{connected ? 'No configured xStock positions found' : 'Connect your wallet to unlock verification'}</strong><span>StockPass only shows a proof when the connected wallet owns a configured official asset mint on Solana mainnet.</span></div>}
  </section>;
}

function Alerts({ alerts, onToggle, onAdd }: { alerts: AlertRow[]; onToggle: (index: number) => void; onAdd: () => void }) {
  return <section className="content-section"><div className="section-heading"><div><p className="eyebrow">ALERTS</p><h2>Know before you refresh</h2><div className="section-note">Price and social alerts for assets you own or watch.</div></div><button className="primary-btn compact" onClick={onAdd}><Plus size={14} /> New alert</button></div><div className="alerts-list">{alerts.map((alert,index)=><div className="alert-row" key={`${alert.symbol}-${index}`}><div className="ticker-dot">{alert.symbol.replace('x','')}</div><div><strong>{alert.symbol}</strong><span>Notify when price is {alert.direction} ${alert.target}</span></div><button className={alert.active ? 'toggle on' : 'toggle'} onClick={() => onToggle(index)}><span /></button></div>)}</div><div className="alert-callout"><Bell size={16} /><div><strong>Next: crowd-signal alerts</strong><p>“3 people you follow bought NVDAx” will come from the same verified event stream used by the social feed.</p></div></div></section>;
}

function Feature({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) { return <div className="feature-card"><div className="feature-icon">{icon}</div><strong>{title}</strong><p>{copy}</p></div>; }

function ComposeModal({ connected, positions, onClose, onPost }: { connected: boolean; positions: VerifiedPosition[]; onClose: () => void; onPost: () => void }) {
  const selected = positions[0];
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><p className="eyebrow">NEW POST</p><h3>Publish with proof</h3></div><button className="ghost-btn compact" onClick={onClose}><X size={14} /></button></div><div className="compose-symbol"><span className="ticker-dot">{selected?.icon ?? 'SP'}</span><div><strong>{selected?.symbol ?? 'Select a position'}</strong><span>{connected ? 'Wallet verification attached' : 'Connect a wallet to attach ownership proof'}</span></div>{connected && selected && <span className="proof"><CheckCircle2 size={13} /> Verified holder</span>}</div><textarea defaultValue={selected ? `Holding ${selected.symbol}. My position is verified against Solana wallet state.` : 'Connect your wallet to publish a position with onchain proof.'} /><div className="modal-foot"><span>Snapshot: wallet state checked at publish time</span><button className="primary-btn" disabled={!connected || !selected} onClick={onPost}><Send size={14} /> Publish</button></div></div></div>;
}
