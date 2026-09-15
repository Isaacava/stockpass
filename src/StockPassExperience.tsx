import { useCallback, useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { AppKitButton, useAppKitAccount } from '@reown/appkit/react';
import { useConnection } from '@solana/wallet-adapter-react';
import { Bell, Check, ChevronRight, CircleUserRound, Home, LayoutGrid, Menu, PenLine, ShieldCheck, Sparkles, X } from 'lucide-react';
import { STOCKS, type StockAsset } from './lib/assets';
import { fetchOfficialPrices, resolveOfficialStocks } from './lib/xstocks';
import { fetchXStockPortfolioValue, sumXStockValue, type XStockPortfolioRow } from './lib/xstockPortfolio';
import { readStockPositions, shortAddress, type VerifiedPosition } from './lib/solana';
import { createPriceAlert, ensureProfile, loadAlerts, loadNotifications, loadPosts, publishVerifiedPost, type FeedPost } from './lib/stockpass';
import { markNotificationsRead, profileUrl, type StockPassNotification } from './lib/social';
import StockPassDiscoverPage from './StockPassDiscoverPage';
import StockPassFeedPage from './StockPassFeedPage';
import StockPassSwapPage from './StockPassSwapPage';
import './stockpass-redesign.css';

type Page = 'discover' | 'feed' | 'portfolio' | 'alerts' | 'activity' | 'swap';
type AlertRow = { id: string; symbol: string; direction: 'above' | 'below'; target: number; active: boolean; mint: string | null };

export default function StockPassExperience() {
  const { address: connectedAddress, isConnected } = useAppKitAccount();
  const address = connectedAddress ?? '';
  const { connection } = useConnection();
  const [page, setPage] = useState<Page>('discover');
  const [assets, setAssets] = useState<StockAsset[]>(STOCKS);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [positions, setPositions] = useState<VerifiedPosition[]>([]);
  const [portfolioRows, setPortfolioRows] = useState<XStockPortfolioRow[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [notifications, setNotifications] = useState<StockPassNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [swapSymbol, setSwapSymbol] = useState(STOCKS[0]?.symbol ?? 'AAPLx');

  const refresh = useCallback(async () => {
    const official = await resolveOfficialStocks(STOCKS);
    const live = await fetchOfficialPrices(official.slice(0, 18));
    setAssets(official);
    setPrices(live);
    return official;
  }, []);

  const refreshWallet = useCallback(async (official: StockAsset[]) => {
    if (!address) return;
    try {
      const rows = await readStockPositions(connection, new PublicKey(address), official);
      setPositions(rows);
      setPortfolioRows(await fetchXStockPortfolioValue(rows, official));
    } catch {
      setPositions([]);
      setPortfolioRows([]);
      setToast('Could not verify wallet holdings on Solana mainnet.');
    }
  }, [address, connection]);

  const refreshSocial = useCallback(async (official: StockAsset[]) => {
    if (!address) return;
    await ensureProfile(address);
    const [nextPosts, nextAlerts, nextNotifications] = await Promise.all([loadPosts(), loadAlerts(address), loadNotifications(address)]);
    setPosts(nextPosts);
    setAlerts(nextAlerts.map((row) => ({ id: row.id as string, symbol: official.find((asset) => asset.mint === row.mint)?.symbol ?? 'xStock', direction: row.direction as 'above' | 'below', target: Number(row.target_price), active: Boolean(row.active), mint: row.mint as string | null })));
    setNotifications(nextNotifications);
  }, [address]);

  useEffect(() => {
    if (!isConnected || !address) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const official = await refresh();
        if (cancelled) return;
        await Promise.all([refreshWallet(official), refreshSocial(official)]);
      } catch {
        if (!cancelled) setToast('Some live StockPass data could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isConnected, address, refresh, refreshWallet, refreshSocial]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const go = (next: Page) => { setPage(next); setMobileNav(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openSwap = (symbol: string) => { setSwapSymbol(symbol); go('swap'); };
  const unread = notifications.filter((item) => !item.read_at).length;
  const trackedValue = sumXStockValue(portfolioRows);
  const heldMints = positions.map((position) => position.mint);

  const addAlert = async (symbol: string) => {
    if (!address) return setToast('Connect your wallet to create alerts.');
    const asset = assets.find((item) => item.symbol === symbol);
    const price = prices[symbol];
    if (!asset?.mint || !price) return setToast('Live xStock price unavailable.');
    const target = Number((price * 1.08).toFixed(2));
    try {
      await createPriceAlert({ wallet: address, mint: asset.mint, direction: 'above', target_price: target });
      setAlerts((rows) => [{ id: crypto.randomUUID(), symbol, direction: 'above', target, active: true, mint: asset.mint }, ...rows]);
      setToast(`${symbol} alert created.`);
      go('alerts');
    } catch { setToast('Could not create the alert.'); }
  };

  const publish = async (position: VerifiedPosition, body: string) => {
    if (!address) return;
    const slot = await connection.getSlot('confirmed');
    await publishVerifiedPost({ wallet: address, position, slot, body });
    setPosts(await loadPosts());
    setNotifications(await loadNotifications(address));
    setComposerOpen(false);
    setToast('Published with fresh mainnet proof.');
    go('feed');
  };

  if (!isConnected) return <DisconnectedLanding />;

  return <div className="sp3-app">
    <header className="sp3-header">
      <div className="sp3-brand" onClick={() => go('discover')} role="button" tabIndex={0}><span className="sp3-brand-mark">SP</span><div><strong>StockPass</strong><small>proof-first markets</small></div></div>
      <nav className="sp3-nav desktop-nav"><NavItem icon={<LayoutGrid size={16} />} label="Discover" active={page === 'discover'} onClick={() => go('discover')} /><NavItem icon={<Home size={16} />} label="Feed" active={page === 'feed'} onClick={() => go('feed')} /><NavItem icon={<CircleUserRound size={16} />} label="Portfolio" active={page === 'portfolio'} onClick={() => go('portfolio')} /><NavItem icon={<Bell size={16} />} label="Alerts" active={page === 'alerts'} onClick={() => go('alerts')} /><NavItem icon={<Sparkles size={16} />} label="Activity" active={page === 'activity'} onClick={() => go('activity')} badge={unread} /></nav>
      <div className="sp3-header-actions"><span className="sp3-mainnet"><i /> MAINNET</span><AppKitButton /><button className="sp3-mobile-menu" onClick={() => setMobileNav((value) => !value)} aria-label="Open navigation">{mobileNav ? <X size={18} /> : <Menu size={18} />}</button></div>
    </header>

    {mobileNav && <div className="sp3-mobile-nav"><NavItem icon={<LayoutGrid size={16} />} label="Discover" active={page === 'discover'} onClick={() => go('discover')} /><NavItem icon={<Home size={16} />} label="Feed" active={page === 'feed'} onClick={() => go('feed')} /><NavItem icon={<CircleUserRound size={16} />} label="Portfolio" active={page === 'portfolio'} onClick={() => go('portfolio')} /><NavItem icon={<Bell size={16} />} label="Alerts" active={page === 'alerts'} onClick={() => go('alerts')} /><NavItem icon={<Sparkles size={16} />} label="Activity" active={page === 'activity'} onClick={() => go('activity')} badge={unread} /></div>}

    <main className="sp3-main">
      {page === 'discover' && <StockPassDiscoverPage onAssetAlert={addAlert} onOpenProfile={() => go('portfolio')} />}
      {page === 'feed' && <StockPassFeedPage posts={posts} assets={assets} prices={prices} viewerWallet={address} heldMints={heldMints} onProfile={(wallet) => window.open(profileUrl(wallet), '_self')} onAlert={addAlert} onCompose={() => setComposerOpen(true)} onSwap={openSwap} />}
      {page === 'portfolio' && <PortfolioPage positions={positions} rows={portfolioRows} total={trackedValue} loading={loading} wallet={address} onRefresh={() => void refreshWallet(assets)} onPost={() => setComposerOpen(true)} />}
      {page === 'alerts' && <AlertsPage alerts={alerts} />}
      {page === 'activity' && <ActivityPage notifications={notifications} onRead={() => { void markNotificationsRead(address); setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() }))); }} />}
      {page === 'swap' && <StockPassSwapPage symbol={swapSymbol} assets={assets} onBack={() => go('feed')} />}
    </main>

    <footer className="sp3-footer"><span>StockPass</span><span>Solana mainnet · xStocks only</span><span>Proof stays on-chain. Social stays readable.</span></footer>
    {composerOpen && <Composer positions={positions} onClose={() => setComposerOpen(false)} onPublish={publish} />}
    {loading && <div className="sp3-loading"><div className="sp3-spinner" /> Syncing mainnet</div>}
    {toast && <div className="sp3-toast"><Check size={14} /> {toast}</div>}
  </div>;
}

function NavItem({ icon, label, active, onClick, badge }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return <button className={active ? 'sp3-nav-item active' : 'sp3-nav-item'} onClick={onClick}>{icon}<span>{label}</span>{Boolean(badge) && <b>{badge}</b>}</button>;
}

function DisconnectedLanding() {
  return <div className="sp3-disconnected"><div className="sp3-disconnected-card"><span className="sp3-brand-mark">SP</span><div className="sp3-kicker">STOCKPASS</div><h1>See the position.<br /><em>Verify the position.</em></h1><p>Connect a Solana wallet to enter the mainnet workspace. StockPass tracks xStocks only and never invents wallet balances.</p><div className="sp3-disconnected-note"><ShieldCheck size={15} /> Solana mainnet is the source of truth</div><AppKitButton /></div></div>;
}

function PortfolioPage({ positions, rows, total, loading, wallet, onRefresh, onPost }: { positions: VerifiedPosition[]; rows: XStockPortfolioRow[]; total: number; loading: boolean; wallet: string; onRefresh: () => void; onPost: () => void }) {
  return <div className="sp3-content"><section className="sp3-page-heading"><div><div className="sp3-kicker">YOUR WALLET</div><h1>Portfolio</h1><p>Only xStocks currently held by your Solana wallet appear here.</p></div><div className="sp3-heading-actions"><button className="sp3-secondary" onClick={onRefresh}>Refresh holdings</button><button className="sp3-primary" onClick={onPost} disabled={!positions.length}><PenLine size={14} /> Post proof</button></div></section><section className="sp3-stat-grid"><Stat label="Tracked xStock value" value={total ? `$${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'} /><Stat label="xStocks held" value={loading ? '…' : String(positions.length)} /><Stat label="Wallet" value={shortAddress(wallet)} /></section><section className="sp3-panel"><div className="sp3-panel-head"><div><strong>Verified holdings</strong><span>Live Solana mainnet balances + official xStocks prices</span></div><ShieldCheck size={17} /></div>{rows.length ? <div className="sp3-holding-list">{rows.map((row) => <div className="sp3-holding" key={row.mint}><span className="sp3-holding-symbol">{row.symbol.replace(/x$/i, '').slice(0, 4)}</span><div><strong>{row.symbol}</strong><span>{row.holding.toLocaleString()} held</span></div><div className="sp3-holding-price"><strong>{row.priceUsd ? `$${row.priceUsd.toFixed(2)}` : '—'}</strong><span>{row.valueUsd ? `$${row.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} value` : 'Price unavailable'}</span></div></div>)}</div> : <div className="sp3-empty"><CircleUserRound size={20} /><strong>No supported xStocks held</strong><span>When the connected wallet holds a verified xStock, it will appear here automatically.</span></div>}</section></div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="sp3-stat"><span>{label}</span><strong>{value}</strong></div>; }

function AlertsPage({ alerts }: { alerts: AlertRow[] }) {
  return <div className="sp3-content"><section className="sp3-page-heading"><div><div className="sp3-kicker">AUTOMATION</div><h1>Alerts</h1><p>Simple price triggers for the xStocks you care about.</p></div></section><section className="sp3-panel">{alerts.length ? <div className="sp3-alert-list">{alerts.map((alert) => <div className="sp3-alert-row" key={alert.id}><div className="sp3-alert-dot"><Bell size={15} /></div><div><strong>{alert.symbol} above ${alert.target.toFixed(2)}</strong><span>{alert.active ? 'Active · in-app notification' : 'Paused'}</span></div><span className="sp3-alert-status">{alert.active ? 'ACTIVE' : 'OFF'}</span><ChevronRight size={15} /></div>)}</div> : <div className="sp3-empty"><Bell size={20} /><strong>No alerts yet</strong><span>Open an xStock in Discover and create an alert from its live market data.</span></div>}</section></div>;
}

function ActivityPage({ notifications, onRead }: { notifications: StockPassNotification[]; onRead: () => void }) {
  return <div className="sp3-content"><section className="sp3-page-heading"><div><div className="sp3-kicker">ACTIVITY</div><h1>Notifications</h1><p>Your StockPass social and proof events in one quiet inbox.</p></div><button className="sp3-secondary" onClick={onRead}>Mark all read</button></section><section className="sp3-panel">{notifications.length ? <div className="sp3-notification-list">{notifications.map((note) => <div className={note.read_at ? 'sp3-note' : 'sp3-note unread'} key={note.id}><span className="sp3-note-icon"><Sparkles size={14} /></span><div><strong>{note.title}</strong><span>{note.body}</span></div><small>{new Date(note.created_at).toLocaleString()}</small></div>)}</div> : <div className="sp3-empty"><Sparkles size={20} /><strong>All quiet</strong><span>New proof, social and alert events will appear here.</span></div>}</section></div>;
}

function Composer({ positions, onClose, onPublish }: { positions: VerifiedPosition[]; onClose: () => void; onPublish: (position: VerifiedPosition, body: string) => Promise<void> }) {
  const [selected, setSelected] = useState(positions[0]?.mint ?? '');
  const [body, setBody] = useState('');
  const current = positions.find((position) => position.mint === selected) ?? positions[0];
  return <div className="sp3-overlay" onClick={onClose}><section className="sp3-modal" onClick={(event) => event.stopPropagation()}><div className="sp3-modal-head"><div><div className="sp3-kicker">VERIFIED POST</div><h2>Publish what you hold.</h2></div><button onClick={onClose} aria-label="Close"><X size={18} /></button></div>{current ? <><label className="sp3-field-label">POSITION</label><select value={selected} onChange={(event) => setSelected(event.target.value)}>{positions.map((position) => <option key={position.mint} value={position.mint}>{position.symbol} · {position.balance.toLocaleString()} held</option>)}</select><label className="sp3-field-label">POST</label><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} placeholder="What do you want the market to know?" /><div className="sp3-modal-foot"><span>Snapshot taken at publish time.</span><button className="sp3-primary" onClick={() => body.trim() && void onPublish(current, body)}>Publish proof</button></div></> : <div className="sp3-empty"><ShieldCheck size={20} /><strong>No verified position available</strong><span>StockPass only publishes positions it can confirm on Solana mainnet.</span></div>}</section></div>;
}
