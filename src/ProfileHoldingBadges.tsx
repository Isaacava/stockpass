import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '@solana/wallet-adapter-react';
import { readStockPositions, type VerifiedPosition } from './lib/solana';
import { supabase } from './lib/supabase';
import './profile-holding-badges.css';

type CatalogRow = {
  symbol: string;
  name: string;
  solana_mint: string;
  logo_url: string | null;
};

function getProfileWallet() {
  return new URLSearchParams(window.location.search).get('profile');
}

export default function ProfileHoldingBadges() {
  const { connection } = useConnection();
  const [wallet, setWallet] = useState<string | null>(() => getProfileWallet());
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [holdings, setHoldings] = useState<VerifiedPosition[]>([]);

  const findSlot = () => {
    const title = document.querySelector('.profile-title h1');
    if (!title || !(title instanceof HTMLElement)) {
      setSlot(null);
      return;
    }
    let target = title.nextElementSibling;
    if (!(target instanceof HTMLElement) || !target.classList.contains('profile-holding-badges-slot')) {
      const created = document.createElement('span');
      created.className = 'profile-holding-badges-slot';
      const inserted = title.insertAdjacentElement('afterend', created);
      target = inserted instanceof HTMLElement ? inserted : created;
    }
    setSlot(target);
  };

  useEffect(() => {
    const check = () => {
      const nextWallet = getProfileWallet();
      setWallet((current) => current === nextWallet ? current : nextWallet);
      findSlot();
    };
    check();
    const observer = new MutationObserver(findSlot);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(check, 700);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!wallet) {
      setCatalog([]);
      setHoldings([]);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('stockpass_xstock_catalog')
          .select('symbol,name,solana_mint,logo_url')
          .eq('network', 'Solana')
          .eq('is_verified', true)
          .eq('badge_enabled', true)
          .not('solana_mint', 'is', null)
          .limit(1000);
        if (error) throw error;
        if (cancelled) return;
        const rows = (data ?? []) as CatalogRow[];
        setCatalog(rows);
        const assets = rows.map((row) => ({
          symbol: row.symbol,
          name: row.name,
          icon: row.symbol.replace(/x$/, '').slice(0, 5),
          mint: row.solana_mint,
          source: 'xStocks' as const
        }));
        const positions = await readStockPositions(connection, new PublicKey(wallet), assets);
        if (!cancelled) setHoldings(positions);
      } catch {
        if (!cancelled) {
          setCatalog([]);
          setHoldings([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [wallet, connection]);

  const visible = useMemo(() => holdings.slice(0, 6), [holdings]);
  const remaining = Math.max(0, holdings.length - visible.length);
  const logoByMint = useMemo(() => new Map(catalog.map((row) => [row.solana_mint, row.logo_url])), [catalog]);

  if (!slot || !wallet || holdings.length === 0) return null;

  return createPortal(
    <span className="profile-holding-badges" aria-label={`${holdings.length} verified xStocks held`}>
      {visible.map((position) => {
        const logo = logoByMint.get(position.mint);
        return <span className="profile-holding-badge" key={position.mint} title={`${position.symbol} · ${position.name} · verified mainnet holding`}>
          {logo ? <img src={logo} alt={position.symbol} loading="lazy" /> : <span className="profile-holding-badge-fallback">{position.symbol.replace(/x$/i, '').slice(0, 2)}</span>}
        </span>;
      })}
      {remaining > 0 && <span className="profile-holding-more" title={`${remaining} more xStock holdings`}>+{remaining}</span>}
    </span>,
    slot
  );
}
