import { useEffect, useState } from 'react';
import { Bell, Check, Copy, PenLine, ShieldCheck, Users } from 'lucide-react';
import type { StockAsset } from './lib/assets';
import type { FeedPost } from './lib/stockpass';
import { loadProfile, profileUrl, shortWallet, type StockPassProfile } from './lib/social';

export default function StockPassFeedPage({ posts, assets, prices, viewerWallet, onProfile, onAlert, onCompose }: { posts: FeedPost[]; assets: StockAsset[]; prices: Record<string, number>; viewerWallet: string | null; onProfile: (wallet: string) => void; onAlert: (symbol: string) => void; onCompose: () => void }) {
  const [profiles, setProfiles] = useState<Record<string, StockPassProfile>>({});
  const [filter, setFilter] = useState<'latest' | 'verified'>('latest');

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

  const displayed = filter === 'verified' ? posts.filter((post) => post.mint) : posts;

  return <div className="sp2-page sp2-feed-page">
    <section className="sp2-feed-hero">
      <div><div className="sp2-kicker"><span className="sp2-kicker-dot" /> SOCIAL PROOF</div><h1>The feed for positions<br /><em>you can actually verify.</em></h1><p>Read conviction with the wallet state attached. Every position post links back to a real mainnet snapshot.</p></div>
      <button className="sp2-primary sp2-compose-top" onClick={onCompose}><PenLine size={15} /> Post a verified position</button>
    </section>

    <section className="sp2-feed-toolbar"><div className="sp2-feed-tabs"><button className={filter === 'latest' ? 'active' : ''} onClick={() => setFilter('latest')}>Latest</button><button className={filter === 'verified' ? 'active' : ''} onClick={() => setFilter('verified')}><ShieldCheck size={12} /> Verified</button></div><div className="sp2-feed-signal"><span className="sp2-live"><i /> MAINNET</span><span>Proof-first social feed</span></div></section>

    <div className="sp2-feed-layout">
      <div className="sp2-feed-list">
        {displayed.length ? displayed.map((post) => <FeedCard key={post.id} post={post} asset={assets.find((asset) => asset.mint === post.mint)} price={assets.find((asset) => asset.mint === post.mint) ? prices[assets.find((asset) => asset.mint === post.mint)!.symbol] : undefined} profile={profiles[post.wallet]} onProfile={onProfile} onAlert={onAlert} />) : <div className="sp2-empty-card"><Users size={20} /><strong>No verified posts yet</strong><span>Own a supported xStock, verify it, and publish the first proof-backed post.</span><button className="sp2-secondary" onClick={onCompose}>Create the first post</button></div>}
      </div>
      <aside className="sp2-feed-rail">
        <div className="sp2-rail-card sp2-rail-dark"><span className="sp2-kicker">TRUST MODEL</span><h3>A screenshot is a claim.<br />A wallet snapshot is evidence.</h3><p>StockPass keeps the social layer readable while the proof layer stays tied to Solana mainnet state.</p><div className="sp2-rail-stat"><strong>{posts.length}</strong><span>proof-backed posts loaded</span></div></div>
        <div className="sp2-rail-card"><div className="sp2-rail-title">Your social actions</div><button onClick={onCompose}><PenLine size={14} /> Publish a position</button><button onClick={() => viewerWallet && onProfile(viewerWallet)}><Users size={14} /> Open your profile</button><div className="sp2-rail-note"><Check size={12} /> Mainnet proof attached at publish time</div></div>
      </aside>
    </div>
  </div>;
}

function FeedCard({ post, asset, price, profile, onProfile, onAlert }: { post: FeedPost; asset?: StockAsset; price?: number; profile?: StockPassProfile | null; onProfile: (wallet: string) => void; onAlert: (symbol: string) => void }) {
  const displayName = profile?.display_name || (profile?.handle ? `@${profile.handle}` : shortWallet(post.wallet));
  const handle = profile?.handle ? `@${profile.handle}` : shortWallet(post.wallet);
  const copy = async () => { try { await navigator.clipboard?.writeText(profileUrl(post.wallet)); } catch {} };
  return <article className="sp2-feed-card"><div className="sp2-feed-card-head"><button className="sp2-avatar" onClick={() => onProfile(post.wallet)}>{displayName.slice(0,2).toUpperCase()}</button><div className="sp2-author-copy"><button onClick={() => onProfile(post.wallet)}>{displayName}</button><span>{handle} · {new Date(post.created_at).toLocaleString()}</span></div><span className="sp2-verified-pill"><ShieldCheck size={12} /> Verified holder</span></div><p className="sp2-post-body">{post.body}</p>{asset && <button className="sp2-position-card" onClick={() => onAlert(asset.symbol)}><span className="sp2-logo">{asset.icon}</span><span><strong>{asset.symbol}</strong><small>{asset.name}</small></span><b>{price ? `$${price.toFixed(2)}` : 'Live data'}</b></button>}<div className="sp2-post-foot"><span><ShieldCheck size={12} /> Snapshot-backed</span><button onClick={() => void copy()}><Copy size={12} /> Copy profile</button>{asset && <button onClick={() => onAlert(asset.symbol)}><Bell size={12} /> Alert</button>}</div></article>;
}
