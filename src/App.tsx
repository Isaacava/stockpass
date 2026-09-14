import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useAppKit, useAppKitAccount, AppKitButton } from '@reown/appkit/react';
import { useConnection } from '@solana/wallet-adapter-react';
import { Bell, Check, ChevronRight, Eye, Link2, Menu, Plus, Send, ShieldCheck, TrendingUp, Users, WalletCards, X, RefreshCw } from 'lucide-react';
import { STOCKS, type StockAsset } from './lib/assets';
import { fetchOfficialPrices, resolveOfficialStocks } from './lib/xstocks';
import { readStockPositions, shortAddress, type VerifiedPosition } from './lib/solana';
import { createPriceAlert, ensureProfile, loadAlerts, loadPosts, publishVerifiedPost, type FeedPost } from './lib/stockpass';

type Tab = 'feed' | 'portfolio' | 'alerts';
type AlertRow = { id: string; symbol: string; direction: 'above' | 'below'; target: number; active: boolean; mint: string | null };

export default function App() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { connection } = useConnection();
  const [tab, setTab] = useState<Tab>('feed');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [assets, setAssets] = useState<StockAsset[]>(STOCKS);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [positions, setPositions] = useState<VerifiedPosition[]>([]);
  const [checking, setChecking] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  const refreshMarketData = useCallback(async () => {
    const official = await resolveOfficialStocks(STOCKS);
    setAssets(official);
    const livePrices = await fetchOfficialPrices(official);
    setPrices(livePrices);
    return official;
  }, []);

  const verifyWallet = useCallback(async (nextAssets = assets) => {
    if (!address) return;
    setChecking(true);
    try {
      const found = await readStockPositions(connection, new PublicKey(address), nextAssets);
      setPositions(found);
      setToast(found.length ? `${found.length} mainnet position${found.length > 1 ? 's' : ''} verified.` : 'No official xStock positions were found in this wallet.');
    } catch {
      setToast('Could not read token accounts from Solana mainnet.');
    } finally {
      setChecking(false);
    }
  }, [address, assets, connection]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const official = await refreshMarketData();
        if (cancelled) return;
        if (address) {
          await ensureProfile(address);
          if (cancelled) return;
          const [nextPosts, nextAlerts] = await Promise.all([loadPosts(), loadAlerts(address)]);
          setPosts(nextPosts);
          setAlerts(nextAlerts.map((row) => ({
            id: row.id as string,
            symbol: official.find((asset) => asset.mint === row.mint)?.symbol ?? 'xStock',
            direction: row.direction as 'above' | 'below',
            target: Number(row.target_price),
            active: Boolean(row.active),
            mint: row.mint as string | null
          })));
          await verifyWallet(official);
        }
      } catch {
        setToast('StockPass could not load one or more live data sources.');
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    };
    void load();
    const timer = window.setInterval(() => { void refreshMarketData(); }, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [address]);

  useEffect(() => {
    if (!isConnected) {
      setPositions([]);
      setAlerts([]);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const verifiedSymbols = useMemo(() => new Set(positions.map((p) => p.symbol)), [positions]);
  const nav = (next: Tab) => { setTab(next); setMobileMenu(false); };

  const addAlert = async (symbol?: string) => {
    if (!address) {
      setToast('Connect a wallet before creating an alert.');
      return;
    }
    const targetAsset = assets.find((asset) => asset.symbol === (symbol ?? positions[0]?.symbol)) ?? positions[0] ?? assets[0];
    const current = prices[targetAsset.symbol];
    if (!targetAsset?.mint || !current) {
      setToast('Live asset pricing is unavailable for this alert.');
      return;
    }
    const target = Number((current * 1.08).toFixed(2));
    try {
      await createPriceAlert({ wallet: address, mint: targetAsset.mint, direction: 'above', target_price: target });
      setAlerts((rows) => [{ id: crypto.randomUUID(), symbol: targetAsset.symbol, direction: 'above', target, active: true, mint: targetAsset.mint }, ...rows]);
      setTab('alerts');
      setToast(`${targetAsset.symbol} alert saved.`);
    } catch {
      setToast('Could not save that alert.');
    }
  };

  const publish = async (position: VerifiedPosition, body: string) => {
    if (!address) return;
    try {
      const slot = await connection.getSlot('confirmed');
      await publishVerifiedPost({ wallet: address, position, slot, body });
      const nextPosts = await loadPosts();
      setPosts(nextPosts);
      setToast('Post published with a fresh mainnet verification snapshot.');
    } catch {
      setToast('Could not publish the proof-backed post.');
      throw new Error('Post publish failed');
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-wrap"><div className="brand-mark">SP</div><div><div className="brand">StockPass</div><div className="brand-sub">Proof behind the post.</div></div></div>
          <nav className="sidebar-nav">
            <button className={tab === 'feed' ? 'nav-link active' : 'nav-link'} onClick={() => nav('feed')}>Discover</button>
            <button className={tab === 'portfolio' ? 'nav-link active' : 'nav-link'} onClick={() => nav('portfolio')}>Portfolio</button>
            <button className={tab === 'alerts' ? 'nav-link active' : 'nav-link'} onClick={() => nav('alerts')}>Alerts</button>
          </nav>
        </div>
        <div className="sidebar-bottom"><div className="network-pill"><span className="dot" /> Solana mainnet</div><div className="wallet-mini">{address ?? 'Wallet not connected'}</div></div>
      </aside>

      <div className="main">
        <header className="topbar"><div className="top-actions"><button className="ghost-btn compact" onClick={() => setToast('Ownership is read directly from Solana mainnet.')}><ShieldCheck size={14} /> Mainnet proof</button><AppKitButton /><button className="ghost-btn compact mobile-menu-btn" onClick={() => setMobileMenu((openNow) => !openNow)} aria-label="Menu">{mobileMenu ? <X size={14} /> : <Menu size={14} />}</button></div></header>
        {mobileMenu && <div className="mobile-nav-card"><button onClick={() => nav('feed')}>Discover</button><button onClick={() => nav('portfolio')}>Portfolio</button><button onClick={() => nav('alerts')}>Alerts</button></div>}

        <main>
          <section className="hero">
            <div className="hero-copy-wrap"><p className="eyebrow">ONCHAIN SOCIAL TRADING</p><h1>Show the position.<br /><span>Prove the position.</span></h1><p className="hero-copy">Follow conviction backed by wallet state, not screenshots. StockPass links every position post to what existed on Solana at the moment it was published.</p><div className="hero-actions"><button className="primary-btn" onClick={() => setComposeOpen(true)} disabled={!positions.length}><Plus size={15} /> Post a position</button><button className="ghost-btn" onClick={() => nav('portfolio')}><WalletCards size={15} /> View portfolio</button></div><div className="hero-proof"><div><strong>OWNERSHIP</strong><span>Verified from the connected wallet.</span></div><div><strong>MARKET DATA</strong><span>Official xStocks public feed.</span></div><div><strong>PROOF</strong><span>Snapshot timestamp and slot.</span></div></div></div>
            <div className="hero-card"><div className="hero-card-top"><span>YOUR VERIFICATION</span><ShieldCheck size={14} /></div><div className="score-line"><strong>{positions.length}</strong><span>live proofs</span><div className="score-ring">✓</div></div><div className="trust-row"><span>Wallet</span><b>{address ? shortAddress(address) : '—'}</b></div><div className="trust-row"><span>Mainnet positions</span><b>{positions.length}</b></div><div className="trust-row"><span>Data</span><b>{loadingData || checking ? 'Checking' : 'Live'}</b></div></div>
          </section>

          {tab === 'feed' && <Feed posts={posts} assets={assets} prices={prices} verifiedSymbols={verifiedSymbols} onAlert={addAlert} onRefresh={async () => { setLoadingData(true); try { const official = await refreshMarketData(); if (address) await verifyWallet(official); const next = await loadPosts(); setPosts(next); setToast('Live data refreshed.'); } finally { setLoadingData(false); } }} />}
          {tab === 'portfolio' && <Portfolio connected={isConnected} address={address ?? null} verifying={checking} positions={positions} onVerify={() => verifyWallet()} onAlert={addAlert} />}
          {tab === 'alerts' && <Alerts alerts={alerts} onToggle={(id) => setAlerts((rows) => rows.map((a) => a.id === id ? { ...a, active: !a.active } : a))} onAdd={() => addAlert()} />}

          <section className="signal-strip"><div><Users size={15} /><strong>Social signal</strong><span>Verified activity can become your next alert stream.</span></div><button onClick={() => setToast('Follow and social-notification persistence is the next expansion of this stream.')}>Turn on alerts <ChevronRight size={14} /></button></section>
          <section className="how-section"><p className="eyebrow">WHY STOCKPASS</p><h2>Social proof that survives the screenshot.</h2><div className="feature-grid"><Feature icon={<Check />} title="Verified holder" copy="A badge requires the official xStocks mint and a non-zero mainnet wallet balance at verification time." /><Feature icon={<Bell />} title="Live market data" copy="Prices come from the public xStocks data layer instead of hardcoded demo values." /><Feature icon={<Users />} title="Follow conviction" copy="Persistent social events make the proof layer useful beyond a single portfolio screen." /></div></section>
        </main>
        <footer><div>StockPass · Solana mainnet social trading</div><div><Link2 size={13} /> Built for Stocklana</div></footer>
      </div>
      {composeOpen && <ComposeModal connected={isConnected} positions={positions} onClose={() => setComposeOpen(false)} onPost={publish} />}
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </div>
  );
}

function Feed({ posts, assets, prices, verifiedSymbols, onAlert, onRefresh }: { posts: FeedPost[]; assets: StockAsset[]; prices: Record<string, number>; verifiedSymbols: Set<string>; onAlert: (symbol: string) => void; onRefresh: () => void }) {
  return <section className="content-section"><div className="section-heading"><div><p className="eyebrow">DISCOVER</p><h2>What your network is doing</h2><div className="section-note">Every proof-backed post is tied to a stored wallet snapshot.</div></div><button className="ghost-btn compact" onClick={onRefresh}><RefreshCw size={14} /> Refresh</button></div><div className="feed-grid"><div className="feed-column">{posts.length ? posts.map((post) => { const asset = assets.find((x) => x.mint === post.mint); return <article className="post-card" key={post.id}><div className="post-head"><div className="avatar">{shortAddress(post.wallet).slice(0, 2)}</div><div className="post-author"><strong>{shortAddress(post.wallet)}</strong><span>{new Date(post.created_at).toLocaleString()}</span></div><div className="proof"><ShieldCheck size={13} /> {post.proof_type === 'verified_holder' ? 'Verified holder' : post.proof_type}</div></div><p>{post.body}</p>{asset && <div className="position-chip"><span className="ticker-dot">{asset.symbol.replace('x', '')}</span><strong>{asset.symbol}</strong><span>{prices[asset.symbol] ? `$${prices[asset.symbol].toFixed(2)}` : 'Live price unavailable'}</span></div>}<div className="post-actions"><button onClick={() => asset && onAlert(asset.symbol)} disabled={!asset}><Bell size={13} /> Alert me</button><button onClick={() => void navigator.clipboard?.writeText(window.location.href)}><Send size={13} /> Share</button></div></article>; }) : <div className="empty-state"><Eye size={20} /><strong>No verified posts yet</strong><span>Connect an official xStock position, then publish the first proof-backed post.</span></div>}</div><aside className="sidebar-card"><div className="side-title"><span>Live xStocks</span><TrendingUp size={14} /></div>{assets.filter((asset) => prices[asset.symbol]).slice(0, 6).map((asset) => <div className="trend-row" key={asset.symbol}><span className="ticker-dot">{asset.symbol.replace('x', '')}</span><div><strong>{asset.symbol}</strong><small>{asset.name}</small></div><div className="trend-price"><b>${prices[asset.symbol].toFixed(2)}</b><span>official feed</span></div></div>)}<div className="mini-note">{verifiedSymbols.size ? <><ShieldCheck size={13} /> {verifiedSymbols.size} live position proofs</> : <>Connect to verify holdings</>}</div></aside></div></section>;
}

function Portfolio({ connected, address, verifying, positions, onVerify, onAlert }: { connected: boolean; address: string | null; verifying: boolean; positions: VerifiedPosition[]; onVerify: () => void; onAlert: (symbol: string) => void }) {
  return <section className="content-section"><div className="section-heading"><div><p className="eyebrow">PORTFOLIO</p><h2>Your positions, with receipts</h2><div className="section-note">Balances below are read from Solana mainnet.</div></div><button className="ghost-btn compact" onClick={onVerify} disabled={!connected || verifying}><ShieldCheck size={14} /> {verifying ? 'Checking…' : 'Verify now'}</button></div><div className="portfolio-summary"><div><span>Wallet</span><strong>{address ? shortAddress(address) : 'Not connected'}</strong></div><div><span>Verified positions</span><strong>{positions.length}</strong></div><div><span>Proof state</span><strong className={positions.length ? 'positive' : ''}>{positions.length ? 'Live onchain' : 'Waiting'}</strong></div></div>{positions.length ? <div className="position-list">{positions.map((position) => <div className="position-row" key={position.symbol}><div className="asset-logo">{position.icon}</div><div className="asset-name"><strong>{position.symbol}</strong><span>{position.name}</span></div><div className="asset-qty"><span>Verified balance</span><b>{position.balance.toLocaleString()}</b></div><div className="asset-proof"><ShieldCheck size={14} /><span>Onchain</span></div><button className="ghost-btn compact" onClick={() => onAlert(position.symbol)}><Bell size={13} /></button></div>)}</div> : <div className="empty-state"><WalletCards size={20} /><strong>{connected ? 'No official xStock positions found' : 'Connect your wallet to unlock verification'}</strong><span>StockPass only shows a proof when the connected wallet owns an official xStocks mint on Solana mainnet.</span></div>}</section>;
}

function Alerts({ alerts, onToggle, onAdd }: { alerts: AlertRow[]; onToggle: (id: string) => void; onAdd: () => void }) { return <section className="content-section"><div className="section-heading"><div><p className="eyebrow">ALERTS</p><h2>Know before you refresh</h2><div className="section-note">Persistent in-app price alerts tied to your wallet.</div></div><button className="primary-btn compact" onClick={onAdd}><Plus size={14} /> New alert</button></div><div className="alerts-list">{alerts.length ? alerts.map((alert)=><div className="alert-row" key={alert.id}><div className="ticker-dot">{alert.symbol.replace('x','')}</div><div><strong>{alert.symbol}</strong><span>Notify when price is {alert.direction} ${alert.target.toFixed(2)}</span></div><button className={alert.active ? 'toggle on' : 'toggle'} onClick={() => onToggle(alert.id)}><span /></button></div>) : <div className="empty-state"><Bell size={19} /><strong>No alerts yet</strong><span>Create a price target from Discover or Portfolio.</span></div>}</div><div className="alert-callout"><Bell size={16} /><div><strong>Next: crowd-signal alerts</strong><p>Activity from people you follow will join the same persistent alert stream.</p></div></div></section>; }

function Feature({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) { return <div className="feature-card"><div className="feature-icon">{icon}</div><strong>{title}</strong><p>{copy}</p></div>; }

function ComposeModal({ connected, positions, onClose, onPost }: { connected: boolean; positions: VerifiedPosition[]; onClose: () => void; onPost: (position: VerifiedPosition, body: string) => Promise<void> }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const selected = positions[selectedIndex];

  useEffect(() => {
    if (selected && !body) setBody(`Holding ${selected.symbol}. My position is verified against Solana wallet state.`);
  }, [selected, body]);

  const submit = async () => {
    if (!selected || !body.trim()) return;
    setSaving(true);
    try { await onPost(selected, body); onClose(); } finally { setSaving(false); }
  };

  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><p className="eyebrow">NEW POST</p><h3>Publish with proof</h3></div><button className="ghost-btn compact" onClick={onClose}><X size={14} /></button></div>{positions.length > 1 && <select value={selectedIndex} onChange={(event) => { setSelectedIndex(Number(event.target.value)); setBody(''); }} className="compose-select">{positions.map((position, index) => <option value={index} key={position.symbol}>{position.symbol}</option>)}</select>}<div className="compose-symbol"><span className="ticker-dot">{selected?.icon ?? 'SP'}</span><div><strong>{selected?.symbol ?? 'Select a position'}</strong><span>{connected ? 'Wallet verification attached' : 'Connect a wallet to attach proof'}</span></div>{connected && selected && <span className="proof"><ShieldCheck size={12} /> Verified holder</span>}</div><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} placeholder="Write what you believe about the position…" /><div className="modal-foot"><span>{selected ? 'Snapshot: current mainnet slot at publish' : 'No verified position selected'}</span><button className="primary-btn" disabled={!connected || !selected || !body.trim() || saving} onClick={() => void submit()}><Send size={14} /> {saving ? 'Publishing…' : 'Publish'}</button></div></div></div>;
}
