import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { AppKitButton, useAppKit, useAppKitAccount } from '@reown/appkit/react';
import { useConnection } from '@solana/wallet-adapter-react';
import { Bell, Check, ChevronLeft, Copy, Eye, Link2, Menu, Plus, Send, ShieldCheck, Users, WalletCards, X } from 'lucide-react';
import { STOCKS, type StockAsset } from './lib/assets';
import { fetchOfficialPrices, resolveOfficialStocks } from './lib/xstocks';
import { readStockPositions, shortAddress, type VerifiedPosition } from './lib/solana';
import { createPriceAlert, ensureProfile, loadAlerts, loadPosts, publishVerifiedPost, type FeedPost } from './lib/stockpass';
import { followWallet, isFollowing, loadFollowCounts, loadNotifications, loadProfile, loadRecentPostsByWallet, markNotificationsRead, profileUrl, saveProfile, shortWallet, unfollowWallet, type StockPassNotification, type StockPassProfile } from './lib/social';
import './social.css';

type Tab = 'discover' | 'portfolio' | 'alerts' | 'notifications';
type AlertRow = { id: string; symbol: string; direction: 'above' | 'below'; target: number; active: boolean; mint: string | null };

type ProfileTab = 'posts' | 'portfolio' | 'proof';

export default function StockPassApp() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { connection } = useConnection();
  const [tab, setTab] = useState<Tab>('discover');
  const [menuOpen, setMenuOpen] = useState(false);
  const [assets, setAssets] = useState<StockAsset[]>(STOCKS);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [positions, setPositions] = useState<VerifiedPosition[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [notifications, setNotifications] = useState<StockPassNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [profileWallet, setProfileWallet] = useState<string | null>(() => new URLSearchParams(window.location.search).get('profile'));
  const [toast, setToast] = useState('');

  const refresh = useCallback(async () => {
    const official = await resolveOfficialStocks(STOCKS);
    const live = await fetchOfficialPrices(official);
    setAssets(official);
    setPrices(live);
    return official;
  }, []);

  const verify = useCallback(async (nextAssets = assets) => {
    if (!address) return;
    setChecking(true);
    try {
      const result = await readStockPositions(connection, new PublicKey(address), nextAssets);
      setPositions(result);
    } catch {
      setToast('Could not read Solana mainnet token accounts.');
    } finally {
      setChecking(false);
    }
  }, [address, assets, connection]);

  const loadUserState = useCallback(async (official: StockAsset[]) => {
    if (!address) return;
    await ensureProfile(address);
    const [nextPosts, nextAlerts, nextNotifications] = await Promise.all([loadPosts(), loadAlerts(address), loadNotifications(address)]);
    setPosts(nextPosts);
    setAlerts(nextAlerts.map((row) => ({
      id: row.id as string,
      symbol: official.find((asset) => asset.mint === row.mint)?.symbol ?? 'xStock',
      direction: row.direction as 'above' | 'below',
      target: Number(row.target_price),
      active: Boolean(row.active),
      mint: row.mint as string | null
    })));
    setNotifications(nextNotifications);
    await verify(official);
  }, [address, verify]);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const official = await refresh();
        if (!cancelled) await loadUserState(official);
      } catch {
        if (!cancelled) setToast('Some StockPass data could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const timer = window.setInterval(() => { void refresh(); }, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [address, refresh, loadUserState]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openProfile = (wallet: string) => {
    setProfileWallet(wallet);
    history.replaceState({}, '', profileUrl(wallet));
    setMenuOpen(false);
  };

  const goTab = (next: Tab) => {
    setProfileWallet(null);
    history.replaceState({}, '', window.location.pathname);
    setTab(next);
    setMenuOpen(false);
  };

  const addAlert = async (symbol: string) => {
    if (!address) return;
    const asset = assets.find((x) => x.symbol === symbol);
    const price = prices[symbol];
    if (!asset?.mint || !price) return setToast('Live price unavailable for that asset.');
    const target = Number((price * 1.08).toFixed(2));
    try {
      await createPriceAlert({ wallet: address, mint: asset.mint, direction: 'above', target_price: target });
      setAlerts((rows) => [{ id: crypto.randomUUID(), symbol, direction: 'above', target, active: true, mint: asset.mint }, ...rows]);
      setToast(`${symbol} alert saved.`);
      setTab('alerts');
    } catch {
      setToast('Could not save the alert.');
    }
  };

  const publish = async (position: VerifiedPosition, body: string) => {
    if (!address) return;
    const slot = await connection.getSlot('confirmed');
    await publishVerifiedPost({ wallet: address, position, slot, body });
    const next = await loadPosts();
    setPosts(next);
    setNotifications(await loadNotifications(address));
    setToast('Published with a fresh mainnet verification snapshot.');
  };

  const unread = notifications.filter((n) => !n.read_at).length;

  if (profileWallet) {
    return <PublicProfile wallet={profileWallet} viewerWallet={address ?? null} assets={assets} prices={prices} onBack={() => goTab('discover')} onFollowToast={setToast} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-wrap"><div className="brand-mark">SP</div><div><div className="brand">StockPass</div><div className="brand-sub">Proof behind the post.</div></div></div>
          <nav className="sidebar-nav">
            <NavButton active={tab === 'discover'} onClick={() => goTab('discover')}>Discover</NavButton>
            <NavButton active={tab === 'portfolio'} onClick={() => goTab('portfolio')}>Portfolio</NavButton>
            <NavButton active={tab === 'alerts'} onClick={() => goTab('alerts')}>Alerts</NavButton>
            <NavButton active={tab === 'notifications'} onClick={() => goTab('notifications')}>Activity {unread > 0 && <span className="nav-count">{unread}</span>}</NavButton>
          </nav>
        </div>
        <div className="sidebar-bottom"><div className="network-pill"><span className="dot" /> Solana mainnet</div><button className="wallet-mini" onClick={() => address && openProfile(address)}>{address ? shortAddress(address) : 'Wallet not connected'}</button></div>
      </aside>

      <div className="main">
        <header className="topbar"><div className="top-actions"><button className="ghost-btn compact" onClick={() => setToast('Ownership is verified against Solana mainnet token accounts.')}><ShieldCheck size={14} /> Mainnet proof</button><AppKitButton /><button className="ghost-btn compact mobile-menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">{menuOpen ? <X size={14} /> : <Menu size={14} />}</button></div></header>
        {menuOpen && <div className="mobile-nav-card"><button onClick={() => goTab('discover')}>Discover</button><button onClick={() => goTab('portfolio')}>Portfolio</button><button onClick={() => goTab('alerts')}>Alerts</button><button onClick={() => goTab('notifications')}>Activity {unread > 0 && `(${unread})`}</button></div>}

        <main>
          {tab === 'discover' && <Discover posts={posts} assets={assets} prices={prices} viewerWallet={address ?? null} onProfile={openProfile} onAlert={addAlert} onCompose={() => setComposeOpen(true)} />}
          {tab === 'portfolio' && <Portfolio positions={positions} checking={checking} address={address ?? null} onVerify={() => verify()} onAlert={addAlert} onProfile={openProfile} />}
          {tab === 'alerts' && <Alerts alerts={alerts} />}
          {tab === 'notifications' && <Activity wallet={address ?? ''} notifications={notifications} onRead={() => { void markNotificationsRead(address ?? ''); setNotifications((items) => items.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))); }} onProfile={openProfile} />}
          {loading && <div className="data-loading">Loading live mainnet data…</div>}
        </main>
        <footer><div>StockPass · Solana mainnet social trading</div><div><Link2 size={13} /> Built for Stocklana</div></footer>
      </div>

      {composeOpen && <ComposeModal connected={isConnected} positions={positions} onClose={() => setComposeOpen(false)} onPost={async (position, body) => { try { await publish(position, body); setComposeOpen(false); } catch { setToast('Could not publish the proof-backed post.'); } }} />}
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </div>
  );
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={active ? 'nav-link active' : 'nav-link'} onClick={onClick}>{children}</button>;
}

function Discover({ posts, assets, prices, viewerWallet, onProfile, onAlert, onCompose }: { posts: FeedPost[]; assets: StockAsset[]; prices: Record<string, number>; viewerWallet: string | null; onProfile: (wallet: string) => void; onAlert: (symbol: string) => void; onCompose: () => void }) {
  const [authorProfiles, setAuthorProfiles] = useState<Record<string, StockPassProfile>>({});

  useEffect(() => {
    let cancelled = false;
    const wallets = Array.from(new Set(posts.map((post) => post.wallet).filter(Boolean)));
    if (!wallets.length) {
      setAuthorProfiles({});
      return () => { cancelled = true; };
    }
    (async () => {
      const entries = await Promise.all(wallets.map(async (wallet) => {
        try {
          const profile = await loadProfile(wallet);
          return profile ? [wallet, profile] as const : null;
        } catch {
          return null;
        }
      }));
      if (cancelled) return;
      const next: Record<string, StockPassProfile> = {};
      for (const entry of entries) if (entry) next[entry[0]] = entry[1];
      setAuthorProfiles(next);
    })();
    return () => { cancelled = true; };
  }, [posts]);

  return <>
    <section className="hero"><div className="hero-copy-wrap"><p className="eyebrow">ONCHAIN SOCIAL TRADING</p><h1>Show the position.<br /><span>Prove the position.</span></h1><p className="hero-copy">Follow conviction backed by wallet state, not screenshots. Every proof starts from a real Solana mainnet position snapshot.</p><div className="hero-actions"><button className="primary-btn" onClick={onCompose}><Plus size={15} /> Post a position</button><button className="ghost-btn" onClick={() => viewerWallet && onProfile(viewerWallet)}><Users size={15} /> Your profile</button></div><div className="hero-proof"><div><strong>OWNERSHIP</strong><span>Verified from the connected wallet.</span></div><div><strong>SOCIAL GRAPH</strong><span>Follow real wallet identities.</span></div><div><strong>PROOF</strong><span>Snapshot timestamp and slot.</span></div></div></div><div className="hero-card"><div className="hero-card-top"><span>TRUST LAYER</span><ShieldCheck size={14} /></div><div className="score-line"><strong>LIVE</strong><span>mainnet source</span><div className="score-ring">✓</div></div><div className="trust-row"><span>Feed</span><b>Verified posts</b></div><div className="trust-row"><span>Social</span><b>Follow graph</b></div><div className="trust-row"><span>Alerts</span><b>In-app</b></div></div></section>
    <section className="content-section"><div className="section-heading"><div><p className="eyebrow">DISCOVER</p><h2>What verified wallets are saying</h2><div className="section-note">Click a wallet to inspect its public StockPass profile.</div></div></div><div className="feed-grid"><div className="feed-column">{posts.length ? posts.map((post) => <PostCard key={post.id} post={post} assets={assets} prices={prices} authorProfile={authorProfiles[post.wallet]} onProfile={onProfile} onAlert={onAlert} />) : <div className="empty-state"><Eye size={20} /><strong>No verified posts yet</strong><span>Own a supported xStock, verify it, and publish the first proof-backed post.</span></div>}</div><aside className="sidebar-card"><div className="side-title"><span>Live xStocks</span><ShieldCheck size={14} /></div>{assets.filter((x) => prices[x.symbol]).slice(0, 6).map((asset) => <div className="trend-row" key={asset.symbol}><span className="ticker-dot">{asset.symbol.replace('x', '')}</span><div><strong>{asset.symbol}</strong><small>{asset.name}</small></div><div className="trend-price"><b>${prices[asset.symbol].toFixed(2)}</b><span>official feed</span></div></div>)}</aside></div></section>
  </>;
}

function PostCard({ post, assets, prices, onProfile, onAlert, authorProfile }: { post: FeedPost; assets: StockAsset[]; prices: Record<string, number>; onProfile: (wallet: string) => void; onAlert: (symbol: string) => void; authorProfile?: StockPassProfile | null }) {
  const asset = assets.find((x) => x.mint === post.mint);
  const share = async () => { await navigator.clipboard?.writeText(profileUrl(post.wallet)); };
  const displayName = authorProfile?.display_name || (authorProfile?.handle ? `@${authorProfile.handle}` : shortWallet(post.wallet));
  const handle = authorProfile?.handle ? `@${authorProfile.handle}` : shortWallet(post.wallet);
  return <article className="post-card"><div className="post-head"><button className="avatar profile-link" onClick={() => onProfile(post.wallet)}>{displayName.slice(0, 2).toUpperCase()}</button><div className="post-author"><button className="profile-link post-handle" onClick={() => onProfile(post.wallet)}>{displayName}</button><span>{handle} · {new Date(post.created_at).toLocaleString()}</span></div><div className="proof"><ShieldCheck size={13} /> Verified holder</div></div><p>{post.body}</p>{asset && <button className="position-chip chip-button" onClick={() => onAlert(asset.symbol)}><span className="ticker-dot">{asset.symbol.replace('x', '')}</span><strong>{asset.symbol}</strong><span>{prices[asset.symbol] ? `$${prices[asset.symbol].toFixed(2)}` : 'Live price unavailable'}</span></button>}<div className="post-actions"><button onClick={() => asset && onAlert(asset.symbol)}><Bell size={13} /> Alert me</button><button onClick={() => void share()}><Copy size={13} /> Copy profile link</button></div></article>;
}

function Portfolio({ positions, checking, address, onVerify, onAlert, onProfile }: { positions: VerifiedPosition[]; checking: boolean; address: string | null; onVerify: () => void; onAlert: (symbol: string) => void; onProfile: (wallet: string) => void }) {
  return <section className="content-section"><div className="section-heading"><div><p className="eyebrow">PORTFOLIO</p><h2>Your positions, with receipts</h2><div className="section-note">Balances below are read directly from Solana mainnet.</div></div><button className="ghost-btn compact" onClick={onVerify} disabled={checking}><ShieldCheck size={14} /> {checking ? 'Checking…' : 'Verify now'}</button></div><div className="portfolio-summary"><div><span>Wallet</span><button className="profile-link summary-wallet" onClick={() => address && onProfile(address)}>{address ? shortAddress(address) : 'Not connected'}</button></div><div><span>Verified positions</span><strong>{positions.length}</strong></div><div><span>Proof state</span><strong className={positions.length ? 'positive' : ''}>{positions.length ? 'Live onchain' : 'Waiting'}</strong></div></div>{positions.length ? <div className="position-list">{positions.map((position) => <div className="position-row" key={position.symbol}><div className="asset-logo">{position.icon}</div><div className="asset-name"><strong>{position.symbol}</strong><span>{position.name}</span></div><div className="asset-qty"><span>Verified balance</span><b>{position.balance.toLocaleString()}</b></div><div className="asset-proof"><ShieldCheck size={14} /><span>Onchain</span></div><button className="ghost-btn compact" onClick={() => onAlert(position.symbol)}><Bell size={13} /></button></div>)}</div> : <div className="empty-state"><WalletCards size={20} /><strong>No supported xStock positions found</strong><span>Connect the wallet holding an official Solana xStock mint to create proof-backed posts.</span></div>}</section>;
}

function Alerts({ alerts }: { alerts: AlertRow[] }) {
  return <section className="content-section"><div className="section-heading"><div><p className="eyebrow">ALERTS</p><h2>Price targets you saved</h2><div className="section-note">Stored against your StockPass wallet.</div></div></div>{alerts.length ? <div className="alerts-list">{alerts.map((alert) => <div className="alert-row" key={alert.id}><div className="ticker-dot">{alert.symbol.replace('x', '')}</div><div><strong>{alert.symbol}</strong><span>Notify when price is {alert.direction} ${alert.target}</span></div><span className={alert.active ? 'alert-status on' : 'alert-status'}>{alert.active ? 'Active' : 'Off'}</span></div>)}</div> : <div className="empty-state"><Bell size={19} /><strong>No alerts yet</strong><span>Create one directly from a verified post or your portfolio.</span></div>}</section>;
}

function Activity({ wallet, notifications, onRead, onProfile }: { wallet: string; notifications: StockPassNotification[]; onRead: () => void; onProfile: (wallet: string) => void }) {
  const unread = notifications.some((n) => !n.read_at);
  return <section className="content-section"><div className="section-heading"><div><p className="eyebrow">ACTIVITY</p><h2>People you follow</h2><div className="section-note">Verified posts from wallets in your social graph.</div></div>{unread && <button className="ghost-btn compact" onClick={onRead}>Mark all read</button>}</div>{notifications.length ? <div className="notification-list">{notifications.map((notification) => <button className={notification.read_at ? 'notification-row' : 'notification-row unread'} key={notification.id} onClick={() => notification.actor_wallet && onProfile(notification.actor_wallet)}><span className="notification-icon"><Bell size={14} /></span><div><strong>{notification.message}</strong><span>{new Date(notification.created_at).toLocaleString()}</span></div><ChevronLeft size={14} className="notification-arrow" /></button>)}</div> : <div className="empty-state"><Users size={19} /><strong>No activity yet</strong><span>Follow a wallet from Discover. Their verified posts will appear here.</span></div>}{!wallet && <div className="empty-state">Connect a wallet to receive activity.</div>}</section>;
}

function PublicProfile({ wallet, viewerWallet, assets, prices, onBack, onFollowToast }: { wallet: string; viewerWallet: string | null; assets: StockAsset[]; prices: Record<string, number>; onBack: () => void; onFollowToast: (message: string) => void }) {
  const { connection } = useConnection();
  const [profile, setProfile] = useState<StockPassProfile | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [following, setFollowing] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [profilePositions, setProfilePositions] = useState<VerifiedPosition[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [profileTab, setProfileTab] = useState<ProfileTab>('posts');
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);

  const supportedAssets = useMemo(() => assets.filter((asset) => Boolean(asset.mint)), [assets]);

  const load = useCallback(async () => {
    try {
      await ensureProfile(wallet);
      const [nextProfile, nextCounts, nextPosts] = await Promise.all([loadProfile(wallet), loadFollowCounts(wallet), loadRecentPostsByWallet(wallet)]);
      setProfile(nextProfile);
      setCounts(nextCounts);
      setPosts(nextPosts);
      setDisplayName(nextProfile?.display_name ?? '');
      setHandle(nextProfile?.handle ?? '');
      setBio(nextProfile?.bio ?? '');
      if (viewerWallet && viewerWallet !== wallet) setFollowing(await isFollowing(viewerWallet, wallet));
    } finally {
      setLoading(false);
    }
  }, [wallet, viewerWallet]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!supportedAssets.length) {
      setPortfolioLoading(false);
      return;
    }
    setPortfolioLoading(true);
    readStockPositions(connection, new PublicKey(wallet), supportedAssets)
      .then((rows) => { if (!cancelled) setProfilePositions(rows); })
      .catch(() => { if (!cancelled) setProfilePositions([]); })
      .finally(() => { if (!cancelled) setPortfolioLoading(false); });
    return () => { cancelled = true; };
  }, [connection, wallet, supportedAssets]);

  const toggleFollow = async () => {
    if (!viewerWallet || viewerWallet === wallet) return;
    try {
      if (following) {
        await unfollowWallet(viewerWallet, wallet);
        setFollowing(false);
        setCounts((c) => ({ ...c, followers: Math.max(0, c.followers - 1) }));
        onFollowToast('Unfollowed wallet.');
      } else {
        await followWallet(viewerWallet, wallet);
        setFollowing(true);
        setCounts((c) => ({ ...c, followers: c.followers + 1 }));
        onFollowToast('Following wallet. Verified activity will appear in Activity.');
      }
    } catch {
      onFollowToast('Could not update the follow state.');
    }
  };

  const save = async () => {
    try {
      const next = await saveProfile({ wallet, display_name: displayName.trim().slice(0, 60) || null, handle: handle.trim().replace(/^@/, '').slice(0, 32) || null, bio: bio.trim().slice(0, 220) || null });
      setProfile(next);
      setEditing(false);
      onFollowToast('Profile saved.');
    } catch {
      onFollowToast('Could not save profile.');
    }
  };

  const share = async () => {
    const url = profileUrl(wallet);
    await navigator.clipboard?.writeText(url);
    onFollowToast('Profile link copied.');
  };

  if (loading) return <div className="profile-page"><button className="ghost-btn compact" onClick={onBack}><ChevronLeft size={14} /> Back</button><div className="data-loading">Loading public profile…</div></div>;
  if (!profile) return <div className="profile-page"><button className="ghost-btn compact" onClick={onBack}><ChevronLeft size={14} /> Back</button><div className="empty-state"><strong>Profile unavailable</strong><span>This wallet has not established a StockPass profile yet.</span></div></div>;

  const name = profile.display_name || (profile.handle ? `@${profile.handle}` : shortWallet(wallet));
  const username = profile.handle ? `@${profile.handle}` : null;
  const avatarText = name.replace('@', '').slice(0, 2).toUpperCase();

  return <div className="profile-page">
    <button className="ghost-btn compact" onClick={onBack}><ChevronLeft size={14} /> Back to Discover</button>
    <section className="profile-card">
      <div className="profile-top">
        <div className="profile-avatar">{avatarText}</div>
        <div className="profile-title">
          <span className="eyebrow">PUBLIC WALLET PROFILE</span>
          <h1>{name}</h1>
          {username && <div className="profile-username">{username}</div>}
          <button className="profile-link wallet-address" onClick={share}>{shortWallet(wallet)} <Copy size={12} /></button>
        </div>
        <div className="profile-actions">
          {viewerWallet && viewerWallet !== wallet && <button className={following ? 'ghost-btn compact' : 'primary-btn compact'} onClick={() => void toggleFollow()}><Users size={13} /> {following ? 'Following' : 'Follow'}</button>}
          <button className="ghost-btn compact" onClick={() => void share()}><Send size={13} /> Share</button>
          {viewerWallet === wallet && <button className="ghost-btn compact" onClick={() => setEditing((v) => !v)}>Edit profile</button>}
        </div>
      </div>
      <p className="profile-bio">{profile.bio || 'Proof-backed positions on Solana.'}</p>
      <div className="profile-stats">
        <div><strong>{counts.followers}</strong><span>followers</span></div>
        <div><strong>{counts.following}</strong><span>following</span></div>
        <div><strong>{posts.length}</strong><span>posts</span></div>
        <div><strong>{profilePositions.length}</strong><span>xStocks</span></div>
      </div>
      {editing && <div className="profile-editor"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="First name or full name" /><input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Username" /><textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio" maxLength={220} /><div><button className="ghost-btn compact" onClick={() => setEditing(false)}>Cancel</button><button className="primary-btn compact" onClick={() => void save()}>Save profile</button></div></div>}
    </section>

    <nav className="profile-tabs" aria-label="Profile sections">
      <button className={profileTab === 'posts' ? 'profile-tab active' : 'profile-tab'} onClick={() => setProfileTab('posts')}>Posts <span>{posts.length}</span></button>
      <button className={profileTab === 'portfolio' ? 'profile-tab active' : 'profile-tab'} onClick={() => setProfileTab('portfolio')}>Portfolio <span>{profilePositions.length}</span></button>
      <button className={profileTab === 'proof' ? 'profile-tab active' : 'profile-tab'} onClick={() => setProfileTab('proof')}>Proof</button>
    </nav>

    {profileTab === 'posts' && <section className="profile-grid profile-content-grid"><div className="profile-posts"><div className="section-heading"><div><p className="eyebrow">POSTS</p><h2>Proof-backed posts</h2></div></div>{posts.length ? posts.map((post) => <PostCard key={post.id} post={post} assets={assets} prices={prices} authorProfile={profile} onProfile={() => undefined} onAlert={() => undefined} />) : <div className="empty-state"><ShieldCheck size={19} /><strong>No verified posts</strong><span>This wallet has not published a proof-backed position yet.</span></div>}</div><ShareCard wallet={wallet} profile={profile} posts={posts} counts={counts} positions={profilePositions} /></section>}

    {profileTab === 'portfolio' && <section className="profile-portfolio-section">
      <div className="profile-portfolio-head"><div><p className="eyebrow">PORTFOLIO</p><h2>All xStocks held by this wallet</h2><div className="section-note">Live balances read from Solana mainnet. Only supported xStocks are shown.</div></div><div className="profile-portfolio-badge"><ShieldCheck size={13} /> Mainnet verified</div></div>
      {portfolioLoading ? <div className="data-loading">Checking mainnet holdings…</div> : profilePositions.length ? <div className="profile-holdings-list">{profilePositions.map((position) => { const price = prices[position.symbol]; const value = price ? position.balance * price : null; return <article className="profile-holding-row" key={position.mint}><div className="asset-logo">{position.icon}</div><div className="profile-holding-main"><strong>{position.symbol}</strong><span>{position.name}</span></div><div className="profile-holding-balance"><span>Balance</span><b>{position.balance.toLocaleString()}</b></div><div className="profile-holding-price"><span>{price ? 'Live price' : 'Price'}</span><b>{price ? `$${price.toFixed(2)}` : '—'}</b>{value !== null && <small>≈ ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</small>}</div><div className="asset-proof"><ShieldCheck size={14} /><span>Onchain</span></div></article>; })}</div> : <div className="empty-state"><WalletCards size={20} /><strong>No supported xStock holdings</strong><span>This wallet currently has no positive balance for the StockPass-supported Solana xStocks.</span></div>}
    </section>}

    {profileTab === 'proof' && <section className="profile-proof-section"><div className="profile-proof-card"><div className="profile-proof-icon"><ShieldCheck size={20} /></div><div><p className="eyebrow">OWNERSHIP PROOF</p><h2>Solana mainnet wallet</h2><p>StockPass reads the wallet's supported xStock token accounts directly from Solana mainnet. A post can reference that observed state with a fresh verification snapshot.</p><button className="profile-link proof-wallet" onClick={share}>{wallet}</button></div></div><div className="profile-proof-grid"><div><span>Verified xStocks</span><strong>{profilePositions.length}</strong></div><div><span>Published posts</span><strong>{posts.length}</strong></div><div><span>Followers</span><strong>{counts.followers}</strong></div><div><span>Following</span><strong>{counts.following}</strong></div></div></section>}
  </div>;
}

function ShareCard({ wallet, profile, posts, counts, positions }: { wallet: string; profile: StockPassProfile; posts: FeedPost[]; counts: { followers: number; following: number }; positions: VerifiedPosition[] }) {
  const post = posts[0];
  const copy = async () => { await navigator.clipboard?.writeText(profileUrl(wallet)); };
  return <aside className="share-card"><div className="share-card-top"><span>STOCKPASS / PUBLIC PROOF</span><ShieldCheck size={14} /></div><div className="share-mark">SP</div><h3>{profile.display_name || (profile.handle ? `@${profile.handle}` : shortWallet(wallet))}</h3>{profile.handle && <div className="share-handle">@{profile.handle}</div>}<p>{profile.bio || 'Proof-backed Solana positions.'}</p><div className="share-stat"><strong>{posts.length}</strong><span>posts</span><strong>{positions.length}</strong><span>xStocks</span><strong>{counts.followers}</strong><span>followers</span></div>{post && <div className="share-proof"><span>Latest proof</span><b>{post.mint ? post.mint.slice(0, 6) + '…' + post.mint.slice(-5) : 'Position'}</b><small>{new Date(post.created_at).toLocaleDateString()}</small></div>}<button className="primary-btn compact" onClick={() => void copy()}><Copy size={13} /> Copy share link</button></aside>;
}

function ComposeModal({ connected, positions, onClose, onPost }: { connected: boolean; positions: VerifiedPosition[]; onClose: () => void; onPost: (position: VerifiedPosition, body: string) => Promise<void> }) {
  const [selected, setSelected] = useState(positions[0]?.symbol ?? '');
  const [body, setBody] = useState(positions[0] ? `Holding ${positions[0].symbol}. Position verified against Solana mainnet.` : '');
  const position = positions.find((p) => p.symbol === selected) ?? positions[0];
  useEffect(() => { if (position) setBody((current) => current || `Holding ${position.symbol}. Position verified against Solana mainnet.`); }, [position]);
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><p className="eyebrow">NEW POST</p><h3>Publish with proof</h3></div><button className="ghost-btn compact" onClick={onClose}><X size={14} /></button></div>{positions.length > 1 && <select value={selected} onChange={(e) => setSelected(e.target.value)}>{positions.map((p) => <option key={p.symbol}>{p.symbol}</option>)}</select>}<div className="compose-symbol"><span className="ticker-dot">{position?.icon ?? 'SP'}</span><div><strong>{position?.symbol ?? 'Select a verified position'}</strong><span>{connected && position ? 'Fresh wallet verification attached' : 'Connect and verify a wallet first'}</span></div>{position && <span className="proof"><ShieldCheck size={12} /> Verified holder</span>}</div><textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} /><div className="modal-foot"><span>Snapshot checked at publish time</span><button className="primary-btn" disabled={!position || !body.trim()} onClick={() => position && void onPost(position, body)}><ShieldCheck size={14} /> Publish proof</button></div></div></div>;
}
