import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Search, ShieldCheck, Star, X } from 'lucide-react';
import { supabase } from './lib/supabase';
import { fetchOfficialPrices } from './lib/xstocks';
import type { StockAsset } from './lib/assets';

export type DiscoverCatalogRow = {
  symbol: string;
  name: string;
  solana_mint: string | null;
  network: string;
  is_verified: boolean;
  badge_enabled: boolean;
  logo_url: string | null;
};

type Props = {
  onAssetAlert: (symbol: string) => void;
  onOpenProfile: () => void;
};

function toAsset(row: DiscoverCatalogRow): StockAsset | null {
  if (!row.solana_mint) return null;
  return { symbol: row.symbol, name: row.name, icon: row.symbol.replace(/x$/i, ''), mint: row.solana_mint, source: 'xStocks' };
}

function compactName(name: string) {
  return name.replace(/\s+(Inc\.|Corporation|Corp\.|Holdings?|Ltd\.)$/i, '');
}

export default function StockPassDiscoverPage({ onAssetAlert, onOpenProfile }: Props) {
  const [catalog, setCatalog] = useState<DiscoverCatalogRow[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<DiscoverCatalogRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('stockpass_xstock_catalog')
        .select('symbol,name,solana_mint,network,is_verified,badge_enabled,logo_url')
        .eq('network', 'Solana')
        .eq('is_verified', true)
        .order('symbol')
        .limit(1000);
      if (cancelled) return;
      const rows = (data ?? []) as DiscoverCatalogRow[];
      setCatalog(rows);
      setLoading(false);
      const featured = rows.slice(0, 12).map(toAsset).filter((asset): asset is StockAsset => Boolean(asset));
      if (featured.length) {
        const live = await fetchOfficialPrices(featured);
        if (!cancelled) setPrices(live);
      }
    })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog;
    return catalog.filter((row) => `${row.symbol} ${row.name}`.toLowerCase().includes(needle));
  }, [catalog, query]);

  const featured = useMemo(() => {
    const withPrices = catalog.filter((row) => prices[row.symbol]);
    return (withPrices.length ? withPrices : catalog).slice(0, 6);
  }, [catalog, prices]);

  return (
    <div className="sp2-page sp2-discover">
      <section className="sp2-discover-hero">
        <div className="sp2-hero-copy">
          <div className="sp2-kicker"><span className="sp2-kicker-dot" /> XSTOCK DISCOVERY</div>
          <h1>Explore real-world assets,<br /><em>verified on Solana.</em></h1>
          <p>Browse the xStock universe, inspect live official prices, and open an asset without leaving StockPass.</p>
          <div className="sp2-hero-actions"><button className="sp2-primary" onClick={() => document.getElementById('sp2-xstock-directory')?.scrollIntoView({ behavior: 'smooth' })}>Browse xStocks <ArrowUpRight size={15} /></button><button className="sp2-secondary" onClick={onOpenProfile}>Open my profile</button></div>
          <div className="sp2-hero-meta"><span><ShieldCheck size={13} /> Solana mainnet</span><span><Star size={13} /> Official xStocks data</span><span>{catalog.length || '—'} verified assets</span></div>
        </div>
        <div className="sp2-hero-board">
          <div className="sp2-board-top"><span>MARKET BOARD</span><span className="sp2-live"><i /> LIVE</span></div>
          <div className="sp2-board-main"><strong>{catalog.length || '—'}</strong><span>verified Solana xStocks</span></div>
          <div className="sp2-board-grid">{featured.slice(0, 4).map((row) => <button key={row.symbol} onClick={() => setSelected(row)} className="sp2-mini-asset"><span className="sp2-logo">{row.logo_url ? <img src={row.logo_url} alt="" /> : row.symbol.replace(/x$/i, '').slice(0, 3)}</span><span><b>{row.symbol}</b><small>{prices[row.symbol] ? `$${prices[row.symbol].toFixed(2)}` : 'Loading'}</small></span><ArrowUpRight size={13} /></button>)}</div>
        </div>
      </section>

      <section className="sp2-section sp2-feature-section">
        <div className="sp2-section-head"><div><div className="sp2-kicker">FEATURED</div><h2>What people are watching</h2></div><span className="sp2-section-note">Official public xStocks prices</span></div>
        <div className="sp2-feature-grid">{featured.map((row) => <button className="sp2-feature-card" key={row.symbol} onClick={() => setSelected(row)}><div className="sp2-feature-top"><span className="sp2-logo sp2-logo-lg">{row.logo_url ? <img src={row.logo_url} alt="" /> : row.symbol.replace(/x$/i, '').slice(0, 3)}</span><span className="sp2-arrow"><ArrowUpRight size={14} /></span></div><div className="sp2-feature-name"><strong>{row.symbol}</strong><span>{compactName(row.name)}</span></div><div className="sp2-feature-price">{prices[row.symbol] ? `$${prices[row.symbol].toFixed(2)}` : '—'}</div><div className="sp2-feature-foot"><span><ShieldCheck size={11} /> Verified</span><span>Solana</span></div></button>)}</div>
      </section>

      <section id="sp2-xstock-directory" className="sp2-section sp2-directory-section">
        <div className="sp2-directory-head"><div><div className="sp2-kicker">ALL XSTOCKS</div><h2>Find an asset</h2><p>Search by ticker or company name. Every entry is sourced from the verified xStock catalog.</p></div><div className="sp2-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search AAPLx, Tesla, Nvidia…" /></div></div>
        <div className="sp2-directory-grid">{loading ? <div className="sp2-empty">Loading verified xStocks…</div> : filtered.slice(0, 120).map((row) => <button className="sp2-directory-row" key={row.symbol} onClick={() => setSelected(row)}><span className="sp2-logo">{row.logo_url ? <img src={row.logo_url} alt="" /> : row.symbol.replace(/x$/i, '').slice(0, 3)}</span><span className="sp2-directory-copy"><strong>{row.symbol}</strong><small>{row.name}</small></span><span className="sp2-directory-price">{prices[row.symbol] ? `$${prices[row.symbol].toFixed(2)}` : ''}</span><ShieldCheck size={13} /></button>)}{!loading && !filtered.length && <div className="sp2-empty">No xStocks match “{query}”.</div>}</div>
      </section>

      {selected && <div className="sp2-modal-backdrop" onClick={() => setSelected(null)}><section className="sp2-asset-sheet" onClick={(event) => event.stopPropagation()}><button className="sp2-close" onClick={() => setSelected(null)} aria-label="Close"><X size={16} /></button><div className="sp2-asset-sheet-top"><span className="sp2-logo sp2-logo-xl">{selected.logo_url ? <img src={selected.logo_url} alt="" /> : selected.symbol.replace(/x$/i, '').slice(0, 3)}</span><div><div className="sp2-kicker">VERIFIED XSTOCK</div><h3>{selected.symbol}</h3><p>{selected.name}</p></div></div><div className="sp2-asset-stats"><div><span>Live price</span><strong>{prices[selected.symbol] ? `$${prices[selected.symbol].toFixed(2)}` : '—'}</strong></div><div><span>Network</span><strong>Solana</strong></div><div><span>Status</span><strong><ShieldCheck size={13} /> Verified</strong></div></div><div className="sp2-asset-actions"><button className="sp2-primary" onClick={() => onAssetAlert(selected.symbol)}>Create alert</button><button className="sp2-secondary" onClick={() => setSelected(null)}>View proof data</button></div><div className="sp2-asset-note">Prices come from the official xStocks public API. Ownership remains read directly from Solana mainnet.</div></section></div>}
    </div>
  );
}
