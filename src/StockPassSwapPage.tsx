import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, ShieldCheck, WalletCards } from 'lucide-react';
import type { StockAsset } from './lib/assets';
import { fetchOfficialPrices, resolveOfficialStocks } from './lib/xstocks';

const JUPITER_SOL_MINT = 'So11111111111111111111111111111111111111112';

export default function StockPassSwapPage({ symbol, assets, onBack }: { symbol: string; assets: StockAsset[]; onBack: () => void }) {
  const [asset, setAsset] = useState<StockAsset | null>(() => assets.find((item) => item.symbol === symbol) ?? null);
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const official = await resolveOfficialStocks(assets);
        const nextAsset = official.find((item) => item.symbol === symbol) ?? null;
        const quotes = nextAsset ? await fetchOfficialPrices([nextAsset]) : {};
        if (cancelled) return;
        setAsset(nextAsset);
        setPrice(nextAsset ? quotes[nextAsset.symbol] ?? null : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [assets, symbol]);

  const openSwap = () => {
    if (!asset?.mint) return;
    window.open(`https://jup.ag/swap/${JUPITER_SOL_MINT}-${asset.mint}`, '_blank', 'noopener,noreferrer');
  };

  return <div className="sp3-content sp3-swap-page">
    <button className="sp3-back-link" onClick={onBack}><ArrowLeft size={15} /> Back to feed</button>
    <section className="sp3-swap-hero">
      <div><div className="sp3-kicker">xSTOCK SWAP</div><h1>Swap SOL into {symbol}</h1><p>Jump from the post straight into a mainnet swap flow for the tagged xStock.</p></div>
      <div className="sp3-swap-proof"><ShieldCheck size={16} /><span>Asset metadata and price context come from the official xStocks public API.</span></div>
    </section>
    <section className="sp3-swap-grid">
      <div className="sp3-swap-card">
        <div className="sp3-swap-token"><span className="sp3-holding-symbol">{asset?.icon ?? symbol.replace(/x$/i, '').slice(0, 4)}</span><div><strong>{asset?.symbol ?? symbol}</strong><span>{asset?.name ?? 'xStock'}</span></div><span className="sp3-mainnet"><i /> MAINNET</span></div>
        <div className="sp3-swap-row"><div><span>From</span><strong>SOL</strong></div><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" /><span>SOL</span></div>
        <div className="sp3-swap-arrow"><ArrowRight size={15} /></div>
        <div className="sp3-swap-row"><div><span>To</span><strong>{asset?.symbol ?? 'xStock'}</strong></div><div className="sp3-swap-quote">{loading ? 'Loading…' : price ? `$${price.toFixed(2)}` : 'Price unavailable'}<small>official xStocks price</small></div><span>USD ref.</span></div>
        <button className="sp3-primary sp3-swap-submit" onClick={openSwap} disabled={!asset?.mint}><WalletCards size={14} /> Continue to mainnet swap <ExternalLink size={13} /></button>
        <small className="sp3-swap-note">StockPass keeps the social feed and market context here; the connected wallet signs the actual on-chain swap in the swap venue.</small>
      </div>
      <aside className="sp3-swap-side"><div className="sp3-kicker">WHY THIS CARD EXISTS</div><h3>Post → asset → action</h3><p>The tagged market card is the bridge between social discovery and the utility layer.</p><div className="sp3-swap-step"><b>01</b><span>See the post and market move</span></div><div className="sp3-swap-step"><b>02</b><span>Open the xStock swap screen</span></div><div className="sp3-swap-step"><b>03</b><span>Review the route and sign with your wallet</span></div></aside>
    </section>
  </div>;
}
