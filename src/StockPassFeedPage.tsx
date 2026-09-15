import { useEffect, useState } from 'react';
import { ArrowUpRight, Bell, Check, Copy, PenLine, ShieldCheck, ShoppingBag, Users } from 'lucide-react';
import type { StockAsset } from './lib/assets';
import type { FeedPost } from './lib/stockpass';
import { fetchOfficialPriceSignals, type XStockSignal } from './lib/xstocks';
import { loadProfile, profileUrl, shortWallet, type StockPassProfile } from './lib/social';
import './feed-swap.css';

export default function StockPassFeedPage({ posts, assets, prices, viewerWallet, onProfile, onAlert, onCompose, onSwap }: { posts: FeedPost[]; assets: StockAsset[]; prices: Record<string, number>; viewerWallet: string | null; onProfile: (wallet: string) => void; onAlert: (symbol: string) => void; onCompose: () => void; onSwap: (symbol: string) => void }) {
  const [profiles, setProfiles] = useState<Record<string, StockPassProfile>>({});
  const [signals, setSignals] = useState<Record<string, XStockSignal>>({});
  const [filter, setFilter] = useState<'general' | 'verified'>('general');

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

  const displayed = filter === 'verified' ? posts.filter((post) => post.proof_type !== 'demo_social' && Boolean(post.mint)) : posts;
  const demoCount = Object.values(profiles).filter((profile) => profile.is_demo_bot).length;

  return <div className="sp2-page sp2-feed-page">
    <section className="sp2-feed-hero">
      <div><div className="sp2-kicker"><span className="sp2-kicker-dot" /> GENERAL FEED</div><h1>Market talk with the<br /><em>asset attached.</em></h1><p>Every post can carry a live xStock market card, so a thought about a stock is only one tap away from its market action.</p></div>
      <button className="sp2-primary sp2-compose-top" onClick={onCompose}><PenLine size={15} /> Post a verified position</button>
    </section>

    <section className="sp2-feed-toolbar"><div className="sp2-feed-tabs"><button className={filter === 'general' ? 'active' : ''} onClick={() => setFilter('general')}>General</button><button className={filter === 'verified' ? 'active' : ''} onClick={() => setFilter('verified')}><ShieldCheck size={12} /> Verified</button></div><div className="sp2-feed-signal"><span className="sp2-live"><i /> MAINNET</span><span>{demoCount || 100} demo market accounts · live xStock cards</span></div></section>

    <div className="sp2-feed-layout">
      <div className="sp2-feed-list">
        {displayed.length ? displayed.map((post) => { const asset = assets.find((candidate) => candidate.mint === post.mint); const signal = asset ? signals[asset.symbol] : undefined; const fallback = asset ? prices[asset.symbol] : undefined; return <FeedCard key={post.id} post={post} asset={asset} signal={signal} fallbackPrice={fallback} profile={profiles[post.wallet]} onProfile={onProfile} onAlert={onAlert} onSwap={onSwap} />; }) : <div className="sp2-empty-card"><Users size={20} /><strong>No verified posts yet</strong><span>Connect a wallet that holds a supported xStock and publish a proof-backed position.</span><button className="sp2-secondary" onClick={onCompose}>Create the first post</button></div>}
      </div>
      <aside className="sp2-feed-rail">
        <div className="sp2-rail-card sp2-rail-dark"><span className="sp2-kicker">GENERAL FEED</span><h3>Social first.<br />Market context second.</h3><p>Demo accounts make the feed feel alive during the hackathon demo, while real user posts remain clearly distinguishable.</p><div className="sp2-rail-stat"><strong>{posts.length}</strong><span>posts currently loaded</span></div></div>
        <div className="sp2-rail-card"><div className="sp2-rail-title">Quick actions</div><button onClick={onCompose}><PenLine size={14} /> Publish a position</button><button onClick={() => viewerWallet && onProfile(viewerWallet)}><Users size={14} /> Open your profile</button><div className="sp2-rail-note"><Check size={12} /> xStock cards use the official xStocks price feed</div></div>
      </aside>
    </div>
  </div>;
}

function FeedCard({ post, asset, signal, fallbackPrice, profile, onProfile, onAlert, onSwap }: { post: FeedPost; asset?: StockAsset; signal?: XStockSignal; fallbackPrice?: number; profile?: StockPassProfile | null; onProfile: (wallet: string) => void; onAlert: (symbol: string) => void; onSwap: (symbol: string) => void }) {
  const displayName = profile?.display_name || (profile?.handle ? `@${profile.handle}` : shortWallet(post.wallet));
  const handle = profile?.handle ? `@${profile.handle}` : shortWallet(post.wallet);
  const copy = async () => { try { await navigator.clipboard?.writeText(profileUrl(post.wallet)); } catch {} };
  const price = signal?.price ?? fallbackPrice;
  const movement = signal?.changePercent ?? null;
  const isDemo = profile?.is_demo_bot || post.proof_type === 'demo_social';
  return <article className="sp2-feed-card">
    <div className="sp2-feed-card-head"><button className="sp2-avatar" onClick={() => onProfile(post.wallet)}>{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : displayName.slice(0,2).toUpperCase()}</button><div className="sp2-author-copy"><button onClick={() => onProfile(post.wallet)}>{displayName}</button><span>{handle} · {new Date(post.created_at).toLocaleString()}</span></div>{isDemo ? <span className="sp2-demo-pill"><ShoppingBag size={11} /> Demo account</span> : <span className="sp2-verified-pill"><ShieldCheck size={12} /> Verified holder</span>}</div>
    <p className="sp2-post-body">{post.body}</p>
    {asset && <button className="sp2-market-attachment" onClick={() => onSwap(asset.symbol)} aria-label={`Open ${asset.symbol} swap page`}>
      <span className="sp2-logo">{asset.icon}</span>
      <span className="sp2-market-copy"><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
      <span className="sp2-market-price"><b>{price ? `$${price.toFixed(2)}` : '—'}</b><small className={movement === null ? '' : movement >= 0 ? 'up' : 'down'}>{movement === null ? 'Live xStock' : `${movement >= 0 ? '+' : ''}${movement.toFixed(2)}%`}</small></span>
      <span className="sp2-market-arrow"><ArrowUpRight size={15} /></span>
    </button>}
    <div className="sp2-post-foot"><span>{isDemo ? <><ShoppingBag size={12} /> Demo social post</> : <><ShieldCheck size={12} /> Snapshot-backed</>}</span><button onClick={() => void copy()}><Copy size={12} /> Copy profile</button>{asset && <button onClick={() => onAlert(asset.symbol)}><Bell size={12} /> Alert</button>} {asset && <button className="sp2-swap-link" onClick={() => onSwap(asset.symbol)}>Swap <ArrowUpRight size={11} /></button>}</div>
  </article>;
}
