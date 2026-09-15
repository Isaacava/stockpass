import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Bell, Check, Copy, Heart, MessageCircle, PenLine, Repeat2, ShieldCheck, ShoppingBag, Users } from 'lucide-react';
import type { StockAsset } from './lib/assets';
import type { FeedPost } from './lib/stockpass';
import { fetchOfficialPriceSignals, type XStockSignal } from './lib/xstocks';
import { loadFollowingWallets, loadProfile, profileUrl, shortWallet, type StockPassProfile } from './lib/social';
import './feed-swap.css';

type FeedTab = 'general' | 'stocks' | 'following';

type Props = {
  posts: FeedPost[];
  assets: StockAsset[];
  prices: Record<string, number>;
  viewerWallet: string | null;
  heldMints: string[];
  onProfile: (wallet: string) => void;
  onAlert: (symbol: string) => void;
  onCompose: () => void;
  onSwap: (symbol: string) => void;
};

export default function StockPassFeedPage({ posts, assets, prices, viewerWallet, heldMints, onProfile, onAlert, onCompose, onSwap }: Props) {
  const [profiles, setProfiles] = useState<Record<string, StockPassProfile>>({});
  const [signals, setSignals] = useState<Record<string, XStockSignal>>({});
  const [following, setFollowing] = useState<string[]>([]);
  const [tab, setTab] = useState<FeedTab>('general');
  const [loadingFollowing, setLoadingFollowing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const wallets = Array.from(new Set(posts.map((post) => post.wallet).filter(Boolean)));
    void Promise.all(wallets.map(async (wallet) => {
      try { const profile = await loadProfile(wallet); return profile ? [wallet, profile] as const : null; } catch { return null; }
    })).then((rows) => {
      if (cancelled) return;
      const next: Record<string, StockPassProfile> = {};
      rows.forEach((row) => { if (row) next[row[0]] = row[1]; });
      setProfiles(next);
    });
    return () => { cancelled = true; };
  }, [posts]);

  useEffect(() => {
    let cancelled = false;
    const tagged = assets.filter((asset) => posts.some((post) => post.mint === asset.mint));
    void fetchOfficialPriceSignals(tagged).then((next) => { if (!cancelled) setSignals(next); });
    return () => { cancelled = true; };
  }, [assets, posts]);

  useEffect(() => {
    if (!viewerWallet) {
      setFollowing([]);
      return;
    }
    let cancelled = false;
    setLoadingFollowing(true);
    void loadFollowingWallets(viewerWallet).then((wallets) => {
      if (!cancelled) setFollowing(wallets);
    }).catch(() => {
      if (!cancelled) setFollowing([]);
    }).finally(() => {
      if (!cancelled) setLoadingFollowing(false);
    });
    return () => { cancelled = true; };
  }, [viewerWallet]);

  const followingSet = useMemo(() => new Set(following), [following]);
  const heldSet = useMemo(() => new Set(heldMints), [heldMints]);
  const displayed = useMemo(() => {
    const verified = posts.filter((post) => post.proof_type !== 'demo_social' && Boolean(post.mint));
    if (tab === 'stocks') return posts.filter((post) => Boolean(post.mint) && heldSet.has(post.mint));
    if (tab === 'following') return posts.filter((post) => followingSet.has(post.wallet));
    return posts;
  }, [posts, tab, heldSet, followingSet]);

  const demoCount = Object.values(profiles).filter((profile) => profile.is_demo_bot).length;
  const tabMeta = tab === 'general'
    ? { kicker: 'GENERAL FEED', title: 'What the market is saying.', copy: 'A clean, chronological stream of StockPass posts. Every attached xStock can open its live market action.' }
    : tab === 'stocks'
      ? { kicker: 'MY STOCKS', title: 'Talk around what you hold.', copy: heldSet.size ? 'Posts tagged with xStocks currently verified in your connected Solana wallet.' : 'Hold a supported xStock on Solana mainnet to personalize this feed.' }
      : { kicker: 'FOLLOWING', title: 'People you chose to hear from.', copy: following.length ? 'Only posts from accounts you follow appear here.' : 'Follow accounts from their profiles to build your own stream.' };

  return <div className="sp2-page sp2-feed-page sp2-twitter-feed">
    <section className="sp2-twitter-head">
      <div><div className="sp2-kicker"><span className="sp2-kicker-dot" /> {tabMeta.kicker}</div><h1>{tabMeta.title}</h1><p>{tabMeta.copy}</p></div>
      <button className="sp2-primary sp2-compose-top" onClick={onCompose}><PenLine size={15} /> Post</button>
    </section>

    <nav className="sp2-feed-tabs sp2-feed-tabs-top" aria-label="Feed views">
      <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}><span>General</span><small>Everything</small></button>
      <button className={tab === 'stocks' ? 'active' : ''} onClick={() => setTab('stocks')}><span>My Stocks</span><small>{heldSet.size ? `${heldSet.size} held` : 'Your positions'}</small></button>
      <button className={tab === 'following' ? 'active' : ''} onClick={() => setTab('following')}><span>Following</span><small>{following.length} accounts</small></button>
    </nav>

    <div className="sp2-feed-layout sp2-twitter-layout">
      <div className="sp2-feed-list">
        <div className="sp2-feed-context"><span className="sp2-live"><i /> MAINNET</span><span>{tab === 'following' && loadingFollowing ? 'Loading follows…' : `${displayed.length} posts`}</span><span className="sp2-feed-context-dot">·</span><span>Official xStocks prices</span></div>
        {displayed.length ? displayed.map((post) => {
          const asset = assets.find((candidate) => candidate.mint === post.mint);
          const signal = asset ? signals[asset.symbol] : undefined;
          const fallback = asset ? prices[asset.symbol] : undefined;
          return <FeedCard key={post.id} post={post} asset={asset} signal={signal} fallbackPrice={fallback} profile={profiles[post.wallet]} isFollowing={followingSet.has(post.wallet)} onProfile={onProfile} onAlert={onAlert} onSwap={onSwap} />;
        }) : <FeedEmpty tab={tab} hasHoldings={heldSet.size > 0} hasFollowing={following.length > 0} onCompose={onCompose} />}
      </div>

      <aside className="sp2-feed-rail sp2-twitter-rail">
        <div className="sp2-rail-card"><div className="sp2-rail-title">Your feed</div><div className="sp2-feed-rail-row"><strong>{posts.length}</strong><span>posts loaded</span></div><div className="sp2-feed-rail-row"><strong>{heldSet.size}</strong><span>xStocks held</span></div><div className="sp2-feed-rail-row"><strong>{following.length}</strong><span>accounts followed</span></div></div>
        <div className="sp2-rail-card"><div className="sp2-rail-title">StockPass rule</div><p className="sp2-rail-copy">Social can be noisy. Proof is not. Verified posts are always tied to a mainnet snapshot.</p><div className="sp2-rail-note"><Check size={12} /> Demo accounts are always labeled</div></div>
      </aside>
    </div>
  </div>;
}

function FeedEmpty({ tab, hasHoldings, hasFollowing, onCompose }: { tab: FeedTab; hasHoldings: boolean; hasFollowing: boolean; onCompose: () => void }) {
  const text = tab === 'stocks'
    ? hasHoldings ? 'No posts are tagged with your current xStocks yet.' : 'No xStocks are currently verified in this wallet.'
    : tab === 'following'
      ? hasFollowing ? 'The accounts you follow have not posted yet.' : 'Follow an account from its profile to build this stream.'
      : 'There are no posts yet.';
  return <div className="sp2-empty-card sp2-twitter-empty"><Users size={20} /><strong>{text}</strong><span>When relevant StockPass posts exist, they will appear here automatically.</span>{tab === 'general' && <button className="sp2-secondary" onClick={onCompose}>Create a verified post</button>}</div>;
}

function FeedCard({ post, asset, signal, fallbackPrice, profile, isFollowing, onProfile, onAlert, onSwap }: { post: FeedPost; asset?: StockAsset; signal?: XStockSignal; fallbackPrice?: number; profile?: StockPassProfile | null; isFollowing: boolean; onProfile: (wallet: string) => void; onAlert: (symbol: string) => void; onSwap: (symbol: string) => void }) {
  const displayName = profile?.display_name || (profile?.handle ? `@${profile.handle}` : shortWallet(post.wallet));
  const handle = profile?.handle ? `@${profile.handle}` : shortWallet(post.wallet);
  const copy = async () => { try { await navigator.clipboard?.writeText(profileUrl(post.wallet)); } catch {} };
  const price = signal?.price ?? fallbackPrice;
  const movement = signal?.changePercent ?? null;
  const isDemo = profile?.is_demo_bot || post.proof_type === 'demo_social';
  return <article className="sp2-feed-card sp2-twitter-card">
    <button className="sp2-avatar" onClick={() => onProfile(post.wallet)} aria-label={`Open ${displayName} profile`}>{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : displayName.slice(0, 2).toUpperCase()}</button>
    <div className="sp2-twitter-card-main">
      <div className="sp2-feed-card-head">
        <div className="sp2-author-copy"><button onClick={() => onProfile(post.wallet)}>{displayName}</button><span>{handle} · {formatPostTime(post.created_at)}</span></div>
        {isDemo ? <span className="sp2-demo-pill"><ShoppingBag size={10} /> Demo</span> : <span className="sp2-verified-pill"><ShieldCheck size={11} /> Verified</span>}
      </div>
      <p className="sp2-post-body">{post.body}</p>

      {asset && <button className="sp2-market-attachment" onClick={() => onSwap(asset.symbol)} aria-label={`Open ${asset.symbol} market action`}>
        <span className="sp2-logo">{asset.icon}</span>
        <span className="sp2-market-copy"><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
        <span className="sp2-market-price"><b>{price ? `$${price.toFixed(2)}` : '—'}</b><small className={movement === null ? '' : movement >= 0 ? 'up' : 'down'}>{movement === null ? 'Live xStock' : `${movement >= 0 ? '+' : ''}${movement.toFixed(2)}%`}</small></span>
        <span className="sp2-market-arrow"><ArrowUpRight size={15} /></span>
      </button>}

      <div className="sp2-post-actions" aria-label="Post actions">
        <button onClick={() => onProfile(post.wallet)}><MessageCircle size={15} /><span>View</span></button>
        <button onClick={() => void copy()}><Repeat2 size={15} /><span>Share</span></button>
        <button onClick={() => onAlert(asset?.symbol ?? '')} disabled={!asset}><Bell size={15} /><span>Alert</span></button>
        <button onClick={() => onSwap(asset?.symbol ?? '')} disabled={!asset}><ArrowUpRight size={15} /><span>Swap</span></button>
        <button onClick={() => onProfile(post.wallet)} className="sp2-like-button"><Heart size={15} /><span>{isFollowing ? 'Following' : 'Profile'}</span></button>
      </div>
    </div>
  </article>;
}

function formatPostTime(createdAt: string) {
  const date = new Date(createdAt);
  const diff = Math.max(0, Date.now() - date.getTime());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'now';
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
