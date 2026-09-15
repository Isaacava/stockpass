import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { useAppKitAccount } from '@reown/appkit/react';
import { Search, ShieldCheck } from 'lucide-react';
import { readStockPositions, type VerifiedPosition } from './lib/solana';
import { supabase } from './lib/supabase';
import './stockpass-discover-market.css';

type CatalogRow = {
  symbol: string;
  name: string;
  solana_mint: string | null;
  logo_url: string | null;
  is_verified: boolean;
  badge_enabled: boolean;
};

type Filter = 'all' | 'held';

function findSlot(): HTMLElement | null {
  const section = document.querySelector('.hero + .content-section');
  const heading = section?.querySelector<HTMLElement>('.section-heading');
  if (!heading) return null;
  let slot = section?.querySelector<HTMLElement>('.sp-discover-market-slot');
  if (!slot) {
    slot = document.createElement('div');
    slot.className = 'sp-discover-market-slot';
    heading.insertAdjacentElement('afterend', slot);
  }
  return slot;
}

export default function StockPassDiscoverMarket() {
  const { address } = useAppKitAccount();
  const { connection } = useConnection();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [holdings, setHoldings] = useState<VerifiedPosition[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const update = () => setSlot(findSlot());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(update, 700);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void supabase
      .from('stockpass_xstock_catalog')
      .select('symbol,name,solana_mint,logo_url,is_verified,badge_enabled')
      .eq('network', 'Solana')
      .eq('is_verified', true)
      .order('symbol')
      .limit(1000)
      .then(({ data }) => {
        if (!cancelled) setCatalog((data ?? []) as CatalogRow[]);
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!address || !catalog.length) {
      setHoldings([]);
      return;
    }
    let cancelled = false;
    const assets = catalog
      .filter((row) => row.solana_mint)
      .map((row) => ({
        symbol: row.symbol,
        name: row.name,
        icon: row.symbol.replace(/x$/i, '').slice(0, 5),
        mint: row.solana_mint!,
        source: 'xStocks' as const
      }));
    readStockPositions(connection, new PublicKey(address), assets)
      .then((rows) => { if (!cancelled) setHoldings(rows); })
      .catch(() => { if (!cancelled) setHoldings([]); });
    return () => { cancelled = true; };
  }, [address, catalog, connection]);

  const heldMints = useMemo(() => new Set(holdings.map((position) => position.mint)), [holdings]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog
      .filter((row) => filter === 'all' || (row.solana_mint ? heldMints.has(row.solana_mint) : false))
      .filter((row) => !needle || `${row.symbol} ${row.name}`.toLowerCase().includes(needle))
      .slice(0, 36);
  }, [catalog, filter, heldMints, query]);

  if (!slot) return null;

  return createPortal(
    <section className="sp-discover-market" aria-label="Discover xStocks">
      <header className="sp-discover-market-head">
        <div>
          <span className="sp-discover-eyebrow">XSTOCKS</span>
          <h3>Discover verified Solana xStocks</h3>
          <p>{catalog.length || '—'} tracked assets · official logos · Solana mainnet</p>
        </div>
        <div className="sp-discover-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search xStocks" /></div>
      </header>

      <div className="sp-discover-filters">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
        <button className={filter === 'held' ? 'active' : ''} onClick={() => setFilter('held')}>My holdings {holdings.length > 0 ? `· ${holdings.length}` : ''}</button>
        <span className="sp-discover-proof"><ShieldCheck size={12} /> Verified registry</span>
      </div>

      <div className="sp-discover-grid">
        {loading && <div className="sp-discover-empty">Loading the verified xStock registry…</div>}
        {!loading && visible.map((row) => {
          const held = Boolean(row.solana_mint && heldMints.has(row.solana_mint));
          return <article className={held ? 'sp-discover-card held' : 'sp-discover-card'} key={row.symbol}>
            <div className="sp-discover-card-top">
              <span className="sp-discover-logo">{row.logo_url ? <img src={row.logo_url} alt="" loading="lazy" /> : row.symbol.replace(/x$/i, '').slice(0, 3)}</span>
              {held && <span className="sp-discover-held">Held</span>}
            </div>
            <strong>{row.symbol}</strong>
            <span>{row.name}</span>
          </article>;
        })}
        {!loading && !visible.length && <div className="sp-discover-empty">No xStocks match this filter.</div>}
      </div>

      {!loading && catalog.length > visible.length && <div className="sp-discover-foot">Showing {visible.length} of {catalog.length}. Use search to explore the full registry.</div>}
    </section>,
    slot
  );
}
